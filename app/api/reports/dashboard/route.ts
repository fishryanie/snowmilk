import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import { calculateDivestmentSuggestion } from "@/lib/calculations/divestment-suggestion";
import { calculateBusinessCashBalance } from "@/lib/divestment-claims";
import { calculateOwnerInvestmentTotal } from "@/lib/investment-total";
import { connectMongo } from "@/lib/mongodb";
import {
  cumulativeSalesPipeline,
  emptyFinanceSummary,
  expenseFacetPipeline,
  investmentFacetPipeline,
  type CumulativeSalesSummary,
  type ExpenseFacet,
  type InvestmentFacet,
} from "@/lib/dashboard-queries";
import {
  payrollPeriodEndDateKey,
  summarizeClosedPayrollFunds,
} from "@/lib/payroll";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { Purchase } from "@/models/Purchase";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { Sale } from "@/models/Sale";
import { isExpensePaid } from "@/lib/expense-payment-status";
import {
  isVietnamDateKey,
  vietnamDateKey,
  vietnamDayBoundary,
} from "@/lib/vietnam-date";

type DashboardDailySummary = {
  date: string;
  revenue: number;
  purchaseTotal: number;
  expenseTotal: number;
  cashExpenseTotal: number;
  equipmentTotal: number;
  payrollTotal: number;
  reserveFundTransferTotal: number;
};

function emptyDailySummary(date: string): DashboardDailySummary {
  return {
    date,
    revenue: 0,
    purchaseTotal: 0,
    expenseTotal: 0,
    cashExpenseTotal: 0,
    equipmentTotal: 0,
    payrollTotal: 0,
    reserveFundTransferTotal: 0,
  };
}

export async function GET(request: Request) {
  try {
    await connectMongo();
    const url = new URL(request.url);
    const toParam = url.searchParams.get("to") ?? vietnamDateKey(new Date());
    const fromParam =
      url.searchParams.get("from") ?? `${toParam.slice(0, 7)}-01`;
    if (!isVietnamDateKey(fromParam) || !isVietnamDateKey(toParam)) {
      return apiError("Khoảng ngày báo cáo không hợp lệ", 422);
    }
    const from = vietnamDayBoundary(fromParam);
    const to = vietnamDayBoundary(toParam, true);
    if (from > to) {
      return apiError("Ngày bắt đầu không thể sau ngày kết thúc", 422);
    }
    const dateFilter = { $gte: from, $lte: to };

    const [
      sales,
      purchaseFacets,
      expenseFacets,
      equipmentFacets,
      payrollSettlements,
      cumulativeSales,
      divestments,
    ] = await Promise.all([
      Sale.find({ saleDate: dateFilter })
        .select(
          "saleDate cashReceived bankTransferReceived -_id",
        )
        .lean(),
      Purchase.aggregate<InvestmentFacet>(investmentFacetPipeline(dateFilter)),
      Expense.aggregate<ExpenseFacet>(expenseFacetPipeline(dateFilter)),
      Equipment.aggregate<InvestmentFacet>(investmentFacetPipeline(dateFilter)),
      PayrollPeriodSettlement.find({})
        .select("period allocatedTotal reserveFundsTotal workingCapitalReserve")
        .lean(),
      Sale.aggregate<CumulativeSalesSummary>(cumulativeSalesPipeline),
      Divestment.find({})
        .select("amount claims.sourceId claims.sourceType claims.amount")
        .lean(),
    ]);
    const purchases = purchaseFacets[0]?.period ?? [];
    const expenses = expenseFacets[0]?.period ?? [];
    const equipment = equipmentFacets[0]?.period ?? [];
    const investmentPurchases = purchaseFacets[0]?.investments ?? [];
    const investmentEquipment = equipmentFacets[0]?.investments ?? [];
    const purchaseFinance = purchaseFacets[0]?.summary[0] ?? emptyFinanceSummary;
    const expenseFinance = expenseFacets[0]?.summary[0] ?? emptyFinanceSummary;
    const equipmentFinance = equipmentFacets[0]?.summary[0] ?? emptyFinanceSummary;
    const salesSummary = cumulativeSales[0];

    const totals = { revenue: 0, cashReceived: 0, bankTransferReceived: 0, daily: new Map<string, DashboardDailySummary>() };
    for (const sale of sales) {
      const revenue = sale.cashReceived + sale.bankTransferReceived;
      totals.revenue += revenue;
      totals.cashReceived += sale.cashReceived;
      totals.bankTransferReceived += sale.bankTransferReceived;
      const day = vietnamDateKey(new Date(sale.saleDate));
      const daily = totals.daily.get(day) ?? emptyDailySummary(day);
      daily.revenue += revenue;
      totals.daily.set(day, daily);
    }
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
    const expenseTotals = expenses.reduce(
      (summary, expense) => {
        const amount = Number(expense.amount ?? 0);
        const day = vietnamDateKey(new Date(expense.expenseDate));
        const daily = totals.daily.get(day) ?? emptyDailySummary(day);
        daily.expenseTotal += amount;
        if (isExpensePaid(expense)) daily.cashExpenseTotal += amount;
        totals.daily.set(day, daily);
        summary.total += amount;
        if (isExpensePaid(expense)) summary.paid += amount;
        if (expense.accountingTreatment !== "inventory_cost") {
          summary.operating += amount;
        }
        return summary;
      },
      { total: 0, paid: 0, operating: 0 },
    );
    const expenseTotal = expenseTotals.total;
    const cashExpenseTotal = expenseTotals.paid;
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
    const closedPayrollFunds = summarizeClosedPayrollFunds(payrollSettlements);
    const periodClosedFunds = closedPayrollFunds.movements.reduce(
      (summary, movement) => {
        const day = payrollPeriodEndDateKey(movement.period);
        if (day < fromParam || day > toParam) return summary;
        const daily = totals.daily.get(day) ?? emptyDailySummary(day);
        daily.payrollTotal += movement.payrollTotal;
        daily.reserveFundTransferTotal += movement.reserveFundTransferTotal;
        totals.daily.set(day, daily);
        summary.payrollTotal += movement.payrollTotal;
        summary.reserveFundTransferTotal += movement.reserveFundTransferTotal;
        return summary;
      },
      { payrollTotal: 0, reserveFundTransferTotal: 0 },
    );
    const payrollTotal = periodClosedFunds.payrollTotal;
    const reserveFundTransferTotal =
      periodClosedFunds.reserveFundTransferTotal;
    const investmentTotal = calculateOwnerInvestmentTotal({
      purchases: investmentPurchases.map((purchase) => ({
        id: String(purchase._id),
        amount: Number(purchase.totalAmount ?? 0),
        fundingSource: purchase.fundingSource,
      })),
      equipment: investmentEquipment.map((item) => ({
        id: String(item._id),
        amount: Number(item.totalAmount ?? 0),
        fundingSource: item.fundingSource,
      })),
      claims: divestments.flatMap((divestment) =>
        (divestment.claims ?? []).map((claim: {
          sourceId?: unknown;
          sourceType?: unknown;
          amount?: unknown;
        }) => ({
          sourceId: String(claim.sourceId ?? ""),
          sourceType:
            claim.sourceType === "equipment"
              ? ("equipment" as const)
              : ("purchase" as const),
          amount: Number(claim.amount ?? 0),
        })),
      ),
    });
    const withdrawnTotal = divestments.reduce(
      (sum, divestment) => sum + Number(divestment.amount ?? 0),
      0,
    );
    const capitalRecovery = calculateCapitalRecovery(
      investmentTotal,
      withdrawnTotal,
    );
    const remainingCapital = capitalRecovery.remainingCapital;
    const cashOut =
      purchaseTotal +
      cashExpenseTotal +
      equipmentTotal +
      payrollTotal +
      reserveFundTransferTotal;
    const netCashFlow = totals.revenue - cashOut;
    const periodDays = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const daily = [...totals.daily.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => {
        const dailyCashOut =
          item.purchaseTotal +
          item.cashExpenseTotal +
          item.equipmentTotal +
          item.payrollTotal +
          item.reserveFundTransferTotal;
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
    const cumulativeCashIn = salesSummary?.totalRevenue ?? 0;
    const cumulativeSettledPayrollTotal =
      closedPayrollFunds.settledPayrollTotal;
    const cumulativeSeparatedReserveFundTotal =
      closedPayrollFunds.separatedReserveFundTotal;
    const cumulativeCashOut =
      equipmentFinance.total +
      purchaseFinance.total +
      expenseFinance.total +
      cumulativeSettledPayrollTotal +
      cumulativeSeparatedReserveFundTotal;
    const businessCash = calculateBusinessCashBalance(
      cumulativeCashIn,
      purchaseFinance.salesFundedTotal,
      expenseFinance.salesFundedTotal,
      equipmentFinance.salesFundedTotal,
      cumulativeSettledPayrollTotal,
      cumulativeSeparatedReserveFundTotal,
    );
    const divestmentSuggestion = calculateDivestmentSuggestion({
      cumulativeCashIn,
      cumulativeCashOut,
      withdrawnTotal,
      recordedCashBalance: businessCash.remainingBalance,
      remainingCapital,
      periodRevenue: totals.revenue,
      periodOperatingCashOut:
        purchaseTotal +
        cashExpenseTotal +
        payrollTotal +
        reserveFundTransferTotal,
      periodDays,
      salesDays,
    });
    return apiSuccess({
      kpis: {
        revenue: totals.revenue,
        cashReceived: totals.cashReceived,
        bankTransferReceived: totals.bankTransferReceived,
        businessCashBalance: businessCash.remainingBalance,
        purchaseTotal,
        expenseTotal,
        operatingExpenseTotal: expenseTotals.operating,
        cashExpenseTotal,
        payrollTotal,
        reserveFundTransferTotal,
        outstandingExpenseTotal: Math.max(0, expenseTotal - cashExpenseTotal),
        investmentTotal,
        withdrawnTotal: capitalRecovery.withdrawnTotal,
        remainingCapital,
        capitalRecoveryRate: capitalRecovery.recoveryRate,
        capitalRecoveryBalance: -remainingCapital,
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
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
