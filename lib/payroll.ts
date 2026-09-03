export const PAYROLL_WORKING_CAPITAL_RESERVE = 10_000_000;
export const PAYROLL_RISK_RESERVE = 10_000_000;

export const PAYROLL_WORKING_CAPITAL_FUND_ID = "working-capital";
export const PAYROLL_RISK_RESERVE_FUND_ID = "risk-reserve";

export const PAYROLL_RESERVE_FUND_MODES = ["fixed", "monthly"] as const;
export type PayrollReserveFundMode =
  (typeof PAYROLL_RESERVE_FUND_MODES)[number];

export type PayrollReserveFund = {
  id: string;
  name: string;
  mode: PayrollReserveFundMode;
  amount: number;
};

export const DEFAULT_PAYROLL_RESERVE_FUNDS: readonly PayrollReserveFund[] = [
  {
    id: PAYROLL_WORKING_CAPITAL_FUND_ID,
    name: "Quỹ vốn xoay vòng",
    mode: "fixed",
    amount: PAYROLL_WORKING_CAPITAL_RESERVE,
  },
  {
    id: PAYROLL_RISK_RESERVE_FUND_ID,
    name: "Quỹ dự phòng rủi ro",
    mode: "monthly",
    amount: PAYROLL_RISK_RESERVE,
  },
];

export const PAYROLL_RESERVE_SETTING_PREFIX = "payroll_reserve_funds:";

export function payrollReserveSettingKey(period: string) {
  return `${PAYROLL_RESERVE_SETTING_PREFIX}${period}`;
}

function legacyPayrollReserveFundId(name: string) {
  const normalized = name.trim().toLocaleLowerCase("vi");
  if (normalized === "quỹ vốn xoay vòng") {
    return PAYROLL_WORKING_CAPITAL_FUND_ID;
  }
  if (normalized === "quỹ dự phòng rủi ro") {
    return PAYROLL_RISK_RESERVE_FUND_ID;
  }

  const slug = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `legacy-${slug || "fund"}`;
}

function inferredPayrollReserveFundMode(
  id: string,
  name: string,
): PayrollReserveFundMode {
  return id === PAYROLL_RISK_RESERVE_FUND_ID ||
    name.trim().toLocaleLowerCase("vi") === "quỹ dự phòng rủi ro"
    ? "monthly"
    : "fixed";
}

export function normalizePayrollReserveFunds(
  value: unknown,
  fallback: readonly PayrollReserveFund[] = DEFAULT_PAYROLL_RESERVE_FUNDS,
): PayrollReserveFund[] {
  if (!Array.isArray(value)) return fallback.map((fund) => ({ ...fund }));

  const funds = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : legacyPayrollReserveFundId(name);
    const mode = PAYROLL_RESERVE_FUND_MODES.includes(
      record.mode as PayrollReserveFundMode,
    )
      ? (record.mode as PayrollReserveFundMode)
      : inferredPayrollReserveFundMode(id, name);
    const amount = Number(record.amount);
    if (!name || !Number.isFinite(amount) || amount < 0) return [];
    return [{ id, name, mode, amount: Math.floor(amount) }];
  });

  return funds.length ? funds : fallback.map((fund) => ({ ...fund }));
}

export function advancePayrollReserveFunds(
  previousBalances: readonly PayrollReserveFund[],
  periodFunds: readonly PayrollReserveFund[],
): PayrollReserveFund[] {
  const previousById = new Map(
    normalizePayrollReserveFunds(previousBalances, []).map((fund) => [
      fund.id,
      fund,
    ]),
  );

  return normalizePayrollReserveFunds(periodFunds, []).map((fund) => {
    const previousAmount = previousById.get(fund.id)?.amount ?? 0;
    return {
      ...fund,
      amount:
        fund.mode === "monthly"
          ? previousAmount + fund.amount
          : fund.amount,
    };
  });
}

export function totalPayrollReserveFunds(
  funds: readonly PayrollReserveFund[],
) {
  return funds.reduce(
    (total, fund) => total + Math.max(0, Math.floor(Number(fund.amount) || 0)),
    0,
  );
}

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
  reserveFundsTotal = totalPayrollReserveFunds(DEFAULT_PAYROLL_RESERVE_FUNDS),
}: {
  businessCashBalance: number;
  withdrawnTotal: number;
  allocatedPercent: number;
  reserveFundsTotal?: number;
}) {
  const operatingReserve = Math.max(0, reserveFundsTotal);
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
  reserveFundsTotal,
  shares,
}: {
  businessCashBalance: number;
  outstandingOwnerCapital: number;
  previouslySettledPools: number;
  reserveFundsTotal: number;
  shares: readonly PayrollShareInput[];
}) {
  const distributablePool = Math.max(
    0,
    Math.floor(
      Math.max(0, businessCashBalance) -
        Math.max(0, outstandingOwnerCapital) -
        Math.max(0, previouslySettledPools) -
        Math.max(0, reserveFundsTotal),
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
