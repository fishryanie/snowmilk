import {
  calculateInlinePackagingUnitCost,
  calculateOnboardingProductCost,
} from "@/lib/calculations/product-onboarding";
import { calculateIngredientCostWithUnits } from "@/lib/calculations/costing";
import {
  calculatePreparationUsageCost,
  normalizedPreparationCostSource,
} from "@/lib/calculations/preparation-batch";
import { convertQuantity } from "@/lib/calculations/units";
import {
  ingredientCodePrefix,
  nextIngredientCode,
  type IngredientCategory,
} from "@/lib/ingredient-code";
import { connectMongo } from "@/lib/mongodb";
import { DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE } from "@/lib/purchase-funding";
import { resolveSettingValue } from "@/lib/settings";
import type { ProductOnboardingInput } from "@/lib/validators/product-onboarding";
import { Equipment } from "@/models/Equipment";
import { Ingredient } from "@/models/Ingredient";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Setting } from "@/models/Setting";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCodeCollision(error: unknown) {
  const mongoError = error as {
    code?: number;
    keyPattern?: Record<string, number>;
  };
  return mongoError.code === 11000 && Boolean(mongoError.keyPattern?.code);
}

async function nextProductCode() {
  const records = await Product.find({ code: /^SP-\d+$/ })
    .select("code")
    .lean();
  const max = records.reduce((current, record) => {
    const number = Number(String(record.code).replace("SP-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `SP-${String(max + 1).padStart(3, "0")}`;
}

async function createIngredientWithCode(
  payload: Record<string, unknown> & { category: IngredientCategory },
) {
  const prefix = ingredientCodePrefix(payload.category);
  const matchingCode = new RegExp(`^${prefix}-?\\d+$`, "i");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const records = await Ingredient.find({ code: matchingCode })
      .select("code")
      .lean();
    const code = nextIngredientCode(
      payload.category,
      records.map((record) => record.code),
    );
    try {
      return await Ingredient.create({ ...payload, code });
    } catch (error) {
      if (!isCodeCollision(error) || attempt === 4) throw error;
    }
  }

  throw new Error("Không thể tạo mã bao bì. Vui lòng thử lại.");
}

async function costSettings() {
  const [settings, depreciation] = await Promise.all([
    Setting.find({
      key: {
        $in: [
          "overhead_bien_doi",
          "so_ly_du_kien_thang",
          "chi_phi_co_dinh_thang_d",
        ],
      },
    }).lean(),
    Equipment.aggregate<{ value: number }>([
      { $match: { isActive: true } },
      { $group: { _id: null, value: { $sum: "$monthlyDepreciation" } } },
    ]),
  ]);
  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, Number(setting.value ?? 0)]),
  );
  const expectedUnits = resolveSettingValue(
    settingsByKey,
    "so_ly_du_kien_thang",
  );
  const allocatedFixedCost =
    expectedUnits > 0
      ? (resolveSettingValue(settingsByKey, "chi_phi_co_dinh_thang_d") +
          Number(depreciation[0]?.value ?? 0)) /
        expectedUnits
      : 0;
  return {
    overheadRate: resolveSettingValue(settingsByKey, "overhead_bien_doi"),
    allocatedFixedCost,
  };
}

async function createInlinePackaging(
  input: Extract<
    ProductOnboardingInput["packagingItems"][number],
    { source: "new" }
  >,
) {
  const duplicate = await Ingredient.exists({
    name: new RegExp(`^${escapeRegExp(input.name)}$`, "i"),
  });
  if (duplicate) {
    throw new Error(
      `Bao bì “${input.name}” đã tồn tại. Hãy chọn từ danh mục có sẵn.`,
    );
  }
  const unitCost = calculateInlinePackagingUnitCost(input);
  const ingredient = await createIngredientWithCode({
    name: input.name,
    category: "Bao bì",
    purchaseUnit: input.purchaseUnit,
    packageQuantity: input.packageQuantity,
    costUnit: input.costUnit,
    referencePackagePrice: input.packagePrice,
    averageUnitCost: unitCost,
    isActive: true,
    note: "Tạo nhanh khi thêm sản phẩm",
  });
  try {
    const purchase = await Purchase.create({
      purchaseDate: new Date(),
      ingredientId: ingredient._id,
      itemCode: ingredient.code,
      itemName: ingredient.name,
      category: ingredient.category,
      purchaseUnit: ingredient.purchaseUnit,
      packageCount: input.packageCount,
      packageQuantity: input.packageQuantity,
      costUnit: input.costUnit,
      referencePackagePrice: input.packagePrice,
      actualPackagePrice: input.packagePrice,
      convertedQuantity: input.packageCount * input.packageQuantity,
      totalAmount: input.packageCount * input.packagePrice,
      fundingSource: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      supplier: input.supplier,
      note: "Phiếu nhập đầu tiên tạo cùng sản phẩm",
    });
    return { ingredient, purchase, unitCost };
  } catch (error) {
    await Ingredient.findByIdAndDelete(ingredient._id);
    throw error;
  }
}

type PackagingMutation = {
  ingredientId: string;
  purchaseId: string;
  deleteIngredient: boolean;
  previousAverageUnitCost?: number;
  previousReferencePackagePrice?: number;
};

async function rollbackPackagingMutations(created: PackagingMutation[]) {
  await Promise.all(
    created.map(async (item) => {
      await Purchase.findByIdAndDelete(item.purchaseId);
      if (item.deleteIngredient) {
        await Ingredient.findByIdAndDelete(item.ingredientId);
        return;
      }
      await Ingredient.findByIdAndUpdate(item.ingredientId, {
        averageUnitCost: item.previousAverageUnitCost ?? 0,
        referencePackagePrice: item.previousReferencePackagePrice ?? 0,
      });
    }),
  );
}

async function resolvePackaging(
  items: ProductOnboardingInput["packagingItems"],
) {
  const existingIds = items.flatMap((item) =>
    item.source === "existing" ? [item.ingredientId] : [],
  );
  if (new Set(existingIds).size !== existingIds.length) {
    throw new Error("Một loại bao bì đang được chọn nhiều lần.");
  }
  const existing = await Ingredient.find({
    _id: { $in: existingIds },
    category: "Bao bì",
    isActive: true,
  }).lean();
  const existingById = new Map(
    existing.map((ingredient) => [String(ingredient._id), ingredient]),
  );
  if (existingIds.some((id) => !existingById.has(id))) {
    throw new Error("Có bao bì không tồn tại hoặc đã ngừng kích hoạt.");
  }

  const created: PackagingMutation[] = [];
  const resolved = [];
  try {
    for (const item of items) {
      if (item.source === "existing") {
        const ingredient = existingById.get(item.ingredientId)!;
        let unitCost = Number(ingredient.averageUnitCost ?? 0);
        if (unitCost <= 0) {
          if (!item.openingPurchase) {
            throw new Error(
              `${ingredient.name} chưa có giá vốn. Hãy nhập giá lốc đầu tiên ngay trong biểu mẫu.`,
            );
          }
          const packageQuantity = Number(ingredient.packageQuantity ?? 0);
          const costUnit = String(ingredient.costUnit ?? "").trim();
          if (packageQuantity <= 0 || !costUnit) {
            throw new Error(
              `${ingredient.name} chưa có quy cách hoặc đơn vị cost hợp lệ.`,
            );
          }
          const {
            packageCount: openingPackageCount,
            packagePrice: openingPackagePrice,
            supplier: openingSupplier,
          } = item.openingPurchase;
          unitCost = calculateInlinePackagingUnitCost({
            packageQuantity,
            packagePrice: openingPackagePrice,
          });
          const purchase = await Purchase.create({
            purchaseDate: new Date(),
            ingredientId: ingredient._id,
            itemCode: ingredient.code,
            itemName: ingredient.name,
            category: ingredient.category,
            purchaseUnit: ingredient.purchaseUnit,
            packageCount: openingPackageCount,
            packageQuantity,
            costUnit,
            referencePackagePrice: openingPackagePrice,
            actualPackagePrice: openingPackagePrice,
            convertedQuantity: openingPackageCount * packageQuantity,
            totalAmount: openingPackageCount * openingPackagePrice,
            fundingSource: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
            supplier: openingSupplier,
            note: "Phiếu nhập đầu tiên tạo cùng sản phẩm",
          });
          try {
            await Ingredient.findByIdAndUpdate(ingredient._id, {
              averageUnitCost: unitCost,
              referencePackagePrice: openingPackagePrice,
            });
          } catch (error) {
            await Purchase.findByIdAndDelete(purchase._id);
            throw error;
          }
          created.push({
            ingredientId: String(ingredient._id),
            purchaseId: String(purchase._id),
            deleteIngredient: false,
            previousAverageUnitCost: Number(ingredient.averageUnitCost ?? 0),
            previousReferencePackagePrice: Number(
              ingredient.referencePackagePrice ?? 0,
            ),
          });
        }
        resolved.push({
          ingredientId: ingredient._id,
          ingredientCode: ingredient.code,
          ingredientName: ingredient.name,
          quantity: item.quantity,
          costUnit: ingredient.costUnit,
          unitCost,
          amount: item.quantity * unitCost,
        });
        continue;
      }

      const inline = await createInlinePackaging(item);
      created.push({
        ingredientId: String(inline.ingredient._id),
        purchaseId: String(inline.purchase._id),
        deleteIngredient: true,
      });
      resolved.push({
        ingredientId: inline.ingredient._id,
        ingredientCode: inline.ingredient.code,
        ingredientName: inline.ingredient.name,
        quantity: item.quantity,
        costUnit: inline.ingredient.costUnit,
        unitCost: inline.unitCost,
        amount: item.quantity * inline.unitCost,
      });
    }
    return { items: resolved, created };
  } catch (error) {
    await rollbackPackagingMutations(created);
    throw error;
  }
}

async function resolveIngredientUsage(
  items: ProductOnboardingInput["ingredientItems"],
) {
  const itemKeys = items.map((item) =>
    item.source === "batch"
      ? `batch:${item.batchId}`
      : `ingredient:${item.ingredientId}`,
  );
  if (new Set(itemKeys).size !== itemKeys.length) {
    throw new Error("Một nguyên liệu đang được chọn nhiều lần.");
  }

  const batchIds = items.flatMap((item) =>
    item.source === "batch" ? [item.batchId] : [],
  );
  const ingredientIds = items.flatMap((item) =>
    item.source === "ingredient" ? [item.ingredientId] : [],
  );
  const [batches, ingredients] = await Promise.all([
    MilkBatch.find({ _id: { $in: batchIds } }).lean(),
    Ingredient.find({
      _id: { $in: ingredientIds },
      category: { $ne: "Bao bì" },
      isActive: true,
    }).lean(),
  ]);
  const batchesById = new Map(
    batches.map((batch) => [String(batch._id), batch]),
  );
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient]),
  );
  if (batchIds.some((id) => !batchesById.has(id))) {
    throw new Error("Có nguyên liệu đã nấu không tồn tại.");
  }
  if (ingredientIds.some((id) => !ingredientsById.has(id))) {
    throw new Error("Có nguyên liệu thô không tồn tại hoặc đã ngừng kích hoạt.");
  }

  const resolvedItems = items.map((item) => {
    if (item.source === "batch") {
      const batch = batchesById.get(item.batchId)!;
      const normalized = normalizedPreparationCostSource(batch);
      return {
        source: "batch" as const,
        batchType: normalized.batchType,
        batchId: batch._id,
        batchCode: batch.code,
        batchName: batch.name,
        itemName: batch.name,
        quantity: item.quantity,
        unit: item.unit,
        costUnit: normalized.outputBaseUnit,
        unitCost: normalized.costPerBaseUnit,
        amount: calculatePreparationUsageCost(batch, item.quantity, item.unit),
      };
    }

    const ingredient = ingredientsById.get(item.ingredientId)!;
    const costUnit = String(ingredient.costUnit ?? "").trim();
    if (!costUnit) throw new Error(`${ingredient.name} chưa có đơn vị cost.`);
    const unitCost = Number(ingredient.averageUnitCost ?? 0);
    return {
      source: "ingredient" as const,
      ingredientId: ingredient._id,
      ingredientCode: ingredient.code,
      itemName: ingredient.name,
      batchName: ingredient.name,
      quantity: item.quantity,
      unit: item.unit,
      costUnit,
      unitCost,
      amount: calculateIngredientCostWithUnits({
        quantity: item.quantity,
        quantityUnit: item.unit,
        unitCost,
        costUnit,
      }),
    };
  });
  const { milkItems, toppingItems } = resolvedItems.reduce(
    (groups, item) => {
      if (item.source === "batch" && item.batchType === "milk_base") {
        groups.milkItems.push(item);
      } else {
        groups.toppingItems.push(item);
      }
      return groups;
    },
    {
      milkItems: [] as typeof resolvedItems,
      toppingItems: [] as typeof resolvedItems,
    },
  );
  return {
    ingredientItems: resolvedItems,
    primaryMilk: milkItems[0],
    milkCost: milkItems.reduce((total, item) => total + item.amount, 0),
    toppingItems,
    toppingCost: toppingItems.reduce((total, item) => total + item.amount, 0),
  };
}

async function buildProductPayload(input: ProductOnboardingInput) {
  const preparation = await resolveIngredientUsage(input.ingredientItems);
  let packagingResult: Awaited<ReturnType<typeof resolvePackaging>> | null =
    null;
  try {
    packagingResult = await resolvePackaging(input.packagingItems);
    const settings = await costSettings();
    const packagingCost = packagingResult.items.reduce(
      (total, item) => total + item.amount,
      0,
    );
    const costs = calculateOnboardingProductCost({
      milkCost: preparation.milkCost,
      toppingCost: preparation.toppingCost,
      packagingCost,
      ...settings,
    });
    const toppingGrams = preparation.toppingItems.reduce((total, item) => {
      try {
        return total + convertQuantity(item.quantity, item.unit, "g");
      } catch {
        return total;
      }
    }, 0);
    const milkMl = preparation.primaryMilk
      ? convertQuantity(
          preparation.primaryMilk.quantity,
          preparation.primaryMilk.unit,
          "ml",
        )
      : 0;
    return {
      payload: {
        name: input.name,
        productMode: "composed",
        milkBatchId: preparation.primaryMilk?.batchId ?? null,
        milkBatchCode: preparation.primaryMilk?.batchCode ?? "",
        milkBatchName: preparation.primaryMilk?.batchName ?? "",
        sizeName: milkMl > 0 ? `${milkMl} ml` : "",
        milkMl,
        toppingName: preparation.toppingItems
          .map((item) => item.itemName)
          .join(", "),
        toppingGrams,
        ingredientItems: preparation.ingredientItems,
        toppingItems: preparation.toppingItems,
        sellingPrice: input.sellingPrice,
        milkCost: preparation.milkCost,
        recipeCost: preparation.milkCost,
        toppingCost: preparation.toppingCost,
        packagingCost,
        packagingItems: packagingResult.items,
        overheadCost: costs.overheadCost,
        variableCost: costs.variableCost,
        allocatedFixedCost: settings.allocatedFixedCost,
        fullCost: costs.fullCost,
        hasCostWarning:
          preparation.ingredientItems.some((item) => item.unitCost <= 0) ||
          packagingResult.items.some((item) => item.unitCost <= 0) ||
          costs.fullCost >= input.sellingPrice,
        isActive: input.isActive,
        note: input.note,
      },
      packagingCreated: packagingResult.created,
    };
  } catch (error) {
    if (packagingResult) {
      await rollbackPackagingMutations(packagingResult.created);
    }
    throw error;
  }
}

export async function loadProductOnboardingData() {
  await connectMongo();
  const [products, batches, ingredients, settings] = await Promise.all([
    Product.find().sort({ createdAt: -1 }).lean(),
    MilkBatch.find().sort({ createdAt: -1 }).lean(),
    Ingredient.find({ isActive: true }).sort({ name: 1 }).lean(),
    costSettings(),
  ]);
  return { products, batches, ingredients, costSettings: settings };
}

export async function createOnboardedProduct(input: ProductOnboardingInput) {
  await connectMongo();
  const duplicate = await Product.exists({
    name: new RegExp(`^${escapeRegExp(input.name)}$`, "i"),
  });
  if (duplicate) throw new Error("Tên sản phẩm đã tồn tại.");

  const built = await buildProductPayload(input);
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await Product.create({
          code: await nextProductCode(),
          ...built.payload,
        });
      } catch (error) {
        if (!isCodeCollision(error) || attempt === 4) throw error;
      }
    }
    throw new Error("Không thể tạo mã sản phẩm. Vui lòng thử lại.");
  } catch (error) {
    await rollbackPackagingMutations(built.packagingCreated);
    throw error;
  }
}

export async function updateOnboardedProduct(
  id: string,
  input: ProductOnboardingInput,
) {
  await connectMongo();
  const [existing, duplicate] = await Promise.all([
    Product.findById(id).select("_id").lean(),
    Product.exists({
      _id: { $ne: id },
      name: new RegExp(`^${escapeRegExp(input.name)}$`, "i"),
    }),
  ]);
  if (!existing) return null;
  if (duplicate) throw new Error("Tên sản phẩm đã tồn tại.");

  const built = await buildProductPayload(input);
  try {
    const product = await Product.findByIdAndUpdate(
      id,
      {
        $set: built.payload,
        $unset: {
          recipeId: 1,
          recipeCode: 1,
          recipeName: 1,
          toppingIngredientId: 1,
          sizeId: 1,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!product) {
      await rollbackPackagingMutations(built.packagingCreated);
    }
    return product;
  } catch (error) {
    await rollbackPackagingMutations(built.packagingCreated);
    throw error;
  }
}

type RecalculationIngredientItem = {
  source?: "batch" | "ingredient";
  batchId?: unknown;
  ingredientId?: unknown;
  quantity?: number;
  unit?: string;
};

export async function recalculateComposedProductCosts(batchId?: string) {
  await connectMongo();
  const filter = batchId
    ? {
        productMode: "composed",
        $or: [
          { milkBatchId: batchId },
          { "toppingItems.batchId": batchId },
          { "ingredientItems.batchId": batchId },
        ],
      }
    : { productMode: "composed" };
  const products = await Product.find(filter).lean();
  if (products.length === 0) return;

  const settings = await costSettings();

  await Promise.all(
    products.map(async (product) => {
      const storedItems = (product.ingredientItems ?? []) as RecalculationIngredientItem[];
      const legacyItems: RecalculationIngredientItem[] = [
        ...(product.milkBatchId
          ? [
              {
                source: "batch" as const,
                batchId: product.milkBatchId,
                quantity: Number(product.milkMl ?? 0),
                unit: "ml",
              },
            ]
          : []),
        ...((product.toppingItems ?? []) as RecalculationIngredientItem[]),
      ];
      const recalculationInput = (storedItems.length ? storedItems : legacyItems)
        .flatMap((item) => {
          const source = item.source ?? "batch";
          const id = source === "batch" ? item.batchId : item.ingredientId;
          if (!id || !item.unit || Number(item.quantity ?? 0) <= 0) return [];
          return [
            {
              source,
              ...(source === "batch"
                ? { batchId: String(id) }
                : { ingredientId: String(id) }),
              quantity: Number(item.quantity),
              unit: item.unit,
            },
          ];
        }) as ProductOnboardingInput["ingredientItems"];
      if (recalculationInput.length === 0) return;
      const usage = await resolveIngredientUsage(recalculationInput);
      const milkMl = usage.primaryMilk
        ? convertQuantity(usage.primaryMilk.quantity, usage.primaryMilk.unit, "ml")
        : 0;
      const toppingGrams = usage.toppingItems.reduce((total, item) => {
        try {
          return total + convertQuantity(item.quantity, item.unit, "g");
        } catch {
          return total;
        }
      }, 0);
      const packagingCost = Number(product.packagingCost ?? 0);
      const costs = calculateOnboardingProductCost({
        milkCost: usage.milkCost,
        toppingCost: usage.toppingCost,
        packagingCost,
        ...settings,
      });
      await Product.findByIdAndUpdate(product._id, {
        $set: {
          milkBatchId: usage.primaryMilk?.batchId ?? null,
          milkBatchCode: usage.primaryMilk?.batchCode ?? "",
          milkBatchName: usage.primaryMilk?.batchName ?? "",
          milkMl,
          sizeName: milkMl > 0 ? `${milkMl} ml` : "",
          milkCost: usage.milkCost,
          recipeCost: usage.milkCost,
          ingredientItems: usage.ingredientItems,
          toppingItems: usage.toppingItems,
          toppingName: usage.toppingItems.map((item) => item.itemName).join(", "),
          toppingGrams,
          toppingCost: usage.toppingCost,
          overheadCost: costs.overheadCost,
          variableCost: costs.variableCost,
          allocatedFixedCost: settings.allocatedFixedCost,
          fullCost: costs.fullCost,
          hasCostWarning:
            usage.ingredientItems.some((item) => item.unitCost <= 0) ||
            costs.fullCost >= Number(product.sellingPrice ?? 0),
        },
      });
    }),
  );
}
