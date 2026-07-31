import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import {
  summarizePurchases,
  type PurchaseQuantityRecord,
} from "@/lib/calculations/purchases";
import {
  convertQuantity,
  convertUnitCost,
} from "@/lib/calculations/units";
import { connectMongo } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";
import { InventorySnapshot } from "@/models/InventorySnapshot";
import { Purchase } from "@/models/Purchase";
import { recalculateIngredientAverages } from "@/services/resource.service";

loadEnvConfig(process.cwd());

type IngredientRow = {
  _id: unknown;
  code?: unknown;
  name?: unknown;
  costUnit?: unknown;
  averageUnitCost?: unknown;
};

type PurchaseRow = PurchaseQuantityRecord & {
  _id: unknown;
  ingredientId?: unknown;
  itemCode?: unknown;
};

type SnapshotItem = {
  itemKey: string;
  itemCode: string;
  unit?: string;
  totalPurchasedQuantity?: number;
  onHandQuantity?: number;
  unitCost?: number;
  inventoryValue?: number;
  inferredUsedQuantity?: number;
  [key: string]: unknown;
};

type SnapshotRow = {
  _id: unknown;
  snapshotDate?: unknown;
  items?: SnapshotItem[];
  milkBatches?: Array<{ inventoryValue?: number; [key: string]: unknown }>;
};

// Hai snapshot legacy ghi tồn Oreo là 0,7 với nhãn "gram", trong khi quy cách
// gói là 0,4 kg. Đây là lỗi nhãn đơn vị của số đã nhập, không phải 0,7 gram.
const legacySnapshotUnitLabelCorrections = new Set(["TP001"]);

function groupPurchases(
  ingredients: IngredientRow[],
  purchases: PurchaseRow[],
) {
  const ids = new Set(
    ingredients.map((ingredient) => String(ingredient._id)),
  );
  const idByCode = new Map(
    ingredients.map((ingredient) => [
      String(ingredient.code ?? ""),
      String(ingredient._id),
    ]),
  );
  const grouped = new Map<string, PurchaseRow[]>();

  for (const purchase of purchases) {
    const linkedId = String(purchase.ingredientId ?? "");
    const ingredientId = ids.has(linkedId)
      ? linkedId
      : idByCode.get(String(purchase.itemCode ?? ""));
    if (!ingredientId) continue;
    grouped.set(ingredientId, [
      ...(grouped.get(ingredientId) ?? []),
      purchase,
    ]);
  }
  return grouped;
}

function normalizedSnapshot(
  snapshot: SnapshotRow,
  ingredientsById: Map<string, IngredientRow>,
  ingredientsByCode: Map<string, IngredientRow>,
) {
  let convertedItems = 0;
  const items = (snapshot.items ?? []).map((item) => {
    const ingredient =
      ingredientsById.get(String(item.itemKey)) ??
      ingredientsByCode.get(String(item.itemCode));
    const targetUnit = String(ingredient?.costUnit ?? "").trim();
    const sourceUnit = String(item.unit ?? "").trim();
    if (!ingredient || !sourceUnit || !targetUnit || sourceUnit === targetUnit) {
      return item;
    }

    convertedItems += 1;
    const totalPurchasedQuantity = convertQuantity(
      Number(item.totalPurchasedQuantity ?? 0),
      sourceUnit,
      targetUnit,
    );
    const preserveEnteredOnHandValue =
      legacySnapshotUnitLabelCorrections.has(item.itemCode);
    const onHandQuantity = preserveEnteredOnHandValue
      ? Number(item.onHandQuantity ?? 0)
      : convertQuantity(
          Number(item.onHandQuantity ?? 0),
          sourceUnit,
          targetUnit,
        );
    const unitCost = convertUnitCost(
      Number(item.unitCost ?? 0),
      sourceUnit,
      targetUnit,
    );
    return {
      ...item,
      unit: targetUnit,
      totalPurchasedQuantity,
      onHandQuantity,
      unitCost,
      inventoryValue: onHandQuantity * unitCost,
      inferredUsedQuantity: preserveEnteredOnHandValue
        ? Math.max(0, totalPurchasedQuantity - onHandQuantity)
        : convertQuantity(
            Number(item.inferredUsedQuantity ?? 0),
            sourceUnit,
            targetUnit,
          ),
    };
  });
  const ingredientInventoryValue = items.reduce(
    (total, item) => total + Number(item.inventoryValue ?? 0),
    0,
  );
  const finishedMilkInventoryValue = (snapshot.milkBatches ?? []).reduce(
    (total, batch) => total + Number(batch.inventoryValue ?? 0),
    0,
  );

  return {
    convertedItems,
    items,
    ingredientInventoryValue,
    finishedMilkInventoryValue,
    totalInventoryValue:
      ingredientInventoryValue + finishedMilkInventoryValue,
  };
}

const applyChanges = process.argv.includes("--apply");

await connectMongo();

const [ingredients, purchases, snapshots] = await Promise.all([
  Ingredient.find()
    .select("_id code name costUnit averageUnitCost")
    .lean() as Promise<IngredientRow[]>,
  Purchase.find()
    .select(
      "_id ingredientId itemCode packageCount packageQuantity costUnit convertedQuantity totalAmount",
    )
    .lean() as Promise<PurchaseRow[]>,
  InventorySnapshot.find()
    .select("_id snapshotDate items milkBatches")
    .lean() as Promise<SnapshotRow[]>,
]);
const purchasesByIngredient = groupPurchases(ingredients, purchases);
const ingredientsById = new Map(
  ingredients.map((ingredient) => [String(ingredient._id), ingredient]),
);
const ingredientsByCode = new Map(
  ingredients.map((ingredient) => [
    String(ingredient.code ?? ""),
    ingredient,
  ]),
);

const ingredientChanges = ingredients.flatMap((ingredient) => {
  const targetUnit = String(ingredient.costUnit ?? "").trim();
  const history =
    purchasesByIngredient.get(String(ingredient._id)) ?? [];
  if (!targetUnit || history.length === 0) return [];
  const summary = summarizePurchases(history, targetUnit);
  const mixedUnitPurchases = history.filter(
    (purchase) =>
      String(purchase.costUnit ?? "").trim() !== targetUnit,
  ).length;
  const previousAverageUnitCost = Number(
    ingredient.averageUnitCost ?? 0,
  );
  if (
    mixedUnitPurchases === 0 &&
    Math.abs(previousAverageUnitCost - summary.averageUnitCost) < 1e-9
  ) {
    return [];
  }
  return [{
    code: String(ingredient.code ?? ""),
    name: String(ingredient.name ?? ""),
    targetUnit,
    mixedUnitPurchases,
    previousAverageUnitCost,
    nextAverageUnitCost: summary.averageUnitCost,
  }];
});

const snapshotPlans = snapshots.map((snapshot) => ({
  snapshot,
  normalized: normalizedSnapshot(
    snapshot,
    ingredientsById,
    ingredientsByCode,
  ),
}));
const snapshotChanges = snapshotPlans
  .filter((plan) => plan.normalized.convertedItems > 0)
  .map((plan) => ({
    snapshotDate: plan.snapshot.snapshotDate,
    convertedItems: plan.normalized.convertedItems,
  }));

if (applyChanges) {
  const ingredientResult = await recalculateIngredientAverages(
    {},
    { normalizePurchaseUnits: true },
  );
  const snapshotUpdates = snapshotPlans
    .filter((plan) => plan.normalized.convertedItems > 0)
    .map((plan) => ({
      updateOne: {
        filter: { _id: plan.snapshot._id },
        update: {
          $set: {
            items: plan.normalized.items,
            ingredientInventoryValue:
              plan.normalized.ingredientInventoryValue,
            finishedMilkInventoryValue:
              plan.normalized.finishedMilkInventoryValue,
            totalInventoryValue:
              plan.normalized.totalInventoryValue,
          },
        },
      },
    }));
  if (snapshotUpdates.length > 0) {
    await InventorySnapshot.bulkWrite(snapshotUpdates, { ordered: false });
  }
  console.log(
    JSON.stringify(
      {
        mode: "applied",
        ingredientChanges,
        snapshotChanges,
        result: {
          ...ingredientResult,
          normalizedSnapshots: snapshotUpdates.length,
        },
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        ingredientChanges,
        snapshotChanges,
        nextStep:
          "Chạy lại với --apply sau khi đã backup database.",
      },
      null,
      2,
    ),
  );
}

await mongoose.disconnect();
