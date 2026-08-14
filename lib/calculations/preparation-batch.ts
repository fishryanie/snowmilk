import { calculateIngredientCostWithUnits } from "./costing";
import { convertQuantity } from "./units";

export type PreparationBatchType = "milk_base" | "topping";
export type PreparationOutputUnit = "ml" | "lít" | "g" | "kg";

export type PreparationIngredientCostLine = {
  quantity: number;
  unit: string;
  unitCost: number;
  costUnit: string;
};

export type PreparationBatchCostSource = {
  batchType?: PreparationBatchType;
  outputQuantity?: number;
  outputUnit?: string;
  outputBaseQuantity?: number;
  outputBaseUnit?: string;
  costPerBaseUnit?: number;
  actualLiters?: number;
  costPerMl?: number;
};

export function preparationBaseUnit(batchType: PreparationBatchType) {
  return batchType === "milk_base" ? "ml" : "g";
}

export function calculatePreparationBatchCost(input: {
  batchType: PreparationBatchType;
  outputQuantity: number;
  outputUnit: string;
  ingredients: PreparationIngredientCostLine[];
  electricityCost: number;
  waterCleaningCost: number;
}) {
  const outputBaseUnit = preparationBaseUnit(input.batchType);
  const outputBaseQuantity = convertQuantity(
    input.outputQuantity,
    input.outputUnit,
    outputBaseUnit,
  );
  if (outputBaseQuantity <= 0) {
    throw new Error("Sản lượng thành phẩm phải lớn hơn 0.");
  }

  const ingredientCost = input.ingredients.reduce(
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
  const totalCost =
    ingredientCost + input.electricityCost + input.waterCleaningCost;
  const costPerBaseUnit = totalCost / outputBaseQuantity;
  const isMilkBase = input.batchType === "milk_base";

  return {
    batchType: input.batchType,
    outputQuantity: input.outputQuantity,
    outputUnit: input.outputUnit,
    ingredientCost,
    totalCost,
    outputBaseQuantity,
    outputBaseUnit,
    costPerBaseUnit,
    actualLiters: isMilkBase ? outputBaseQuantity / 1_000 : 0,
    costPerLiter: isMilkBase ? costPerBaseUnit * 1_000 : 0,
    costPerMl: isMilkBase ? costPerBaseUnit : 0,
  };
}

export function normalizedPreparationCostSource(
  source: PreparationBatchCostSource,
) {
  const batchType = source.batchType ?? "milk_base";
  const outputBaseUnit =
    source.outputBaseUnit || preparationBaseUnit(batchType);
  const outputBaseQuantity =
    Number(source.outputBaseQuantity ?? 0) ||
    (batchType === "milk_base"
      ? Number(source.actualLiters ?? 0) * 1_000
      : convertQuantity(
          Number(source.outputQuantity ?? 0),
          source.outputUnit || "g",
          "g",
        ));
  const costPerBaseUnit =
    Number(source.costPerBaseUnit ?? 0) ||
    (batchType === "milk_base" ? Number(source.costPerMl ?? 0) : 0);

  return {
    batchType,
    outputBaseUnit,
    outputBaseQuantity,
    costPerBaseUnit,
  };
}

export function calculatePreparationUsageCost(
  source: PreparationBatchCostSource,
  quantity: number,
  unit: string,
) {
  const normalized = normalizedPreparationCostSource(source);
  return calculateIngredientCostWithUnits({
    quantity,
    quantityUnit: unit,
    unitCost: normalized.costPerBaseUnit,
    costUnit: normalized.outputBaseUnit,
  });
}
