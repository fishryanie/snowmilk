import { connectMongo } from "@/lib/mongodb";
import {
  calculateIngredientCostWithUnits,
  calculateProductCost,
  calculatePurchasePricing,
} from "@/lib/calculations/costing";
import {
  resourceModels,
  resourceSearchFields,
} from "@/lib/resource-registry";
import { resolveSettingValue } from "@/lib/settings";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  type PurchaseFundingSource,
} from "@/lib/purchase-funding";
import type { ResourceName } from "@/lib/validators/resources";
import { Ingredient } from "@/models/Ingredient";
import { Equipment } from "@/models/Equipment";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { ProductSize } from "@/models/Size";

type PurchaseInput = {
  purchaseDate: Date;
  ingredientId: string;
  packageCount: number;
  totalAmount?: number;
  actualPackagePrice?: number;
  fundingSource?: PurchaseFundingSource;
  supplier?: string;
  note?: string;
};

type EquipmentInput = {
  purchaseDate: Date;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  residualValue?: number;
  usefulLifeMonths?: number;
  isActive?: boolean;
  note?: string;
};

type ProductInput = {
  toppingIngredientId: string;
  sizeId: string;
  toppingGrams: number;
  isActive?: boolean;
};

type BatchInput = {
  name: string;
  actualLiters: number;
  cookingHours: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    note?: string;
  }>;
  note?: string;
};

async function nextBatchCode() {
  const records = await MilkBatch.find({ code: /^ME-\d+$/ })
    .select("code")
    .lean();
  const max = records.reduce((current, record) => {
    const number = Number(String(record.code).replace("ME-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `ME-${String(max + 1).padStart(3, "0")}`;
}

async function batchPayload(
  payload: BatchInput,
  code: string,
  editingId?: string,
) {
  const [ingredients, settings, duplicate] = await Promise.all([
    Ingredient.find({
      _id: {
        $in: payload.ingredients.map((item) => item.ingredientId),
      },
      isActive: true,
    }).lean(),
    Setting.find({
      key: {
        $in: [
          "cong_suat_bep_mac_dinh_kw",
          "gia_dien_d_kwh",
          "dien_khac_moi_me_d",
          "nuoc_ve_sinh_moi_me_d",
        ],
      },
    }).lean(),
    MilkBatch.exists({
      name: payload.name,
      ...(editingId ? { _id: { $ne: editingId } } : {}),
    }),
  ]);
  if (duplicate) throw new Error("Tên mẻ sữa đã tồn tại.");
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [String(ingredient._id), ingredient]),
  );
  if (
    payload.ingredients.some(
      (item) => !ingredientsById.has(item.ingredientId),
    )
  ) {
    throw new Error(
      "Có nguyên liệu không tồn tại hoặc đã ngừng kích hoạt.",
    );
  }
  const resolvedIngredients = payload.ingredients.map((item) => {
    const ingredient = ingredientsById.get(item.ingredientId)!;
    const unitCost = Number(ingredient.averageUnitCost ?? 0);
    return {
      ingredientId: ingredient._id,
      ingredientName: ingredient.name,
      quantity: item.quantity,
      unit: ingredient.costUnit,
      unitCost,
      amount: item.quantity * unitCost,
      note: item.note ?? "",
    };
  });
  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, Number(setting.value ?? 0)]),
  );
  const stoveKw = resolveSettingValue(
    settingsByKey,
    "cong_suat_bep_mac_dinh_kw",
  );
  const electricityPrice = resolveSettingValue(
    settingsByKey,
    "gia_dien_d_kwh",
  );
  const otherElectricityCost = resolveSettingValue(
    settingsByKey,
    "dien_khac_moi_me_d",
  );
  const waterCleaningCost = resolveSettingValue(
    settingsByKey,
    "nuoc_ve_sinh_moi_me_d",
  );
  const ingredientCost = resolvedIngredients.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const electricityCost =
    payload.cookingHours * stoveKw * electricityPrice +
    otherElectricityCost;
  const totalCost = ingredientCost + electricityCost + waterCleaningCost;

  return {
    code,
    name: payload.name,
    actualLiters: payload.actualLiters,
    cookingHours: payload.cookingHours,
    stoveKw,
    electricityPrice,
    otherElectricityCost,
    waterCleaningCost,
    ingredientCost,
    electricityCost,
    totalCost,
    costPerLiter: totalCost / payload.actualLiters,
    costPerMl: totalCost / (payload.actualLiters * 1_000),
    ingredients: resolvedIngredients,
    note: payload.note ?? "",
  };
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

async function productPayload(
  payload: ProductInput,
  code: string,
  editingId?: string,
) {
  const [topping, size, batch, settings, depreciation] = await Promise.all([
    Ingredient.findOne({
      _id: payload.toppingIngredientId,
      category: "Topping",
      isActive: true,
    }).lean(),
    ProductSize.findOne({
      _id: payload.sizeId,
      isActive: true,
    }).lean(),
    MilkBatch.findOne()
      .sort({ cookedAt: -1, createdAt: -1 })
      .lean(),
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
  if (!topping) {
    throw new Error("Topping không tồn tại hoặc đã ngừng kích hoạt.");
  }
  if (!size) {
    throw new Error("Size không tồn tại hoặc đã ngừng kích hoạt.");
  }
  const packaging = await Ingredient.find({
    name: {
      $in: [
        size.cupSetName,
        "Ống hút",
        "Muỗng",
        "Túi mang đi",
      ],
    },
    isActive: true,
  }).lean();
  const duplicate = await Product.exists({
    toppingIngredientId: topping._id,
    sizeId: size._id,
    ...(editingId ? { _id: { $ne: editingId } } : {}),
  });
  if (duplicate) {
    throw new Error("Sản phẩm với topping và size này đã tồn tại.");
  }
  const settingsByKey = new Map(
    settings.map((setting) => [setting.key, Number(setting.value ?? 0)]),
  );
  const expectedCups = resolveSettingValue(
    settingsByKey,
    "so_ly_du_kien_thang",
  );
  const allocatedFixedCost =
    expectedCups > 0
      ? (resolveSettingValue(
          settingsByKey,
          "chi_phi_co_dinh_thang_d",
        ) +
          Number(depreciation[0]?.value ?? 0)) /
        expectedCups
      : 0;
  const milkCost = Number(size.milkMl ?? 0) * Number(batch?.costPerMl ?? 0);
  const toppingCost = calculateIngredientCostWithUnits({
    quantity: payload.toppingGrams,
    quantityUnit: "g",
    unitCost: Number(topping.averageUnitCost ?? 0),
    costUnit: String(topping.costUnit ?? "g"),
  });
  const packagingCost = packaging.reduce(
    (total, item) => total + Number(item.averageUnitCost ?? 0),
    0,
  );
  const costs = calculateProductCost({
    milkCost,
    toppingCost,
    packagingCost,
    overheadRate: resolveSettingValue(
      settingsByKey,
      "overhead_bien_doi",
    ),
    allocatedFixedCost,
  });

  return {
    code,
    name: `${topping.name} - ${size.name}`,
    toppingIngredientId: topping._id,
    sizeId: size._id,
    milkBatchId: batch?._id ?? null,
    milkBatchCode: batch?.code ?? "",
    milkBatchName: batch?.name ?? "",
    toppingName: topping.name,
    sizeName: size.name,
    toppingGrams: payload.toppingGrams,
    sellingPrice: size.sellingPrice,
    milkMl: size.milkMl,
    milkCost,
    toppingCost,
    packagingCost,
    overheadCost: costs.overheadCost,
    variableCost: costs.variableCost,
    allocatedFixedCost,
    fullCost: costs.fullCost,
    hasCostWarning:
      costs.fullCost > Number(size.sellingPrice ?? 0) * 2,
    isActive: payload.isActive ?? true,
  };
}

function equipmentPayload(payload: EquipmentInput, code: string) {
  const totalAmount = payload.quantity * payload.unitPrice;
  const isActive = payload.isActive ?? true;
  const residualValue = payload.residualValue ?? 0;
  const monthlyDepreciation =
    isActive && payload.usefulLifeMonths
      ? Math.max(0, totalAmount - residualValue) / payload.usefulLifeMonths
      : 0;
  return {
    ...payload,
    code,
    totalAmount,
    residualValue,
    monthlyDepreciation,
    isActive,
    status: isActive ? "using" : "disposed",
  };
}

async function nextEquipmentCode() {
  const records = await Equipment.find({ code: /^TS-\d+$/ })
    .select("code")
    .lean();
  const max = records.reduce((current, record) => {
    const number = Number(String(record.code).replace("TS-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `TS-${String(max + 1).padStart(3, "0")}`;
}

async function purchasePayload(payload: PurchaseInput) {
  const ingredient = await Ingredient.findById(payload.ingredientId).lean();
  if (!ingredient) {
    throw new Error(
      "Hàng hóa đã chọn không còn tồn tại. Hãy tải lại danh mục và chọn lại.",
    );
  }
  if (!ingredient.isActive) {
    throw new Error("Hàng hóa đã ngừng kích hoạt nên không thể nhập thêm.");
  }

  const packageQuantity = Number(ingredient.packageQuantity ?? 1);
  const referencePackagePrice = Number(
    ingredient.referencePackagePrice ?? 0,
  );
  const { actualPackagePrice, totalAmount } = calculatePurchasePricing({
    packageCount: payload.packageCount,
    referencePackagePrice,
    actualPackagePrice: payload.actualPackagePrice,
    totalAmount: payload.totalAmount,
  });

  return {
    purchaseDate: payload.purchaseDate,
    ingredientId: ingredient._id,
    itemCode: ingredient.code,
    itemName: ingredient.name,
    category: ingredient.category,
    packageCount: payload.packageCount,
    packageQuantity,
    costUnit: ingredient.costUnit,
    referencePackagePrice,
    actualPackagePrice,
    convertedQuantity: payload.packageCount * packageQuantity,
    totalAmount,
    fundingSource:
      payload.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
    supplier: payload.supplier ?? "",
    note: payload.note ?? "",
  };
}

async function refreshIngredientAverage(
  ingredientId: unknown,
  itemCode?: string,
) {
  const ingredient =
    ingredientId != null
      ? await Ingredient.findById(ingredientId).select("_id").lean()
      : itemCode
        ? await Ingredient.findOne({ code: itemCode }).select("_id").lean()
        : null;
  if (!ingredient) return;

  const match = itemCode
    ? { $or: [{ ingredientId: ingredient._id }, { itemCode }] }
    : { ingredientId: ingredient._id };
  const totals = await Purchase.aggregate<{
    totalAmount: number;
    convertedQuantity: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$totalAmount" },
        convertedQuantity: { $sum: "$convertedQuantity" },
      },
    },
  ]);
  const total = totals[0];
  const averageUnitCost =
    total && total.convertedQuantity > 0
      ? total.totalAmount / total.convertedQuantity
      : 0;
  await Ingredient.findByIdAndUpdate(ingredient._id, { averageUnitCost });
  await recalculateProductCosts({ toppingIngredientId: ingredient._id });
}

export async function recalculateProductCosts(
  filter: Record<string, unknown> = {},
) {
  await connectMongo();
  const products = await Product.find(filter)
    .select(
      "_id code toppingIngredientId sizeId toppingGrams isActive",
    )
    .lean();
  const updates = [];
  const skipped: Array<{ code: string; reason: string }> = [];

  for (const product of products) {
    if (!product.toppingIngredientId || !product.sizeId) {
      skipped.push({
        code: String(product.code),
        reason: "Thiếu liên kết topping hoặc size",
      });
      continue;
    }
    try {
      const payload = await productPayload(
        {
          toppingIngredientId: String(product.toppingIngredientId),
          sizeId: String(product.sizeId),
          toppingGrams: Number(product.toppingGrams ?? 0),
          isActive: product.isActive,
        },
        String(product.code),
        String(product._id),
      );
      updates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $set: payload },
        },
      });
    } catch (error) {
      skipped.push({
        code: String(product.code),
        reason:
          error instanceof Error ? error.message : "Không thể tính lại cost",
      });
    }
  }

  if (updates.length > 0) {
    await Product.bulkWrite(updates, { ordered: false });
  }
  return {
    found: products.length,
    updated: updates.length,
    skipped,
  };
}

export async function listResources(
  resource: ResourceName,
  options: { query?: string; limit?: number } = {},
) {
  await connectMongo();
  const model = resourceModels[resource];
  const filter: Record<string, unknown> = {};
  const sort: Record<string, 1 | -1> =
    resource === "purchases"
      ? { purchaseDate: -1, createdAt: -1 }
      : resource === "divestments"
        ? { withdrawalDate: -1, createdAt: -1 }
      : { createdAt: -1 };
  if (options.query) {
    filter.$or = resourceSearchFields[resource].map((field) => ({
      [field]: { $regex: options.query, $options: "i" },
    }));
  }
  return model
    .find(filter)
    .sort(sort)
    .limit(Math.min(options.limit ?? 250, 500))
    .lean();
}

export async function createResource(
  resource: ResourceName,
  payload: Record<string, unknown>,
) {
  await connectMongo();
  if (resource === "purchases") {
    const resolved = await purchasePayload(payload as PurchaseInput);
    const purchase = await Purchase.create(resolved);
    await refreshIngredientAverage(resolved.ingredientId, resolved.itemCode);
    return purchase;
  }
  if (resource === "products") {
    const code = await nextProductCode();
    return Product.create(
      await productPayload(payload as ProductInput, code),
    );
  }
  if (resource === "batches") {
    const code = await nextBatchCode();
    const batch = await MilkBatch.create(
      await batchPayload(payload as BatchInput, code),
    );
    await recalculateProductCosts();
    return batch;
  }
  if (resource === "equipment") {
    const code = await nextEquipmentCode();
    return Equipment.create(
      equipmentPayload(payload as EquipmentInput, code),
    );
  }
  return resourceModels[resource].create(payload);
}

export async function updateResource(
  resource: ResourceName,
  id: string,
  payload: Record<string, unknown>,
) {
  await connectMongo();
  if (resource === "purchases") {
    const existing = await Purchase.findById(id).lean();
    if (!existing) return null;
    const resolved = await purchasePayload(payload as PurchaseInput);
    const purchase = await Purchase.findByIdAndUpdate(id, resolved, {
      new: true,
      runValidators: true,
    });
    await Promise.all([
      refreshIngredientAverage(resolved.ingredientId, resolved.itemCode),
      String(existing.ingredientId ?? "") !== String(resolved.ingredientId)
        ? refreshIngredientAverage(existing.ingredientId, existing.itemCode)
        : null,
    ]);
    return purchase;
  }
  if (resource === "products") {
    const existing = await Product.findById(id).select("code").lean();
    if (!existing) return null;
    return Product.findByIdAndUpdate(
      id,
      await productPayload(payload as ProductInput, existing.code, id),
      { new: true, runValidators: true },
    );
  }
  if (resource === "batches") {
    const existing = await MilkBatch.findById(id).select("code").lean();
    if (!existing) return null;
    const batch = await MilkBatch.findByIdAndUpdate(
      id,
      await batchPayload(payload as BatchInput, existing.code, id),
      { new: true, runValidators: true },
    );
    await Promise.all([
      recalculateProductCosts(),
      batch
        ? Sale.updateMany(
            { batchId: batch._id },
            {
              $set: {
                batchCode: batch.code,
                batchName: batch.name,
              },
            },
          )
        : null,
    ]);
    return batch;
  }
  if (resource === "equipment") {
    const existing = await Equipment.findById(id).select("code").lean();
    if (!existing) return null;
    return Equipment.findByIdAndUpdate(
      id,
      equipmentPayload(payload as EquipmentInput, existing.code),
      { new: true, runValidators: true },
    );
  }
  if (resource === "ingredients") {
    const ingredient = await Ingredient.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
    if (ingredient?.category === "Topping") {
      await recalculateProductCosts({ toppingIngredientId: ingredient._id });
    }
    return ingredient;
  }
  if (resource === "sizes") {
    const size = await ProductSize.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
    if (size) await recalculateProductCosts({ sizeId: size._id });
    return size;
  }
  return resourceModels[resource].findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
}

export async function deleteResource(resource: ResourceName, id: string) {
  await connectMongo();
  if (resource === "purchases") {
    const purchase = await Purchase.findByIdAndDelete(id);
    if (purchase?.ingredientId) {
      await refreshIngredientAverage(
        purchase.ingredientId,
        purchase.itemCode,
      );
    }
    return purchase;
  }
  if (resource === "batches") {
    const deleted = await MilkBatch.findByIdAndDelete(id);
    if (!deleted) return null;
    const replacement = await MilkBatch.findOne()
      .sort({ cookedAt: -1, createdAt: -1 })
      .lean();
    await Promise.all([
      recalculateProductCosts(),
      replacement
        ? Sale.updateMany(
            {
              $or: [
                { batchId: deleted._id },
                { batchCode: deleted.code },
                { batchName: deleted.name },
              ],
            },
            {
              $set: {
                batchId: replacement._id,
                batchCode: replacement.code,
                batchName: replacement.name,
              },
            },
          )
        : null,
    ]);
    return deleted;
  }
  const deleted = await resourceModels[resource].findByIdAndDelete(id);
  return deleted;
}
