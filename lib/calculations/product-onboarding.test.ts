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

  test("combines recipe, packaging, overhead and fixed allocation", () => {
    expect(
      calculateOnboardingProductCost({
        recipeCostPerMl: 20,
        servingMl: 400,
        packagingCost: 725,
        overheadRate: 0.05,
        allocatedFixedCost: 500,
      }),
    ).toEqual({
      recipeCost: 8_000,
      directCost: 8_725,
      overheadCost: 436.25,
      variableCost: 9_161.25,
      fullCost: 9_661.25,
    });
  });
});
