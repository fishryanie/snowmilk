import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import {
  MongoClient,
  Decimal128,
  ObjectId,
  type ClientSession,
  type Db,
  type Document,
} from "mongodb";
import { getMongoConfig } from "@/lib/mongodb-config";
import {
  DEFAULT_LOCATION,
  DEFAULT_ORGANIZATION,
  LEGACY_BASELINE,
  MIGRATION_VERSION,
  V2_COLLECTIONS,
} from "@/lib/v2/constants";
import {
  validateExplicitCatalogMappings,
  type ExplicitCatalogMapping,
} from "@/lib/v2/catalog-mapping";
import {
  assertApplyTargetGuard,
  assertMatchingDryRunChecksum,
  buildSuggestedApplyCommand,
  buildMongoTargetFingerprint,
  parseMigrationCliArgs,
  sanitizeMigrationError,
} from "@/lib/v2/migration-guard";
import { buildMigrationPlan } from "@/lib/v2/migration-plan";
import {
  materializeLegacyPostings,
  materializeLegacySalesDay,
} from "@/lib/v2/migration-materializer";
import { sha256Canonical } from "@/lib/v2/canonical";
import { assertUpsertedDocumentMatches } from "@/lib/v2/migration-integrity";
import {
  assertReconciliationMatches,
  buildAppliedMigrationReconciliation,
  summarizeAppliedDailyFacts,
  summarizeAppliedRevenueEntries,
  summarizeAppliedSalesDays,
} from "@/lib/v2/migration-reconciliation";
import {
  materializeLegacyRecipe,
  materializeLegacyRecipeVersion,
} from "@/lib/v2/recipe-materializer";

loadEnvConfig(process.cwd());

const options = parseMigrationCliArgs(process.argv.slice(2));
const { uri, dbName } = getMongoConfig();
const fingerprint = buildMongoTargetFingerprint(uri, dbName);
assertApplyTargetGuard(options, fingerprint);

console.log(
  JSON.stringify(
    {
      migrationVersion: MIGRATION_VERSION,
      mode: options.mode,
      connectionSource: fingerprint.connectionSource,
      scheme: fingerprint.scheme,
      dbName: fingerprint.dbName,
      targetDigest: fingerprint.targetDigest,
    },
    null,
    2,
  ),
);

async function loadMappings(): Promise<ExplicitCatalogMapping[]> {
  const fromFile = options.catalogMapPath
    ? JSON.parse(
        await readFile(path.resolve(options.catalogMapPath), "utf8"),
      )
    : [];
  const fileMappings = validateExplicitCatalogMappings(fromFile);
  const inlineMappings = validateExplicitCatalogMappings(
    options.inlineCatalogMappings,
  );
  return validateExplicitCatalogMappings([...fileMappings, ...inlineMappings]);
}

const actor = {
  userId: "migration:bep-nha-ne-v2",
  displayName: "Bếp Nhà Nè v2 migration",
  source: "migration" as const,
};

const legacySource = (collection: string, sourceId: string) => ({
  sourceCollection: collection,
  sourceId,
  migrationVersion: MIGRATION_VERSION,
});

function startedDate() {
  return new Date();
}

function priceEffectiveDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000+07:00`);
}

function requireResolvedId(
  values: ReadonlyMap<string, ObjectId>,
  code: string,
  label: string,
) {
  const value = values.get(code);
  if (!value) throw new Error(`Không thể resolve ${label} cho mã ${code}.`);
  return value;
}

async function buildSourcePlan(db: Db) {
  const [
    products,
    recipes,
    ingredients,
    sales,
    milkBatches,
    purchases,
    inventorySnapshots,
    expenses,
    equipment,
  ] = await Promise.all([
    db.collection("products").find({}).sort({ code: 1, _id: 1 }).toArray(),
    db.collection("recipes").find({}).sort({ code: 1, _id: 1 }).toArray(),
    db.collection("ingredients").find({}).sort({ code: 1, _id: 1 }).toArray(),
    db.collection("sales").find({}).sort({ saleDate: 1, _id: 1 }).toArray(),
    db.collection("milkbatches").find({}).sort({ code: 1, _id: 1 }).toArray(),
    db.collection("purchases").find({}).sort({ purchaseDate: 1, _id: 1 }).toArray(),
    db.collection("inventorysnapshots").find({}).sort({ snapshotDate: 1, _id: 1 }).toArray(),
    db.collection("expenses").find({}).sort({ expenseDate: 1, _id: 1 }).toArray(),
    db.collection("equipment").find({}).sort({ purchaseDate: 1, _id: 1 }).toArray(),
  ]);
  return buildMigrationPlan({
    targetDigest: fingerprint.targetDigest,
    products,
    recipes,
    ingredients,
    sales,
    milkBatches,
    purchases,
    inventorySnapshots,
    expenses,
    equipment,
    explicitCatalogMappings: await loadMappings(),
  });
}

function publicReport(plan: Awaited<ReturnType<typeof buildSourcePlan>>) {
  return {
    mode: options.mode,
    migrationVersion: plan.migrationVersion,
    checksum: plan.checksum,
    targetDigest: plan.targetDigest,
    sourceCounts: plan.sourceCounts,
    catalog: {
      catalogProducts: plan.catalog.catalogProducts.length,
      skus: plan.catalog.skus.length,
      prices: plan.catalog.skuPrices.length,
      canApply: plan.catalog.canApply,
      issues: plan.catalog.issues,
      unresolvedMappingTemplate: plan.catalog.mappingTemplate,
    },
    recipes: {
      aggregates: plan.recipeBackfill.recipes.length,
      versions: plan.recipeBackfill.recipeVersions.length,
      inventoryItems: plan.recipeBackfill.inventoryItems.length,
      mappedIngredients: plan.recipeBackfill.mappedIngredientCount,
      sourceIngredients: plan.recipeBackfill.sourceIngredientCount,
      canApply: plan.recipeBackfill.canApply,
      issues: plan.recipeBackfill.issues,
    },
    sourceManifest: plan.sourceManifest,
    inventoryOpening: {
      legacySnapshotsReplayed: false,
      instruction:
        "Các inventory snapshot cũ chỉ được giữ làm tham chiếu. Sau cutover, người vận hành phải kiểm kho vật lý để tạo opening stock count/lots/movements/balances mới.",
    },
    sourceValidation: plan.sourceValidation,
    sales: {
      ...plan.sales.totals,
      frozenBaseline: plan.sales.baselineTotals,
      canApply: plan.sales.canApply,
      issues: plan.sales.issues,
      noRetroactiveStockMovements:
        plan.sales.stockMovements.length === 0,
    },
    canApply: plan.canApply,
    nextStep: plan.canApply
      ? buildSuggestedApplyCommand(options, plan.checksum)
      : "Giải quyết mọi exception và hoàn tất catalog map, sau đó dry-run lại.",
  };
}

async function currentV2Counts(db: Db, session?: ClientSession) {
  return Object.values(V2_COLLECTIONS).reduce<Promise<Record<string, number>>>(
    async (promise, collection) => {
      const result = await promise;
      result[collection] = await db
        .collection(collection)
        .countDocuments({}, { session });
      return result;
    },
    Promise.resolve({}),
  );
}

async function ensureIndexes(db: Db) {
  await db
    .collection(V2_COLLECTIONS.organizations)
    .createIndex({ code: 1 }, { unique: true, name: "uq_org_code" });
  await db.collection(V2_COLLECTIONS.locations).createIndex(
    { organizationId: 1, code: 1 },
    { unique: true, name: "uq_location_org_code" },
  );
  for (const [collection, field, name] of [
    [V2_COLLECTIONS.businessLines, "code", "uq_business_line_org_code"],
    [V2_COLLECTIONS.categories, "code", "uq_category_org_code"],
    [V2_COLLECTIONS.catalogProducts, "code", "uq_catalog_product_org_code"],
    [V2_COLLECTIONS.skus, "code", "uq_sku_org_code"],
    [V2_COLLECTIONS.inventoryItems, "code", "uq_inventory_item_org_code"],
  ] as const) {
    await db
      .collection(collection)
      .createIndex(
        { organizationId: 1, [field]: 1 },
        { unique: true, name },
      );
  }
  await db.collection(V2_COLLECTIONS.skuPrices).createIndex(
    { organizationId: 1, locationId: 1, skuId: 1, effectiveFrom: 1 },
    { unique: true, name: "uq_sku_price_effective_start" },
  );
  await db.collection(V2_COLLECTIONS.recipes).createIndex(
    { organizationId: 1, code: 1 },
    { unique: true, name: "uq_recipe_org_code" },
  );
  await db.collection(V2_COLLECTIONS.recipeVersions).createIndex(
    { organizationId: 1, recipeCode: 1, versionNumber: 1 },
    { unique: true, name: "uq_recipe_version" },
  );
  await db.collection(V2_COLLECTIONS.recipeVersions).createIndex(
    { organizationId: 1, releaseIdempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { releaseIdempotencyKey: { $type: "string" } },
      name: "uq_recipe_release_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.salesDays).createIndex(
    { organizationId: 1, locationId: 1, businessDate: 1 },
    { unique: true, name: "uq_sales_day_business_date" },
  );
  await db.collection(V2_COLLECTIONS.revenueEntries).createIndex(
    { organizationId: 1, idempotencyKey: 1 },
    { unique: true, name: "uq_revenue_entry_idempotency" },
  );
  await db.collection(V2_COLLECTIONS.dailyRevenueFacts).createIndex(
    { organizationId: 1, locationId: 1, businessDate: 1 },
    { unique: true, name: "uq_daily_revenue_fact_date" },
  );
  await db.collection(V2_COLLECTIONS.migrationRuns).createIndex(
    { migrationVersion: 1, runId: 1 },
    { unique: true, name: "uq_migration_version_run" },
  );
  await db.collection(V2_COLLECTIONS.locations).createIndex(
    { organizationId: 1, isActive: 1, name: 1 },
    { name: "ix_location_active_name" },
  );
  await db.collection(V2_COLLECTIONS.locations).createIndex(
    { organizationId: 1, isDefault: 1 },
    {
      unique: true,
      partialFilterExpression: { isDefault: true },
      name: "uq_location_default_per_org",
    },
  );
  await db.collection(V2_COLLECTIONS.memberships).createIndex(
    { organizationId: 1, userId: 1 },
    { unique: true, name: "uq_membership_org_user" },
  );
  await db.collection(V2_COLLECTIONS.memberships).createIndex(
    { userId: 1, status: 1, isActive: 1 },
    { name: "ix_membership_user_status" },
  );
  await db.collection(V2_COLLECTIONS.businessLines).createIndex(
    { organizationId: 1, parentId: 1, sortOrder: 1 },
    { name: "ix_business_line_tree" },
  );
  await db.collection(V2_COLLECTIONS.categories).createIndex(
    { organizationId: 1, parentId: 1, sortOrder: 1 },
    { name: "ix_category_tree" },
  );
  await db.collection(V2_COLLECTIONS.catalogProducts).createIndex(
    { organizationId: 1, defaultCategoryId: 1, isActive: 1, sortOrder: 1 },
    { name: "ix_catalog_product_category" },
  );
  await db.collection(V2_COLLECTIONS.skus).createIndex(
    { organizationId: 1, businessLineId: 1, isActive: 1, sortOrder: 1 },
    { name: "ix_sku_business_line" },
  );
  await db.collection(V2_COLLECTIONS.skus).createIndex(
    { organizationId: 1, catalogProductId: 1, isActive: 1 },
    { name: "ix_sku_catalog_product" },
  );
  await db.collection(V2_COLLECTIONS.skuPrices).createIndex(
    { organizationId: 1, locationId: 1, skuId: 1, isActive: 1, effectiveTo: 1 },
    { name: "ix_sku_price_current" },
  );
  await db.collection(V2_COLLECTIONS.inventoryItems).createIndex(
    { organizationId: 1, itemType: 1, isActive: 1, name: 1 },
    { name: "ix_inventory_item_type" },
  );
  await db.collection(V2_COLLECTIONS.inventoryLots).createIndex(
    { organizationId: 1, locationId: 1, inventoryItemId: 1, lotCode: 1 },
    { unique: true, name: "uq_inventory_lot_code" },
  );
  await db.collection(V2_COLLECTIONS.inventoryLots).createIndex(
    {
      organizationId: 1,
      locationId: 1,
      inventoryItemId: 1,
      status: 1,
      expiresAt: 1,
    },
    { name: "ix_inventory_lot_fefo" },
  );
  await db.collection(V2_COLLECTIONS.recipes).createIndex(
    { organizationId: 1, skuId: 1, isActive: 1 },
    { name: "ix_recipe_sku_active" },
  );
  await db.collection(V2_COLLECTIONS.recipeVersions).createIndex(
    { organizationId: 1, skuId: 1, status: 1, isActive: 1 },
    { name: "ix_recipe_version_sku_status" },
  );
  await db.collection(V2_COLLECTIONS.recipeVersions).createIndex(
    { organizationId: 1, contentHash: 1 },
    { unique: true, name: "uq_recipe_content_hash" },
  );
  await db.collection(V2_COLLECTIONS.recipeVersions).createIndex(
    { organizationId: 1, configurationIdempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: {
        configurationIdempotencyKey: { $type: "string" },
      },
      name: "uq_recipe_configuration_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.productionBatches).createIndex(
    { organizationId: 1, locationId: 1, batchCode: 1 },
    { unique: true, name: "uq_production_batch_code" },
  );
  await db.collection(V2_COLLECTIONS.purchaseReceipts).createIndex(
    { organizationId: 1, locationId: 1, receiptCode: 1 },
    { unique: true, name: "uq_purchase_receipt_code" },
  );
  await db.collection(V2_COLLECTIONS.purchaseReceipts).createIndex(
    { organizationId: 1, locationId: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      name: "uq_purchase_receipt_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.purchaseReceipts).createIndex(
    { organizationId: 1, locationId: 1, businessDate: -1, receivedAt: -1 },
    { name: "ix_purchase_receipt_history" },
  );
  await db.collection(V2_COLLECTIONS.productionBatches).createIndex(
    { organizationId: 1, locationId: 1, completionIdempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { completionIdempotencyKey: { $type: "string" } },
      name: "uq_production_batch_completion_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.productionBatches).createIndex(
    { organizationId: 1, locationId: 1, businessDate: -1, status: 1 },
    { name: "ix_production_batch_date_status" },
  );
  await db.collection(V2_COLLECTIONS.productionBatches).createIndex(
    { organizationId: 1, locationId: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      name: "uq_production_batch_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.stockMovements).createIndex(
    { organizationId: 1, idempotencyKey: 1 },
    { unique: true, name: "uq_stock_movement_idempotency" },
  );
  await db.collection(V2_COLLECTIONS.stockMovements).createIndex(
    {
      organizationId: 1,
      locationId: 1,
      inventoryItemId: 1,
      inventoryLotId: 1,
      occurredAt: 1,
    },
    { name: "ix_stock_movement_ledger" },
  );
  await db.collection(V2_COLLECTIONS.stockMovements).createIndex(
    { organizationId: 1, sourceType: 1, sourceId: 1, sourceLineKey: 1 },
    { unique: true, name: "uq_stock_movement_source_line" },
  );
  await db.collection(V2_COLLECTIONS.stockMovements).createIndex(
    { organizationId: 1, reversalOfId: 1 },
    {
      unique: true,
      partialFilterExpression: { reversalOfId: { $type: "objectId" } },
      name: "uq_stock_movement_reversal",
    },
  );
  await db.collection(V2_COLLECTIONS.inventoryBalances).createIndex(
    { organizationId: 1, locationId: 1, inventoryItemId: 1, inventoryLotId: 1 },
    { unique: true, name: "uq_inventory_balance_dimension" },
  );
  await db.collection(V2_COLLECTIONS.inventoryBalances).createIndex(
    { organizationId: 1, locationId: 1, availableQuantity: 1 },
    { name: "ix_inventory_balance_available" },
  );
  await db.collection(V2_COLLECTIONS.stockCounts).createIndex(
    { organizationId: 1, locationId: 1, countCode: 1 },
    { unique: true, name: "uq_stock_count_code" },
  );
  await db.collection(V2_COLLECTIONS.stockCounts).createIndex(
    { organizationId: 1, locationId: 1, businessDate: -1, status: 1 },
    { name: "ix_stock_count_date_status" },
  );
  await db.collection(V2_COLLECTIONS.stockCounts).createIndex(
    { organizationId: 1, locationId: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      name: "uq_stock_count_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.stockCounts).createIndex(
    { organizationId: 1, locationId: 1, countType: 1 },
    {
      unique: true,
      partialFilterExpression: { countType: "opening" },
      name: "uq_stock_count_one_opening_per_location",
    },
  );
  await db.collection(V2_COLLECTIONS.salesDays).createIndex(
    { organizationId: 1, locationId: 1, status: 1, businessDate: -1 },
    { name: "ix_sales_day_status_date" },
  );
  await db.collection(V2_COLLECTIONS.salesDays).createIndex(
    { organizationId: 1, locationId: 1, idempotencyKey: 1 },
    {
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      name: "uq_sales_day_idempotency",
    },
  );
  await db.collection(V2_COLLECTIONS.revenueEntries).createIndex(
    { organizationId: 1, salesDayId: 1, lineKey: 1, entryType: 1 },
    { unique: true, name: "uq_revenue_entry_sales_line" },
  );
  await db.collection(V2_COLLECTIONS.revenueEntries).createIndex(
    { organizationId: 1, locationId: 1, businessDate: 1, businessLineId: 1 },
    { name: "ix_revenue_entry_reporting" },
  );
  await db.collection(V2_COLLECTIONS.revenueEntries).createIndex(
    { organizationId: 1, reversalOfId: 1 },
    {
      unique: true,
      partialFilterExpression: { reversalOfId: { $type: "objectId" } },
      name: "uq_revenue_entry_reversal",
    },
  );
  await db.collection(V2_COLLECTIONS.dailyRevenueFacts).createIndex(
    { organizationId: 1, businessDate: 1, "dimensions.dimensionCode": 1 },
    { name: "ix_daily_revenue_fact_dimension" },
  );
  await db.collection(V2_COLLECTIONS.auditLogs).createIndex(
    { organizationId: 1, resourceType: 1, resourceId: 1, occurredAt: -1 },
    { name: "ix_audit_resource_timeline" },
  );
  await db.collection(V2_COLLECTIONS.auditLogs).createIndex(
    { organizationId: 1, "actor.userId": 1, occurredAt: -1 },
    { name: "ix_audit_actor_timeline" },
  );
  await db.collection(V2_COLLECTIONS.auditLogs).createIndex(
    { organizationId: 1, requestId: 1, action: 1, resourceType: 1, resourceId: 1 },
    { unique: true, name: "uq_audit_request_action_resource" },
  );
  await db.collection(V2_COLLECTIONS.migrationRuns).createIndex(
    { connectionFingerprint: 1, mode: 1, startedAt: -1 },
    { name: "ix_migration_target_history" },
  );
  await db.collection(V2_COLLECTIONS.migrationRuns).createIndex(
    { migrationVersion: 1, inputChecksum: 1, mappingChecksum: 1, mode: 1 },
    { name: "ix_migration_replay" },
  );
  for (const [collection, name] of [
    [V2_COLLECTIONS.catalogProducts, "uq_catalog_product_legacy_source"],
    [V2_COLLECTIONS.skus, "uq_sku_legacy_source"],
    [V2_COLLECTIONS.recipes, "uq_recipe_legacy_source"],
    [V2_COLLECTIONS.recipeVersions, "uq_recipe_version_legacy_source"],
    [V2_COLLECTIONS.inventoryItems, "uq_inventory_item_legacy_source"],
    [V2_COLLECTIONS.salesDays, "uq_sales_day_legacy_source"],
  ] as const) {
    await db.collection(collection).createIndex(
      {
        organizationId: 1,
        "legacySource.sourceCollection": 1,
        "legacySource.sourceId": 1,
      },
      {
        unique: true,
        partialFilterExpression: {
          "legacySource.sourceCollection": { $type: "string" },
          "legacySource.sourceId": { $type: "string" },
        },
        name,
      },
    );
  }
}

let activeMigrationSession: ClientSession | undefined;

async function upsertOne(
  db: Db,
  collection: string,
  filter: Document,
  body: Document,
  now: Date,
) {
  await db.collection(collection).updateOne(
    filter,
    {
      $setOnInsert: { ...body, createdAt: now, updatedAt: now },
    },
    { upsert: true, session: activeMigrationSession },
  );
  const result = await db
    .collection(collection)
    .findOne(filter, { session: activeMigrationSession });
  if (!result) throw new Error(`Không thể read-back ${collection}.`);
  assertUpsertedDocumentMatches(
    result as Record<string, unknown>,
    body as Record<string, unknown>,
    collection,
  );
  return result;
}

async function readAppliedMigrationSnapshot(db: Db, session?: ClientSession) {
  const organization = await db.collection(V2_COLLECTIONS.organizations).findOne({
    code: DEFAULT_ORGANIZATION.code,
  }, { session });
  if (!organization) throw new Error("Không tìm thấy organization v2 để đối soát.");
  const location = await db.collection(V2_COLLECTIONS.locations).findOne({
    organizationId: organization._id,
    code: DEFAULT_LOCATION.code,
  }, { session });
  if (!location) throw new Error("Không tìm thấy location v2 để đối soát.");
  const legacyFilter = {
    organizationId: organization._id,
    locationId: location._id,
    "legacySource.sourceCollection": "sales",
    "legacySource.migrationVersion": MIGRATION_VERSION,
  };
  const [salesDays, revenueEntries] = await Promise.all([
    db
      .collection(V2_COLLECTIONS.salesDays)
      .find(legacyFilter, { session })
      .toArray(),
    db
      .collection(V2_COLLECTIONS.revenueEntries)
      .find(legacyFilter, { session })
      .toArray(),
  ]);
  const migratedSalesDayIds = salesDays.map(({ _id }) => _id);
  const [dailyFacts, retroactiveStockMovementCount] = await Promise.all([
    db
      .collection(V2_COLLECTIONS.dailyRevenueFacts)
      .find({
        organizationId: organization._id,
        locationId: location._id,
        salesDayId: { $in: migratedSalesDayIds },
      }, { session })
      .toArray(),
    db.collection(V2_COLLECTIONS.stockMovements).countDocuments({
      organizationId: organization._id,
      locationId: location._id,
      sourceType: "sales_day",
      sourceId: { $in: migratedSalesDayIds },
    }, { session }),
  ]);
  const isFrozenBaseline = (document: Document) => {
    const date = String(document.businessDate ?? "");
    return (
      date >= LEGACY_BASELINE.fromBusinessDate &&
      date <= LEGACY_BASELINE.toBusinessDate
    );
  };
  const summarizeLayer = (
    layerSalesDays: typeof salesDays,
    layerRevenueEntries: typeof revenueEntries,
    layerFacts: typeof dailyFacts,
  ) => ({
    salesDays: summarizeAppliedSalesDays(
      layerSalesDays as unknown as Parameters<typeof summarizeAppliedSalesDays>[0],
    ),
    revenueEntries: summarizeAppliedRevenueEntries(
      layerRevenueEntries as unknown as Parameters<
        typeof summarizeAppliedRevenueEntries
      >[0],
    ),
    dailyFacts: summarizeAppliedDailyFacts(
      layerFacts as unknown as Parameters<typeof summarizeAppliedDailyFacts>[0],
    ),
  });
  return {
    frozenBaseline: summarizeLayer(
      salesDays.filter(isFrozenBaseline),
      revenueEntries.filter(isFrozenBaseline),
      dailyFacts.filter(isFrozenBaseline),
    ),
    overall: summarizeLayer(salesDays, revenueEntries, dailyFacts),
    retroactiveStockMovementCount,
  };
}

function expectedAppliedMigration(
  plan: Awaited<ReturnType<typeof buildSourcePlan>>,
) {
  return {
    ...plan.sales.totals,
    entryCount: plan.sales.revenueEntries.length,
    factCount: plan.sales.dailyRevenueFacts.length,
  };
}

function plannedTargetCounts(
  plan: Awaited<ReturnType<typeof buildSourcePlan>>,
) {
  const inventoryCodes = new Set([
    ...plan.recipeBackfill.inventoryItems.map(({ code }) => code),
    ...plan.recipeBackfill.outputInventoryItems.map(({ code }) => String(code)),
    ...plan.seeds.healthyBreakfast.inventoryItems.map(({ code }) => code),
  ]);
  return {
    [V2_COLLECTIONS.organizations]: 1,
    [V2_COLLECTIONS.locations]: 1,
    [V2_COLLECTIONS.businessLines]: plan.seeds.businessLines.length,
    [V2_COLLECTIONS.categories]: plan.seeds.categories.length,
    [V2_COLLECTIONS.catalogProducts]: plan.catalog.catalogProducts.length + 1,
    [V2_COLLECTIONS.skus]: plan.catalog.skus.length + 1,
    [V2_COLLECTIONS.skuPrices]: plan.catalog.skuPrices.length + 1,
    [V2_COLLECTIONS.inventoryItems]: inventoryCodes.size,
    [V2_COLLECTIONS.recipes]: plan.recipeBackfill.recipes.length + 1,
    [V2_COLLECTIONS.recipeVersions]:
      plan.recipeBackfill.recipeVersions.length + 1,
    [V2_COLLECTIONS.salesDays]: plan.sales.salesDays.length,
    [V2_COLLECTIONS.revenueEntries]: plan.sales.revenueEntries.length,
    [V2_COLLECTIONS.dailyRevenueFacts]: plan.sales.dailyRevenueFacts.length,
    [V2_COLLECTIONS.migrationRuns]: 1,
  } as Record<string, number>;
}

function migrationRunCounts(
  plan: Awaited<ReturnType<typeof buildSourcePlan>>,
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
) {
  const plannedCounts = plannedTargetCounts(plan);
  return Object.entries(after).map(([collectionName, afterCount]) => {
    const beforeCount = before[collectionName] ?? 0;
    const inserted = Math.max(0, afterCount - beforeCount);
    const planned = plannedCounts[collectionName] ?? 0;
    return {
      collectionName,
      before: beforeCount,
      read:
        collectionName === V2_COLLECTIONS.catalogProducts
          ? plan.sourceCounts.products
          : collectionName === V2_COLLECTIONS.recipeVersions
            ? plan.sourceCounts.recipes
            : collectionName === V2_COLLECTIONS.inventoryItems
              ? plan.sourceCounts.ingredients
              : collectionName === V2_COLLECTIONS.salesDays
                ? plan.sourceCounts.sales
                : 0,
      inserted,
      updated: 0,
      skipped: Math.max(0, planned - inserted),
      exceptions: 0,
      after: afterCount,
    };
  });
}

async function applyPlan(
  client: MongoClient,
  db: Db,
  plan: Awaited<ReturnType<typeof buildSourcePlan>>,
  dryRunId: unknown,
) {
  if (!plan.canApply) {
    throw new Error("Migration plan còn exception; từ chối --apply.");
  }
  const before = await currentV2Counts(db);
  const runId = `apply-${plan.checksum.slice(0, 20)}`;
  await ensureIndexes(db);
  const alreadySucceeded = await db.collection(V2_COLLECTIONS.migrationRuns).findOne({
    migrationVersion: MIGRATION_VERSION,
    runId,
    mode: "apply",
    status: "succeeded",
  });
  if (alreadySucceeded) {
    assertUpsertedDocumentMatches(
      alreadySucceeded as Record<string, unknown>,
      {
        inputChecksum: plan.checksum,
        mappingChecksum: sha256Canonical({
          catalog: plan.catalog,
          recipeBackfill: plan.recipeBackfill,
        }),
        sourceManifest: plan.sourceManifest,
      },
      "migration run replay",
    );
    const reconciliation = buildAppliedMigrationReconciliation(
      await readAppliedMigrationSnapshot(db),
      expectedAppliedMigration(plan),
    );
    assertReconciliationMatches(reconciliation);
    return {
      replayed: true,
      runId,
      before,
      after: before,
      reconciliation,
    };
  }

  const session = client.startSession();
  let after: Record<string, number> = before;
  let reconciliation: ReturnType<typeof buildAppliedMigrationReconciliation> = [];
  try {
    // Index DDL is performed before the data transaction. The transaction
    // itself contains every operational v2 insert/upsert and the apply receipt.
    activeMigrationSession = session;
    await session.withTransaction(async () => {
      const now = startedDate();
      const organization = await upsertOne(
        db,
        V2_COLLECTIONS.organizations,
        { code: DEFAULT_ORGANIZATION.code },
        {
          code: DEFAULT_ORGANIZATION.code,
          profile: {
            displayName: DEFAULT_ORGANIZATION.name,
            tagline: DEFAULT_ORGANIZATION.tagline,
            wordmark: DEFAULT_ORGANIZATION.name,
            timezone: DEFAULT_ORGANIZATION.timeZone,
            currency: DEFAULT_ORGANIZATION.currency,
            locale: "vi-VN",
          },
          isActive: true,
          version: 1,
          actor,
        },
        now,
      );
      const organizationId = organization._id;
      const location = await upsertOne(
        db,
        V2_COLLECTIONS.locations,
        { organizationId, code: DEFAULT_LOCATION.code },
        {
          organizationId,
          code: DEFAULT_LOCATION.code,
          name: DEFAULT_LOCATION.name,
          timezone: DEFAULT_LOCATION.timeZone,
          isDefault: true,
          isActive: true,
          version: 1,
          actor,
        },
        now,
      );
      const locationId = location._id;

      const businessLineIds = new Map<string, ObjectId>();
      for (const seed of plan.seeds.businessLines) {
        const parentId = seed.parentCode
          ? businessLineIds.get(seed.parentCode)
          : null;
        const line = await upsertOne(
          db,
          V2_COLLECTIONS.businessLines,
          { organizationId, code: seed.code },
          {
            organizationId,
            code: seed.code,
            name: seed.name,
            parentId,
            pathCodes: seed.pathCodes,
            depth: seed.pathCodes.length,
            isPosting: seed.isPosting,
            sortOrder: seed.sortOrder,
            isActive: seed.isActive,
            version: 1,
            actor,
          },
          now,
        );
        businessLineIds.set(seed.code, line._id as ObjectId);
      }

      const categoryIds = new Map<string, ObjectId>();
      for (const seed of plan.seeds.categories) {
        const category = await upsertOne(
          db,
          V2_COLLECTIONS.categories,
          { organizationId, code: seed.code },
          {
            organizationId,
            code: seed.code,
            name: seed.name,
            parentId: null,
            pathCodes: [],
            depth: 0,
            sortOrder: seed.sortOrder,
            isActive: seed.isActive,
            version: 1,
            actor,
          },
          now,
        );
        categoryIds.set(seed.code, category._id as ObjectId);
      }

      const catalogProductIds = new Map<string, ObjectId>();
      for (const source of [
        ...plan.catalog.catalogProducts,
        plan.seeds.healthyBreakfast.product,
      ]) {
        const firstLegacyId =
          "legacySourceIds" in source ? source.legacySourceIds[0] : null;
        const product = await upsertOne(
          db,
          V2_COLLECTIONS.catalogProducts,
          { organizationId, code: source.code },
          {
            organizationId,
            code: source.code,
            name: source.name,
            defaultBusinessLineId: requireResolvedId(
              businessLineIds,
              source.businessLineCode,
              "business line",
            ),
            defaultCategoryId: requireResolvedId(
              categoryIds,
              source.categoryCode,
              "category",
            ),
            sortOrder: 0,
            ...(firstLegacyId
              ? { legacySource: legacySource("products", firstLegacyId) }
              : {}),
            isActive: source.isActive,
            version: 1,
            actor,
          },
          now,
        );
        catalogProductIds.set(source.code, product._id as ObjectId);
      }

      const skuIds = new Map<string, ObjectId>();
      const inventoryItemIds = new Map<string, ObjectId>();
      for (const source of plan.catalog.skus) {
        const existingSku = await db.collection(V2_COLLECTIONS.skus).findOne(
          { organizationId, code: source.code },
          { session },
        );
        const skuId = (existingSku?._id as ObjectId | undefined) ?? new ObjectId();
        let outputInventoryItemId: ObjectId | null = null;
        if (source.fulfillment === "preproduced") {
          const outputItem = await upsertOne(
            db,
            V2_COLLECTIONS.inventoryItems,
            { organizationId, code: `FG-${source.code}` },
            {
              organizationId,
              code: `FG-${source.code}`,
              name: `${source.name} thành phẩm`,
              itemType: "finished_good",
              baseUnit: "each",
              costingMethod: "fifo",
              lotTracked: true,
              expiryTracked: true,
              allowNegativeStock: false,
              linkedSkuId: skuId,
              legacySource: legacySource("products", source.legacySourceId),
              isActive: source.isActive,
              version: 1,
              actor,
            },
            now,
          );
          outputInventoryItemId = outputItem._id as ObjectId;
          inventoryItemIds.set(`FG-${source.code}`, outputInventoryItemId);
        }
        const sku = await upsertOne(
          db,
          V2_COLLECTIONS.skus,
          { organizationId, code: source.code },
          {
            _id: skuId,
            organizationId,
            catalogProductId: requireResolvedId(
              catalogProductIds,
              source.catalogProductCode,
              "catalog product",
            ),
            code: source.code,
            name: source.name,
            variantName: source.sizeName,
            businessLineId: requireResolvedId(
              businessLineIds,
              source.businessLineCode,
              "business line",
            ),
            categoryId: requireResolvedId(
              categoryIds,
              source.categoryCode,
              "category",
            ),
            salesUnit: source.sellingUnit,
            fulfillmentMode: source.fulfillment,
            outputInventoryItemId,
            sortOrder: 0,
            legacySource: legacySource("products", source.legacySourceId),
            legacyCostSnapshot: source.legacyCostSnapshot,
            isActive: source.isActive,
            version: 1,
            actor,
          },
          now,
        );
        skuIds.set(source.code, sku._id as ObjectId);
      }

      for (const item of plan.recipeBackfill.inventoryItems) {
        const inventory = await upsertOne(
          db,
          V2_COLLECTIONS.inventoryItems,
          { organizationId, code: item.code },
          {
            organizationId,
            code: item.code,
            name: item.name,
            itemType: item.itemType,
            baseUnit: item.baseUnit,
            costingMethod: "weighted_average",
            lotTracked: true,
            expiryTracked: false,
            allowNegativeStock: false,
            linkedSkuId: null,
            legacySource: legacySource("ingredients", item.legacySourceId),
            legacyCostSnapshot: item.legacyCostSnapshot,
            note: item.note,
            isActive: item.isActive,
            version: 1,
            actor,
          },
          now,
        );
        inventoryItemIds.set(item.code, inventory._id as ObjectId);
      }

      for (const item of plan.recipeBackfill.outputInventoryItems) {
        const skuId = requireResolvedId(skuIds, String(item.skuCode), "recipe SKU");
        const inventory = await upsertOne(
          db,
          V2_COLLECTIONS.inventoryItems,
          { organizationId, code: item.code },
          {
            organizationId,
            code: item.code,
            name: item.name,
            itemType: "finished_good",
            baseUnit: "each",
            costingMethod: "fifo",
            lotTracked: true,
            expiryTracked: true,
            allowNegativeStock: false,
            linkedSkuId: skuId,
            legacySource: legacySource("products", String(item.legacySourceId)),
            isActive: item.isActive,
            version: 1,
            actor,
          },
          now,
        );
        inventoryItemIds.set(String(item.code), inventory._id as ObjectId);
      }

      const healthy = plan.seeds.healthyBreakfast;
      const existingHealthySku = await db.collection(V2_COLLECTIONS.skus).findOne(
        { organizationId, code: healthy.sku.code },
        { session },
      );
      const healthySkuId =
        (existingHealthySku?._id as ObjectId | undefined) ?? new ObjectId();
      for (const item of healthy.inventoryItems) {
        const isFinished = item.kind === "finished_good";
        const inventory = await upsertOne(
          db,
          V2_COLLECTIONS.inventoryItems,
          { organizationId, code: item.code },
          {
            organizationId,
            code: item.code,
            name: item.name,
            itemType: item.kind,
            baseUnit: item.baseUnit,
            costingMethod: isFinished ? "fifo" : "weighted_average",
            lotTracked: true,
            expiryTracked: isFinished,
            allowNegativeStock: false,
            linkedSkuId: isFinished ? healthySkuId : null,
            isActive: true,
            version: 1,
            actor,
          },
          now,
        );
        inventoryItemIds.set(item.code, inventory._id as ObjectId);
      }
      const finishedItemId = requireResolvedId(
        inventoryItemIds,
        healthy.recipeVersion.outputInventoryItemCode,
        "healthy finished inventory item",
      );
      const healthySku = await upsertOne(
        db,
        V2_COLLECTIONS.skus,
        { organizationId, code: healthy.sku.code },
        {
          _id: healthySkuId,
          organizationId,
          catalogProductId: requireResolvedId(
            catalogProductIds,
            healthy.product.code,
            "healthy catalog product",
          ),
          code: healthy.sku.code,
          name: healthy.sku.name,
          variantName: "1 hộp",
          businessLineId: requireResolvedId(
            businessLineIds,
            healthy.sku.businessLineCode,
            "healthy business line",
          ),
          categoryId: requireResolvedId(
            categoryIds,
            healthy.sku.categoryCode,
            "healthy category",
          ),
          salesUnit: healthy.sku.sellingUnit,
          fulfillmentMode: healthy.sku.fulfillment,
          outputInventoryItemId: finishedItemId,
          sortOrder: 0,
          isActive: healthy.sku.isActive,
          version: 1,
          actor,
        },
        now,
      );
      skuIds.set(healthy.sku.code, healthySku._id as ObjectId);

      for (const price of [
        ...plan.catalog.skuPrices,
        {
          skuCode: healthy.sku.code,
          unitPriceVnd: healthy.sku.unitPriceVnd,
          effectiveFromBusinessDate: LEGACY_BASELINE.toBusinessDate,
        },
      ]) {
        const skuId = requireResolvedId(skuIds, price.skuCode, "SKU price");
        await upsertOne(
          db,
          V2_COLLECTIONS.skuPrices,
          {
            organizationId,
            locationId: null,
            skuId,
            effectiveFrom: priceEffectiveDate(price.effectiveFromBusinessDate),
          },
          {
            organizationId,
            locationId: null,
            skuId,
            unitPriceVnd: price.unitPriceVnd,
            currency: "VND",
            effectiveFrom: priceEffectiveDate(price.effectiveFromBusinessDate),
            effectiveTo: null,
            isActive: true,
            version: 1,
            actor,
          },
          now,
        );
      }

      const recipeIds = new Map<string, ObjectId>();
      for (const logicalRecipe of plan.recipeBackfill.recipes) {
        const skuId = requireResolvedId(
          skuIds,
          String(logicalRecipe.skuCode),
          "legacy recipe SKU",
        );
        const outputInventoryItemId = requireResolvedId(
          inventoryItemIds,
          String(logicalRecipe.outputInventoryItemCode),
          "legacy recipe output",
        );
        const body = materializeLegacyRecipe(
          logicalRecipe as unknown as Parameters<typeof materializeLegacyRecipe>[0],
          { organizationId, skuId, outputInventoryItemId, actor },
        );
        const recipe = await upsertOne(
          db,
          V2_COLLECTIONS.recipes,
          { organizationId, code: logicalRecipe.code },
          body,
          now,
        );
        recipeIds.set(String(logicalRecipe.code), recipe._id as ObjectId);
      }

      const healthyRecipeSeed = healthy.recipe;
      const healthyRecipe = await upsertOne(
        db,
        V2_COLLECTIONS.recipes,
        { organizationId, code: healthyRecipeSeed.code },
        {
          organizationId,
          code: healthyRecipeSeed.code,
          name: healthyRecipeSeed.name,
          skuId: healthySku._id,
          outputInventoryItemId: finishedItemId,
          note: healthyRecipeSeed.note,
          isActive: healthyRecipeSeed.isActive,
          version: 1,
          actor,
        },
        now,
      );
      recipeIds.set(healthyRecipeSeed.code, healthyRecipe._id as ObjectId);

      const linkCurrentVersion = async (
        collectionName: string,
        id: ObjectId,
        field: "currentVersionId" | "currentRecipeVersionId",
        versionId: ObjectId,
      ) => {
        const result = await db.collection(collectionName).updateOne(
          {
            _id: id,
            $or: [{ [field]: null }, { [field]: versionId }],
          },
          { $set: { [field]: versionId, updatedAt: now } },
          { session },
        );
        if (result.matchedCount !== 1) {
          throw new Error(
            `${collectionName}.${field} đã trỏ tới version khác; từ chối ghi đè.`,
          );
        }
      };

      for (const logicalVersion of plan.recipeBackfill.recipeVersions) {
        const recipeCode = String(logicalVersion.recipeCode);
        const recipeId = requireResolvedId(recipeIds, recipeCode, "legacy recipe");
        const skuId = requireResolvedId(
          skuIds,
          String(logicalVersion.skuCode),
          "legacy recipe SKU",
        );
        const outputInventoryItemId = requireResolvedId(
          inventoryItemIds,
          String(logicalVersion.outputInventoryItemCode),
          "legacy recipe output",
        );
        const body = materializeLegacyRecipeVersion(
          logicalVersion as unknown as Parameters<
            typeof materializeLegacyRecipeVersion
          >[0],
          {
            organizationId,
            recipeId,
            skuId,
            outputInventoryItemId,
            inventoryItemIds,
            actor,
          },
        );
        const version = await upsertOne(
          db,
          V2_COLLECTIONS.recipeVersions,
          {
            organizationId,
            recipeCode,
            versionNumber: logicalVersion.versionNumber,
          },
          body,
          now,
        );
        const versionId = version._id as ObjectId;
        await linkCurrentVersion(
          V2_COLLECTIONS.recipes,
          recipeId,
          "currentVersionId",
          versionId,
        );
        await linkCurrentVersion(
          V2_COLLECTIONS.skus,
          skuId,
          "currentRecipeVersionId",
          versionId,
        );
      }

      const recipeSeed = healthy.recipeVersion;
      const healthyRecipeBody = {
        organizationId,
        recipeCode: recipeSeed.recipeCode,
        recipeId: healthyRecipe._id,
        versionNumber: recipeSeed.version,
        name: recipeSeed.name,
        skuId: healthySku._id,
        outputInventoryItemId: finishedItemId,
        outputQuantity: Decimal128.fromString(recipeSeed.outputQuantity),
        outputUnit: recipeSeed.outputUnit,
        shelfLifeHours: null,
        finishedSpec: recipeSeed.finishedSpec.map((line) => ({
          inventoryItemId: requireResolvedId(
            inventoryItemIds,
            line.inventoryItemCode,
            "finished spec inventory item",
          ),
          itemCode: line.inventoryItemCode,
          itemName: line.name,
          quantity: Decimal128.fromString(line.quantity),
          unit: line.unit,
        })),
        components: recipeSeed.components.map((line) => ({
          inventoryItemId: requireResolvedId(
            inventoryItemIds,
            line.inventoryItemCode,
            "recipe component inventory item",
          ),
          itemCode: line.inventoryItemCode,
          itemName:
            healthy.inventoryItems.find(({ code }) => code === line.inventoryItemCode)
              ?.name ?? line.inventoryItemCode,
          ...(line.expectedInputQuantity
            ? {
                inputQuantity: Decimal128.fromString(
                  line.expectedInputQuantity,
                ),
              }
            : {}),
          unit: line.inputUnit,
          ...(line.expectedYieldPercent
            ? {
                expectedYieldPercent: Decimal128.fromString(
                  line.expectedYieldPercent,
                ),
              }
            : {}),
        })),
        status: recipeSeed.status,
        releasedAt: null,
        configurationIdempotencyKey: null,
        configurationRequestHash: null,
        releaseIdempotencyKey: null,
        contentHash: sha256Canonical(recipeSeed),
        costDataQuality: "missing_cost",
        isActive: true,
        version: 1,
        actor,
      };
      await upsertOne(
        db,
        V2_COLLECTIONS.recipeVersions,
        {
          organizationId,
          recipeCode: recipeSeed.recipeCode,
          versionNumber: recipeSeed.version,
        },
        healthyRecipeBody,
        now,
      );

      for (const sale of plan.sales.salesDays) {
        const legacyOccurredAt = new Date(
          `${sale.businessDate}T23:59:59.000+07:00`,
        );
        const materializerReferences = {
          organizationId,
          locationId,
          businessLineIds: {
            SNOW_MILK: businessLineIds.get("SNOW_MILK"),
            FRESH_MILK: businessLineIds.get("FRESH_MILK"),
          },
          actor,
          occurredAt: legacyOccurredAt,
        };
        const materializedSalesDay = materializeLegacySalesDay(
          sale as unknown as Parameters<typeof materializeLegacySalesDay>[0],
          materializerReferences,
        );
        const salesDay = await upsertOne(
          db,
          V2_COLLECTIONS.salesDays,
          { organizationId, locationId, businessDate: sale.businessDate },
          materializedSalesDay,
          now,
        );
        const postings = materializeLegacyPostings(
          materializedSalesDay,
          salesDay._id,
          materializerReferences,
        );
        for (const entry of postings.revenueEntries) {
          await upsertOne(
            db,
            V2_COLLECTIONS.revenueEntries,
            {
              organizationId,
              idempotencyKey: entry.idempotencyKey,
            },
            entry,
            now,
          );
        }
        await upsertOne(
          db,
          V2_COLLECTIONS.dailyRevenueFacts,
          { organizationId, locationId, businessDate: sale.businessDate },
          postings.dailyRevenueFact,
          now,
        );
      }

      const confirmationTokenHash = createHash("sha256")
        .update(options.confirmation ?? "")
        .digest("hex");
      await db.collection(V2_COLLECTIONS.migrationRuns).updateOne(
        { migrationVersion: MIGRATION_VERSION, runId },
        {
          $setOnInsert: {
            migrationVersion: MIGRATION_VERSION,
            runId,
            mode: "apply",
            connectionFingerprint: fingerprint.targetDigest,
            connectionSource: "online",
            scheme: "mongodb+srv",
            dbName: "snowmilk",
            inputChecksum: plan.checksum,
            mappingChecksum: sha256Canonical({
              catalog: plan.catalog,
              recipeBackfill: plan.recipeBackfill,
            }),
            sourceManifest: plan.sourceManifest,
            confirmationTokenHash,
            dryRunId: String(dryRunId),
            startedAt: now,
            executedBy: actor.userId,
            version: 1,
            createdAt: now,
          },
          $set: {
            status: "running",
            counts: [],
            exceptions: [],
            reconciliation: [],
            updatedAt: now,
          },
        },
        { upsert: true, session },
      );
      const runReceipt = await db.collection(V2_COLLECTIONS.migrationRuns).findOne(
        { migrationVersion: MIGRATION_VERSION, runId },
        { session },
      );
      if (!runReceipt) throw new Error("Không thể read-back migration receipt.");
      assertUpsertedDocumentMatches(
        runReceipt as Record<string, unknown>,
        {
          inputChecksum: plan.checksum,
          mappingChecksum: sha256Canonical({
            catalog: plan.catalog,
            recipeBackfill: plan.recipeBackfill,
          }),
          sourceManifest: plan.sourceManifest,
        },
        "migration receipt",
      );

      const transactionAfter = await currentV2Counts(db, session);
      const transactionReconciliation = buildAppliedMigrationReconciliation(
        await readAppliedMigrationSnapshot(db, session),
        expectedAppliedMigration(plan),
      );
      assertReconciliationMatches(transactionReconciliation);
      const finishedAt = startedDate();
      const counts = migrationRunCounts(plan, before, transactionAfter);
      await db.collection(V2_COLLECTIONS.migrationRuns).updateOne(
        { migrationVersion: MIGRATION_VERSION, runId, mode: "apply" },
        {
          $set: {
            status: "succeeded",
            counts,
            reconciliation: transactionReconciliation,
            exceptions: [],
            finishedAt,
            updatedAt: finishedAt,
          },
        },
        { session },
      );
      after = transactionAfter;
      reconciliation = transactionReconciliation;
    });
  } finally {
    activeMigrationSession = undefined;
    await session.endSession();
  }
  return {
    replayed: false,
    runId,
    before,
    after,
    reconciliation,
  };
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 8_000,
  appName: `bep-nha-ne-${options.mode}`,
});

try {
  await client.connect();
  const db = client.db(dbName);
  const plan = await buildSourcePlan(db);
  assertMatchingDryRunChecksum(options, plan.checksum);

  if (options.mode === "dry-run") {
    // Dry-run is strictly read-only. The checksum includes the target digest,
    // source data and explicit mappings; apply recalculates all of it.
    console.log(JSON.stringify(publicReport(plan), null, 2));
  } else {
    const result = await applyPlan(
      client,
      db,
      plan,
      `checksum:${plan.checksum}`,
    );
    console.log(JSON.stringify({ ...publicReport(plan), result }, null, 2));
  }
} catch (error) {
  console.error(sanitizeMigrationError(error));
  process.exitCode = 1;
} finally {
  await client.close();
}
