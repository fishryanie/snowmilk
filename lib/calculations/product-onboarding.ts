import {
  calculateIngredientCostWithUnits,
  calculateProductCost,
} from "./costing";

export const DEFAULT_STERILIZATION_COST_PER_LITER = 5_000;

export type RecipeCostLine = {
  quantity: number;
  unit: string;
  unitCost: number;
  costUnit: string;
};

export function calculateRecipeCost(
  yieldMl: number,
  ingredients: RecipeCostLine[],
) {
  const ingredientCost = ingredients.reduce(
    (total, ingredient) =>
      total +
      calculateIngredientCostWithUnits({
        quantity: ingredient.quantity,
        quantityUnit: ingredient.unit,
        unitCost: ingredient.unitCost,
        costUnit: ingredient.costUnit,
      }),
    0,
  );
  return {
    ingredientCost,
    costPerMl: yieldMl > 0 ? ingredientCost / yieldMl : 0,
  };
}

export function calculateInlinePackagingUnitCost(input: {
  packageQuantity: number;
  packagePrice: number;
}) {
  return input.packageQuantity > 0
    ? input.packagePrice / input.packageQuantity
    : 0;
}

export function calculateSterilizationCost(
  servingMl: number,
  costPerLiter = DEFAULT_STERILIZATION_COST_PER_LITER,
) {
  return (Math.max(0, servingMl) / 1_000) * Math.max(0, costPerLiter);
}

export function calculateOnboardingProductCost(input: {
  milkCost: number;
  toppingCost: number;
  packagingCost: number;
  overheadRate: number;
  allocatedFixedCost: number;
}) {
  const costs = calculateProductCost({
    milkCost: input.milkCost,
    toppingCost: input.toppingCost,
    packagingCost: input.packagingCost,
    overheadRate: input.overheadRate,
    allocatedFixedCost: input.allocatedFixedCost,
  });
  return { recipeCost: input.milkCost, ...costs };
}
