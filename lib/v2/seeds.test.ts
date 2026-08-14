import { describe, expect, test } from "bun:test";
import { BUSINESS_LINE_SEEDS } from "./constants";
import {
  HEALTHY_BREAKFAST_RECIPE_VERSION,
  HEALTHY_BREAKFAST_SKU,
} from "./seeds";

describe("Bếp Nhà Nè v2 seed definitions", () => {
  test("keeps MILK aggregate-only and its children posting", () => {
    expect(BUSINESS_LINE_SEEDS).toContainEqual(
      expect.objectContaining({ code: "MILK", isPosting: false }),
    );
    expect(BUSINESS_LINE_SEEDS).toContainEqual(
      expect.objectContaining({
        code: "SNOW_MILK",
        parentCode: "MILK",
        isPosting: true,
      }),
    );
    expect(BUSINESS_LINE_SEEDS).toContainEqual(
      expect.objectContaining({
        code: "FRESH_MILK",
        parentCode: "MILK",
        isPosting: true,
      }),
    );
  });

  test("seeds the healthy box at exactly 20,000 VND", () => {
    expect(HEALTHY_BREAKFAST_SKU).toMatchObject({
      code: "HBF-BOX-001",
      businessLineCode: "BREAKFAST",
      unitPriceVnd: 20_000,
      fulfillment: "preproduced",
      sellingUnit: "box",
    });
  });

  test("stores finished portions but never guesses raw yields", () => {
    expect(HEALTHY_BREAKFAST_RECIPE_VERSION.finishedSpec).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Khoai đã hấp, lột vỏ",
          quantity: "200",
          unit: "g",
        }),
        expect.objectContaining({
          name: "Bắp Mỹ phần ăn được đã hấp, lột",
          quantity: "200",
          unit: "g",
        }),
      ]),
    );
    expect(
      HEALTHY_BREAKFAST_RECIPE_VERSION.components
        .filter(({ requiresYieldConfiguration }) => requiresYieldConfiguration)
        .every(
          ({ expectedInputQuantity, expectedYieldPercent }) =>
            expectedInputQuantity === null && expectedYieldPercent === null,
        ),
    ).toBe(true);
  });
});
