import { describe, expect, test } from "bun:test";
import {
  calculateInlinePackagingUnitCost,
  calculateOnboardingProductCost,
  calculateRecipeCost,
  calculateSterilizationCost,
} from "./product-onboarding";

describe("product onboarding costs", () => {
  test("calculates a 430ml bottle recipe from ml and gram inputs", () => {
    const result = calculateRecipeCost(430, [
      { quantity: 400, unit: "ml", unitCost: 22_000, costUnit: "lít" },
      { quantity: 60, unit: "g", unitCost: 24_000, costUnit: "kg" },
    ]);

    expect(result.ingredientCost).toBe(10_240);
    expect(result.costPerMl).toBeCloseTo(10_240 / 430);
  });

  test("spreads a 145k pack across 200 bottles", () => {
    expect(
      calculateInlinePackagingUnitCost({
        packageQuantity: 200,
        packagePrice: 145_000,
      }),
    ).toBe(725);
  });

  test("calculates the optional sterilization cost from product volume", () => {
    expect(calculateSterilizationCost(430)).toBe(2_150);
    expect(calculateSterilizationCost(1_000)).toBe(5_000);
  });

  test("combines milk, topping, packaging, overhead and fixed allocation", () => {
    const result = calculateOnboardingProductCost({
      milkCost: 8_000,
      toppingCost: 324,
      packagingCost: 725,
      overheadRate: 0.05,
      allocatedFixedCost: 500,
    });

    expect(result.recipeCost).toBe(8_000);
    expect(result.directCost).toBe(9_049);
    expect(result.overheadCost).toBeCloseTo(452.45);
    expect(result.variableCost).toBeCloseTo(9_501.45);
    expect(result.fullCost).toBeCloseTo(10_001.45);
  });
});
