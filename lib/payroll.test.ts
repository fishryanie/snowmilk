import { describe, expect, test } from "bun:test";
import {
  calculateEmployeeEntitlement,
  calculatePeriodDistribution,
  calculatePayrollSummary,
  PAYROLL_WORKING_CAPITAL_RESERVE,
} from "./payroll";

describe("payroll allocation", () => {
  test("always keeps the fixed 10-million working-capital reserve", () => {
    expect(
      calculatePayrollSummary({
        businessCashBalance: 50_000_000,
        withdrawnTotal: 0,
        allocatedPercent: 100,
      }),
    ).toEqual({
      operatingReserve: PAYROLL_WORKING_CAPITAL_RESERVE,
      grossPayrollPool: 40_000_000,
      availablePayrollPool: 40_000_000,
      unallocatedPool: 0,
    });
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

    expect(summary.availablePayrollPool).toBe(44_000_000);
    expect(summary.unallocatedPool).toBe(15_000_000);
    expect(calculateEmployeeEntitlement(summary.grossPayrollPool, 20)).toBe(
      10_000_000,
    );
  });

  test("does not lower the fixed reserve when the cash balance is smaller", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 3_000_000,
      withdrawnTotal: 0,
      allocatedPercent: 100,
    });

    expect(summary.operatingReserve).toBe(10_000_000);
    expect(summary.grossPayrollPool).toBe(0);
  });

  test("reserves unclaimed owner capital before closing a monthly pool", () => {
    const distribution = calculatePeriodDistribution({
      businessCashBalance: 18_000_000,
      outstandingOwnerCapital: 2_000_000,
      previouslySettledPools: 1_000_000,
      workingCapitalReserve: PAYROLL_WORKING_CAPITAL_RESERVE,
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
      workingCapitalReserve: PAYROLL_WORKING_CAPITAL_RESERVE,
      shares: [],
    });
    const afterClaim = calculatePeriodDistribution({
      businessCashBalance: 16_000_000,
      outstandingOwnerCapital: 0,
      previouslySettledPools: 1_000_000,
      workingCapitalReserve: PAYROLL_WORKING_CAPITAL_RESERVE,
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
      workingCapitalReserve: PAYROLL_WORKING_CAPITAL_RESERVE,
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
