import { LEGACY_BASELINE, MIGRATION_VERSION } from "./constants";
import {
  exactDecimalString,
  multiplyDecimalRatioExact,
  normalizeLegacyCostRate,
  normalizeLegacyQuantity,
  type BaseInventoryUnit,
} from "./decimal";

type LegacyRecipeComponent = {
  ingredientId?: unknown;
  ingredientCode?: unknown;
  ingredientName?: unknown;
  quantity?: unknown;
  unit?: unknown;
  costUnit?: unknown;
  unitCost?: unknown;
  amount?: unknown;
};

export type LegacyRecipeRecord = {
  _id?: unknown;
  id?: unknown;
  code?: unknown;
  name?: unknown;
  yieldMl?: unknown;
  ingredientCost?: unknown;
  costPerMl?: unknown;
  ingredients?: unknown;
  note?: unknown;
  isActive?: unknown;
};

export type LegacyRecipeProductRecord = {
  _id?: unknown;
  id?: unknown;
  code?: unknown;
  name?: unknown;
  productMode?: unknown;
  recipeId?: unknown;
  recipeCode?: unknown;
  milkMl?: unknown;
  packagingItems?: unknown;
  isActive?: unknown;
};

export type LegacyIngredientRecord = {
  _id?: unknown;
  id?: unknown;
  code?: unknown;
  name?: unknown;
  category?: unknown;
  purchaseUnit?: unknown;
  packageQuantity?: unknown;
  costUnit?: unknown;
  referencePackagePrice?: unknown;
  averageUnitCost?: unknown;
  note?: unknown;
  isActive?: unknown;
};

export type ResolvedCatalogSkuForRecipe = {
  code: string;
  name: string;
  legacySourceId: string;
  legacyProductCode: string;
  legacyRecipeId: string | null;
  legacyRecipeCode: string | null;
  legacyProductMode: string | null;
  isActive: boolean;
};

export type RecipeMigrationIssue = {
  severity: "error";
  code:
    | "INVALID_RECIPE_LINK"
    | "UNMAPPED_RECIPE"
    | "DUPLICATE_RECIPE_TARGET"
    | "MISSING_INGREDIENT"
    | "INVALID_RECIPE_VALUE";
  sourceId: string;
  sourceCode: string;
  message: string;
};

function stringId(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "toHexString" in value) {
    const fn = (value as { toHexString?: unknown }).toHexString;
    if (typeof fn === "function") return String(fn.call(value));
  }
  return value == null ? "" : String(value).trim();
}

function code(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function name(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rows(value: unknown): LegacyRecipeComponent[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is LegacyRecipeComponent =>
          item != null && typeof item === "object",
      )
    : [];
}

function positiveDecimal(value: unknown, label: string) {
  const normalized = exactDecimalString(value, label);
  if (normalized === "0") throw new RangeError(`${label} phải lớn hơn 0.`);
  return normalized;
}

function ingredientKey(id: string, ingredientCode: string) {
  return `${id}|${ingredientCode}`;
}

type PlannedInventoryItem = {
  code: string;
  name: string;
  itemType: "raw_material" | "packaging";
  baseUnit: BaseInventoryUnit;
  legacySourceId: string;
  isActive: boolean;
  note: string;
  legacyCostSnapshot: Record<string, unknown>;
};

function addInventoryItem(
  byCode: Map<string, PlannedInventoryItem>,
  next: PlannedInventoryItem,
) {
  const existing = byCode.get(next.code);
  if (!existing) {
    byCode.set(next.code, next);
    return;
  }
  if (
    existing.legacySourceId !== next.legacySourceId ||
    existing.baseUnit !== next.baseUnit ||
    existing.itemType !== next.itemType
  ) {
    throw new Error(`Inventory item ${next.code} có định nghĩa legacy mâu thuẫn.`);
  }
  existing.isActive ||= next.isActive;
}

function inventoryItemType(value: unknown) {
  const category = name(value);
  if (category === "Bao bì") return "packaging" as const;
  if (category === "Nguyên liệu" || category === "Topping") {
    return "raw_material" as const;
  }
  throw new RangeError(`Category ingredient chưa được map tường minh: ${category}.`);
}

function ingredientBaseUnit(value: unknown, label: string) {
  return normalizeLegacyQuantity(1, value, label).unit;
}

function sourceIngredientSnapshot(ingredient: LegacyIngredientRecord) {
  return {
    category: name(ingredient.category),
    purchaseUnit: name(ingredient.purchaseUnit),
    packageQuantity:
      ingredient.packageQuantity == null
        ? null
        : exactDecimalString(ingredient.packageQuantity),
    costUnit: name(ingredient.costUnit),
    referencePackagePriceVnd:
      ingredient.referencePackagePrice == null
        ? null
        : exactDecimalString(ingredient.referencePackagePrice),
    legacyAverageUnitCostVnd:
      ingredient.averageUnitCost == null
        ? null
        : exactDecimalString(ingredient.averageUnitCost),
  };
}

export function buildLegacyRecipeBackfillPlan(input: {
  products: readonly LegacyRecipeProductRecord[];
  recipes: readonly LegacyRecipeRecord[];
  ingredients: readonly LegacyIngredientRecord[];
  catalogSkus: readonly ResolvedCatalogSkuForRecipe[];
}) {
  const issues: RecipeMigrationIssue[] = [];
  const recipeByReference = new Map(
    input.recipes.map((recipe) => [
      ingredientKey(stringId(recipe._id ?? recipe.id), code(recipe.code)),
      recipe,
    ]),
  );
  const ingredientByReference = new Map(
    input.ingredients.map((ingredient) => [
      ingredientKey(
        stringId(ingredient._id ?? ingredient.id),
        code(ingredient.code),
      ),
      ingredient,
    ]),
  );
  const skuByProductReference = new Map(
    input.catalogSkus.map((sku) => [
      ingredientKey(sku.legacySourceId, sku.legacyProductCode),
      sku,
    ]),
  );
  const inventoryItems = new Map<string, PlannedInventoryItem>();
  const migratedRecipeIds = new Set<string>();
  const recipeTargets = new Set<string>();
  const recipes: Array<Record<string, unknown>> = [];
  const recipeVersions: Array<Record<string, unknown>> = [];
  const outputInventoryItems: Array<Record<string, unknown>> = [];

  for (const ingredient of input.ingredients) {
    const sourceId = stringId(ingredient._id ?? ingredient.id);
    const sourceCode = code(ingredient.code);
    try {
      if (!sourceId || !sourceCode || !name(ingredient.name)) {
        throw new Error("Ingredient nguồn thiếu _id, code hoặc name.");
      }
      const itemType = inventoryItemType(ingredient.category);
      const baseUnit = ingredientBaseUnit(
        ingredient.costUnit,
        `${sourceCode}.costUnit`,
      );
      addInventoryItem(inventoryItems, {
        code: sourceCode,
        name: name(ingredient.name),
        itemType,
        baseUnit,
        legacySourceId: sourceId,
        isActive: ingredient.isActive !== false,
        note: name(ingredient.note),
        legacyCostSnapshot: sourceIngredientSnapshot(ingredient),
      });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_RECIPE_VALUE",
        sourceId,
        sourceCode,
        message:
          error instanceof Error
            ? error.message
            : "Ingredient legacy không hợp lệ.",
      });
    }
  }

  for (const product of input.products) {
    if (name(product.productMode).toLowerCase() !== "recipe") continue;
    const productId = stringId(product._id ?? product.id);
    const productCode = code(product.code);
    const productName = name(product.name);
    const sourceRecipeId = stringId(product.recipeId);
    const sourceRecipeCode = code(product.recipeCode);
    const sku = skuByProductReference.get(
      ingredientKey(productId, productCode),
    );
    if (
      !productId ||
      !productCode ||
      !productName ||
      !sourceRecipeId ||
      !sourceRecipeCode ||
      !sku ||
      sku.legacyRecipeId !== sourceRecipeId ||
      sku.legacyRecipeCode !== sourceRecipeCode
    ) {
      issues.push({
        severity: "error",
        code: "INVALID_RECIPE_LINK",
        sourceId: productId,
        sourceCode: productCode,
        message:
          "Product recipe phải khớp chính xác product mapping và recipe _id + code.",
      });
      continue;
    }
    const sourceRecipe = recipeByReference.get(
      ingredientKey(sourceRecipeId, sourceRecipeCode),
    );
    if (!sourceRecipe) {
      issues.push({
        severity: "error",
        code: "INVALID_RECIPE_LINK",
        sourceId: productId,
        sourceCode: productCode,
        message: `Không tìm thấy recipe ${sourceRecipeCode} theo đúng _id nguồn.`,
      });
      continue;
    }
    if (recipeTargets.has(sourceRecipeCode)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_RECIPE_TARGET",
        sourceId: sourceRecipeId,
        sourceCode: sourceRecipeCode,
        message:
          "Một recipe legacy đang liên kết nhiều SKU; cần mapping recipe aggregate tường minh.",
      });
      continue;
    }

    try {
      const yieldMl = positiveDecimal(sourceRecipe.yieldMl, `${sourceRecipeCode}.yieldMl`);
      const servingMl = positiveDecimal(product.milkMl, `${productCode}.milkMl`);
      const outputInventoryItemCode = `FG-${sku.code}`;
      const componentPlans: Array<Record<string, unknown>> = [];
      const legacyComponentSnapshots: Array<Record<string, unknown>> = [];

      for (const component of rows(sourceRecipe.ingredients)) {
        const componentId = stringId(component.ingredientId);
        const componentCode = code(component.ingredientCode);
        const ingredient = ingredientByReference.get(
          ingredientKey(componentId, componentCode),
        );
        if (!componentId || !componentCode || !ingredient) {
          issues.push({
            severity: "error",
            code: "MISSING_INGREDIENT",
            sourceId: sourceRecipeId,
            sourceCode: sourceRecipeCode,
            message: `Không resolve được ingredient ${componentCode || componentId} theo _id + code.`,
          });
          continue;
        }
        const fullBatch = normalizeLegacyQuantity(
          component.quantity,
          component.unit,
          `${sourceRecipeCode}.${componentCode}.quantity`,
        );
        const inputQuantity = multiplyDecimalRatioExact(
          fullBatch.quantity,
          servingMl,
          yieldMl,
          `${sourceRecipeCode}.${componentCode}.serving-ratio`,
        );
        const estimatedUnitCostVnd = normalizeLegacyCostRate(
          component.unitCost,
          component.costUnit,
          fullBatch.unit,
          `${sourceRecipeCode}.${componentCode}.unitCost`,
        );
        addInventoryItem(inventoryItems, {
          code: componentCode,
          name: name(ingredient.name) || name(component.ingredientName),
          itemType: "raw_material",
          baseUnit: fullBatch.unit,
          legacySourceId: componentId,
          isActive: ingredient.isActive !== false,
          note: name(ingredient.note),
          legacyCostSnapshot: sourceIngredientSnapshot(ingredient),
        });
        componentPlans.push({
          inventoryItemCode: componentCode,
          itemName: name(ingredient.name) || name(component.ingredientName),
          inputQuantity,
          unit: fullBatch.unit,
          expectedYieldPercent: null,
          estimatedUnitCostVnd,
          preparationNote:
            "Định lượng trực tiếp cho một phần bán, quy đổi từ recipe legacy; chưa có dữ liệu yield thực tế.",
        });
        legacyComponentSnapshots.push({
          ingredientId: componentId,
          ingredientCode: componentCode,
          quantity: exactDecimalString(component.quantity),
          unit: name(component.unit),
          costUnit: name(component.costUnit),
          unitCostVnd: exactDecimalString(component.unitCost),
          amountVnd: exactDecimalString(component.amount),
        });
      }

      for (const packaging of rows(product.packagingItems)) {
        const packagingId = stringId(packaging.ingredientId);
        const packagingCode = code(packaging.ingredientCode);
        const ingredient = ingredientByReference.get(
          ingredientKey(packagingId, packagingCode),
        );
        if (!packagingId || !packagingCode) {
          issues.push({
            severity: "error",
            code: "MISSING_INGREDIENT",
            sourceId: sourceRecipeId,
            sourceCode: sourceRecipeCode,
            message: "Packaging snapshot thiếu ingredientId hoặc ingredientCode.",
          });
          continue;
        }
        const packagingQuantity = normalizeLegacyQuantity(
          packaging.quantity,
          packaging.costUnit,
          `${productCode}.${packagingCode}.quantity`,
        );
        const estimatedUnitCostVnd = normalizeLegacyCostRate(
          packaging.unitCost,
          packaging.costUnit,
          packagingQuantity.unit,
          `${productCode}.${packagingCode}.unitCost`,
        );
        addInventoryItem(inventoryItems, {
          code: packagingCode,
          name: name(ingredient?.name) || name(packaging.ingredientName),
          itemType: "packaging",
          baseUnit: packagingQuantity.unit,
          legacySourceId: packagingId,
          isActive: ingredient?.isActive !== false,
          note: name(ingredient?.note),
          legacyCostSnapshot: ingredient
            ? sourceIngredientSnapshot(ingredient)
            : {
                purchaseUnit: null,
                packageQuantity: null,
                costUnit: name(packaging.costUnit),
                averageUnitCostVnd: exactDecimalString(packaging.unitCost),
                snapshotSource: "product.packagingItems",
              },
        });
        componentPlans.push({
          inventoryItemCode: packagingCode,
          itemName: name(ingredient?.name) || name(packaging.ingredientName),
          inputQuantity: packagingQuantity.quantity,
          unit: packagingQuantity.unit,
          expectedYieldPercent: null,
          estimatedUnitCostVnd,
          preparationNote: "Bao bì theo snapshot product legacy.",
        });
        legacyComponentSnapshots.push({
          ingredientId: packagingId,
          ingredientCode: packagingCode,
          quantity: exactDecimalString(packaging.quantity),
          unit: name(packaging.costUnit),
          costUnit: name(packaging.costUnit),
          unitCostVnd: exactDecimalString(packaging.unitCost),
          amountVnd: exactDecimalString(packaging.amount),
        });
      }

      if (issues.some((issue) => issue.sourceId === sourceRecipeId)) continue;
      if (componentPlans.length === 0) {
        throw new Error(`${sourceRecipeCode} không có component hợp lệ.`);
      }

      recipeTargets.add(sourceRecipeCode);
      migratedRecipeIds.add(sourceRecipeId);
      outputInventoryItems.push({
        code: outputInventoryItemCode,
        name: `${productName} thành phẩm`,
        itemType: "finished_good",
        baseUnit: "each",
        skuCode: sku.code,
        legacySourceId: productId,
        isActive: product.isActive !== false,
      });
      recipes.push({
        code: sourceRecipeCode,
        name: name(sourceRecipe.name),
        skuCode: sku.code,
        outputInventoryItemCode,
        legacySourceId: sourceRecipeId,
        note: name(sourceRecipe.note),
        isActive: sourceRecipe.isActive !== false,
      });
      recipeVersions.push({
        recipeCode: sourceRecipeCode,
        versionNumber: 1,
        name: name(sourceRecipe.name),
        skuCode: sku.code,
        outputInventoryItemCode,
        outputQuantity: "1",
        outputUnit: "each",
        finishedSpec: [
          {
            inventoryItemCode: outputInventoryItemCode,
            itemName: productName,
            quantity: "1",
            unit: "each",
            preparationNote: `${servingMl} ml trong 1 chai theo product legacy ${productCode}.`,
          },
        ],
        components: componentPlans.sort((left, right) =>
          String(left.inventoryItemCode).localeCompare(
            String(right.inventoryItemCode),
          ),
        ),
        status: "released",
        releasedAt: `${LEGACY_BASELINE.toBusinessDate}T23:59:59.000+07:00`,
        shelfLifeHours: null,
        releaseIdempotencyKey: `migration:${MIGRATION_VERSION}:recipe-release:${sourceRecipeId}`,
        costDataQuality: "legacy",
        legacySourceId: sourceRecipeId,
        legacyCostSnapshot: {
          sourceRecipeCode,
          yieldMl,
          servingMl,
          ingredientCostVnd: exactDecimalString(sourceRecipe.ingredientCost),
          costPerMlVnd: exactDecimalString(sourceRecipe.costPerMl),
          components: legacyComponentSnapshots.sort((left, right) =>
            String(left.ingredientCode).localeCompare(
              String(right.ingredientCode),
            ),
          ),
        },
        isActive: sourceRecipe.isActive !== false,
      });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_RECIPE_VALUE",
        sourceId: sourceRecipeId,
        sourceCode: sourceRecipeCode,
        message:
          error instanceof Error ? error.message : "Recipe legacy không hợp lệ.",
      });
    }
  }

  for (const sourceRecipe of input.recipes) {
    const sourceId = stringId(sourceRecipe._id ?? sourceRecipe.id);
    if (!migratedRecipeIds.has(sourceId)) {
      issues.push({
        severity: "error",
        code: "UNMAPPED_RECIPE",
        sourceId,
        sourceCode: code(sourceRecipe.code),
        message: "Recipe nguồn chưa được map chính xác tới một SKU v2.",
      });
    }
  }

  const sortByCode = <T extends Record<string, unknown>>(
    values: T[],
    field: keyof T = "code" as keyof T,
  ) => values.sort((left, right) => String(left[field]).localeCompare(String(right[field])));
  return {
    recipes: sortByCode(recipes),
    recipeVersions: sortByCode(recipeVersions, "recipeCode"),
    inventoryItems: sortByCode([...inventoryItems.values()]),
    outputInventoryItems: sortByCode(outputInventoryItems),
    issues: issues.sort(
      (left, right) =>
        left.sourceCode.localeCompare(right.sourceCode) ||
        left.code.localeCompare(right.code),
    ),
    mappedIngredientCount: inventoryItems.size,
    sourceIngredientCount: input.ingredients.length,
    canApply:
      issues.length === 0 &&
      migratedRecipeIds.size === input.recipes.length &&
      inventoryItems.size >= input.ingredients.length,
  };
}
