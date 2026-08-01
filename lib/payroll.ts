export const PAYROLL_WORKING_CAPITAL_RESERVE = 10_000_000;

export type PayrollShareInput = {
  employeeId: string;
  employeeName: string;
  role: string;
  sharePercent: number;
};

export type PayrollAllocation = PayrollShareInput & {
  amount: number;
};

export function calculatePayrollSummary({
  businessCashBalance,
  withdrawnTotal,
  allocatedPercent,
}: {
  businessCashBalance: number;
  withdrawnTotal: number;
  allocatedPercent: number;
}) {
  const operatingReserve = PAYROLL_WORKING_CAPITAL_RESERVE;
  const grossPayrollPool = Math.max(
    0,
    Math.floor(businessCashBalance - operatingReserve),
  );

  return {
    operatingReserve,
    grossPayrollPool,
    availablePayrollPool: Math.max(
      0,
      Math.floor(grossPayrollPool - withdrawnTotal),
    ),
    unallocatedPool: Math.floor(
      grossPayrollPool *
        Math.max(0, 1 - Math.min(100, allocatedPercent) / 100),
    ),
  };
}

export function calculateEmployeeEntitlement(
  grossPayrollPool: number,
  sharePercent: number,
) {
  return Math.floor(
    Math.max(0, grossPayrollPool) *
      (Math.max(0, Math.min(100, sharePercent)) / 100),
  );
}

export function calculatePeriodDistribution({
  businessCashBalance,
  outstandingOwnerCapital,
  previouslySettledPools,
  workingCapitalReserve,
  shares,
}: {
  businessCashBalance: number;
  outstandingOwnerCapital: number;
  previouslySettledPools: number;
  workingCapitalReserve: number;
  shares: readonly PayrollShareInput[];
}) {
  const distributablePool = Math.max(
    0,
    Math.floor(
      Math.max(0, businessCashBalance) -
        Math.max(0, outstandingOwnerCapital) -
        Math.max(0, previouslySettledPools) -
        Math.max(0, workingCapitalReserve),
    ),
  );
  const allocations: PayrollAllocation[] = shares.map((share) => ({
    ...share,
    amount: calculateEmployeeEntitlement(
      distributablePool,
      share.sharePercent,
    ),
  }));
  const allocatedTotal = allocations.reduce(
    (total, allocation) => total + allocation.amount,
    0,
  );

  return {
    distributablePool,
    allocatedTotal,
    unallocatedPool: Math.max(0, distributablePool - allocatedTotal),
    allocations,
  };
}
