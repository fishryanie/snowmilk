import { convertQuantity } from "./units";

export type CostInputs = {
  milkCost: number;
  toppingCost: number;
  packagingCost: number;
  overheadRate: number;
  allocatedFixedCost: number;
};

export function calculateProductCost(input: CostInputs) {
  const directCost = input.milkCost + input.toppingCost + input.packagingCost;
  const overheadCost = directCost * input.overheadRate;
  const variableCost = directCost + overheadCost;
  const fullCost = variableCost + input.allocatedFixedCost;
  return { directCost, overheadCost, variableCost, fullCost };
}

export function calculateIngredientCost(
  quantity: number,
  unitCost: number,
  wasteRate = 0,
) {
  return quantity * unitCost * (1 + wasteRate);
}

export function calculateIngredientCostWithUnits(input: {
  quantity: number;
  quantityUnit: string;
  unitCost: number;
  costUnit: string;
  wasteRate?: number;
}) {
  const costQuantity = convertQuantity(
    input.quantity,
    input.quantityUnit,
    input.costUnit,
  );
  return calculateIngredientCost(
    costQuantity,
    input.unitCost,
    input.wasteRate,
  );
}

export function calculatePurchasePricing(input: {
  packageCount: number;
  referencePackagePrice: number;
  actualPackagePrice?: number;
  totalAmount?: number;
}) {
  const fallbackPackagePrice =
    input.actualPackagePrice ?? input.referencePackagePrice;
  const totalAmount =
    input.totalAmount ?? input.packageCount * fallbackPackagePrice;
  const actualPackagePrice =
    input.packageCount > 0 ? totalAmount / input.packageCount : 0;

  return { actualPackagePrice, totalAmount };
}
