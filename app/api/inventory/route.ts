import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  calculateInventory,
  type InventoryIngredientLine,
  type InventoryMilkBatchLine,
} from "@/lib/calculations/inventory";
import { connectMongo } from "@/lib/mongodb";
import {
  isVietnamDateKey,
  vietnamDateKey,
  vietnamDayBoundary,
} from "@/lib/vietnam-date";
import { Ingredient } from "@/models/Ingredient";
import { InventorySnapshot } from "@/models/InventorySnapshot";
import { MilkBatch } from "@/models/MilkBatch";
import { Purchase } from "@/models/Purchase";
import { ProductSize } from "@/models/Size";

const inventoryInputSchema = z
  .object({
    snapshotDate: z
      .string()
      .refine(isVietnamDateKey, "Ngày kiểm kho không hợp lệ"),
    items: z.array(
      z
        .object({
          itemKey: z.string().min(1),
          onHandQuantity: z.coerce.number().min(0),
        })
        .strict(),
    ),
    milkBatches: z.array(
      z
        .object({
          batchKey: z.string().min(1),
          remainingLiters: z.coerce.number().min(0),
        })
        .strict(),
    ),
    note: z.string().trim().max(1_000).optional().default(""),
  })
  .strict();

type StoredItem = InventoryIngredientLine & {
  inventoryValue?: number;
  inferredUsedQuantity?: number;
};

type StoredMilkBatch = InventoryMilkBatchLine & {
  inventoryValue?: number;
  inferredUsedLiters?: number;
};

function recordKey(record: { _id?: unknown; id?: unknown; code?: unknown }) {
  return String(record._id ?? record.id ?? record.code ?? "");
}

async function inventoryContext(date: string) {
  const boundary = vietnamDayBoundary(date);
  const endOfDay = vietnamDayBoundary(date, true);
  const [
    ingredients,
    purchases,
    batches,
    sizes,
    savedSnapshot,
    previousSnapshot,
    recentSnapshots,
  ] = await Promise.all([
    Ingredient.find({ isActive: true }).sort({ category: 1, name: 1 }).lean(),
    Purchase.find({ purchaseDate: { $lte: endOfDay } })
      .select("ingredientId itemCode convertedQuantity")
      .lean(),
    MilkBatch.find()
      .sort({ cookedAt: 1, createdAt: 1 })
      .select(
        "_id code name actualLiters costPerLiter totalCost cookedAt createdAt",
      )
      .lean(),
    ProductSize.find({ isActive: true }).select("milkMl").lean(),
    InventorySnapshot.findOne({ snapshotDate: boundary }).lean(),
    InventorySnapshot.findOne({ snapshotDate: { $lt: boundary } })
      .sort({ snapshotDate: -1 })
      .lean(),
    InventorySnapshot.find({ snapshotDate: { $lte: boundary } })
      .sort({ snapshotDate: -1 })
      .limit(60)
      .select(
        "snapshotDate totalInventoryValue estimatedCups inferredCupsFromPackaging inferredCupsFromMilk",
      )
      .lean(),
  ]);

  const purchasedById = new Map<string, number>();
  const purchasedByCode = new Map<string, number>();
  for (const purchase of purchases) {
    const quantity = Number(purchase.convertedQuantity ?? 0);
    const ingredientId = String(purchase.ingredientId ?? "");
    const code = String(purchase.itemCode ?? "");
    if (ingredientId) {
      purchasedById.set(
        ingredientId,
        (purchasedById.get(ingredientId) ?? 0) + quantity,
      );
    }
    if (code) {
      purchasedByCode.set(code, (purchasedByCode.get(code) ?? 0) + quantity);
    }
  }

  const savedItems = new Map(
    ((savedSnapshot?.items ?? []) as StoredItem[]).map((item) => [
      item.itemKey,
      item,
    ]),
  );
  const previousItems = new Map(
    ((previousSnapshot?.items ?? []) as StoredItem[]).map((item) => [
      item.itemKey,
      item,
    ]),
  );
  const ingredientLines: InventoryIngredientLine[] = ingredients.map(
    (ingredient) => {
      const itemKey = recordKey(ingredient);
      const itemCode = String(ingredient.code ?? "");
      const totalPurchasedQuantity =
        purchasedById.get(itemKey) ??
        purchasedByCode.get(itemCode) ??
        Number(
          (ingredient as { totalPurchasedQuantity?: number })
            .totalPurchasedQuantity ?? 0,
        );
      const saved = savedItems.get(itemKey);
      const previous = previousItems.get(itemKey);
      const purchasesSincePrevious = previous
        ? Math.max(
            0,
            totalPurchasedQuantity -
              Number(previous.totalPurchasedQuantity ?? 0),
          )
        : 0;
      return {
        itemKey,
        itemCode,
        itemName: String(ingredient.name ?? ""),
        category: String(ingredient.category ?? "Khác"),
        unit: String(ingredient.costUnit ?? ""),
        totalPurchasedQuantity,
        onHandQuantity:
          Number(saved?.onHandQuantity) ||
          (saved?.onHandQuantity === 0
            ? 0
            : previous
              ? Number(previous.onHandQuantity ?? 0) + purchasesSincePrevious
              : totalPurchasedQuantity),
        unitCost: Number(ingredient.averageUnitCost ?? 0),
      };
    },
  );

  const savedBatches = new Map(
    ((savedSnapshot?.milkBatches ?? []) as StoredMilkBatch[]).map((batch) => [
      batch.batchKey,
      batch,
    ]),
  );
  const previousBatches = new Map(
    ((previousSnapshot?.milkBatches ?? []) as StoredMilkBatch[]).map((batch) => [
      batch.batchKey,
      batch,
    ]),
  );
  const milkBatchLines: InventoryMilkBatchLine[] = batches.map((batch) => {
    const batchKey = recordKey(batch);
    const producedLiters = Number(batch.actualLiters ?? 0);
    return {
      batchKey,
      batchCode: String(batch.code ?? ""),
      batchName: String(batch.name ?? ""),
      producedLiters,
      remainingLiters: Number(
        savedBatches.get(batchKey)?.remainingLiters ??
          previousBatches.get(batchKey)?.remainingLiters ??
          producedLiters,
      ),
      costPerLiter: Number(
        batch.costPerLiter ??
          (producedLiters > 0
            ? Number(batch.totalCost ?? 0) / producedLiters
            : 0),
      ),
    };
  });

  const averageMilkMlPerCup =
    sizes.length > 0
      ? sizes.reduce((total, size) => total + Number(size.milkMl ?? 0), 0) /
        sizes.length
      : 0;
  const previousEstimatedCups = Number(previousSnapshot?.estimatedCups ?? 0);
  const calculation = calculateInventory({
    ingredients: ingredientLines,
    milkBatches: milkBatchLines,
    averageMilkMlPerCup,
    previousEstimatedCups,
  });
  const ascendingHistory = recentSnapshots
    .map((snapshot) => ({
      snapshotDate: vietnamDateKey(snapshot.snapshotDate as Date),
      totalInventoryValue: Number(snapshot.totalInventoryValue ?? 0),
      estimatedCups: Number(snapshot.estimatedCups ?? 0),
      inferredCupsFromPackaging: Number(
        snapshot.inferredCupsFromPackaging ?? 0,
      ),
      inferredCupsFromMilk: Number(snapshot.inferredCupsFromMilk ?? 0),
    }))
    .toReversed();
  const history = ascendingHistory
    .map((snapshot, index) => ({
      ...snapshot,
      estimatedCupsSincePrevious:
        snapshot.estimatedCups -
        (ascendingHistory[index - 1]?.estimatedCups ?? 0),
    }))
    .toReversed();

  return {
    snapshotDate: date,
    saved: Boolean(savedSnapshot),
    savedAt: savedSnapshot?.updatedAt ?? null,
    note: String(savedSnapshot?.note ?? ""),
    previousSnapshot: previousSnapshot
      ? {
          snapshotDate: vietnamDateKey(previousSnapshot.snapshotDate as Date),
          estimatedCups: previousEstimatedCups,
        }
      : null,
    averageMilkMlPerCup,
    history,
    ...calculation,
  };
}

export async function GET(request: Request) {
  try {
    const date =
      new URL(request.url).searchParams.get("date") ??
      vietnamDateKey(new Date());
    if (!isVietnamDateKey(date)) {
      return apiError("Ngày kiểm kho không hợp lệ", 422);
    }
    await connectMongo();
    return apiSuccess(await inventoryContext(date));
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = inventoryInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu kiểm kho không hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    await connectMongo();
    const context = await inventoryContext(parsed.data.snapshotDate);
    const itemQuantities = new Map(
      parsed.data.items.map((item) => [item.itemKey, item.onHandQuantity]),
    );
    const batchQuantities = new Map(
      parsed.data.milkBatches.map((batch) => [
        batch.batchKey,
        batch.remainingLiters,
      ]),
    );
    const unknownItem = parsed.data.items.find(
      (item) =>
        !context.ingredientLines.some(
          (catalogItem) => catalogItem.itemKey === item.itemKey,
        ),
    );
    const unknownBatch = parsed.data.milkBatches.find(
      (batch) =>
        !context.milkBatchLines.some(
          (catalogBatch) => catalogBatch.batchKey === batch.batchKey,
        ),
    );
    if (unknownItem || unknownBatch) {
      return apiError(
        "Danh mục kho đã thay đổi. Hãy tải lại trang rồi lưu lần nữa.",
        409,
      );
    }
    const calculation = calculateInventory({
      ingredients: context.ingredientLines.map((item) => ({
        ...item,
        onHandQuantity:
          itemQuantities.get(item.itemKey) ?? item.onHandQuantity,
      })),
      milkBatches: context.milkBatchLines.map((batch) => ({
        ...batch,
        remainingLiters:
          batchQuantities.get(batch.batchKey) ?? batch.remainingLiters,
      })),
      averageMilkMlPerCup: context.averageMilkMlPerCup,
      previousEstimatedCups:
        context.previousSnapshot?.estimatedCups ?? 0,
    });
    const snapshot = await InventorySnapshot.findOneAndUpdate(
      { snapshotDate: vietnamDayBoundary(parsed.data.snapshotDate) },
      {
        $set: {
          snapshotDate: vietnamDayBoundary(parsed.data.snapshotDate),
          items: calculation.ingredientLines,
          milkBatches: calculation.milkBatchLines,
          averageMilkMlPerCup: context.averageMilkMlPerCup,
          ingredientInventoryValue: calculation.ingredientInventoryValue,
          finishedMilkInventoryValue:
            calculation.finishedMilkInventoryValue,
          totalInventoryValue: calculation.totalInventoryValue,
          inferredCupsFromPackaging:
            calculation.inferredCupsFromPackaging,
          inferredMilkLitersUsed: calculation.inferredMilkLitersUsed,
          inferredCupsFromMilk: calculation.inferredCupsFromMilk,
          estimatedCups: calculation.estimatedCups,
          estimatedCupsSincePrevious:
            calculation.estimatedCupsSincePrevious,
          estimationBasis: calculation.estimationBasis,
          note: parsed.data.note,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    return apiSuccess(
      {
        snapshot,
        context: await inventoryContext(parsed.data.snapshotDate),
      },
      context.saved ? "Đã cập nhật kiểm kho" : "Đã chốt kiểm kho hôm nay",
      context.saved ? 200 : 201,
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
