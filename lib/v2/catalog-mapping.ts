import {
  LEGACY_BASELINE,
  type PostingBusinessLineCode,
} from "./constants";
import { assertVnd } from "./money";

type LegacyProductRecord = {
  _id?: unknown;
  id?: unknown;
  code?: unknown;
  name?: unknown;
  sellingPrice?: unknown;
  sizeName?: unknown;
  isActive?: unknown;
  productMode?: unknown;
  recipeId?: unknown;
  recipeCode?: unknown;
  variableCost?: unknown;
  fullCost?: unknown;
};

export type ExplicitCatalogMapping = {
  oldProductId: string;
  oldProductCode: string;
  businessLineCode: PostingBusinessLineCode;
  catalogProductCode: string;
  catalogProductName: string;
  skuCode: string;
  categoryCode: string;
  salesUnit: "box" | "cup" | "bottle" | "portion" | "each";
  fulfillment: "made_to_order" | "preproduced";
};

type KnownLegacyRule = Omit<
  ExplicitCatalogMapping,
  "oldProductId" | "oldProductCode" | "skuCode"
>;

export const KNOWN_LEGACY_PRODUCT_RULES: Readonly<
  Record<string, KnownLegacyRule>
> = {
  "M-OREO": snowMilkRule("SNOW-OREO", "Sữa Tuyết Oreo"),
  "L-OREO": snowMilkRule("SNOW-OREO", "Sữa Tuyết Oreo"),
  "M-DUA": snowMilkRule("SNOW-DUA", "Sữa Tuyết Dừa non"),
  "L-DUA": snowMilkRule("SNOW-DUA", "Sữa Tuyết Dừa non"),
  "M-DAU": snowMilkRule("SNOW-DAU", "Sữa Tuyết Dâu giòn"),
  "L-DAU": snowMilkRule("SNOW-DAU", "Sữa Tuyết Dâu giòn"),
  "M-SC": snowMilkRule("SNOW-SC", "Sữa Tuyết Sữa chua sấy"),
  "L-SC": snowMilkRule("SNOW-SC", "Sữa Tuyết Sữa chua sấy"),
  "M-CHOCO": snowMilkRule("SNOW-CHOCO", "Sữa Tuyết Choco Ball"),
  "L-CHOCO": snowMilkRule("SNOW-CHOCO", "Sữa Tuyết Choco Ball"),
};

function snowMilkRule(
  catalogProductCode: string,
  catalogProductName: string,
): KnownLegacyRule {
  return {
    businessLineCode: "SNOW_MILK",
    catalogProductCode,
    catalogProductName,
    categoryCode: "SNOW_MILK",
    salesUnit: "cup",
    fulfillment: "made_to_order",
  };
}

function stringId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toHexString" in value) {
    const toHexString = (value as { toHexString?: unknown }).toHexString;
    if (typeof toHexString === "function") {
      return String(toHexString.call(value));
    }
  }
  if (value === undefined || value === null) return "";
  return String(value);
}

function cleanCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPostingBusinessLine(
  value: string,
): value is PostingBusinessLineCode {
  return ["SNOW_MILK", "FRESH_MILK", "BREAKFAST"].includes(value);
}

export function validateExplicitCatalogMappings(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Catalog map phải là một mảng JSON.");
  }
  const mappings = value.map((item, index): ExplicitCatalogMapping => {
    if (!item || typeof item !== "object") {
      throw new Error(`Catalog map dòng ${index + 1} không hợp lệ.`);
    }
    const row = item as Record<string, unknown>;
    const oldProductId = cleanName(row.oldProductId);
    const oldProductCode = cleanCode(row.oldProductCode);
    const businessLineCode = cleanCode(row.businessLineCode);
    const catalogProductCode = cleanCode(row.catalogProductCode);
    const catalogProductName = cleanName(row.catalogProductName);
    const skuCode = cleanCode(row.skuCode);
    const categoryCode = cleanCode(row.categoryCode);
    const salesUnit = cleanName(row.salesUnit);
    const fulfillment = cleanName(row.fulfillment);
    if (
      !oldProductId ||
      !oldProductCode ||
      !catalogProductCode ||
      !catalogProductName ||
      !skuCode ||
      !categoryCode ||
      !isPostingBusinessLine(businessLineCode) ||
      !["box", "cup", "bottle", "portion", "each"].includes(salesUnit) ||
      !["made_to_order", "preproduced"].includes(fulfillment)
    ) {
      throw new Error(
        `Catalog map dòng ${index + 1} thiếu field hoặc chứa mã không hợp lệ.`,
      );
    }
    return {
      oldProductId,
      oldProductCode,
      businessLineCode,
      catalogProductCode,
      catalogProductName,
      skuCode,
      categoryCode,
      salesUnit: salesUnit as ExplicitCatalogMapping["salesUnit"],
      fulfillment: fulfillment as ExplicitCatalogMapping["fulfillment"],
    };
  });

  const keys = mappings.map(
    ({ oldProductId, oldProductCode }) => `${oldProductId}|${oldProductCode}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Catalog map có product nguồn bị trùng.");
  }
  return mappings;
}

export type CatalogMappingIssue = {
  severity: "error";
  code: "UNRESOLVED_PRODUCT" | "INVALID_PRODUCT" | "DUPLICATE_TARGET";
  oldProductId: string;
  oldProductCode: string;
  message: string;
};

export function buildCatalogBackfillPlan(
  sourceProducts: readonly LegacyProductRecord[],
  explicitMappings: readonly ExplicitCatalogMapping[] = [],
) {
  const overrides = new Map(
    explicitMappings.map((mapping) => [
      `${mapping.oldProductId}|${mapping.oldProductCode}`,
      mapping,
    ]),
  );
  const issues: CatalogMappingIssue[] = [];
  const mappingTemplate: Record<string, unknown>[] = [];
  const resolved: Array<
    ExplicitCatalogMapping & {
      sourceName: string;
      sellingPriceVnd: number;
      sizeName: string;
      isActive: boolean;
      productMode: string;
      recipeId: string;
      recipeCode: string;
      legacyCostSnapshot: { variableCost: number; fullCost: number };
    }
  > = [];

  for (const source of sourceProducts) {
    const oldProductId = stringId(source._id ?? source.id);
    const oldProductCode = cleanCode(source.code);
    const sourceName = cleanName(source.name);
    if (!oldProductId || !oldProductCode || !sourceName) {
      issues.push({
        severity: "error",
        code: "INVALID_PRODUCT",
        oldProductId,
        oldProductCode,
        message: "Product nguồn thiếu _id, code hoặc name; không thể map an toàn.",
      });
      continue;
    }

    const override = overrides.get(`${oldProductId}|${oldProductCode}`);
    const knownRule = KNOWN_LEGACY_PRODUCT_RULES[oldProductCode];
    const mapping: ExplicitCatalogMapping | undefined =
      override ??
      (knownRule
        ? {
            oldProductId,
            oldProductCode,
            skuCode: oldProductCode,
            ...knownRule,
          }
        : undefined);

    if (!mapping) {
      issues.push({
        severity: "error",
        code: "UNRESOLVED_PRODUCT",
        oldProductId,
        oldProductCode,
        message:
          "Chưa có mapping tường minh theo _id + code; không được phân loại bằng tên.",
      });
      mappingTemplate.push({
        oldProductId,
        oldProductCode,
        oldProductName: sourceName,
        businessLineCode: "FILL_ME",
        catalogProductCode: "FILL_ME",
        catalogProductName: "FILL_ME",
        skuCode: oldProductCode,
        categoryCode: "FILL_ME",
        salesUnit: "FILL_ME",
        fulfillment: "made_to_order",
      });
      continue;
    }

    const sellingPriceVnd = Number(source.sellingPrice ?? 0);
    try {
      assertVnd(sellingPriceVnd, `Giá bán ${oldProductCode}`);
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_PRODUCT",
        oldProductId,
        oldProductCode,
        message: error instanceof Error ? error.message : "Giá bán không hợp lệ.",
      });
      continue;
    }
    resolved.push({
      ...mapping,
      sourceName,
      sellingPriceVnd,
      sizeName: cleanName(source.sizeName),
      isActive: source.isActive !== false,
      productMode: cleanName(source.productMode),
      recipeId: stringId(source.recipeId),
      recipeCode: cleanCode(source.recipeCode),
      legacyCostSnapshot: {
        variableCost: Number(source.variableCost ?? 0),
        fullCost: Number(source.fullCost ?? 0),
      },
    });
  }

  const duplicateSkuCodes = resolved
    .map(({ skuCode }) => skuCode)
    .filter((code, index, all) => all.indexOf(code) !== index);
  for (const skuCode of new Set(duplicateSkuCodes)) {
    const duplicate = resolved.find((item) => item.skuCode === skuCode)!;
    issues.push({
      severity: "error",
      code: "DUPLICATE_TARGET",
      oldProductId: duplicate.oldProductId,
      oldProductCode: duplicate.oldProductCode,
      message: `Nhiều product nguồn cùng map vào SKU ${skuCode}.`,
    });
  }

  const catalogProductGroups = new Map<
    string,
    {
      code: string;
      name: string;
      businessLineCode: PostingBusinessLineCode;
      categoryCode: string;
      legacySourceIds: string[];
      isActive: boolean;
    }
  >();
  for (const item of resolved) {
    const existing = catalogProductGroups.get(item.catalogProductCode);
    if (
      existing &&
      (existing.name !== item.catalogProductName ||
        existing.businessLineCode !== item.businessLineCode ||
        existing.categoryCode !== item.categoryCode)
    ) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_TARGET",
        oldProductId: item.oldProductId,
        oldProductCode: item.oldProductCode,
        message: `Catalog product ${item.catalogProductCode} có mapping mâu thuẫn.`,
      });
      continue;
    }
    if (existing) {
      existing.legacySourceIds.push(item.oldProductId);
      existing.isActive ||= item.isActive;
    } else {
      catalogProductGroups.set(item.catalogProductCode, {
        code: item.catalogProductCode,
        name: item.catalogProductName,
        businessLineCode: item.businessLineCode,
        categoryCode: item.categoryCode,
        legacySourceIds: [item.oldProductId],
        isActive: item.isActive,
      });
    }
  }

  const catalogProducts = [...catalogProductGroups.values()]
    .map((item) => ({
      ...item,
      legacySourceIds: item.legacySourceIds.sort(),
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const skus = resolved
    .map((item) => ({
      code: item.skuCode,
      name: item.sourceName,
      catalogProductCode: item.catalogProductCode,
      businessLineCode: item.businessLineCode,
      categoryCode: item.categoryCode,
      fulfillment: item.fulfillment,
      sellingUnit: item.salesUnit,
      sizeName: item.sizeName,
      isActive: item.isActive,
      legacySourceId: item.oldProductId,
      legacyProductCode: item.oldProductCode,
      legacyRecipeId: item.recipeId || null,
      legacyRecipeCode: item.recipeCode || null,
      legacyProductMode: item.productMode || null,
      legacyCostSnapshot: item.legacyCostSnapshot,
    }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const skuPrices = resolved
    .map((item) => ({
      skuCode: item.skuCode,
      unitPriceVnd: item.sellingPriceVnd,
      effectiveFromBusinessDate: LEGACY_BASELINE.fromBusinessDate,
      effectiveToBusinessDate: null,
      source: "legacy_catalog",
    }))
    .sort((left, right) => left.skuCode.localeCompare(right.skuCode));

  return {
    catalogProducts,
    skus,
    skuPrices,
    mappingTemplate: mappingTemplate.sort((left, right) =>
      String(left.oldProductCode).localeCompare(String(right.oldProductCode)),
    ),
    issues: issues.sort(
      (left, right) =>
        left.oldProductCode.localeCompare(right.oldProductCode) ||
        left.code.localeCompare(right.code),
    ),
    canApply: issues.length === 0 && resolved.length === sourceProducts.length,
  };
}
