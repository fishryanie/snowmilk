import { describe, expect, it } from "bun:test";
import {
  addUnsignedDecimals,
  deriveUnitCostVnd,
  purchaseBalanceAmounts,
  sumVndExact,
} from "./purchase-receipt-invariants";

describe("purchase receipt fixed-precision invariants", () => {
  it("derives unit cost without floating point", () => {
    expect(deriveUnitCostVnd(20_000, "3")).toBe("6666.666666667");
    expect(deriveUnitCostVnd(125_000, "12.5")).toBe("10000");
    expect(deriveUnitCostVnd(1, "0.000000001")).toBe("1000000000");
  });

  it("adds decimal quantities exactly", () => {
    expect(addUnsignedDecimals("0.1", "0.2")).toBe("0.3");
    expect(addUnsignedDecimals("999999999999.999999999", "0.000000001")).toBe(
      "1000000000000",
    );
  });

  it("computes weighted cost from integer inventory value", () => {
    expect(
      purchaseBalanceAmounts({
        existingOnHandQuantity: "3",
        existingAvailableQuantity: "2.5",
        existingInventoryValueVnd: 20_000,
        existingCostDataQuality: "complete",
        incomingQuantity: "2",
        incomingAmountVnd: 30_000,
      }),
    ).toEqual({
      onHandQuantity: "5",
      availableQuantity: "4.5",
      averageUnitCostVnd: "10000",
      inventoryValueVnd: 50_000,
      costDataQuality: "complete",
    });
  });

  it("does not invent a cost for legacy stock with missing cost", () => {
    expect(
      purchaseBalanceAmounts({
        existingOnHandQuantity: "3",
        existingAvailableQuantity: "3",
        existingInventoryValueVnd: null,
        existingCostDataQuality: "missing_cost",
        incomingQuantity: "2",
        incomingAmountVnd: 30_000,
      }),
    ).toMatchObject({
      onHandQuantity: "5",
      averageUnitCostVnd: null,
      inventoryValueVnd: null,
      costDataQuality: "missing_cost",
    });
  });

  it("rejects unsafe VND totals", () => {
    expect(() => sumVndExact([Number.MAX_SAFE_INTEGER, 1])).toThrow(
      "vượt quá giới hạn",
    );
  });
});
