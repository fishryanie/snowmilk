import { describe, expect, test } from "bun:test";
import {
  allocateVndProportionally,
  calculateSalesDay,
  multiplyDecimalRateToVnd,
  multiplyVnd,
} from "./money";

describe("v2 integer VND calculations", () => {
  test("multiplies integer quantity and VND without floating point", () => {
    expect(multiplyVnd(3, 20_000)).toBe(60_000);
    expect(() => multiplyVnd(0.5, 20_000)).toThrow("Số lượng");
  });

  test("multiplies decimal rates exactly and rounds half-up", () => {
    expect(multiplyDecimalRateToVnd("200.5", "12.34")).toBe(2_474);
    expect(multiplyDecimalRateToVnd("0.5", "1")).toBe(1);
    expect(multiplyDecimalRateToVnd("0.49", "1")).toBe(0);
    expect(multiplyDecimalRateToVnd("200", "12.3400")).toBe(2_468);
  });

  test("allocates remainder deterministically by largest remainder then key", () => {
    expect(
      allocateVndProportionally(2, [
        { key: "C", weight: 1 },
        { key: "B", weight: 1 },
        { key: "A", weight: 1 },
      ]),
    ).toEqual({ C: 0, B: 1, A: 1 });
    expect(
      allocateVndProportionally(10, [
        { key: "small", weight: 1 },
        { key: "large", weight: 3 },
      ]),
    ).toEqual({ small: 2, large: 8 });
  });

  test("computes close parity and proportional global discount", () => {
    const result = calculateSalesDay(
      [
        {
          lineKey: "HBF-BOX-001",
          skuId: "healthy",
          quantity: 3,
          unitPriceVnd: 20_000,
        },
        {
          lineKey: "M-OREO",
          skuId: "snow",
          quantity: 1,
          unitPriceVnd: 35_000,
        },
      ],
      5_000,
      { cashVnd: 50_000, bankTransferVnd: 40_000 },
    );

    expect(result.totals).toEqual({
      grossRevenueVnd: 95_000,
      discountVnd: 5_000,
      refundVnd: 0,
      netRevenueVnd: 90_000,
      collectedVnd: 90_000,
      paymentDifferenceVnd: 0,
    });
    expect(result.canClose).toBe(true);
    expect(result.lines.map(({ sharedDiscountVnd }) => sharedDiscountVnd)).toEqual([
      3_158,
      1_842,
    ]);
  });

  test("reports payment mismatch instead of silently closing", () => {
    const result = calculateSalesDay(
      [
        {
          lineKey: "HBF-BOX-001",
          skuId: "healthy",
          quantity: 1,
          unitPriceVnd: 20_000,
        },
      ],
      0,
      { cashVnd: 19_000 },
    );
    expect(result.canClose).toBe(false);
    expect(result.totals.paymentDifferenceVnd).toBe(-1_000);
  });
});
