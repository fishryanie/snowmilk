import { describe, expect, test } from "bun:test";
import {
  calculateEmployeeEntitlement,
  calculatePeriodDistribution,
  calculatePayrollSummary,
} from "./payroll";

describe("payroll allocation", () => {
  test("keeps only the largest working-capital shortfall", () => {
    expect(
      calculatePayrollSummary({
        businessCashBalance: 50_000_000,
        dailyOperatingCash: [
          { revenue: 0, purchaseTotal: 8_000_000, expenseTotal: 0 },
          { revenue: 5_000_000, purchaseTotal: 3_000_000, expenseTotal: 0 },
          { revenue: 10_000_000, purchaseTotal: 2_000_000, expenseTotal: 0 },
        ],
        withdrawnTotal: 0,
        allocatedPercent: 100,
      }),
    ).toEqual({
      operatingReserve: 8_000_000,
      grossPayrollPool: 42_000_000,
      availablePayrollPool: 42_000_000,
      unallocatedPool: 0,
    });
  });

  test("never exposes cash when the operating reserve is not covered", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 18_000_000,
      dailyOperatingCash: [
        { revenue: 0, purchaseTotal: 20_000_000, expenseTotal: 0 },
      ],
      withdrawnTotal: 2_000_000,
      allocatedPercent: 75,
    });

    expect(summary.grossPayrollPool).toBe(0);
    expect(summary.availablePayrollPool).toBe(0);
  });

  test("deducts withdrawals and keeps the unassigned percentage in the company", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 60_000_000,
      dailyOperatingCash: [
        { revenue: 0, purchaseTotal: 10_000_000, expenseTotal: 0 },
        { revenue: 12_000_000, purchaseTotal: 0, expenseTotal: 0 },
      ],
      withdrawnTotal: 6_000_000,
      allocatedPercent: 70,
    });

    expect(summary.availablePayrollPool).toBe(44_000_000);
    expect(summary.unallocatedPool).toBe(15_000_000);
    expect(calculateEmployeeEntitlement(summary.grossPayrollPool, 20)).toBe(
      10_000_000,
    );
  });

  test("sales fund same-day restocking and inactive days add no reserve", () => {
    const summary = calculatePayrollSummary({
      businessCashBalance: 18_000_000,
      dailyOperatingCash: [
        { revenue: 1_000_000, purchaseTotal: 800_000, expenseTotal: 0 },
        { revenue: 0, purchaseTotal: 0, expenseTotal: 0 },
        { revenue: 2_000_000, purchaseTotal: 1_200_000, expenseTotal: 300_000 },
      ],
      withdrawnTotal: 0,
      allocatedPercent: 100,
    });

    expect(summary.operatingReserve).toBe(0);
    expect(summary.grossPayrollPool).toBe(18_000_000);
  });

  test("closes only clean cash after every cost and prior monthly pool", () => {
    const distribution = calculatePeriodDistribution({
      cumulativeRevenue: 20_000_000,
      cumulativeCosts: 12_000_000,
      previouslySettledPools: 1_000_000,
      workingCapitalReserve: 2_000_000,
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
});
