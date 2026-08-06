export const PAYROLL_CALCULATION_VERSION = "profit-share-v1";

export type PayrollPayslipSnapshot = {
  calculationVersion: typeof PAYROLL_CALCULATION_VERSION;
  employeeRole: string;
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  cumulativeRevenue: number;
  companyFundedOutflow: number;
  businessCashBalance: number;
  outstandingOwnerCapital: number;
  previouslySettledPools: number;
  workingCapitalReserve: number;
  distributablePool: number;
  allocatedTotal: number;
  unallocatedPool: number;
  employeeEntitlement: number;
};

export type PayrollSettlementForPayslip = {
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  cumulativeRevenue: number;
  businessCashBalance?: number;
  outstandingOwnerCapital?: number;
  workingCapitalReserve: number;
  distributablePool: number;
  allocatedTotal: number;
  unallocatedPool: number;
};

export type PayrollAllocationForPayslip = {
  role: string;
  amount: number;
};

function money(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
}

function signedMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}

export function createPayrollPayslipSnapshot({
  settlement,
  allocation,
  previouslySettledPools,
}: {
  settlement: PayrollSettlementForPayslip;
  allocation: PayrollAllocationForPayslip;
  previouslySettledPools: number;
}): PayrollPayslipSnapshot {
  const cumulativeRevenue = money(settlement.cumulativeRevenue);
  const businessCashBalance = signedMoney(settlement.businessCashBalance);

  return {
    calculationVersion: PAYROLL_CALCULATION_VERSION,
    employeeRole: allocation.role,
    periodRevenue: money(settlement.periodRevenue),
    periodPurchaseTotal: money(settlement.periodPurchaseTotal),
    periodExpenseTotal: money(settlement.periodExpenseTotal),
    periodEquipmentTotal: money(settlement.periodEquipmentTotal),
    cumulativeRevenue,
    companyFundedOutflow: Math.max(
      0,
      cumulativeRevenue - businessCashBalance,
    ),
    businessCashBalance,
    outstandingOwnerCapital: money(settlement.outstandingOwnerCapital),
    previouslySettledPools: money(previouslySettledPools),
    workingCapitalReserve: money(settlement.workingCapitalReserve),
    distributablePool: money(settlement.distributablePool),
    allocatedTotal: money(settlement.allocatedTotal),
    unallocatedPool: money(settlement.unallocatedPool),
    employeeEntitlement: money(allocation.amount),
  };
}
