export const MIGRATION_VERSION = "bep-nha-ne-v2.2026-08-12.1";

export const DEFAULT_ORGANIZATION = {
  code: "BEP_NHA_NE",
  name: "Bếp Nhà Nè",
  tagline: "làm ở nhà, ngon thiệt nè.",
  timeZone: "Asia/Ho_Chi_Minh",
  currency: "VND",
} as const;

export const DEFAULT_LOCATION = {
  code: "MAIN",
  name: "Bếp chính",
  timeZone: DEFAULT_ORGANIZATION.timeZone,
} as const;

export const BUSINESS_LINE_CODES = [
  "MILK",
  "SNOW_MILK",
  "FRESH_MILK",
  "BREAKFAST",
] as const;

export type BusinessLineCode = (typeof BUSINESS_LINE_CODES)[number];
export type PostingBusinessLineCode = Exclude<BusinessLineCode, "MILK">;

export type BusinessLineSeed = {
  code: BusinessLineCode;
  name: string;
  parentCode: BusinessLineCode | null;
  pathCodes: BusinessLineCode[];
  isPosting: boolean;
  sortOrder: number;
  isActive: boolean;
};

export const BUSINESS_LINE_SEEDS: readonly BusinessLineSeed[] = [
  {
    code: "MILK",
    name: "Sữa",
    parentCode: null,
    pathCodes: [],
    isPosting: false,
    sortOrder: 10,
    isActive: true,
  },
  {
    code: "SNOW_MILK",
    name: "Sữa Tuyết",
    parentCode: "MILK",
    pathCodes: ["MILK"],
    isPosting: true,
    sortOrder: 11,
    isActive: true,
  },
  {
    code: "FRESH_MILK",
    name: "Sữa tươi",
    parentCode: "MILK",
    pathCodes: ["MILK"],
    isPosting: true,
    sortOrder: 12,
    isActive: true,
  },
  {
    code: "BREAKFAST",
    name: "Đồ ăn sáng",
    parentCode: null,
    pathCodes: [],
    isPosting: true,
    sortOrder: 20,
    isActive: true,
  },
] as const;

export const CATEGORY_SEEDS = [
  {
    code: "SNOW_MILK",
    name: "Sữa Tuyết",
    sortOrder: 10,
    isActive: true,
  },
  {
    code: "FRESH_MILK",
    name: "Sữa tươi",
    sortOrder: 20,
    isActive: true,
  },
  {
    code: "BREAKFAST_HEALTHY",
    name: "Đồ ăn sáng / Healthy",
    sortOrder: 30,
    isActive: true,
  },
] as const;

export const V2_COLLECTIONS = {
  organizations: "v2_organizations",
  locations: "v2_locations",
  memberships: "v2_memberships",
  businessLines: "v2_business_lines",
  categories: "v2_categories",
  catalogProducts: "v2_catalog_products",
  skus: "v2_skus",
  skuPrices: "v2_sku_prices",
  purchaseReceipts: "v2_purchase_receipts",
  recipes: "v2_recipes",
  inventoryItems: "v2_inventory_items",
  inventoryLots: "v2_inventory_lots",
  recipeVersions: "v2_recipe_versions",
  productionBatches: "v2_production_batches",
  stockMovements: "v2_stock_movements",
  inventoryBalances: "v2_inventory_balances",
  stockCounts: "v2_stock_counts",
  salesDays: "v2_sales_days",
  revenueEntries: "v2_revenue_entries",
  dailyRevenueFacts: "v2_daily_revenue_facts",
  auditLogs: "v2_audit_logs",
  migrationRuns: "v2_migration_runs",
} as const;

export const LEGACY_BASELINE = {
  fromBusinessDate: "2026-07-22",
  toBusinessDate: "2026-08-11",
  saleCount: 20,
  totals: {
    grossRevenueVnd: 110_501_000,
    netRevenueVnd: 110_501_000,
    snowMilkRevenueVnd: 108_501_000,
    freshMilkRevenueVnd: 2_000_000,
    cashVnd: 70_030_000,
    bankTransferVnd: 40_471_000,
    freshMilkBottleCount: 100,
    estimatedSnowMilkCups: 2_893,
  },
} as const;

export const LEGACY_SOURCE_COUNT_BASELINE = {
  products: 12,
  recipes: 2,
  ingredients: 19,
  sales: 20,
  milkBatches: 3,
  purchases: 144,
  inventorySnapshots: 4,
  expenses: 19,
  equipment: 21,
} as const;
