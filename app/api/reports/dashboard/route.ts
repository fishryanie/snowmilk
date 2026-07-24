import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { calculateDivestmentSuggestion } from "@/lib/calculations/divestment-suggestion";
import { connectMongo } from "@/lib/mongodb";
import { ownerCapitalPurchaseFilter } from "@/lib/purchase-funding";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";
import {
  vietnamDateKey,
  vietnamDayBoundary,
} from "@/lib/vietnam-date";

type DashboardSizeSummary = {
  sizeName: string;
  quantity: number;
  referenceSellingPrice: number;
};

type DashboardDailySummary = {
  date: string;
  revenue: number;
  cups: number;
  purchaseTotal: number;
  expenseTotal: number;
  equipmentTotal: number;
};

function emptyDailySummary(date: string): DashboardDailySummary {
  return {
    date,
    revenue: 0,
    cups: 0,
    purchaseTotal: 0,
    expenseTotal: 0,
    equipmentTotal: 0,
  };
}

export async function GET(request: Request) {
  try {
    await connectMongo();
    const url = new URL(request.url);
    const toParam = url.searchParams.get("to") ?? vietnamDateKey(new Date());
    const fromParam =
      url.searchParams.get("from") ?? `${toParam.slice(0, 7)}-01`;
    const from = vietnamDayBoundary(fromParam);
    const to = vietnamDayBoundary(toParam, true);
    const dateFilter = { $gte: from, $lte: to };

    const [
      sales,
      purchases,
      expenses,
      equipment,
      equipmentInvestment,
      purchaseInvestment,
      ownerFundedPurchaseInvestment,
      expenseInvestment,
      withdrawnInvestment,
      allSales,
      activeProducts,
    ] =
      await Promise.all([
        Sale.find({ saleDate: dateFilter }).lean(),
        Purchase.find({ purchaseDate: dateFilter }).lean(),
        Expense.find({ expenseDate: dateFilter }).lean(),
        Equipment.find({ purchaseDate: dateFilter }).lean(),
        Equipment.aggregate([
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Purchase.aggregate([
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Purchase.aggregate([
          { $match: ownerCapitalPurchaseFilter() },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Expense.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Divestment.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Sale.find({})
          .select("saleDate entryMode netRevenue")
          .lean(),
        Product.countDocuments({ isActive: true }),
      ]);

    const dailySummaryDates = new Set(
      sales
        .filter((sale) => sale.entryMode === "daily-summary")
        .map((sale) => vietnamDateKey(new Date(sale.saleDate))),
    );
    const effectiveSales = sales.filter((sale) => {
      const day = vietnamDateKey(new Date(sale.saleDate));
      return (
        sale.entryMode === "daily-summary" || !dailySummaryDates.has(day)
      );
    });
    const totals = effectiveSales.reduce(
      (acc, sale) => {
        acc.totalCups += sale.totalCups ?? 0;
        acc.revenue += sale.netRevenue ?? 0;
        acc.variableCost += sale.totalVariableCost ?? 0;
        acc.allocatedFixedCost += sale.allocatedFixedCost ?? 0;
        acc.profit +=
          sale.entryMode === "daily-summary"
            ? (sale.estimatedProfit ?? sale.contributionProfit ?? 0)
            : (sale.contributionProfit ?? 0);
        if (sale.entryMode === "daily-summary") {
          acc.estimatedSalesDays += 1;
          const sizeWeights = (
            (sale.sizeSummaries ?? []) as DashboardSizeSummary[]
          ).map((summary) => ({
            ...summary,
            weight:
              Number(summary.quantity ?? 0) *
              Number(summary.referenceSellingPrice ?? 0),
          }));
          const totalWeight = sizeWeights.reduce(
            (sum, summary) => sum + summary.weight,
            0,
          );
          for (const summary of sizeWeights) {
            const current = acc.products.get(summary.sizeName) ?? {
              product: summary.sizeName,
              cups: 0,
              revenue: 0,
            };
            current.cups += summary.quantity;
            current.revenue +=
              totalWeight > 0
                ? (Number(sale.netRevenue ?? 0) * summary.weight) / totalWeight
                : 0;
            acc.products.set(summary.sizeName, current);
          }
        } else {
          for (const item of sale.items ?? []) {
            const current = acc.products.get(item.productName) ?? {
              product: item.productName,
              cups: 0,
              revenue: 0,
            };
            current.cups += item.quantity;
            current.revenue += item.revenue;
            acc.products.set(item.productName, current);
          }
        }
        const day = vietnamDateKey(new Date(sale.saleDate));
        const daily = acc.daily.get(day) ?? emptyDailySummary(day);
        daily.revenue += sale.netRevenue ?? 0;
        daily.cups += sale.totalCups ?? 0;
        acc.daily.set(day, daily);
        return acc;
      },
      {
        totalCups: 0,
        revenue: 0,
        variableCost: 0,
        allocatedFixedCost: 0,
        profit: 0,
        estimatedSalesDays: 0,
        products: new Map<string, { product: string; cups: number; revenue: number }>(),
        daily: new Map<string, DashboardDailySummary>(),
      },
    );
    const purchaseTotal = purchases.reduce(
      (sum, purchase) => {
        const day = vietnamDateKey(new Date(purchase.purchaseDate));
        const daily = totals.daily.get(day) ?? emptyDailySummary(day);
        daily.purchaseTotal += purchase.totalAmount ?? 0;
        totals.daily.set(day, daily);
        return sum + (purchase.totalAmount ?? 0);
      },
      0,
    );
    const expenseTotal = expenses.reduce(
      (sum, expense) => {
        const day = vietnamDateKey(new Date(expense.expenseDate));
        const daily = totals.daily.get(day) ?? emptyDailySummary(day);
        daily.expenseTotal += expense.amount ?? 0;
        totals.daily.set(day, daily);
        return sum + (expense.amount ?? 0);
      },
      0,
    );
    const equipmentTotal = equipment.reduce(
      (sum, item) => {
        const day = vietnamDateKey(new Date(item.purchaseDate));
        const daily = totals.daily.get(day) ?? emptyDailySummary(day);
        daily.equipmentTotal += item.totalAmount ?? 0;
        totals.daily.set(day, daily);
        return sum + (item.totalAmount ?? 0);
      },
      0,
    );
    const investmentTotal =
      (equipmentInvestment[0]?.total ?? 0) +
      (ownerFundedPurchaseInvestment[0]?.total ?? 0);
    const withdrawnTotal = withdrawnInvestment[0]?.total ?? 0;
    const remainingCapital = Math.max(0, investmentTotal - withdrawnTotal);
    const estimatedProfit = totals.profit - expenseTotal;
    const cashOut = purchaseTotal + expenseTotal + equipmentTotal;
    const netCashFlow = totals.revenue - cashOut;
    const periodDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const daily = [...totals.daily.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => {
        const dailyCashOut =
          item.purchaseTotal + item.expenseTotal + item.equipmentTotal;
        return {
          ...item,
          cashIn: item.revenue,
          cashOut: dailyCashOut,
          netCashFlow: item.revenue - dailyCashOut,
        };
      });
    const activeCashFlowDays = daily.filter(
      (item) => item.cashIn > 0 || item.cashOut > 0,
    ).length;
    const positiveCashFlowDays = daily.filter(
      (item) => item.netCashFlow > 0,
    ).length;
    const salesDays = daily.filter((item) => item.revenue > 0).length;
    const allDailySummaryDates = new Set(
      allSales
        .filter((sale) => sale.entryMode === "daily-summary")
        .map((sale) => vietnamDateKey(new Date(sale.saleDate))),
    );
    const cumulativeCashIn = allSales
      .filter((sale) => {
        const day = vietnamDateKey(new Date(sale.saleDate));
        return (
          sale.entryMode === "daily-summary" ||
          !allDailySummaryDates.has(day)
        );
      })
      .reduce((sum, sale) => sum + (sale.netRevenue ?? 0), 0);
    const cumulativeCashOut =
      (equipmentInvestment[0]?.total ?? 0) +
      (purchaseInvestment[0]?.total ?? 0) +
      (expenseInvestment[0]?.total ?? 0);
    const divestmentSuggestion = calculateDivestmentSuggestion({
      cumulativeCashIn,
      cumulativeCashOut,
      withdrawnTotal,
      remainingCapital,
      periodRevenue: totals.revenue,
      periodOperatingCashOut: purchaseTotal + expenseTotal,
      periodDays,
      salesDays,
    });

    return apiSuccess({
      kpis: {
        revenue: totals.revenue,
        totalCups: totals.totalCups,
        purchaseTotal,
        expenseTotal,
        variableCost: totals.variableCost,
        allocatedFixedCost: totals.allocatedFixedCost,
        estimatedProfit,
        averageCostPerCup:
          totals.totalCups > 0 ? totals.variableCost / totals.totalCups : 0,
        investmentTotal,
        capitalRecoveryBalance: estimatedProfit - investmentTotal,
        activeProducts,
        estimatedSalesDays: totals.estimatedSalesDays,
        cashIn: totals.revenue,
        cashOut,
        netCashFlow,
        equipmentTotal,
        averageDailyCashOut: cashOut / periodDays,
        positiveCashFlowDays,
        activeCashFlowDays,
      },
      divestmentSuggestion,
      daily,
      products: [...totals.products.values()].sort((a, b) => b.cups - a.cups),
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
