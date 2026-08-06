import { describe, expect, test } from "bun:test";
import {
  createPayrollPayslipSnapshot,
  PAYROLL_CALCULATION_VERSION,
} from "./payroll-payslip";
import { payrollPayslipPreviewSchema } from "./validators/payroll";

describe("payroll payslip snapshot", () => {
  test("captures the complete source-of-funds calculation", () => {
    const snapshot = createPayrollPayslipSnapshot({
      settlement: {
        periodRevenue: 12_000_000,
        periodPurchaseTotal: 2_000_000,
        periodExpenseTotal: 1_000_000,
        periodEquipmentTotal: 500_000,
        cumulativeRevenue: 80_000_000,
        businessCashBalance: 58_000_000,
        outstandingOwnerCapital: 3_000_000,
        workingCapitalReserve: 10_000_000,
        distributablePool: 40_000_000,
        allocatedTotal: 36_000_000,
        unallocatedPool: 4_000_000,
      },
      allocation: {
        role: "Quản lý cửa hàng",
        amount: 8_000_000,
      },
      previouslySettledPools: 5_000_000,
    });

    expect(snapshot).toEqual({
      calculationVersion: PAYROLL_CALCULATION_VERSION,
      employeeRole: "Quản lý cửa hàng",
      periodRevenue: 12_000_000,
      periodPurchaseTotal: 2_000_000,
      periodExpenseTotal: 1_000_000,
      periodEquipmentTotal: 500_000,
      cumulativeRevenue: 80_000_000,
      companyFundedOutflow: 22_000_000,
      businessCashBalance: 58_000_000,
      outstandingOwnerCapital: 3_000_000,
      previouslySettledPools: 5_000_000,
      workingCapitalReserve: 10_000_000,
      distributablePool: 40_000_000,
      allocatedTotal: 36_000_000,
      unallocatedPool: 4_000_000,
      employeeEntitlement: 8_000_000,
    });
  });

  test("normalizes invalid values while preserving a negative cash balance", () => {
    const snapshot = createPayrollPayslipSnapshot({
      settlement: {
        periodRevenue: -1,
        periodPurchaseTotal: Number.NaN,
        periodExpenseTotal: 0,
        periodEquipmentTotal: 0,
        cumulativeRevenue: 2_000_000,
        businessCashBalance: -1_000_000,
        outstandingOwnerCapital: -10,
        workingCapitalReserve: 10_000_000,
        distributablePool: 0,
        allocatedTotal: 0,
        unallocatedPool: 0,
      },
      allocation: { role: "Nhân sự", amount: -1 },
      previouslySettledPools: -1,
    });

    expect(snapshot.companyFundedOutflow).toBe(3_000_000);
    expect(snapshot.businessCashBalance).toBe(-1_000_000);
    expect(snapshot.periodRevenue).toBe(0);
    expect(snapshot.periodPurchaseTotal).toBe(0);
    expect(snapshot.employeeEntitlement).toBe(0);
  });
});

describe("payroll payslip preview input", () => {
  test("accepts only the fields needed to build a read-only preview", () => {
    const parsed = payrollPayslipPreviewSchema.safeParse({
      employeeId: "66b1a2c3d4e5f6789012abcd",
      period: "2026-07",
      withdrawalDate: "2026-08-05T03:00:00.000Z",
      note: "Đối chiếu trước khi nhận lương",
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects a client-provided amount so the server remains authoritative", () => {
    const parsed = payrollPayslipPreviewSchema.safeParse({
      employeeId: "66b1a2c3d4e5f6789012abcd",
      period: "2026-07",
      withdrawalDate: "2026-08-05T03:00:00.000Z",
      amount: 1,
    });

    expect(parsed.success).toBe(false);
  });
});
