import {
  calculatePeriodDistribution,
  PAYROLL_WORKING_CAPITAL_RESERVE,
  type PayrollShareInput,
} from "@/lib/payroll";
import { DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE } from "@/lib/purchase-funding";
import { vietnamDateKey, vietnamDayBoundary } from "@/lib/vietnam-date";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { PayrollEmployee } from "@/models/PayrollEmployee";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { PayrollWithdrawal } from "@/models/PayrollWithdrawal";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";

type SaleRecord = {
  saleDate: Date;
  entryMode?: string;
  netRevenue?: number;
};

type CostRecord = {
  _id: unknown;
  purchaseDate?: Date;
  expenseDate?: Date;
  totalAmount?: number;
  amount?: number;
  fundingSource?: string | null;
};

type DivestmentClaimRecord = {
  sourceType?: string;
  sourceId?: unknown;
  sourceDate?: Date;
  amount?: number;
};

type DivestmentRecord = {
  withdrawalDate: Date;
  claims?: DivestmentClaimRecord[];
};

type WithdrawalRecord = {
  period: string;
};

type EmployeeRecord = {
  _id: unknown;
  name: string;
  role: string;
  sharePercent: number;
  joinedAt: Date;
  isActive: boolean;
};

type AllocationRecord = {
  employeeId: unknown;
  employeeName: string;
  role: string;
  sharePercent: number;
  amount: number;
};

type SettlementRecord = {
  _id?: unknown;
  period: string;
  closedAt: Date;
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  cumulativeRevenue: number;
  cumulativeCosts: number;
  businessCashBalance?: number;
  outstandingOwnerCapital?: number;
  workingCapitalReserve: number;
  distributablePool: number;
  allocatedTotal: number;
  unallocatedPool: number;
  allocations: AllocationRecord[];
};

type PeriodLedger = {
  revenue: number;
  purchaseTotal: number;
  expenseTotal: number;
  equipmentTotal: number;
  salesFundedOutflow: number;
  ownerCapitalAdded: number;
  ownerCapitalClaimed: number;
};

function emptyLedger(): PeriodLedger {
  return {
    revenue: 0,
    purchaseTotal: 0,
    expenseTotal: 0,
    equipmentTotal: 0,
    salesFundedOutflow: 0,
    ownerCapitalAdded: 0,
    ownerCapitalClaimed: 0,
  };
}

function safeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function periodFromDate(date: Date) {
  return vietnamDateKey(date).slice(0, 7);
}

function periodEndKey(period: string) {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, "0")}`;
}

function periodSequence(startPeriod: string, endPeriod: string) {
  const periods: string[] = [];
  const [startYear, startMonth] = startPeriod.split("-").map(Number);
  const [endYear, endMonth] = endPeriod.split("-").map(Number);
  let cursor = startYear * 12 + startMonth - 1;
  const end = endYear * 12 + endMonth - 1;

  while (cursor <= end) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    periods.push(`${year}-${String(month).padStart(2, "0")}`);
    cursor += 1;
  }

  return periods;
}

function settlementDto(
  settlement: SettlementRecord,
  isClosed: boolean,
) {
  return {
    period: settlement.period,
    isClosed,
    closedAt: isClosed ? new Date(settlement.closedAt).toISOString() : null,
    periodRevenue: settlement.periodRevenue,
    periodPurchaseTotal: settlement.periodPurchaseTotal,
    periodExpenseTotal: settlement.periodExpenseTotal,
    periodEquipmentTotal: settlement.periodEquipmentTotal,
    periodCostTotal:
      settlement.periodPurchaseTotal +
      settlement.periodExpenseTotal +
      settlement.periodEquipmentTotal,
    cumulativeRevenue: settlement.cumulativeRevenue,
    cumulativeCosts: settlement.cumulativeCosts,
    businessCashBalance: settlement.businessCashBalance ?? 0,
    outstandingOwnerCapital:
      settlement.outstandingOwnerCapital ?? 0,
    workingCapitalReserve: settlement.workingCapitalReserve,
    distributablePool: settlement.distributablePool,
    allocatedTotal: settlement.allocatedTotal,
    unallocatedPool: settlement.unallocatedPool,
    allocations: settlement.allocations.map((allocation) => ({
      employeeId: String(allocation.employeeId),
      employeeName: allocation.employeeName,
      role: allocation.role,
      sharePercent: allocation.sharePercent,
      amount: allocation.amount,
    })),
  };
}

export async function getPayrollPeriodSummaries(now = new Date()) {
  const [
    sales,
    purchases,
    expenses,
    equipment,
    divestments,
    employees,
    existingSettlements,
    payrollWithdrawals,
  ] = await Promise.all([
    Sale.find({})
      .select("saleDate entryMode netRevenue")
      .lean<SaleRecord[]>(),
    Purchase.find({})
      .select("purchaseDate totalAmount fundingSource")
      .lean<CostRecord[]>(),
    Expense.find({})
      .select("expenseDate amount fundingSource")
      .lean<CostRecord[]>(),
    Equipment.find({})
      .select("purchaseDate totalAmount fundingSource")
      .lean<CostRecord[]>(),
    Divestment.find({})
      .select(
        "withdrawalDate claims.sourceType claims.sourceId claims.sourceDate claims.amount",
      )
      .lean<DivestmentRecord[]>(),
    PayrollEmployee.find({})
      .sort({ createdAt: 1 })
      .lean<EmployeeRecord[]>(),
    PayrollPeriodSettlement.find({})
      .sort({ period: 1 })
      .lean<SettlementRecord[]>(),
    PayrollWithdrawal.find({})
      .select("period")
      .lean<WithdrawalRecord[]>(),
  ]);

  const dailySummaryDates = new Set<string>();
  for (const sale of sales) {
    if (sale.entryMode === "daily-summary") {
      dailySummaryDates.add(vietnamDateKey(new Date(sale.saleDate)));
    }
  }
  const effectiveSales = sales.filter((sale) => {
    const day = vietnamDateKey(new Date(sale.saleDate));
    return (
      sale.entryMode === "daily-summary" || !dailySummaryDates.has(day)
    );
  });
  const ledgers = new Map<string, PeriodLedger>();
  const sourcePeriods: string[] = [];
  const ledgerFor = (period: string) => {
    const ledger = ledgers.get(period) ?? emptyLedger();
    ledgers.set(period, ledger);
    return ledger;
  };
  const claimBySource = new Map<string, DivestmentClaimRecord>();
  for (const divestment of divestments) {
    for (const claim of divestment.claims ?? []) {
      if (
        (claim.sourceType === "purchase" ||
          claim.sourceType === "equipment") &&
        claim.sourceId
      ) {
        claimBySource.set(
          `${claim.sourceType}:${String(claim.sourceId)}`,
          claim,
        );
      }
    }
  }
  const presentInvestmentSources = new Set<string>();
  const normalizedFundingSource = (record: CostRecord) =>
    record.fundingSource || DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE;

  for (const sale of effectiveSales) {
    const date = vietnamDateKey(new Date(sale.saleDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(sale.netRevenue);
    const ledger = ledgerFor(period);
    ledger.revenue += amount;
    sourcePeriods.push(period);
  }
  for (const purchase of purchases) {
    if (!purchase.purchaseDate) continue;
    const date = vietnamDateKey(new Date(purchase.purchaseDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(purchase.totalAmount);
    const ledger = ledgerFor(period);
    ledger.purchaseTotal += amount;
    const sourceKey = `purchase:${String(purchase._id)}`;
    presentInvestmentSources.add(sourceKey);
    if (
      claimBySource.has(sourceKey) ||
      normalizedFundingSource(purchase) === "owner_capital"
    ) {
      ledger.ownerCapitalAdded += amount;
    } else if (normalizedFundingSource(purchase) === "sales_revenue") {
      ledger.salesFundedOutflow += amount;
    }
    sourcePeriods.push(period);
  }
  for (const expense of expenses) {
    if (!expense.expenseDate) continue;
    const date = vietnamDateKey(new Date(expense.expenseDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(expense.amount);
    const ledger = ledgerFor(period);
    ledger.expenseTotal += amount;
    if (normalizedFundingSource(expense) === "sales_revenue") {
      ledger.salesFundedOutflow += amount;
    }
    sourcePeriods.push(period);
  }
  for (const item of equipment) {
    if (!item.purchaseDate) continue;
    const period = periodFromDate(new Date(item.purchaseDate));
    const ledger = ledgerFor(period);
    const amount = safeAmount(item.totalAmount);
    ledger.equipmentTotal += amount;
    const sourceKey = `equipment:${String(item._id)}`;
    presentInvestmentSources.add(sourceKey);
    if (
      claimBySource.has(sourceKey) ||
      normalizedFundingSource(item) === "owner_capital"
    ) {
      ledger.ownerCapitalAdded += amount;
    } else if (normalizedFundingSource(item) === "sales_revenue") {
      ledger.salesFundedOutflow += amount;
    }
    sourcePeriods.push(period);
  }
  for (const divestment of divestments) {
    const claimPeriod = periodFromDate(new Date(divestment.withdrawalDate));
    const claimLedger = ledgerFor(claimPeriod);
    for (const claim of divestment.claims ?? []) {
      if (
        claim.sourceType !== "purchase" &&
        claim.sourceType !== "equipment"
      ) {
        continue;
      }
      const amount = safeAmount(claim.amount);
      const sourceKey = `${claim.sourceType}:${String(claim.sourceId ?? "")}`;
      if (!presentInvestmentSources.has(sourceKey) && claim.sourceDate) {
        const sourcePeriod = periodFromDate(new Date(claim.sourceDate));
        const sourceLedger = ledgerFor(sourcePeriod);
        sourceLedger.ownerCapitalAdded += amount;
        if (claim.sourceType === "purchase") {
          sourceLedger.purchaseTotal += amount;
        } else {
          sourceLedger.equipmentTotal += amount;
        }
        sourcePeriods.push(sourcePeriod);
      }
      claimLedger.ownerCapitalClaimed += amount;
      claimLedger.salesFundedOutflow += amount;
    }
    sourcePeriods.push(claimPeriod);
  }

  const currentPeriod = periodFromDate(now);
  const employeePeriods = employees.map((employee) =>
    periodFromDate(new Date(employee.joinedAt)),
  );
  const allKnownPeriods = [
    currentPeriod,
    ...sourcePeriods,
    ...employeePeriods,
    ...existingSettlements.map((settlement) => settlement.period),
  ];
  const startPeriod = allKnownPeriods.toSorted()[0] ?? currentPeriod;
  const periods = periodSequence(startPeriod, currentPeriod);
  const existingByPeriod = new Map(
    existingSettlements.map((settlement) => [
      settlement.period,
      settlement,
    ]),
  );

  let cumulativeRevenue = 0;
  let cumulativeCosts = 0;
  let businessCashBalance = 0;
  let outstandingOwnerCapital = 0;
  let previouslySettledPools = 0;
  const periodsWithWithdrawals = new Set(
    payrollWithdrawals.map((withdrawal) => withdrawal.period),
  );
  const summaries = [];

  for (const period of periods) {
    const ledger = ledgers.get(period) ?? emptyLedger();
    cumulativeRevenue += ledger.revenue;
    cumulativeCosts +=
      ledger.purchaseTotal + ledger.expenseTotal + ledger.equipmentTotal;
    businessCashBalance += ledger.revenue - ledger.salesFundedOutflow;
    outstandingOwnerCapital = Math.max(
      0,
      outstandingOwnerCapital +
        ledger.ownerCapitalAdded -
        ledger.ownerCapitalClaimed,
    );
    const isClosed = period < currentPeriod;
    const existing = existingByPeriod.get(period);
    const hasWithdrawals = periodsWithWithdrawals.has(period);

    const hasOwnerCapitalSnapshot =
      Number.isFinite(existing?.businessCashBalance) &&
      Number.isFinite(existing?.outstandingOwnerCapital);
    if (isClosed && existing && hasWithdrawals) {
      summaries.push(settlementDto(existing, true));
      previouslySettledPools += existing.distributablePool;
      continue;
    }

    const endOfPeriod = vietnamDayBoundary(periodEndKey(period), true);
    const shares: PayrollShareInput[] = [];
    for (const employee of employees) {
      if (employee.isActive && new Date(employee.joinedAt) <= endOfPeriod) {
        shares.push({
          employeeId: String(employee._id),
          employeeName: employee.name,
          role: employee.role,
          sharePercent: employee.sharePercent,
        });
      }
    }
    const workingCapitalReserve = PAYROLL_WORKING_CAPITAL_RESERVE;
    const distribution = calculatePeriodDistribution({
      businessCashBalance,
      outstandingOwnerCapital,
      previouslySettledPools,
      workingCapitalReserve,
      shares,
    });
    const computed: SettlementRecord = {
      period,
      closedAt: endOfPeriod,
      periodRevenue: ledger.revenue,
      periodPurchaseTotal: ledger.purchaseTotal,
      periodExpenseTotal: ledger.expenseTotal,
      periodEquipmentTotal: ledger.equipmentTotal,
      cumulativeRevenue,
      cumulativeCosts,
      businessCashBalance,
      outstandingOwnerCapital,
      workingCapitalReserve,
      ...distribution,
    };

    if (!isClosed) {
      summaries.push(settlementDto(computed, false));
      continue;
    }

    if (existing) {
      const allocationsMatch =
        existing.allocations.length === computed.allocations.length &&
        existing.allocations.every((allocation, index) => {
          const next = computed.allocations[index];
          return (
            Boolean(next) &&
            String(allocation.employeeId) === next.employeeId &&
            allocation.employeeName === next.employeeName &&
            allocation.role === next.role &&
            allocation.sharePercent === next.sharePercent &&
            allocation.amount === next.amount
          );
        });
      const snapshotMatches =
        hasOwnerCapitalSnapshot &&
        existing.periodRevenue === computed.periodRevenue &&
        existing.periodPurchaseTotal === computed.periodPurchaseTotal &&
        existing.periodExpenseTotal === computed.periodExpenseTotal &&
        existing.periodEquipmentTotal === computed.periodEquipmentTotal &&
        existing.cumulativeRevenue === computed.cumulativeRevenue &&
        existing.cumulativeCosts === computed.cumulativeCosts &&
        existing.businessCashBalance === computed.businessCashBalance &&
        existing.outstandingOwnerCapital ===
          computed.outstandingOwnerCapital &&
        existing.workingCapitalReserve === computed.workingCapitalReserve &&
        existing.distributablePool === computed.distributablePool &&
        existing.allocatedTotal === computed.allocatedTotal &&
        existing.unallocatedPool === computed.unallocatedPool &&
        allocationsMatch;

      if (snapshotMatches) {
        summaries.push(settlementDto(existing, true));
        previouslySettledPools += existing.distributablePool;
        continue;
      }

      const migrated = await PayrollPeriodSettlement.findOneAndUpdate(
        { period },
        { $set: computed },
        { new: true, runValidators: true },
      ).lean<SettlementRecord>();
      if (!migrated) {
        throw new Error(`Không thể cập nhật quỹ lương tháng ${period}.`);
      }
      summaries.push(settlementDto(migrated, true));
      previouslySettledPools += migrated.distributablePool;
      continue;
    }

    const saved = await PayrollPeriodSettlement.findOneAndUpdate(
      { period },
      { $setOnInsert: computed },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<SettlementRecord>();
    if (!saved) {
      throw new Error(`Không thể chốt quỹ lương tháng ${period}.`);
    }
    summaries.push(settlementDto(saved, true));
    previouslySettledPools += saved.distributablePool;
  }

  return summaries;
}
