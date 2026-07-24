import { describe, expect, test } from "bun:test";
import {
  calculateIngredientCostWithUnits,
  calculatePurchasePricing,
} from "./costing";

describe("ingredient costing", () => {
  test("converts recipe grams to a kilogram cost unit", () => {
    expect(
      calculateIngredientCostWithUnits({
        quantity: 15,
        quantityUnit: "g",
        unitCost: 396_000,
        costUnit: "kg",
      }),
    ).toBe(5_940);
  });

  test("keeps gram-based costs unchanged", () => {
    expect(
      calculateIngredientCostWithUnits({
        quantity: 15,
        quantityUnit: "g",
        unitCost: 237.5,
        costUnit: "gram",
      }),
    ).toBe(3_562.5);
  });
});

describe("purchase pricing", () => {
  test("spreads the full paid amount, including shipping, across packages", () => {
    expect(
      calculatePurchasePricing({
        packageCount: 13,
        referencePackagePrice: 25_000,
        totalAmount: 350_000,
      }),
    ).toEqual({
      actualPackagePrice: 350_000 / 13,
      totalAmount: 350_000,
    });
  });

  test("keeps compatibility with unit-price purchase payloads", () => {
    expect(
      calculatePurchasePricing({
        packageCount: 13,
        referencePackagePrice: 25_000,
        actualPackagePrice: 26_000,
      }),
    ).toEqual({
      actualPackagePrice: 26_000,
      totalAmount: 338_000,
    });
  });
});
