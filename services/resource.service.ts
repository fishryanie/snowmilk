import { connectMongo } from "@/lib/mongodb";
import {
  calculateIngredientCostWithUnits,
  calculateProductCost,
  calculatePurchasePricing,
} from "@/lib/calculations/costing";
import {
  normalizePurchaseUnit,
  summarizePurchases,
  type PurchaseQuantityRecord,
} from "@/lib/calculations/purchases";
import {
  resourceModels,
  resourceSearchFields,
} from "@/lib/resource-registry";
import { resolveSettingValue } from "@/lib/settings";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  type PurchaseFundingSource,
} from "@/lib/purchase-funding";
import {
  DEFAULT_NEW_EXPENSE_PAYMENT_STATUS,
  isExpensePaid,
} from "@/lib/expense-payment-status";
import {
  MILK_STERILIZATION_EXPENSE_CATEGORY,
  milkSterilizationDescription,
} from "@/lib/expense-categories";
import {
  calculateMilkPurchaseCost,
  isFreshMilkIngredient,
} from "@/lib/milk-sterilization";
import { vietnamDateKey, vietnamDayBoundary } from "@/lib/vietnam-date";
import type { ResourceName } from "@/lib/validators/resources";
import { Ingredient } from "@/models/Ingredient";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { ProductSize } from "@/models/Size";
import {
  ingredientCodePrefix,
  nextIngredientCode,
  type IngredientCategory,
} from "@/lib/ingredient-code";

type PurchaseInput = {
  purchaseDate: Date;
  ingredientId: string;
  packageCount: number;
  totalAmount?: number;
  actualPackagePrice?: number;
  fundingSource?: PurchaseFundingSource;
  sterilizationOutsourcedLiters?: number;
  sterilizationUnitPrice?: number;
  sterilizationProvider?: string;
  supplier?: string;
  note?: string;
};

type EquipmentInput = {
  purchaseDate: Date;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number;
  fundingSource?: PurchaseFundingSource;
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

async function createIngredient(payload: Record<string, unknown>) {
  const category = payload.category as IngredientCategory;
  const prefix = ingredientCodePrefix(category);
  const matchingCode = new RegExp(`^${prefix}-?\\d+$`, "i");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const records = await Ingredient.find({ code: matchingCode })
      .select("code")
      .lean();
    const code = nextIngredientCode(
      category,
      records.map((record) => record.code),
    );

    try {
      return await Ingredient.create({ ...payload, code });
    } catch (error) {
      const mongoError = error as {
        code?: number;
        keyPattern?: Record<string, number>;
      };
      const isCodeCollision =
        mongoError.code === 11000 && Boolean(mongoError.keyPattern?.code);
      if (!isCodeCollision || attempt === 4) throw error;
    }
  }

  throw new Error("Không thể tạo mã hàng hóa. Vui lòng thử lại.");
}

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
    fundingSource:
      payload.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
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
  const convertedQuantity = payload.packageCount * packageQuantity;
  const isFreshMilk = isFreshMilkIngredient(ingredient);
  const milkCost = calculateMilkPurchaseCost({
    goodsAmount: totalAmount,
    totalLiters: convertedQuantity,
    outsourcedLiters: isFreshMilk
      ? payload.sterilizationOutsourcedLiters
      : 0,
    sterilizationUnitPrice: payload.sterilizationUnitPrice,
  });
  const sterilizationProvider = isFreshMilk
    ? String(payload.sterilizationProvider ?? "").trim()
    : "";
  if (milkCost.outsourcedLiters > 0 && !sterilizationProvider) {
    throw new Error("Vui lòng nhập bên nhận tiệt trùng sữa.");
  }

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
    convertedQuantity,
    totalAmount,
    sterilizationOutsourcedLiters: milkCost.outsourcedLiters,
    sterilizationSelfLiters: isFreshMilk
      ? milkCost.selfProcessedLiters
      : 0,
    sterilizationUnitPrice: isFreshMilk
      ? milkCost.sterilizationUnitPrice
      : 0,
    sterilizationCost: isFreshMilk ? milkCost.sterilizationCost : 0,
    sterilizationProvider,
    inventoryCostAmount: isFreshMilk
      ? milkCost.inventoryCostAmount
      : totalAmount,
    landedUnitCost: isFreshMilk
      ? milkCost.landedUnitCost
      : convertedQuantity > 0
        ? totalAmount / convertedQuantity
        : 0,
    fundingSource:
      payload.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
    supplier: payload.supplier ?? "",
    note: payload.note ?? "",
  };
}

type ResolvedPurchase = Awaited<ReturnType<typeof purchasePayload>>;

async function linkedSterilizationExpense(purchase: {
  _id: unknown;
  sterilizationExpenseId?: unknown;
}) {
  return Expense.findOne({
    $or: [
      ...(purchase.sterilizationExpenseId
        ? [{ _id: purchase.sterilizationExpenseId }]
        : []),
      { sourcePurchaseId: purchase._id },
    ],
  });
}

function paidSterilizationChanged(
  expense: {
    expenseDate?: Date;
    milkLiters?: number;
    milkUnitPrice?: number;
    amount?: number;
    provider?: string;
    fundingSource?: string;
  },
  purchase: ResolvedPurchase,
) {
  return (
    new Date(expense.expenseDate ?? 0).getTime() !==
      new Date(purchase.purchaseDate).getTime() ||
    Number(expense.milkLiters ?? 0) !==
      Number(purchase.sterilizationOutsourcedLiters) ||
    Number(expense.milkUnitPrice ?? 0) !==
      Number(purchase.sterilizationUnitPrice) ||
    Number(expense.amount ?? 0) !== Number(purchase.sterilizationCost) ||
    String(expense.provider ?? "") !== purchase.sterilizationProvider ||
    String(expense.fundingSource ?? "") !== String(purchase.fundingSource)
  );
}

async function assertSterilizationExpenseCanChange(
  existingPurchase: { _id: unknown; sterilizationExpenseId?: unknown },
  nextPurchase: ResolvedPurchase,
) {
  const expense = await linkedSterilizationExpense(existingPurchase);
  if (
    expense &&
    isExpensePaid(expense) &&
    paidSterilizationChanged(expense, nextPurchase)
  ) {
    throw new Error(
      "Chi phí tiệt trùng của lần nhập này đã thanh toán nên không thể thay đổi số lít, đơn giá, nhà cung cấp hoặc nguồn tiền.",
    );
  }
}

async function syncSterilizationExpense(purchase: {
  _id: unknown;
  purchaseDate: Date;
  itemCode?: string;
  itemName?: string;
  sterilizationExpenseId?: unknown;
  sterilizationOutsourcedLiters?: number;
  sterilizationUnitPrice?: number;
  sterilizationCost?: number;
  sterilizationProvider?: string;
  fundingSource?: PurchaseFundingSource;
}) {
  let expense = await linkedSterilizationExpense(purchase);
  const amount = Number(purchase.sterilizationCost ?? 0);

  if (amount <= 0) {
    if (expense && isExpensePaid(expense)) {
      throw new Error(
        "Không thể xóa chi phí tiệt trùng đã thanh toán khỏi lần nhập.",
      );
    }
    if (expense) await expense.deleteOne();
    await Purchase.findByIdAndUpdate(purchase._id, {
      $unset: { sterilizationExpenseId: 1 },
    });
    return null;
  }

  if (!expense) {
    const purchaseDateKey = vietnamDateKey(new Date(purchase.purchaseDate));
    const matchingLegacyExpenses = await Expense.find({
      category: MILK_STERILIZATION_EXPENSE_CATEGORY,
      sourcePurchaseId: { $exists: false },
      expenseDate: {
        $gte: vietnamDayBoundary(purchaseDateKey),
        $lte: vietnamDayBoundary(purchaseDateKey, true),
      },
      milkLiters: Number(purchase.sterilizationOutsourcedLiters ?? 0),
      milkUnitPrice: Number(purchase.sterilizationUnitPrice ?? 0),
      amount,
    }).limit(2);
    if (matchingLegacyExpenses.length === 1) {
      expense = matchingLegacyExpenses[0];
    }
  }

  if (expense && isExpensePaid(expense)) {
    await Expense.findByIdAndUpdate(expense._id, {
      $set: {
        accountingTreatment: "inventory_cost",
        sourceType: "purchase_sterilization",
        sourcePurchaseId: purchase._id,
        provider: purchase.sterilizationProvider ?? expense.provider ?? "",
      },
    });
    await Purchase.findByIdAndUpdate(purchase._id, {
      $set: { sterilizationExpenseId: expense._id },
    });
    return expense;
  }

  const milkLiters = Number(purchase.sterilizationOutsourcedLiters ?? 0);
  const milkUnitPrice = Number(purchase.sterilizationUnitPrice ?? 0);
  const expensePayload = {
    expenseDate: purchase.purchaseDate,
    category: MILK_STERILIZATION_EXPENSE_CATEGORY,
    description: `${purchase.itemName ?? "Sữa"} · ${milkSterilizationDescription(
      milkLiters,
      milkUnitPrice,
    )}`,
    milkLiters,
    milkUnitPrice,
    provider: purchase.sterilizationProvider ?? "",
    amount,
    accountingTreatment: "inventory_cost",
    sourceType: "purchase_sterilization",
    sourcePurchaseId: purchase._id,
    paymentStatus: DEFAULT_NEW_EXPENSE_PAYMENT_STATUS,
    fundingSource:
      purchase.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
    isRecurring: false,
    note: `Tự động tạo từ phiếu nhập ${purchase.itemCode ?? "sữa"}`,
  } as const;
  const savedExpense = expense
    ? await Expense.findByIdAndUpdate(expense._id, expensePayload, {
        returnDocument: "after",
        runValidators: true,
      })
    : await Expense.create(expensePayload);
  if (savedExpense) {
    await Purchase.findByIdAndUpdate(purchase._id, {
      $set: { sterilizationExpenseId: savedExpense._id },
    });
  }
  return savedExpense;
}

type IngredientForPurchaseSummary = {
  _id: unknown;
  code?: unknown;
  category?: unknown;
  costUnit?: unknown;
};

type PurchaseForSummary = PurchaseQuantityRecord & {
  _id?: unknown;
  ingredientId?: unknown;
  itemCode?: unknown;
};

function groupPurchasesByIngredient(
  ingredients: IngredientForPurchaseSummary[],
  purchases: PurchaseForSummary[],
) {
  const ingredientIdByCode = new Map(
    ingredients.map((ingredient) => [
      String(ingredient.code ?? ""),
      String(ingredient._id),
    ]),
  );
  const ingredientIds = new Set(
    ingredients.map((ingredient) => String(ingredient._id)),
  );
  const grouped = new Map<string, PurchaseForSummary[]>();

  for (const purchase of purchases) {
    const linkedId = String(purchase.ingredientId ?? "");
    const ingredientId = ingredientIds.has(linkedId)
      ? linkedId
      : ingredientIdByCode.get(String(purchase.itemCode ?? ""));
    if (!ingredientId) continue;
    grouped.set(ingredientId, [
      ...(grouped.get(ingredientId) ?? []),
      purchase,
    ]);
  }

  return grouped;
}

export async function recalculateIngredientAverages(
  filter: Record<string, unknown> = {},
  options: {
    normalizePurchaseUnits?: boolean;
    recalculateProducts?: boolean;
  } = {},
) {
  await connectMongo();
  const ingredients = (await Ingredient.find(filter)
    .select("_id code category costUnit")
    .lean()) as IngredientForPurchaseSummary[];
  if (ingredients.length === 0) {
    return { found: 0, updated: 0, normalizedPurchases: 0 };
  }

  const ingredientIds = ingredients.map((ingredient) => ingredient._id);
  const ingredientCodes = ingredients
    .map((ingredient) => String(ingredient.code ?? ""))
    .filter(Boolean);
  const purchases = (await Purchase.find({
    $or: [
      { ingredientId: { $in: ingredientIds } },
      { itemCode: { $in: ingredientCodes } },
    ],
  })
    .select(
      "_id ingredientId itemCode packageCount packageQuantity costUnit convertedQuantity totalAmount inventoryCostAmount",
    )
    .lean()) as PurchaseForSummary[];
  const purchasesByIngredient = groupPurchasesByIngredient(
    ingredients,
    purchases,
  );
  const ingredientUpdates = [];
  const purchaseUpdates = [];

  for (const ingredient of ingredients) {
    const history =
      purchasesByIngredient.get(String(ingredient._id)) ?? [];
    const targetUnit =
      String(ingredient.costUnit ?? "").trim() ||
      String(history[0]?.costUnit ?? "").trim();
    const summary = summarizePurchases(history, targetUnit);
    ingredientUpdates.push({
      updateOne: {
        filter: { _id: ingredient._id },
        update: { $set: { averageUnitCost: summary.averageUnitCost } },
      },
    });

    if (options.normalizePurchaseUnits && targetUnit) {
      for (const purchase of history) {
        if (String(purchase.costUnit ?? "").trim() === targetUnit) continue;
        purchaseUpdates.push({
          updateOne: {
            filter: { _id: purchase._id },
            update: {
              $set: normalizePurchaseUnit(purchase, targetUnit),
            },
          },
        });
      }
    }
  }

  if (purchaseUpdates.length > 0) {
    await Purchase.bulkWrite(purchaseUpdates, { ordered: false });
  }
  if (ingredientUpdates.length > 0) {
    await Ingredient.bulkWrite(ingredientUpdates, { ordered: false });
  }

  if (options.recalculateProducts !== false) {
    const toppingIds = ingredients
      .filter((ingredient) => ingredient.category === "Topping")
      .map((ingredient) => ingredient._id);
    if (toppingIds.length > 0) {
      await recalculateProductCosts({
        toppingIngredientId: { $in: toppingIds },
      });
    }
  }

  return {
    found: ingredients.length,
    updated: ingredientUpdates.length,
    normalizedPurchases: purchaseUpdates.length,
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
  await recalculateIngredientAverages(
    { _id: ingredient._id },
    { normalizePurchaseUnits: true },
  );
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
  const records = await model
    .find(filter)
    .sort(sort)
    .limit(Math.min(options.limit ?? 250, 500))
    .lean();
  if (resource === "purchases" && records.length > 0) {
    const purchases = records as Array<
      Record<string, unknown> & { _id: unknown; sterilizationExpenseId?: unknown }
    >;
    const purchaseIds = purchases.map((purchase) => purchase._id);
    const expenseIds = purchases
      .map((purchase) => purchase.sterilizationExpenseId)
      .filter(Boolean);
    const expenses = await Expense.find({
      $or: [
        { _id: { $in: expenseIds } },
        { sourcePurchaseId: { $in: purchaseIds } },
      ],
    })
      .select("_id sourcePurchaseId paymentStatus paidAt")
      .lean();
    const expensesByPurchase = new Map(
      expenses.map((expense) => [String(expense.sourcePurchaseId), expense]),
    );
    const expensesById = new Map(
      expenses.map((expense) => [String(expense._id), expense]),
    );
    return purchases.map((purchase) => {
      const expense =
        expensesById.get(String(purchase.sterilizationExpenseId ?? "")) ??
        expensesByPurchase.get(String(purchase._id));
      return {
        ...purchase,
        sterilizationPaymentStatus: expense?.paymentStatus,
        sterilizationPaidAt: expense?.paidAt,
      };
    });
  }
  if (resource !== "ingredients" || records.length === 0) return records;

  const ingredients = records as Array<
    Record<string, unknown> & { _id: unknown; code?: unknown }
  >;
  const ingredientIds = ingredients.map((ingredient) => ingredient._id);
  const ingredientCodes = ingredients
    .map((ingredient) => String(ingredient.code ?? ""))
    .filter(Boolean);
  const purchases = (await Purchase.find({
    $or: [
      { ingredientId: { $in: ingredientIds } },
      { itemCode: { $in: ingredientCodes } },
    ],
  })
    .select(
      "ingredientId itemCode packageCount costUnit convertedQuantity totalAmount inventoryCostAmount",
    )
    .lean()) as PurchaseForSummary[];
  const purchasesByIngredient = groupPurchasesByIngredient(
    ingredients,
    purchases,
  );
  const emptyTotals = () => ({
    totalPurchasedPackages: 0,
    totalPurchasedQuantity: 0,
    totalPurchasedAmount: 0,
  });

  return ingredients.map((ingredient) => ({
    ...ingredient,
    ...(purchasesByIngredient.has(String(ingredient._id))
      ? summarizePurchases(
          purchasesByIngredient.get(String(ingredient._id)) ?? [],
          String(ingredient.costUnit ?? "").trim() ||
            String(
              purchasesByIngredient.get(String(ingredient._id))?.[0]
                ?.costUnit ?? "",
            ).trim(),
        )
      : emptyTotals()),
  }));
}

export async function createResource(
  resource: ResourceName,
  payload: Record<string, unknown>,
) {
  await connectMongo();
  if (resource === "purchases") {
    const resolved = await purchasePayload(payload as PurchaseInput);
    const purchase = await Purchase.create(resolved);
    try {
      await syncSterilizationExpense(purchase);
      await refreshIngredientAverage(resolved.ingredientId, resolved.itemCode);
      return Purchase.findById(purchase._id);
    } catch (error) {
      const linkedExpense = await Expense.findOne({
        sourcePurchaseId: purchase._id,
      });
      const purchaseCreatedAt = new Date(
        purchase.get("createdAt") ?? purchase.purchaseDate,
      ).getTime();
      const expenseCreatedAt = linkedExpense
        ? new Date(linkedExpense.get("createdAt") ?? 0).getTime()
        : 0;
      if (linkedExpense && expenseCreatedAt >= purchaseCreatedAt) {
        await linkedExpense.deleteOne();
      } else if (linkedExpense) {
        await Expense.findByIdAndUpdate(linkedExpense._id, {
          $set: {
            sourceType: "manual",
            accountingTreatment: "operating_expense",
          },
          $unset: { sourcePurchaseId: 1 },
        });
      }
      await Purchase.findByIdAndDelete(purchase._id);
      throw error;
    }
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
  if (resource === "ingredients") {
    return createIngredient(payload);
  }
  if (resource === "expenses") {
    const paid = payload.paymentStatus === "paid";
    return Expense.create({
      ...payload,
      ...(paid ? { paidAt: new Date() } : {}),
    });
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
    await assertSterilizationExpenseCanChange(existing, resolved);
    const purchase = await Purchase.findByIdAndUpdate(id, resolved, {
      returnDocument: "after",
      runValidators: true,
    });
    if (purchase) await syncSterilizationExpense(purchase);
    await Promise.all([
      refreshIngredientAverage(resolved.ingredientId, resolved.itemCode),
      String(existing.ingredientId ?? "") !== String(resolved.ingredientId)
        ? refreshIngredientAverage(existing.ingredientId, existing.itemCode)
        : null,
    ]);
    return Purchase.findById(id);
  }
  if (resource === "products") {
    const existing = await Product.findById(id).select("code").lean();
    if (!existing) return null;
    return Product.findByIdAndUpdate(
      id,
      await productPayload(payload as ProductInput, existing.code, id),
      { returnDocument: "after", runValidators: true },
    );
  }
  if (resource === "batches") {
    const existing = await MilkBatch.findById(id).select("code").lean();
    if (!existing) return null;
    const batch = await MilkBatch.findByIdAndUpdate(
      id,
      await batchPayload(payload as BatchInput, existing.code, id),
      { returnDocument: "after", runValidators: true },
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
      { returnDocument: "after", runValidators: true },
    );
  }
  if (resource === "ingredients") {
    const existing = await Ingredient.findById(id)
      .select("_id code")
      .lean();
    if (!existing) return null;
    const ingredientPayload = { ...payload };
    delete ingredientPayload.code;
    const targetUnit = String(ingredientPayload.costUnit ?? "").trim();
    const purchaseHistory = (await Purchase.find({
      $or: [
        { ingredientId: existing._id },
        { itemCode: existing.code },
      ],
    })
      .select("costUnit convertedQuantity")
      .lean()) as PurchaseForSummary[];
    if (purchaseHistory.length > 0 && !targetUnit) {
      throw new Error(
        "Không thể bỏ đơn vị cost khi hàng hóa đã có lịch sử nhập.",
      );
    }
    summarizePurchases(purchaseHistory, targetUnit);

    const ingredient = await Ingredient.findByIdAndUpdate(
      id,
      ingredientPayload,
      {
        returnDocument: "after",
        runValidators: true,
      },
    );
    if (ingredient) {
      await recalculateIngredientAverages(
        { _id: ingredient._id },
        { normalizePurchaseUnits: true },
      );
      return Ingredient.findById(ingredient._id);
    }
    return ingredient;
  }
  if (resource === "sizes") {
    const size = await ProductSize.findByIdAndUpdate(id, payload, {
      returnDocument: "after",
      runValidators: true,
    });
    if (size) await recalculateProductCosts({ sizeId: size._id });
    return size;
  }
  if (resource === "expenses") {
    const existing = await Expense.findById(id).lean();
    if (!existing) return null;
    const isPurchaseSterilization =
      existing.sourceType === "purchase_sterilization" &&
      Boolean(existing.sourcePurchaseId);
    if (
      isPurchaseSterilization &&
      existing.paymentId &&
      payload.paymentStatus === "unpaid"
    ) {
      throw new Error(
        "Khoản này đã nằm trong một lần thanh toán cuối tuần nên không thể chuyển lại thành Chưa thanh toán.",
      );
    }
    const editablePayload = isPurchaseSterilization
      ? {
          ...payload,
          category: existing.category,
          description: existing.description,
          milkLiters: existing.milkLiters,
          milkUnitPrice: existing.milkUnitPrice,
          provider: existing.provider,
          amount: existing.amount,
          accountingTreatment: existing.accountingTreatment,
          sourceType: existing.sourceType,
          sourcePurchaseId: existing.sourcePurchaseId,
          isRecurring: false,
        }
      : payload;
    const keepsMilkDetails =
      editablePayload.milkLiters !== undefined &&
      editablePayload.milkUnitPrice !== undefined;
    const paymentStatus = (editablePayload as Record<string, unknown>)
      .paymentStatus;
    const paymentUpdate =
      paymentStatus === "paid"
        ? { paidAt: existing.paidAt ?? new Date() }
        : paymentStatus === "unpaid"
          ? null
          : undefined;
    return Expense.findByIdAndUpdate(
      id,
      keepsMilkDetails
        ? {
            $set: {
              ...editablePayload,
              ...(paymentUpdate ? paymentUpdate : {}),
            },
            ...(!paymentUpdate && paymentStatus === "unpaid"
              ? { $unset: { paidAt: 1, paymentId: 1 } }
              : {}),
          }
        : {
            $set: {
              ...editablePayload,
              ...(paymentUpdate ? paymentUpdate : {}),
            },
            $unset: {
              milkLiters: 1,
              milkUnitPrice: 1,
              ...(!paymentUpdate && paymentStatus === "unpaid"
                ? { paidAt: 1, paymentId: 1 }
                : {}),
            },
          },
      { returnDocument: "after", runValidators: true },
    );
  }
  return resourceModels[resource].findByIdAndUpdate(id, payload, {
    returnDocument: "after",
    runValidators: true,
  });
}

export async function deleteResource(resource: ResourceName, id: string) {
  await connectMongo();
  if (resource === "purchases") {
    const existing = await Purchase.findById(id);
    if (!existing) return null;
    const expense = await linkedSterilizationExpense(existing);
    if (expense && isExpensePaid(expense)) {
      throw new Error(
        "Không thể xóa lần nhập vì chi phí tiệt trùng đã được thanh toán.",
      );
    }
    if (expense) await expense.deleteOne();
    const purchase = await Purchase.findByIdAndDelete(id);
    if (purchase?.ingredientId) {
      await refreshIngredientAverage(
        purchase.ingredientId,
        purchase.itemCode,
      );
    }
    return purchase;
  }
  if (resource === "expenses") {
    const expense = await Expense.findById(id).lean();
    if (!expense) return null;
    if (expense.sourceType === "purchase_sterilization") {
      throw new Error(
        "Chi phí này được tạo từ phiếu nhập sữa. Hãy sửa hoặc xóa tại trang Nhập hàng.",
      );
    }
    return Expense.findByIdAndDelete(id);
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
