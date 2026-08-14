import { describe, expect, test } from "bun:test";
import {
  calculatePreparationBatchCost,
  calculatePreparationUsageCost,
} from "./preparation-batch";

describe("preparation batch costing", () => {
  test("calculates a 6 liter milk base in ml", () => {
    const result = calculatePreparationBatchCost({
      batchType: "milk_base",
      outputQuantity: 6,
      outputUnit: "lít",
      ingredients: [
        { quantity: 1, unit: "kg", unitCost: 30_000, costUnit: "kg" },
      ],
      electricityCost: 3_000,
      waterCleaningCost: 0,
    });

    expect(result.outputBaseQuantity).toBe(6_000);
    expect(result.outputBaseUnit).toBe("ml");
    expect(result.costPerMl).toBe(5.5);
    expect(calculatePreparationUsageCost(result, 350, "ml")).toBe(1_925);
  });

  test("keeps a cooked topping cost independent from drink size", () => {
    const topping = calculatePreparationBatchCost({
      batchType: "topping",
      outputQuantity: 75,
      outputUnit: "g",
      ingredients: [
        { quantity: 60, unit: "g", unitCost: 28_000, costUnit: "kg" },
        { quantity: 15, unit: "g", unitCost: 50_000, costUnit: "kg" },
      ],
      electricityCost: 0,
      waterCleaningCost: 0,
    });

    expect(topping.ingredientCost).toBe(2_430);
    expect(topping.costPerBaseUnit).toBe(32.4);
    expect(calculatePreparationUsageCost(topping, 10, "g")).toBe(324);
  });
});
