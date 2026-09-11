import { describe, expect, test } from "bun:test";
import {
  advancePayrollReserveFunds,
  calculateEmployeeEntitlement,
  calculatePeriodDistribution,
  calculatePayrollSummary,
  DEFAULT_PAYROLL_RESERVE_FUNDS,
  normalizePayrollReserveFunds,
  PAYROLL_RISK_RESERVE,
  payrollPeriodEndDateKey,
  PAYROLL_RISK_RESERVE_FUND_ID,
  PAYROLL_WORKING_CAPITAL_RESERVE,
  PAYROLL_WORKING_CAPITAL_FUND_ID,
  summarizeClosedPayrollFunds,
  totalPayrollReserveFunds,
} from "./payroll";

describe("payroll allocation", () => {
  const defaultReserveTotal = totalPayrollReserveFunds(
    DEFAULT_PAYROLL_RESERVE_FUNDS,
  );

  test("recognizes a closed payroll fund on the final day of its payroll month", () => {
    expect(payrollPeriodEndDateKey("2026-08")).toBe("2026-08-31");
    expect(payrollPeriodEndDateKey("2028-02")).toBe("2028-02-29");
  });

  test("separates salary and reserve funds once in their closing month", () => {
    expect(
      summarizeClosedPayrollFunds([
        {
          period: "2026-09",
          allocatedTotal: 12_000_000,
          reserveFundsTotal: 30_000_000,
        },
        {
          period: "2026-08",
          allocatedTotal: 18_000_000,
          reserveFundsTotal: 20_000_000,
        },
      ]),
    ).toEqual({
      movements: [
        {
          period: "2026-08",
          payrollTotal: 18_000_000,
          reserveFundTransferTotal: 20_000_000,
          reserveFundBalance: 20_000_000,
        },
        {
          period: "2026-09",
          payrollTotal: 12_000_000,
          reserveFundTransferTotal: 10_000_000,
          reserveFundBalance: 30_000_000,
        },
      ],
      settledPayrollTotal: 30_000_000,
      separatedReserveFundTotal: 30_000_000,
    });
  });

  test("keeps both the working-capital and risk reserve by default", () => {
    expect(
      calculatePayrollSummary({
        businessCashBalance: 50_000_000,
        withdrawnTotal: 0,
        allocatedPercent: 100,
      }),
    ).toEqual({
      operatingReserve: defaultReserveTotal,
      grossPayrollPool: 30_000_000,
      availablePayrollPool: 30_000_000,
      unallocatedPool: 0,
    });
    expect(defaultReserveTotal).toBe(
      PAYROLL_WORKING_CAPITAL_RESERVE + PAYROLL_RISK_RESERVE,
    );
  });

  test("never exposes cash when the operating reserve is not covered", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 8_000_000,
      withdrawnTotal: 2_000_000,
      allocatedPercent: 75,
    });

    expect(summary.grossPayrollPool).toBe(0);
    expect(summary.availablePayrollPool).toBe(0);
  });

  test("deducts withdrawals and keeps the unassigned percentage in the company", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 60_000_000,
      withdrawnTotal: 6_000_000,
      allocatedPercent: 70,
    });

    expect(summary.availablePayrollPool).toBe(34_000_000);
    expect(summary.unallocatedPool).toBe(12_000_000);
    expect(calculateEmployeeEntitlement(summary.grossPayrollPool, 20)).toBe(
      8_000_000,
    );
  });

  test("does not lower the configured reserves when the cash balance is smaller", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 3_000_000,
      withdrawnTotal: 0,
      allocatedPercent: 100,
    });

    expect(summary.operatingReserve).toBe(defaultReserveTotal);
    expect(summary.grossPayrollPool).toBe(0);
  });

  test("normalizes an extensible monthly reserve-fund list", () => {
    const funds = normalizePayrollReserveFunds([
      { name: " Quỹ vốn xoay vòng ", amount: 8_500_000.9 },
      { name: "Quỹ sửa chữa", amount: 2_000_000 },
      { name: "", amount: 999 },
    ]);

    expect(funds).toEqual([
      {
        id: PAYROLL_WORKING_CAPITAL_FUND_ID,
        name: "Quỹ vốn xoay vòng",
        mode: "fixed",
        amount: 8_500_000,
      },
      {
        id: "legacy-quy-sua-chua",
        name: "Quỹ sửa chữa",
        mode: "fixed",
        amount: 2_000_000,
      },
    ]);
    expect(totalPayrollReserveFunds(funds)).toBe(10_500_000);
  });

  test("adds the risk contribution once per period while fixed funds stay flat", () => {
    const firstMonth = advancePayrollReserveFunds(
      [],
      DEFAULT_PAYROLL_RESERVE_FUNDS,
    );
    const secondMonth = advancePayrollReserveFunds(
      firstMonth,
      DEFAULT_PAYROLL_RESERVE_FUNDS,
    );
    const recalculatedSecondMonth = advancePayrollReserveFunds(
      firstMonth,
      DEFAULT_PAYROLL_RESERVE_FUNDS,
    );

    expect(
      secondMonth.find(
        (fund) => fund.id === PAYROLL_WORKING_CAPITAL_FUND_ID,
      )?.amount,
    ).toBe(PAYROLL_WORKING_CAPITAL_RESERVE);
    expect(
      secondMonth.find((fund) => fund.id === PAYROLL_RISK_RESERVE_FUND_ID)
        ?.amount,
    ).toBe(PAYROLL_RISK_RESERVE * 2);
    expect(recalculatedSecondMonth).toEqual(secondMonth);
  });

  test("reserves unclaimed owner capital before closing a monthly pool", () => {
    const distribution = calculatePeriodDistribution({
      businessCashBalance: 18_000_000,
      outstandingOwnerCapital: 2_000_000,
      previouslySettledPools: 1_000_000,
      reserveFundsTotal: PAYROLL_WORKING_CAPITAL_RESERVE,
      shares: [
        {
          employeeId: "employee-1",
          employeeName: "Nhân sự 1",
          role: "Quản lý",
          sharePercent: 60,
        },
        {
          employeeId: "employee-2",
          employeeName: "Nhân sự 2",
          role: "Thu ngân",
          sharePercent: 30,
        },
      ],
    });

    expect(distribution.distributablePool).toBe(5_000_000);
    expect(distribution.allocatedTotal).toBe(4_500_000);
    expect(distribution.unallocatedPool).toBe(500_000);
    expect(distribution.allocations.map((item) => item.amount)).toEqual([
      3_000_000, 1_500_000,
    ]);
  });

  test("does not deduct owner capital twice after it is claimed", () => {
    const beforeClaim = calculatePeriodDistribution({
      businessCashBalance: 18_000_000,
      outstandingOwnerCapital: 2_000_000,
      previouslySettledPools: 1_000_000,
      reserveFundsTotal: PAYROLL_WORKING_CAPITAL_RESERVE,
      shares: [],
    });
    const afterClaim = calculatePeriodDistribution({
      businessCashBalance: 16_000_000,
      outstandingOwnerCapital: 0,
      previouslySettledPools: 1_000_000,
      reserveFundsTotal: PAYROLL_WORKING_CAPITAL_RESERVE,
      shares: [],
    });

    expect(afterClaim.distributablePool).toBe(
      beforeClaim.distributablePool,
    );
  });

  test("recalculates the closed amount immediately from updated shares", () => {
    const distribution = calculatePeriodDistribution({
      businessCashBalance: 21_767_000,
      outstandingOwnerCapital: 3_984_500,
      previouslySettledPools: 0,
      reserveFundsTotal: PAYROLL_WORKING_CAPITAL_RESERVE,
      shares: [
        ["employee-1", 28],
        ["employee-2", 20],
        ["employee-3", 34],
        ["employee-4", 3],
        ["employee-5", 15],
      ].map(([employeeId, sharePercent]) => ({
        employeeId: String(employeeId),
        employeeName: String(employeeId),
        role: "Nhân sự",
        sharePercent: Number(sharePercent),
      })),
    });

    expect(distribution.distributablePool).toBe(7_782_500);
    expect(distribution.allocations.map((item) => item.amount)).toEqual([
      2_179_100, 1_556_500, 2_646_050, 233_475, 1_167_375,
    ]);
  });
});
