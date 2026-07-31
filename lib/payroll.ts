export type DailyOperatingCash = {
  revenue: number;
  purchaseTotal: number;
  expenseTotal: number;
};

export type PayrollShareInput = {
  employeeId: string;
  employeeName: string;
  role: string;
  sharePercent: number;
};

export type PayrollAllocation = PayrollShareInput & {
  amount: number;
};

export function calculateWorkingCapitalReserve(
  dailyOperatingCash: readonly DailyOperatingCash[],
) {
  let unfundedCash = 0;
  let largestShortfall = 0;

  for (const day of dailyOperatingCash) {
    const cashIn = Math.max(0, day.revenue);
    const operatingCashOut =
      Math.max(0, day.purchaseTotal) + Math.max(0, day.expenseTotal);

    unfundedCash = Math.max(0, unfundedCash + operatingCashOut - cashIn);
    largestShortfall = Math.max(largestShortfall, unfundedCash);
  }

  return Math.ceil(largestShortfall);
}

export function calculatePayrollSummary({
  businessCashBalance,
  dailyOperatingCash,
  withdrawnTotal,
  allocatedPercent,
}: {
  businessCashBalance: number;
  dailyOperatingCash: readonly DailyOperatingCash[];
  withdrawnTotal: number;
  allocatedPercent: number;
}) {
  const operatingReserve =
    calculateWorkingCapitalReserve(dailyOperatingCash);
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
  cumulativeRevenue,
  cumulativeCosts,
  previouslySettledPools,
  workingCapitalReserve,
  shares,
}: {
  cumulativeRevenue: number;
  cumulativeCosts: number;
  previouslySettledPools: number;
  workingCapitalReserve: number;
  shares: readonly PayrollShareInput[];
}) {
  const distributablePool = Math.max(
    0,
    Math.floor(
      Math.max(0, cumulativeRevenue) -
        Math.max(0, cumulativeCosts) -
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
