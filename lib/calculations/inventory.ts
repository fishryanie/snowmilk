export type InventoryIngredientLine = {
  itemKey: string;
  itemCode: string;
  itemName: string;
  category: string;
  unit: string;
  totalPurchasedQuantity: number;
  onHandQuantity: number;
  unitCost: number;
};

export type InventoryMilkBatchLine = {
  batchKey: string;
  batchCode: string;
  batchName: string;
  producedLiters: number;
  remainingLiters: number;
  costPerLiter: number;
};

export type InventoryCalculationInput = {
  ingredients: InventoryIngredientLine[];
  milkBatches: InventoryMilkBatchLine[];
  averageMilkMlPerCup: number;
  previousEstimatedCups?: number;
};

export function isCupInventoryItem(item: {
  category: string;
  itemName: string;
}) {
  if (item.category !== "Bao bì") return false;
  const name = item.itemName.trim().toLocaleLowerCase("vi");
  return /^(ly|cốc)(\s|$)/u.test(name) && !/(nắp|ống|muỗng|túi)/u.test(name);
}

export function calculateInventory(input: InventoryCalculationInput) {
  const ingredientLines = input.ingredients.map((item) => {
    const onHandQuantity = Math.max(0, Number(item.onHandQuantity) || 0);
    const totalPurchasedQuantity = Math.max(
      0,
      Number(item.totalPurchasedQuantity) || 0,
    );
    const unitCost = Math.max(0, Number(item.unitCost) || 0);
    return {
      ...item,
      onHandQuantity,
      totalPurchasedQuantity,
      unitCost,
      inventoryValue: onHandQuantity * unitCost,
      inferredUsedQuantity: Math.max(
        0,
        totalPurchasedQuantity - onHandQuantity,
      ),
    };
  });

  const milkBatchLines = input.milkBatches.map((batch) => {
    const producedLiters = Math.max(0, Number(batch.producedLiters) || 0);
    const remainingLiters = Math.max(
      0,
      Number(batch.remainingLiters) || 0,
    );
    const costPerLiter = Math.max(0, Number(batch.costPerLiter) || 0);
    return {
      ...batch,
      producedLiters,
      remainingLiters,
      costPerLiter,
      inventoryValue: remainingLiters * costPerLiter,
      inferredUsedLiters: Math.max(0, producedLiters - remainingLiters),
    };
  });

  const ingredientInventoryValue = ingredientLines.reduce(
    (total, item) => total + item.inventoryValue,
    0,
  );
  const finishedMilkInventoryValue = milkBatchLines.reduce(
    (total, batch) => total + batch.inventoryValue,
    0,
  );
  const inferredCupsFromPackaging = ingredientLines
    .filter(isCupInventoryItem)
    .reduce((total, item) => total + item.inferredUsedQuantity, 0);
  const inferredMilkLitersUsed = milkBatchLines.reduce(
    (total, batch) => total + batch.inferredUsedLiters,
    0,
  );
  const milkReconciliationReliable = milkBatchLines.every(
    (batch) => batch.remainingLiters <= batch.producedLiters,
  );
  const averageMilkMlPerCup = Math.max(
    0,
    Number(input.averageMilkMlPerCup) || 0,
  );
  const inferredCupsFromMilk =
    averageMilkMlPerCup > 0
      ? (inferredMilkLitersUsed * 1_000) / averageMilkMlPerCup
      : 0;
  const hasCupPurchaseHistory = ingredientLines.some(
    (item) => isCupInventoryItem(item) && item.totalPurchasedQuantity > 0,
  );
  const estimatedCups = Math.round(
    hasCupPurchaseHistory
      ? inferredCupsFromPackaging
      : inferredCupsFromMilk,
  );
  const previousEstimatedCups = Math.round(
    Number(input.previousEstimatedCups) || 0,
  );

  return {
    ingredientLines,
    milkBatchLines,
    ingredientInventoryValue,
    finishedMilkInventoryValue,
    totalInventoryValue:
      ingredientInventoryValue + finishedMilkInventoryValue,
    inferredCupsFromPackaging: Math.round(inferredCupsFromPackaging),
    inferredMilkLitersUsed,
    inferredCupsFromMilk: Math.round(inferredCupsFromMilk),
    milkReconciliationReliable,
    estimatedCups,
    estimatedCupsSincePrevious: estimatedCups - previousEstimatedCups,
    estimationBasis: hasCupPurchaseHistory
      ? ("packaging" as const)
      : ("finished-milk" as const),
  };
}
