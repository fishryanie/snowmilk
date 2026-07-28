export const DEFAULT_RESERVE_DAYS = 30;
export const DEFAULT_MINIMUM_SALES_DAYS = 7;

type DivestmentSuggestionInput = {
  cumulativeCashIn: number;
  cumulativeCashOut: number;
  withdrawnTotal: number;
  recordedCashBalance?: number;
  remainingCapital: number;
  periodRevenue: number;
  periodOperatingCashOut: number;
  periodDays: number;
  salesDays: number;
  reserveDays?: number;
  minimumSalesDays?: number;
};

function safeNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundDownToThousand(value: number) {
  return Math.floor(safeNonNegative(value) / 1_000) * 1_000;
}

export function calculateDivestmentSuggestion(
  input: DivestmentSuggestionInput,
) {
  const cumulativeCashIn = safeNonNegative(input.cumulativeCashIn);
  const cumulativeCashOut = safeNonNegative(input.cumulativeCashOut);
  const withdrawnTotal = safeNonNegative(input.withdrawnTotal);
  const remainingCapital = safeNonNegative(input.remainingCapital);
  const periodRevenue = safeNonNegative(input.periodRevenue);
  const periodOperatingCashOut = safeNonNegative(
    input.periodOperatingCashOut,
  );
  const periodDays = Math.max(1, Math.floor(safeNonNegative(input.periodDays)));
  const salesDays = Math.floor(safeNonNegative(input.salesDays));
  const reserveDays = Math.max(
    1,
    Math.floor(
      safeNonNegative(input.reserveDays ?? DEFAULT_RESERVE_DAYS),
    ),
  );
  const minimumSalesDays = Math.max(
    1,
    Math.floor(
      safeNonNegative(
        input.minimumSalesDays ?? DEFAULT_MINIMUM_SALES_DAYS,
      ),
    ),
  );

  const recordedCashBalance = Number.isFinite(input.recordedCashBalance)
    ? (input.recordedCashBalance as number)
    : cumulativeCashIn - cumulativeCashOut - withdrawnTotal;
  const averageDailyOperatingCashOut = periodOperatingCashOut / periodDays;
  const reserveTarget = averageDailyOperatingCashOut * reserveDays;
  const cashAvailableAfterReserve = Math.max(
    0,
    recordedCashBalance - reserveTarget,
  );
  const periodOperatingNetCashFlow =
    periodRevenue - periodOperatingCashOut;
  const averageDailyOperatingSurplus =
    periodOperatingNetCashFlow / periodDays;

  const checks = {
    hasPositiveRecordedCash: recordedCashBalance > 0,
    hasPositiveOperatingCashFlow: periodOperatingNetCashFlow > 0,
    hasEnoughSalesData: salesDays >= minimumSalesDays,
    keepsOperatingReserve: recordedCashBalance > reserveTarget,
    hasCapitalToRecover: remainingCapital > 0,
  };
  const isReady = Object.values(checks).every(Boolean);
  const suggestedAmount = isReady
    ? roundDownToThousand(
        Math.min(cashAvailableAfterReserve, remainingCapital),
      )
    : 0;
  const cashGapBeforeSuggestion = Math.max(
    0,
    reserveTarget + 1_000 - recordedCashBalance,
  );
  const estimatedDaysUntilEligible =
    checks.hasEnoughSalesData &&
    checks.hasPositiveOperatingCashFlow &&
    checks.hasCapitalToRecover
      ? Math.ceil(cashGapBeforeSuggestion / averageDailyOperatingSurplus)
      : null;

  const status = !checks.hasCapitalToRecover
    ? "capital-recovered"
    : isReady && suggestedAmount > 0
      ? "ready"
      : checks.hasPositiveRecordedCash &&
          checks.hasPositiveOperatingCashFlow &&
          !checks.hasEnoughSalesData
        ? "insufficient-data"
        : "wait";

  return {
    status,
    suggestedAmount,
    recordedCashBalance,
    reserveTarget,
    reserveDays,
    remainingCapital,
    withdrawnTotal,
    cashAvailableAfterReserve,
    periodOperatingNetCashFlow,
    averageDailyOperatingCashOut,
    averageDailyOperatingSurplus,
    salesDays,
    minimumSalesDays,
    estimatedDaysUntilEligible,
    checks,
  };
}
