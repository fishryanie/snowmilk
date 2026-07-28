import { describe, expect, test } from "bun:test";
import {
  calculateInventory,
  isCupInventoryItem,
} from "./inventory";

describe("inventory calculation", () => {
  test("values raw stock and a completed milk batch without double-counting units", () => {
    const result = calculateInventory({
      ingredients: [
        {
          itemKey: "sugar",
          itemCode: "NL003",
          itemName: "Đường",
          category: "Nguyên liệu",
          unit: "kg",
          totalPurchasedQuantity: 10,
          onHandQuantity: 4,
          unitCost: 25_000,
        },
      ],
      milkBatches: [
        {
          batchKey: "batch-50",
          batchCode: "ME-050",
          batchName: "Mẻ 50 lít",
          producedLiters: 50,
          remainingLiters: 50,
          costPerLiter: 30_000,
        },
      ],
      averageMilkMlPerCup: 500,
    });

    expect(result.ingredientInventoryValue).toBe(100_000);
    expect(result.finishedMilkInventoryValue).toBe(1_500_000);
    expect(result.totalInventoryValue).toBe(1_600_000);
    expect(result.inferredMilkLitersUsed).toBe(0);
  });

  test("prefers cup stock for cumulative sold cups and calculates daily delta", () => {
    const result = calculateInventory({
      ingredients: [
        {
          itemKey: "cup-m",
          itemCode: "BB001",
          itemName: "Ly size M",
          category: "Bao bì",
          unit: "cái",
          totalPurchasedQuantity: 200,
          onHandQuantity: 135,
          unitCost: 300,
        },
        {
          itemKey: "lid-m",
          itemCode: "BB002",
          itemName: "Nắp size M",
          category: "Bao bì",
          unit: "cái",
          totalPurchasedQuantity: 200,
          onHandQuantity: 120,
          unitCost: 240,
        },
      ],
      milkBatches: [],
      averageMilkMlPerCup: 475,
      previousEstimatedCups: 50,
    });

    expect(result.inferredCupsFromPackaging).toBe(65);
    expect(result.estimatedCups).toBe(65);
    expect(result.estimatedCupsSincePrevious).toBe(15);
    expect(result.estimationBasis).toBe("packaging");
  });

  test("falls back to completed milk consumption when cup purchases are absent", () => {
    const result = calculateInventory({
      ingredients: [],
      milkBatches: [
        {
          batchKey: "batch",
          batchCode: "ME-001",
          batchName: "50L",
          producedLiters: 50,
          remainingLiters: 40.5,
          costPerLiter: 32_000,
        },
      ],
      averageMilkMlPerCup: 475,
    });

    expect(result.inferredCupsFromMilk).toBe(20);
    expect(result.estimatedCups).toBe(20);
    expect(result.estimationBasis).toBe("finished-milk");
  });

  test("values a consolidated milk count but marks recipe-based reconciliation unreliable", () => {
    const result = calculateInventory({
      ingredients: [],
      milkBatches: [
        {
          batchKey: "batch",
          batchCode: "ME-001",
          batchName: "Sữa thường",
          producedLiters: 6,
          remainingLiters: 135,
          costPerLiter: 32_000,
        },
      ],
      averageMilkMlPerCup: 475,
    });

    expect(result.milkBatchLines[0]?.remainingLiters).toBe(135);
    expect(result.finishedMilkInventoryValue).toBe(4_320_000);
    expect(result.inferredMilkLitersUsed).toBe(0);
    expect(result.milkReconciliationReliable).toBe(false);
  });

  test("only counts cup containers, not lids and straws", () => {
    expect(
      isCupInventoryItem({
        category: "Bao bì",
        itemName: "Ly size L",
      }),
    ).toBe(true);
    expect(
      isCupInventoryItem({
        category: "Bao bì",
        itemName: "Nắp size L",
      }),
    ).toBe(false);
  });
});
