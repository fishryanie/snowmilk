import { isVietnamDateKey, vietnamDateKey } from "@/lib/vietnam-date";
import {
  BUSINESS_LINE_SEEDS,
  CATEGORY_SEEDS,
  DEFAULT_LOCATION,
  DEFAULT_ORGANIZATION,
  LEGACY_BASELINE,
  MIGRATION_VERSION,
  type PostingBusinessLineCode,
} from "./constants";
import {
  buildCatalogBackfillPlan,
  type ExplicitCatalogMapping,
} from "./catalog-mapping";
import { sha256Canonical } from "./canonical";
import {
  HEALTHY_BREAKFAST_INVENTORY_ITEMS,
  HEALTHY_BREAKFAST_PRODUCT,
  HEALTHY_BREAKFAST_RECIPE,
  HEALTHY_BREAKFAST_RECIPE_VERSION,
  HEALTHY_BREAKFAST_SKU,
} from "./seeds";
import {
  buildLegacyRecipeBackfillPlan,
  type LegacyIngredientRecord,
  type LegacyRecipeProductRecord,
  type LegacyRecipeRecord,
  type ResolvedCatalogSkuForRecipe,
} from "./recipe-migration";
import {
  buildLegacySourceManifest,
  sourceCountsFromManifest,
  validateLegacySourceManifest,
  type LegacySourceDocuments,
} from "./source-manifest";

export type LegacySaleRecord = {
  _id?: unknown;
  id?: unknown;
  saleDate?: unknown;
  items?: unknown[];
  totalCups?: unknown;
  cupCountSource?: unknown;
  freshMilkBottleCount?: unknown;
  freshMilkBottleUnitPrice?: unknown;
  grossRevenue?: unknown;
  discountAmount?: unknown;
  netRevenue?: unknown;
  snowMilkRevenue?: unknown;
  freshMilkRevenue?: unknown;
  cashReceived?: unknown;
  bankTransferReceived?: unknown;
  totalVariableCost?: unknown;
  allocatedFixedCost?: unknown;
  contributionProfit?: unknown;
  estimatedProfit?: unknown;
  estimatedProfitLow?: unknown;
  estimatedProfitHigh?: unknown;
  estimatedMargin?: unknown;
  batchId?: unknown;
  batchCode?: unknown;
  batchName?: unknown;
  note?: unknown;
  [key: string]: unknown;
};

type BaselineExpectation = typeof LEGACY_BASELINE;

export type MigrationIssue = {
  severity: "error" | "warning";
  code:
    | "INVALID_LEGACY_SALE"
    | "PAYMENT_MISMATCH"
    | "REVENUE_SPLIT_MISMATCH"
    | "DUPLICATE_BUSINESS_DATE"
    | "BASELINE_MISMATCH";
  legacySourceId?: string;
  businessDate?: string;
  message: string;
};

function sourceId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toHexString" in value) {
    const toHexString = (value as { toHexString?: unknown }).toHexString;
    if (typeof toHexString === "function") return String(toHexString.call(value));
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function finiteInteger(value: unknown, label: string) {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`${label} phải là số nguyên an toàn.`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, label: string) {
  const result = finiteInteger(value, label);
  if (result < 0) throw new Error(`${label} không được âm.`);
  return result;
}

function businessDate(value: unknown) {
  if (typeof value === "string" && isVietnamDateKey(value)) return value;
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(parsed.valueOf())) throw new Error("saleDate không hợp lệ.");
  return vietnamDateKey(parsed);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(record: object, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function metricMismatch(
  actual: number,
  expected: number,
  label: string,
): MigrationIssue | null {
  return actual === expected
    ? null
    : {
        severity: "error",
        code: "BASELINE_MISMATCH",
        message: `${label}: kỳ vọng ${expected}, nhận ${actual}.`,
      };
}

export function buildLegacySalesBackfillPlan(
  sourceSales: readonly LegacySaleRecord[],
  expectedBaseline: BaselineExpectation | null = null,
) {
  const salesDays: Record<string, unknown>[] = [];
  const revenueEntries: Record<string, unknown>[] = [];
  const dailyRevenueFacts: Record<string, unknown>[] = [];
  const issues: MigrationIssue[] = [];

  for (const source of sourceSales) {
    const legacySourceId = sourceId(source._id ?? source.id);
    try {
      if (!legacySourceId) throw new Error("Sale nguồn thiếu _id.");
      const date = businessDate(source.saleDate);
      const grossRevenueVnd = nonNegativeInteger(
        source.grossRevenue ?? source.netRevenue,
        "grossRevenue",
      );
      const discountVnd = nonNegativeInteger(source.discountAmount, "discountAmount");
      const netRevenueVnd = nonNegativeInteger(source.netRevenue, "netRevenue");
      if (grossRevenueVnd - discountVnd !== netRevenueVnd) {
        throw new Error(
          "grossRevenue - discountAmount không bằng netRevenue; cần đối soát nguồn.",
        );
      }
      const isExplicitSplit =
        hasOwn(source, "snowMilkRevenue") ||
        hasOwn(source, "freshMilkRevenue") ||
        hasOwn(source, "freshMilkBottleCount");
      const freshMilkRevenueVnd = isExplicitSplit
        ? nonNegativeInteger(source.freshMilkRevenue, "freshMilkRevenue")
        : 0;
      const snowMilkRevenueVnd = isExplicitSplit
        ? nonNegativeInteger(source.snowMilkRevenue, "snowMilkRevenue")
        : netRevenueVnd;
      const freshMilkBottleCount = isExplicitSplit
        ? nonNegativeInteger(
            source.freshMilkBottleCount,
            "freshMilkBottleCount",
          )
        : 0;
      const estimatedSnowMilkCups = nonNegativeInteger(
        source.totalCups,
        "totalCups",
      );
      const cashVnd = nonNegativeInteger(source.cashReceived, "cashReceived");
      const bankTransferVnd = nonNegativeInteger(
        source.bankTransferReceived,
        "bankTransferReceived",
      );
      const collectedVnd = cashVnd + bankTransferVnd;

      if (snowMilkRevenueVnd + freshMilkRevenueVnd !== netRevenueVnd) {
        issues.push({
          severity: "error",
          code: "REVENUE_SPLIT_MISMATCH",
          legacySourceId,
          businessDate: date,
          message: "Tổng Sữa Tuyết + Sữa tươi không bằng netRevenue.",
        });
      }
      if (collectedVnd !== netRevenueVnd) {
        issues.push({
          severity: "error",
          code: "PAYMENT_MISMATCH",
          legacySourceId,
          businessDate: date,
          message: `Tiền đã thu lệch ${collectedVnd - netRevenueVnd}đ.`,
        });
      }
      if (Array.isArray(source.items) && source.items.length > 0) {
        issues.push({
          severity: "warning",
          code: "INVALID_LEGACY_SALE",
          legacySourceId,
          businessDate: date,
          message:
            "Sale nguồn có items; planner vẫn không dùng chúng vì baseline đã xác minh không có dòng SKU thực tế.",
        });
      }

      const lines: Array<Record<string, unknown>> = [];
      const addLine = (
        businessLineCode: PostingBusinessLineCode,
        revenueVnd: number,
        quantity: number,
        quantityUnit: "cup" | "bottle",
        quantitySource: "estimated" | "legacy",
      ) => {
        if (revenueVnd === 0 && quantity === 0) return;
        const legacyLineKey = `${legacySourceId}:${businessLineCode}`;
        const line = {
          legacyLineKey,
          lineType: "legacy_summary",
          skuId: null,
          skuCode: null,
          businessLineCode,
          quantity,
          quantityUnit,
          quantitySource,
          unitPriceVnd: null,
          grossRevenueVnd: revenueVnd,
          discountVnd: 0,
          refundVnd: 0,
          netRevenueVnd: revenueVnd,
          costVnd: null,
          dataQuality: [
            "legacy_summary",
            ...(quantitySource === "estimated" ? ["estimated_quantity"] : []),
            "no_sku_fabrication",
          ],
        };
        lines.push(line);
        revenueEntries.push({
          entryKey: legacyLineKey,
          legacySourceId,
          organizationCode: DEFAULT_ORGANIZATION.code,
          locationCode: DEFAULT_LOCATION.code,
          businessDate: date,
          direction: "credit",
          entryType: "legacy_sale",
          ...line,
        });
      };

      addLine(
        "SNOW_MILK",
        snowMilkRevenueVnd,
        estimatedSnowMilkCups,
        "cup",
        "estimated",
      );
      addLine(
        "FRESH_MILK",
        freshMilkRevenueVnd,
        freshMilkBottleCount,
        "bottle",
        "legacy",
      );

      const legacyFinancialSnapshot = {
        totalVariableCost: Number(source.totalVariableCost ?? 0),
        allocatedFixedCost: Number(source.allocatedFixedCost ?? 0),
        contributionProfit: Number(source.contributionProfit ?? 0),
        estimatedProfit: Number(source.estimatedProfit ?? 0),
        estimatedProfitLow: Number(source.estimatedProfitLow ?? 0),
        estimatedProfitHigh: Number(source.estimatedProfitHigh ?? 0),
        estimatedMargin: Number(source.estimatedMargin ?? 0),
      };
      const common = {
        legacySourceId,
        organizationCode: DEFAULT_ORGANIZATION.code,
        locationCode: DEFAULT_LOCATION.code,
        businessDate: date,
        grossRevenueVnd,
        discountVnd,
        refundVnd: 0,
        netRevenueVnd,
        collectedVnd,
        paymentDifferenceVnd: collectedVnd - netRevenueVnd,
        payments: { cashVnd, bankTransferVnd, otherVnd: 0 },
        revenueSplitSource: isExplicitSplit
          ? "legacy_explicit_fields"
          : "legacy_unsplit_assigned_to_snow_milk",
        calculationVersion: "legacy-v1-snapshot",
        legacyFinancialSnapshot,
        legacyBatchSnapshot: {
          batchId: sourceId(source.batchId) || null,
          batchCode: text(source.batchCode) || null,
          batchName: text(source.batchName) || null,
        },
        note: text(source.note),
        dataQuality: {
          source: "legacy",
          hasActualSkuLines: false,
          estimatedSnowMilkQuantity: true,
          explicitRevenueSplit: isExplicitSplit,
          costSnapshotOnly: true,
        },
      };

      salesDays.push({
        ...common,
        status: "closed",
        version: 1,
        lines,
      });
      dailyRevenueFacts.push({
        factKey: `${DEFAULT_LOCATION.code}:${date}`,
        ...common,
        businessLines: [
          {
            code: "SNOW_MILK",
            netRevenueVnd: snowMilkRevenueVnd,
            quantity: estimatedSnowMilkCups,
            quantitySource: "estimated",
          },
          {
            code: "FRESH_MILK",
            netRevenueVnd: freshMilkRevenueVnd,
            quantity: freshMilkBottleCount,
            quantitySource: "legacy",
          },
        ],
      });
    } catch (error) {
      issues.push({
        severity: "error",
        code: "INVALID_LEGACY_SALE",
        legacySourceId,
        message: error instanceof Error ? error.message : "Sale nguồn không hợp lệ.",
      });
    }
  }

  salesDays.sort(
    (left, right) =>
      String(left.businessDate).localeCompare(String(right.businessDate)) ||
      String(left.legacySourceId).localeCompare(String(right.legacySourceId)),
  );
  revenueEntries.sort((left, right) =>
    String(left.entryKey).localeCompare(String(right.entryKey)),
  );
  dailyRevenueFacts.sort((left, right) =>
    String(left.factKey).localeCompare(String(right.factKey)),
  );

  const dates = salesDays.map(({ businessDate: date }) => String(date));
  for (const duplicateDate of new Set(
    dates.filter((date, index) => dates.indexOf(date) !== index),
  )) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_BUSINESS_DATE",
      businessDate: duplicateDate,
      message: `Có nhiều Sale nguồn cho ngày ${duplicateDate}.`,
    });
  }

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const summarize = (
    selectedSalesDays: readonly Record<string, unknown>[],
    selectedRevenueEntries: readonly Record<string, unknown>[],
  ) => ({
    saleCount: selectedSalesDays.length,
    grossRevenueVnd: sum(
      selectedSalesDays.map((sale) => Number(sale.grossRevenueVnd)),
    ),
    netRevenueVnd: sum(
      selectedSalesDays.map((sale) => Number(sale.netRevenueVnd)),
    ),
    snowMilkRevenueVnd: sum(
      selectedRevenueEntries
        .filter(({ businessLineCode }) => businessLineCode === "SNOW_MILK")
        .map(({ netRevenueVnd }) => Number(netRevenueVnd)),
    ),
    freshMilkRevenueVnd: sum(
      selectedRevenueEntries
        .filter(({ businessLineCode }) => businessLineCode === "FRESH_MILK")
        .map(({ netRevenueVnd }) => Number(netRevenueVnd)),
    ),
    cashVnd: sum(
      selectedSalesDays.map((sale) =>
        Number((sale.payments as { cashVnd: number }).cashVnd),
      ),
    ),
    bankTransferVnd: sum(
      selectedSalesDays.map((sale) =>
        Number((sale.payments as { bankTransferVnd: number }).bankTransferVnd),
      ),
    ),
    freshMilkBottleCount: sum(
      selectedRevenueEntries
        .filter(({ businessLineCode }) => businessLineCode === "FRESH_MILK")
        .map(({ quantity }) => Number(quantity)),
    ),
    estimatedSnowMilkCups: sum(
      selectedRevenueEntries
        .filter(({ businessLineCode }) => businessLineCode === "SNOW_MILK")
        .map(({ quantity }) => Number(quantity)),
    ),
  });
  const totals = summarize(salesDays, revenueEntries);
  const inFrozenBaseline = (record: Record<string, unknown>) => {
    const date = String(record.businessDate);
    return (
      date >= LEGACY_BASELINE.fromBusinessDate &&
      date <= LEGACY_BASELINE.toBusinessDate
    );
  };
  const baselineSalesDays = salesDays.filter(inFrozenBaseline);
  const baselineRevenueEntries = revenueEntries.filter(inFrozenBaseline);
  const baselineTotals = summarize(
    baselineSalesDays,
    baselineRevenueEntries,
  );

  if (expectedBaseline) {
    const expected = expectedBaseline.totals;
    const checks = [
      metricMismatch(
        baselineTotals.saleCount,
        expectedBaseline.saleCount,
        "Số ngày baseline",
      ),
      metricMismatch(
        baselineTotals.grossRevenueVnd,
        expected.grossRevenueVnd,
        "Doanh thu gộp baseline",
      ),
      metricMismatch(
        baselineTotals.netRevenueVnd,
        expected.netRevenueVnd,
        "Doanh thu thuần baseline",
      ),
      metricMismatch(
        baselineTotals.snowMilkRevenueVnd,
        expected.snowMilkRevenueVnd,
        "Doanh thu Sữa Tuyết",
      ),
      metricMismatch(
        baselineTotals.freshMilkRevenueVnd,
        expected.freshMilkRevenueVnd,
        "Doanh thu Sữa tươi",
      ),
      metricMismatch(baselineTotals.cashVnd, expected.cashVnd, "Tiền mặt"),
      metricMismatch(
        baselineTotals.bankTransferVnd,
        expected.bankTransferVnd,
        "Chuyển khoản",
      ),
      metricMismatch(
        baselineTotals.freshMilkBottleCount,
        expected.freshMilkBottleCount,
        "Số chai Sữa tươi",
      ),
      metricMismatch(
        baselineTotals.estimatedSnowMilkCups,
        expected.estimatedSnowMilkCups,
        "Số ly Sữa Tuyết ước tính",
      ),
    ].filter((issue): issue is MigrationIssue => issue !== null);
    issues.push(...checks);
  }

  issues.sort(
    (left, right) =>
      String(left.businessDate ?? "").localeCompare(
        String(right.businessDate ?? ""),
      ) || left.code.localeCompare(right.code),
  );
  return {
    salesDays,
    revenueEntries,
    dailyRevenueFacts,
    stockMovements: [] as never[],
    totals,
    baselineTotals,
    issues,
    canApply: !issues.some(({ severity }) => severity === "error"),
  };
}

export function buildMigrationPlan(input: {
  targetDigest: string;
  products: readonly Record<string, unknown>[];
  sales: readonly LegacySaleRecord[];
  recipes?: readonly LegacyRecipeRecord[];
  ingredients?: readonly LegacyIngredientRecord[];
  milkBatches?: readonly Record<string, unknown>[];
  purchases?: readonly Record<string, unknown>[];
  inventorySnapshots?: readonly Record<string, unknown>[];
  expenses?: readonly Record<string, unknown>[];
  equipment?: readonly Record<string, unknown>[];
  explicitCatalogMappings?: readonly ExplicitCatalogMapping[];
}) {
  const catalog = buildCatalogBackfillPlan(
    input.products,
    input.explicitCatalogMappings,
  );
  const recipeBackfill = buildLegacyRecipeBackfillPlan({
    products: input.products as readonly LegacyRecipeProductRecord[],
    recipes: input.recipes ?? [],
    ingredients: input.ingredients ?? [],
    catalogSkus: catalog.skus as ResolvedCatalogSkuForRecipe[],
  });
  const sales = buildLegacySalesBackfillPlan(input.sales, LEGACY_BASELINE);
  const sourceDocuments: LegacySourceDocuments = {
    products: input.products,
    recipes: (input.recipes ?? []) as readonly Record<string, unknown>[],
    ingredients: (input.ingredients ?? []) as readonly Record<string, unknown>[],
    sales: input.sales,
    milkBatches: input.milkBatches ?? [],
    purchases: input.purchases ?? [],
    inventorySnapshots: input.inventorySnapshots ?? [],
    expenses: input.expenses ?? [],
    equipment: input.equipment ?? [],
  };
  const sourceManifest = buildLegacySourceManifest(sourceDocuments);
  const sourceValidation = validateLegacySourceManifest(sourceManifest);
  const body = {
    migrationVersion: MIGRATION_VERSION,
    targetDigest: input.targetDigest,
    defaults: {
      organization: DEFAULT_ORGANIZATION,
      location: DEFAULT_LOCATION,
    },
    seeds: {
      businessLines: BUSINESS_LINE_SEEDS,
      categories: CATEGORY_SEEDS,
      healthyBreakfast: {
        product: HEALTHY_BREAKFAST_PRODUCT,
        sku: HEALTHY_BREAKFAST_SKU,
        recipe: HEALTHY_BREAKFAST_RECIPE,
        inventoryItems: HEALTHY_BREAKFAST_INVENTORY_ITEMS,
        recipeVersion: HEALTHY_BREAKFAST_RECIPE_VERSION,
      },
    },
    catalog,
    recipeBackfill,
    sales,
    sourceManifest,
    sourceValidation,
    sourceCounts: sourceCountsFromManifest(sourceManifest),
    invariants: {
      noSkuFabrication: true,
      noRetroactiveStockMovements: true,
      localDatabaseIsNotProductionBaseline: true,
    },
    canApply:
      catalog.canApply &&
      recipeBackfill.canApply &&
      sales.canApply &&
      sourceValidation.canApply,
  };
  return { ...body, checksum: sha256Canonical(body) };
}
