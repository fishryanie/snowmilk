import {
  calculatePeriodDistribution,
  calculateWorkingCapitalReserve,
  type DailyOperatingCash,
  type PayrollShareInput,
} from "@/lib/payroll";
import { vietnamDateKey, vietnamDayBoundary } from "@/lib/vietnam-date";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { PayrollEmployee } from "@/models/PayrollEmployee";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";

type SaleRecord = {
  saleDate: Date;
  entryMode?: string;
  netRevenue?: number;
};

type CostRecord = {
  purchaseDate?: Date;
  expenseDate?: Date;
  totalAmount?: number;
  amount?: number;
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
  period: string;
  closedAt: Date;
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  cumulativeRevenue: number;
  cumulativeCosts: number;
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
  daily: Map<string, DailyOperatingCash>;
};

function emptyLedger(): PeriodLedger {
  return {
    revenue: 0,
    purchaseTotal: 0,
    expenseTotal: 0,
    equipmentTotal: 0,
    daily: new Map(),
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

function dailyCash(
  ledger: PeriodLedger,
  date: string,
) {
  const current = ledger.daily.get(date) ?? {
    revenue: 0,
    purchaseTotal: 0,
    expenseTotal: 0,
  };
  ledger.daily.set(date, current);
  return current;
}

export async function getPayrollPeriodSummaries(now = new Date()) {
  const [
    sales,
    purchases,
    expenses,
    equipment,
    employees,
    existingSettlements,
  ] = await Promise.all([
    Sale.find({})
      .select("saleDate entryMode netRevenue")
      .lean<SaleRecord[]>(),
    Purchase.find({})
      .select("purchaseDate totalAmount")
      .lean<CostRecord[]>(),
    Expense.find({})
      .select("expenseDate amount")
      .lean<CostRecord[]>(),
    Equipment.find({})
      .select("purchaseDate totalAmount")
      .lean<CostRecord[]>(),
    PayrollEmployee.find({})
      .sort({ createdAt: 1 })
      .lean<EmployeeRecord[]>(),
    PayrollPeriodSettlement.find({})
      .sort({ period: 1 })
      .lean<SettlementRecord[]>(),
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
  const ledgers = new Map<string, PeriodLedger>();
  const sourcePeriods: string[] = [];
  const ledgerFor = (period: string) => {
    const ledger = ledgers.get(period) ?? emptyLedger();
    ledgers.set(period, ledger);
    return ledger;
  };

  for (const sale of effectiveSales) {
    const date = vietnamDateKey(new Date(sale.saleDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(sale.netRevenue);
    const ledger = ledgerFor(period);
    ledger.revenue += amount;
    dailyCash(ledger, date).revenue += amount;
    sourcePeriods.push(period);
  }
  for (const purchase of purchases) {
    if (!purchase.purchaseDate) continue;
    const date = vietnamDateKey(new Date(purchase.purchaseDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(purchase.totalAmount);
    const ledger = ledgerFor(period);
    ledger.purchaseTotal += amount;
    dailyCash(ledger, date).purchaseTotal += amount;
    sourcePeriods.push(period);
  }
  for (const expense of expenses) {
    if (!expense.expenseDate) continue;
    const date = vietnamDateKey(new Date(expense.expenseDate));
    const period = date.slice(0, 7);
    const amount = safeAmount(expense.amount);
    const ledger = ledgerFor(period);
    ledger.expenseTotal += amount;
    dailyCash(ledger, date).expenseTotal += amount;
    sourcePeriods.push(period);
  }
  for (const item of equipment) {
    if (!item.purchaseDate) continue;
    const period = periodFromDate(new Date(item.purchaseDate));
    const ledger = ledgerFor(period);
    ledger.equipmentTotal += safeAmount(item.totalAmount);
    sourcePeriods.push(period);
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
  let previouslySettledPools = 0;
  const summaries = [];

  for (const period of periods) {
    const ledger = ledgers.get(period) ?? emptyLedger();
    cumulativeRevenue += ledger.revenue;
    cumulativeCosts +=
      ledger.purchaseTotal + ledger.expenseTotal + ledger.equipmentTotal;
    const isClosed = period < currentPeriod;
    const existing = existingByPeriod.get(period);

    if (isClosed && existing) {
      summaries.push(settlementDto(existing, true));
      previouslySettledPools += existing.distributablePool;
      continue;
    }

    const endOfPeriod = vietnamDayBoundary(periodEndKey(period), true);
    const shares: PayrollShareInput[] = employees
      .filter(
        (employee) =>
          employee.isActive && new Date(employee.joinedAt) <= endOfPeriod,
      )
      .map((employee) => ({
        employeeId: String(employee._id),
        employeeName: employee.name,
        role: employee.role,
        sharePercent: employee.sharePercent,
      }));
    const workingCapitalReserve = calculateWorkingCapitalReserve(
      [...ledger.daily.entries()]
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([, day]) => day),
    );
    const distribution = calculatePeriodDistribution({
      cumulativeRevenue,
      cumulativeCosts,
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
      workingCapitalReserve,
      ...distribution,
    };

    if (!isClosed) {
      summaries.push(settlementDto(computed, false));
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
