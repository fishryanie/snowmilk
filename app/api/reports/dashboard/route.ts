import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import { calculateDivestmentSuggestion } from "@/lib/calculations/divestment-suggestion";
import { calculateBusinessCashBalance } from "@/lib/divestment-claims";
import { calculateOwnerInvestmentTotal } from "@/lib/investment-total";
import { connectMongo } from "@/lib/mongodb";
import {
  payrollPeriodEndDateKey,
  summarizeClosedPayrollFunds,
} from "@/lib/payroll";
import { normalizeProductGroupName } from "@/lib/product-groups";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { InventorySnapshot } from "@/models/InventorySnapshot";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { Sale } from "@/models/Sale";
import { isExpensePaid } from "@/lib/expense-payment-status";
import {
  isVietnamDateKey,
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
  snowMilkRevenue: number;
  freshMilkRevenue: number;
  freshMilkBottleCount: number;
  cups: number;
  purchaseTotal: number;
  expenseTotal: number;
  cashExpenseTotal: number;
  equipmentTotal: number;
  payrollTotal: number;
  reserveFundTransferTotal: number;
};

type HealthIssue = {
  key: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  href?: string;
};

function emptyDailySummary(date: string): DashboardDailySummary {
  return {
    date,
    revenue: 0,
    snowMilkRevenue: 0,
    freshMilkRevenue: 0,
    freshMilkBottleCount: 0,
    cups: 0,
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
      purchases,
      expenses,
      equipment,
      payrollSettlements,
      equipmentInvestment,
      purchaseInvestment,
      expenseInvestment,
      salesFundedPurchaseInvestment,
      salesFundedExpenseInvestment,
      salesFundedEquipmentInvestment,
      allSales,
      investmentPurchases,
      investmentEquipment,
      divestments,
      activeProductRecords,
      validBatchCount,
      latestInventorySnapshot,
      missingPurchaseFunding,
      missingExpenseFunding,
      missingEquipmentFunding,
    ] =
      await Promise.all([
        Sale.find({ saleDate: dateFilter }).lean(),
        Purchase.find({ purchaseDate: dateFilter }).lean(),
        Expense.find({ expenseDate: dateFilter }).lean(),
        Equipment.find({ purchaseDate: dateFilter }).lean(),
        PayrollPeriodSettlement.find({})
          .select(
            "period allocatedTotal reserveFundsTotal workingCapitalReserve",
          )
          .lean(),
        Equipment.aggregate([
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Purchase.aggregate([
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Expense.aggregate([
          {
            $match: {
              $or: [
                { paymentStatus: "paid" },
                { paymentStatus: { $exists: false } },
                { paymentStatus: null },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Purchase.aggregate([
          { $match: { fundingSource: "sales_revenue" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Expense.aggregate([
          {
            $match: {
              fundingSource: "sales_revenue",
              $or: [
                { paymentStatus: "paid" },
                { paymentStatus: { $exists: false } },
                { paymentStatus: null },
              ],
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Equipment.aggregate([
          { $match: { fundingSource: "sales_revenue" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Sale.find({})
          .select(
            "saleDate entryMode netRevenue snowMilkRevenue freshMilkRevenue freshMilkBottleCount cashReceived bankTransferReceived",
          )
          .lean(),
        Purchase.find({})
          .select("_id totalAmount fundingSource")
          .lean(),
        Equipment.find({})
          .select("_id totalAmount fundingSource")
          .lean(),
        Divestment.find({})
          .select("amount claims.sourceId claims.sourceType claims.amount")
          .lean(),
        Product.find({ isActive: true })
          .select("hasCostWarning fullCost sellingPrice")
          .lean(),
        MilkBatch.countDocuments({ costPerMl: { $gt: 0 } }),
        InventorySnapshot.findOne({})
          .sort({ snapshotDate: -1 })
          .select("snapshotDate milkBatches")
          .lean(),
        Purchase.countDocuments({
          $or: [
            { fundingSource: { $exists: false } },
            { fundingSource: null },
          ],
        }),
        Expense.countDocuments({
          $or: [
            { fundingSource: { $exists: false } },
            { fundingSource: null },
          ],
        }),
        Equipment.countDocuments({
          $or: [
            { fundingSource: { $exists: false } },
            { fundingSource: null },
          ],
        }),
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
        const saleFreshMilkRevenue =
          sale.entryMode === "daily-summary"
            ? Number(sale.freshMilkRevenue ?? 0)
            : 0;
        const saleSnowMilkRevenue =
          sale.entryMode === "daily-summary"
            ? Number(
                sale.snowMilkRevenue ??
                  Math.max(
                    0,
                    Number(sale.netRevenue ?? 0) - saleFreshMilkRevenue,
                  ),
              )
            : Number(sale.netRevenue ?? 0);
        const saleFreshMilkBottleCount =
          sale.entryMode === "daily-summary"
            ? Number(sale.freshMilkBottleCount ?? 0)
            : 0;
        const saleCountedProductRevenue = (sale.items ?? []).reduce(
          (sum: number, item: { revenue?: number }) =>
            sum + Number(item.revenue ?? 0),
          0,
        );
        const saleSnowMilkRevenueForSizes = Math.max(
          0,
          saleSnowMilkRevenue - saleCountedProductRevenue,
        );
        acc.totalCups += sale.totalCups ?? 0;
        acc.revenue += sale.netRevenue ?? 0;
        acc.snowMilkRevenue += saleSnowMilkRevenue;
        acc.freshMilkRevenue += saleFreshMilkRevenue;
        acc.freshMilkBottleCount += saleFreshMilkBottleCount;
        acc.variableCost += sale.totalVariableCost ?? 0;
        acc.allocatedFixedCost += sale.allocatedFixedCost ?? 0;
        acc.profit +=
          sale.entryMode === "daily-summary"
            ? (sale.estimatedProfit ?? sale.contributionProfit ?? 0)
            : (sale.contributionProfit ?? 0);
        if (sale.entryMode === "daily-summary") {
          acc.estimatedSalesDays += saleSnowMilkRevenue > 0 ? 1 : 0;
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
                ? (saleSnowMilkRevenueForSizes * summary.weight) / totalWeight
                : 0;
            acc.products.set(summary.sizeName, current);
          }
          if (saleFreshMilkRevenue > 0 || saleFreshMilkBottleCount > 0) {
            const current = acc.products.get("Sữa tươi") ?? {
              product: "Sữa tươi",
              cups: 0,
              revenue: 0,
            };
            current.cups += saleFreshMilkBottleCount;
            current.revenue += saleFreshMilkRevenue;
            acc.products.set("Sữa tươi", current);
          }
        }
        for (const item of sale.items ?? []) {
          const itemRevenue = Number(item.revenue ?? 0);
          const itemQuantity = Number(item.quantity ?? 0);
          const current = acc.products.get(item.productName) ?? {
            product: item.productName,
            cups: 0,
            revenue: 0,
          };
          current.cups += itemQuantity;
          current.revenue += itemRevenue;
          acc.products.set(item.productName, current);

          const groupName = normalizeProductGroupName(item.groupName);
          const group = acc.groups.get(groupName) ?? {
            name: groupName,
            quantity: 0,
            revenue: 0,
          };
          group.quantity += itemQuantity;
          group.revenue += itemRevenue;
          acc.groups.set(groupName, group);
        }
        const day = vietnamDateKey(new Date(sale.saleDate));
        const daily = acc.daily.get(day) ?? emptyDailySummary(day);
        daily.revenue += sale.netRevenue ?? 0;
        daily.snowMilkRevenue += saleSnowMilkRevenue;
        daily.freshMilkRevenue += saleFreshMilkRevenue;
        daily.freshMilkBottleCount += saleFreshMilkBottleCount;
        daily.cups += sale.totalCups ?? 0;
        acc.daily.set(day, daily);
        return acc;
      },
      {
        totalCups: 0,
        revenue: 0,
        snowMilkRevenue: 0,
        freshMilkRevenue: 0,
        freshMilkBottleCount: 0,
        variableCost: 0,
        allocatedFixedCost: 0,
        profit: 0,
        estimatedSalesDays: 0,
        products: new Map<string, { product: string; cups: number; revenue: number }>(),
        groups: new Map<
          string,
          { name: string; quantity: number; revenue: number }
        >(),
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
    const estimatedProfit = totals.profit - expenseTotals.operating;
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
    const cumulativeSettledPayrollTotal =
      closedPayrollFunds.settledPayrollTotal;
    const cumulativeSeparatedReserveFundTotal =
      closedPayrollFunds.separatedReserveFundTotal;
    const cumulativeCashOut =
      (equipmentInvestment[0]?.total ?? 0) +
      (purchaseInvestment[0]?.total ?? 0) +
      (expenseInvestment[0]?.total ?? 0) +
      cumulativeSettledPayrollTotal +
      cumulativeSeparatedReserveFundTotal;
    const businessCash = calculateBusinessCashBalance(
      cumulativeCashIn,
      salesFundedPurchaseInvestment[0]?.total ?? 0,
      salesFundedExpenseInvestment[0]?.total ?? 0,
      salesFundedEquipmentInvestment[0]?.total ?? 0,
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
    const healthIssues: HealthIssue[] = [];
    if (activeProductRecords.length === 0) {
      healthIssues.push({
        key: "products",
        severity: "error",
        title: "Chưa có sản phẩm đang hoạt động",
        description:
          "Cần tạo sản phẩm để hệ thống có định mức topping, bao bì và giá vốn.",
        href: "/products",
      });
    }
    if (validBatchCount === 0) {
      healthIssues.push({
        key: "batches",
        severity: "error",
        title: "Chưa có mẻ sữa có giá vốn hợp lệ",
        description:
          "Chốt bán hàng sẽ bị khóa nếu không có ít nhất một công thức/mẻ có cost trên 0.",
        href: "/batches",
      });
    }
    const costWarningCount = activeProductRecords.filter(
      (product) =>
        product.hasCostWarning ||
        Number(product.fullCost ?? 0) > Number(product.sellingPrice ?? 0),
    ).length;
    if (costWarningCount > 0) {
      healthIssues.push({
        key: "product-cost",
        severity: "warning",
        title: `${costWarningCount} sản phẩm có giá vốn cần kiểm tra`,
        description:
          "Giá vốn bất thường hoặc cao hơn giá bán có thể làm sai lợi nhuận ước tính.",
        href: "/costing",
      });
    }
    if (missingPurchaseFunding > 0) {
      healthIssues.push({
        key: "purchase-funding-source",
        severity: "warning",
        title: `${missingPurchaseFunding} phiếu nhập cũ chưa ghi nguồn tiền`,
        description:
          "Hệ thống đang tạm coi các phiếu này là Tiền cá nhân; hãy đối soát để tổng vốn và tiền tiệm chính xác.",
        href: "/purchases",
      });
    }
    if (missingExpenseFunding > 0) {
      healthIssues.push({
        key: "expense-funding-source",
        severity: "warning",
        title: `${missingExpenseFunding} chi phí cũ chưa ghi nguồn tiền`,
        description:
          "Hãy xác nhận chi phí được thanh toán từ tiền bán hàng, tiền cá nhân, tiền vay hay nguồn khác.",
        href: "/expenses",
      });
    }
    if (missingEquipmentFunding > 0) {
      healthIssues.push({
        key: "equipment-funding-source",
        severity: "warning",
        title: `${missingEquipmentFunding} tài sản cũ chưa ghi nguồn tiền`,
        description:
          "Hệ thống đang tạm coi các tài sản này là Tiền cá nhân; hãy đối soát để tiến độ thu hồi vốn chính xác.",
        href: "/equipment",
      });
    }
    const paymentMismatchCount = allSales.filter(
      (sale) =>
        sale.entryMode === "daily-summary" &&
        Number(sale.cashReceived ?? 0) +
          Number(sale.bankTransferReceived ?? 0) !==
          Number(sale.netRevenue ?? 0),
    ).length;
    if (paymentMismatchCount > 0) {
      healthIssues.push({
        key: "payment-reconciliation",
        severity: "error",
        title: `${paymentMismatchCount} ngày lệch tiền nhận và doanh thu`,
        description:
          "Cần sửa bản chốt ngày để tiền mặt + chuyển khoản bằng đúng doanh thu thực nhận.",
        href: "/sales",
      });
    }
    const inventoryQuantityWarningCount = (
      latestInventorySnapshot?.milkBatches ?? []
    ).filter(
      (batch: { remainingLiters?: unknown; producedLiters?: unknown }) =>
        Number(batch.remainingLiters ?? 0) >
        Number(batch.producedLiters ?? 0),
    ).length;
    if (inventoryQuantityWarningCount > 0) {
      const latestInventoryDate = latestInventorySnapshot?.snapshotDate
        ? vietnamDateKey(new Date(latestInventorySnapshot.snapshotDate))
        : null;
      healthIssues.push({
        key: "inventory-milk-basis",
        severity: "warning",
        title: "Tồn sữa đang lớn hơn sản lượng một mẻ",
        description:
          "Giá trị tồn vẫn dùng số kiểm thực tế, nhưng đối chiếu số ly theo sữa không còn đáng tin cho mốc kiểm kho mới nhất.",
        href: latestInventoryDate
          ? `/ingredients?date=${latestInventoryDate}#inventory-milk-basis`
          : "/ingredients#inventory-milk-basis",
      });
    }
    if (!latestInventorySnapshot) {
      healthIssues.push({
        key: "inventory",
        severity: "info",
        title: "Chưa có mốc kiểm kho",
        description:
          "Chốt kiểm kho đầu tiên để theo dõi giá trị tồn và hao hụt giữa các ngày.",
        href: "/inventory",
      });
    }
    const setupRequired =
      activeProductRecords.length === 0 || validBatchCount === 0;
    const hasError = healthIssues.some((issue) => issue.severity === "error");
    const hasWarning = healthIssues.some(
      (issue) => issue.severity === "warning",
    );

    return apiSuccess({
      health: {
        status: setupRequired
          ? ("setup-required" as const)
          : hasError || hasWarning
            ? ("attention" as const)
            : ("ready" as const),
        issues: healthIssues,
        lastSaleDate:
          allSales.length > 0
            ? vietnamDateKey(
                new Date(
                  Math.max(
                    ...allSales.map((sale) =>
                      new Date(sale.saleDate).getTime(),
                    ),
                  ),
                ),
              )
            : null,
        lastInventoryDate: latestInventorySnapshot?.snapshotDate
          ? vietnamDateKey(new Date(latestInventorySnapshot.snapshotDate))
          : null,
      },
      kpis: {
        revenue: totals.revenue,
        snowMilkRevenue: totals.snowMilkRevenue,
        freshMilkRevenue: totals.freshMilkRevenue,
        freshMilkBottleCount: totals.freshMilkBottleCount,
        totalCups: totals.totalCups,
        businessCashBalance: businessCash.remainingBalance,
        purchaseTotal,
        expenseTotal,
        operatingExpenseTotal: expenseTotals.operating,
        cashExpenseTotal,
        payrollTotal,
        reserveFundTransferTotal,
        outstandingExpenseTotal: Math.max(0, expenseTotal - cashExpenseTotal),
        variableCost: totals.variableCost,
        allocatedFixedCost: totals.allocatedFixedCost,
        estimatedProfit,
        averageCostPerCup:
          totals.totalCups > 0 ? totals.variableCost / totals.totalCups : 0,
        investmentTotal,
        withdrawnTotal: capitalRecovery.withdrawnTotal,
        remainingCapital,
        capitalRecoveryRate: capitalRecovery.recoveryRate,
        capitalRecoveryBalance: -remainingCapital,
        activeProducts: activeProductRecords.length,
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
      groups: [...totals.groups.values()].sort(
        (a, b) => b.revenue - a.revenue,
      ),
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
