import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import {
  summarizePurchases,
  type PurchaseQuantityRecord,
} from "@/lib/calculations/purchases";
import { connectMongo } from "@/lib/mongodb";
import { Ingredient } from "@/models/Ingredient";
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

const applyChanges = process.argv.includes("--apply");

await connectMongo();

const [ingredients, purchases] = await Promise.all([
  Ingredient.find()
    .select("_id code name costUnit averageUnitCost")
    .lean() as Promise<IngredientRow[]>,
  Purchase.find()
    .select(
      "_id ingredientId itemCode packageCount packageQuantity costUnit convertedQuantity totalAmount inventoryCostAmount",
    )
    .lean() as Promise<PurchaseRow[]>,

]);
const purchasesByIngredient = groupPurchases(ingredients, purchases);
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

if (applyChanges) {
  const ingredientResult = await recalculateIngredientAverages(
    {},
    { normalizePurchaseUnits: true },
  );
  console.log(
    JSON.stringify(
      {
        mode: "applied",
        ingredientChanges,
        result: {
          ...ingredientResult,
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
        nextStep:
          "Chạy lại với --apply sau khi đã backup database.",
      },
      null,
      2,
    ),
  );
}

await mongoose.disconnect();
