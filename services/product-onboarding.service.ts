import { calculateIngredientCostWithUnits } from "@/lib/calculations/costing";
import {
  calculateInlinePackagingUnitCost,
  calculateOnboardingProductCost,
  calculateRecipeCost,
} from "@/lib/calculations/product-onboarding";
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
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Recipe } from "@/models/Recipe";
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

async function nextRecipeCode() {
  const records = await Recipe.find({ code: /^CT-\d+$/ }).select("code").lean();
  const max = records.reduce((current, record) => {
    const number = Number(String(record.code).replace("CT-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `CT-${String(max + 1).padStart(3, "0")}`;
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

async function createRecipe(
  input: Extract<ProductOnboardingInput["recipe"], { mode: "new" }>,
) {
  const ingredientIds = input.ingredients.map((item) => item.ingredientId);
  const ingredients = await Ingredient.find({
    _id: { $in: ingredientIds },
    isActive: true,
    category: { $ne: "Bao bì" },
  }).lean();
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient]),
  );
  if (
    input.ingredients.some(
      (item) => !ingredientsById.has(item.ingredientId),
    )
  ) {
    throw new Error("Có nguyên liệu không tồn tại hoặc đã ngừng kích hoạt.");
  }

  const resolvedIngredients = input.ingredients.map((item) => {
    const ingredient = ingredientsById.get(item.ingredientId)!;
    const unitCost = Number(ingredient.averageUnitCost ?? 0);
    const costUnit = String(ingredient.costUnit ?? "").trim();
    if (!costUnit) {
      throw new Error(`${ingredient.name} chưa có đơn vị cost.`);
    }
    return {
      ingredientId: ingredient._id,
      ingredientCode: ingredient.code,
      ingredientName: ingredient.name,
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
  const costs = calculateRecipeCost(
    input.yieldMl,
    resolvedIngredients.map((item) => ({
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
      costUnit: item.costUnit,
    })),
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Recipe.create({
        code: await nextRecipeCode(),
        name: input.name,
        yieldMl: input.yieldMl,
        ingredients: resolvedIngredients,
        ...costs,
        note: input.note,
        isActive: true,
      });
    } catch (error) {
      if (!isCodeCollision(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Không thể tạo mã công thức. Vui lòng thử lại.");
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

async function resolveRecipe(input: ProductOnboardingInput["recipe"]) {
  if (input.mode === "new") {
    const recipe = await createRecipe(input);
    return { recipe, created: true };
  }
  const recipe = await Recipe.findOne({
    _id: input.recipeId,
    isActive: true,
  });
  if (!recipe) {
    throw new Error("Công thức không tồn tại hoặc đã ngừng kích hoạt.");
  }
  return { recipe, created: false };
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
          unitCost = calculateInlinePackagingUnitCost({
            packageQuantity,
            packagePrice: item.openingPurchase.packagePrice,
          });
          const purchase = await Purchase.create({
            purchaseDate: new Date(),
            ingredientId: ingredient._id,
            itemCode: ingredient.code,
            itemName: ingredient.name,
            category: ingredient.category,
            packageCount: item.openingPurchase.packageCount,
            packageQuantity,
            costUnit,
            referencePackagePrice: item.openingPurchase.packagePrice,
            actualPackagePrice: item.openingPurchase.packagePrice,
            convertedQuantity:
              item.openingPurchase.packageCount * packageQuantity,
            totalAmount:
              item.openingPurchase.packageCount *
              item.openingPurchase.packagePrice,
            fundingSource: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
            supplier: item.openingPurchase.supplier,
            note: "Phiếu nhập đầu tiên tạo cùng sản phẩm",
          });
          try {
            await Ingredient.findByIdAndUpdate(ingredient._id, {
              averageUnitCost: unitCost,
              referencePackagePrice: item.openingPurchase.packagePrice,
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

async function removeCreatedPackaging(created: PackagingMutation[]) {
  await rollbackPackagingMutations(created);
}

async function buildProductPayload(input: ProductOnboardingInput) {
  const recipeResult = await resolveRecipe(input.recipe);
  let packagingResult: Awaited<ReturnType<typeof resolvePackaging>> | null =
    null;
  try {
    packagingResult = await resolvePackaging(input.packagingItems);
    const settings = await costSettings();
    const recipe = recipeResult.recipe;
    const packagingCost = packagingResult.items.reduce(
      (total, item) => total + item.amount,
      0,
    );
    const costs = calculateOnboardingProductCost({
      recipeCostPerMl: Number(recipe.costPerMl ?? 0),
      servingMl: input.servingMl,
      packagingCost,
      ...settings,
    });
    return {
      payload: {
        name: input.name,
        recipeId: recipe._id,
        recipeCode: recipe.code,
        recipeName: recipe.name,
        productMode: "recipe",
        sizeName: `${input.servingMl} ml`,
        milkMl: input.servingMl,
        sellingPrice: input.sellingPrice,
        milkCost: costs.recipeCost,
        recipeCost: costs.recipeCost,
        toppingCost: 0,
        packagingCost,
        packagingItems: packagingResult.items,
        overheadCost: costs.overheadCost,
        variableCost: costs.variableCost,
        allocatedFixedCost: settings.allocatedFixedCost,
        fullCost: costs.fullCost,
        hasCostWarning:
          costs.recipeCost <= 0 ||
          packagingResult.items.some((item) => item.unitCost <= 0) ||
          costs.fullCost >= input.sellingPrice,
        isActive: input.isActive,
        note: input.note,
      },
      recipeCreated: recipeResult.created ? String(recipe._id) : "",
      packagingCreated: packagingResult.created,
    };
  } catch (error) {
    await Promise.all([
      recipeResult.created
        ? Recipe.findByIdAndDelete(recipeResult.recipe._id)
        : null,
      packagingResult
        ? removeCreatedPackaging(packagingResult.created)
        : null,
    ]);
    throw error;
  }
}

export async function loadProductOnboardingData() {
  await connectMongo();
  const [products, recipes, ingredients, settings] = await Promise.all([
    Product.find().sort({ createdAt: -1 }).lean(),
    Recipe.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
    Ingredient.find({ isActive: true }).sort({ name: 1 }).lean(),
    costSettings(),
  ]);
  return { products, recipes, ingredients, costSettings: settings };
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
    await Promise.all([
      built.recipeCreated
        ? Recipe.findByIdAndDelete(built.recipeCreated)
        : null,
      removeCreatedPackaging(built.packagingCreated),
    ]);
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
          toppingIngredientId: 1,
          sizeId: 1,
          milkBatchId: 1,
          milkBatchCode: 1,
          milkBatchName: 1,
          toppingName: 1,
          toppingGrams: 1,
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!product) {
      await Promise.all([
        built.recipeCreated
          ? Recipe.findByIdAndDelete(built.recipeCreated)
          : null,
        removeCreatedPackaging(built.packagingCreated),
      ]);
    }
    return product;
  } catch (error) {
    await Promise.all([
      built.recipeCreated
        ? Recipe.findByIdAndDelete(built.recipeCreated)
        : null,
      removeCreatedPackaging(built.packagingCreated),
    ]);
    throw error;
  }
}
