import { describe, expect, it } from "bun:test";
import {
  addUnsignedDecimals,
  deriveUnitCostVnd,
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



  it("rejects unsafe VND totals", () => {
    expect(() => sumVndExact([Number.MAX_SAFE_INTEGER, 1])).toThrow(
      "vượt quá giới hạn",
    );
  });
});
