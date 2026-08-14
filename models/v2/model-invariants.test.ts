import { describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import { InventoryBalance } from "./InventoryBalance";
import { Recipe } from "./Recipe";
import { RecipeVersion } from "./RecipeVersion";
import { RevenueEntry } from "./RevenueEntry";
import { SalesDay } from "./SalesDay";
import { StockCount } from "./StockCount";
import { StockMovement } from "./StockMovement";

const actor = { userId: "test", source: "system" };

function recipeVersion(status: "draft" | "released") {
  return new RecipeVersion({
    organizationId: new Types.ObjectId(),
    recipeCode: "HBF-BOX-001",
    recipeId: null,
    versionNumber: 1,
    name: "Hộp ăn sáng Healthy",
    skuId: new Types.ObjectId(),
    outputInventoryItemId: new Types.ObjectId(),
    outputQuantity: "1",
    outputUnit: "each",
    finishedSpec: [
      { itemCode: "POTATO", itemName: "Khoai", quantity: "200", unit: "g" },
    ],
    components: [
      {
        inventoryItemId: new Types.ObjectId(),
        itemCode: "RAW-POTATO",
        itemName: "Khoai thô",
        unit: "g",
        ...(status === "released"
          ? { inputQuantity: "250", expectedYieldPercent: "80" }
          : {}),
      },
    ],
    status,
    releasedAt: status === "released" ? new Date() : null,
    releaseIdempotencyKey: status === "released" ? "release-key" : null,
    contentHash: `${status}-hash`,
    costDataQuality: "missing_cost",
    actor,
  });
}

describe("v2 model cross-domain invariants", () => {
  test("uses a distinct stable recipe aggregate collection", () => {
    expect(Recipe.collection.collectionName).toBe("v2_recipes");
  });

  test("only indexes recipe legacy identity when a legacy source exists", () => {
    const [, options] = Recipe.schema
      .indexes()
      .find(
        (entry: [Record<string, unknown>, Record<string, unknown>]) =>
          entry[1].name === "uq_recipe_legacy_source",
      )!;
    expect(options.sparse).toBeUndefined();
    expect(options.partialFilterExpression).toEqual({
      "legacySource.sourceCollection": { $type: "string" },
      "legacySource.sourceId": { $type: "string" },
    });
  });

  test("allows an unlinked draft but requires recipeId before release", async () => {
    await expect(recipeVersion("draft").validate()).resolves.toBeUndefined();
    await expect(recipeVersion("released").validate()).rejects.toThrow(
      "recipe ổn định",
    );
  });

  test("allows unknown yield only for explicitly sourced legacy releases", async () => {
    const version = recipeVersion("released");
    version.recipeId = new Types.ObjectId();
    version.costDataQuality = "legacy";
    version.legacySource = {
      sourceCollection: "recipes",
      sourceId: "legacy-ct-001",
      migrationVersion: "v2-test",
    };
    version.components[0].expectedYieldPercent = null;
    await expect(version.validate()).resolves.toBeUndefined();

    version.legacySource = undefined;
    await expect(version.validate()).rejects.toThrow("yield");
  });

  test("pairs recipe configuration idempotency key with its request hash", async () => {
    const draft = recipeVersion("draft");
    draft.configurationIdempotencyKey = "recipe-config-key";
    await expect(draft.validate()).rejects.toThrow("request hash");
  });

  test("does not permit zero-valued cost fields to masquerade as missing", async () => {
    const balance = new InventoryBalance({
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      inventoryItemId: new Types.ObjectId(),
      onHandQuantity: "1",
      reservedQuantity: "0",
      availableQuantity: "1",
      averageUnitCostVnd: "0",
      inventoryValueVnd: 0,
      costDataQuality: "missing_cost",
      lastMovementId: new Types.ObjectId(),
      lastMovementAt: new Date(),
      actor,
    });
    await expect(balance.validate()).rejects.toThrow("cost giả định");
  });

  test("validates inventory balance quantities without floating-point loss", async () => {
    const balance = new InventoryBalance({
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      inventoryItemId: new Types.ObjectId(),
      onHandQuantity: "100000000000000000000.2",
      reservedQuantity: "100000000000000000000.1",
      availableQuantity: "0.1",
      averageUnitCostVnd: null,
      inventoryValueVnd: null,
      costDataQuality: "missing_cost",
      lastMovementId: new Types.ObjectId(),
      lastMovementAt: new Date(),
      actor,
    });
    await expect(balance.validate()).resolves.toBeUndefined();
    balance.availableQuantity = "0.1000000001";
    await expect(balance.validate()).rejects.toThrow("Tồn khả dụng");
  });

  test("keeps subnormal Decimal128 movement signs exact", async () => {
    const movement = new StockMovement({
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      inventoryItemId: new Types.ObjectId(),
      inventoryLotId: new Types.ObjectId(),
      itemCodeSnapshot: "RAW-POTATO",
      itemNameSnapshot: "Khoai",
      unitSnapshot: "g",
      movementType: "opening",
      quantityDelta: "1E-1000",
      businessDate: "2026-08-12",
      occurredAt: new Date(),
      sourceType: "stock_count",
      sourceId: new Types.ObjectId(),
      sourceLineKey: "raw-potato",
      idempotencyKey: "tiny-opening-movement",
      actor,
    });
    await expect(movement.validate()).resolves.toBeUndefined();
  });

  test("allows an empty draft while its close-time cost is unresolved", async () => {
    const day = new SalesDay({
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      businessDate: "2026-08-12",
      status: "draft",
      lines: [],
      tenders: [],
      grossRevenueVnd: 0,
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: 0,
      collectedVnd: 0,
      cogsVnd: null,
      profitVnd: null,
      dataQuality: "missing_cost",
      actor,
    });
    await expect(day.validate()).resolves.toBeUndefined();
  });

  test("requires signed quantity snapshots on append-only revenue entries", async () => {
    const common = {
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      salesDayId: new Types.ObjectId(),
      lineKey: "HBF-BOX-001:v2",
      businessDate: "2026-08-12",
      skuId: new Types.ObjectId(),
      skuCodeSnapshot: "HBF-BOX-001",
      skuNameSnapshot: "Hộp ăn sáng Healthy",
      businessLineId: new Types.ObjectId(),
      businessLineCodeSnapshot: "BREAKFAST",
      businessLineNameSnapshot: "Đồ ăn sáng",
      businessLinePathCodesSnapshot: [],
      categoryId: new Types.ObjectId(),
      categoryCodeSnapshot: "HEALTHY",
      categoryNameSnapshot: "Healthy",
      quantitySource: "actual",
      salesUnitSnapshot: "box",
      grossRevenueVnd: 20_000,
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: 20_000,
      cogsVnd: null,
      profitVnd: null,
      dataQuality: "missing_cost",
      calculationVersion: "sales-v2.1",
      idempotencyKey: "revenue-entry-test",
      occurredAt: new Date(),
      actor,
    };
    const sale = new RevenueEntry({
      ...common,
      entryType: "sale",
      quantity: "1",
    });
    await expect(sale.validate()).resolves.toBeUndefined();

    const negativeSubnormalSale = new RevenueEntry({
      ...common,
      lineKey: "HBF-BOX-001:v3",
      entryType: "sale",
      quantity: "-1E-1000",
      idempotencyKey: "revenue-entry-negative-subnormal-test",
    });
    await expect(negativeSubnormalSale.validate()).rejects.toThrow("không âm");

    const invalidReversal = new RevenueEntry({
      ...common,
      lineKey: "HBF-BOX-001:v2:reversal",
      entryType: "reversal",
      quantity: "1",
      grossRevenueVnd: -20_000,
      netRevenueVnd: -20_000,
      reversalOfId: new Types.ObjectId(),
      reversalReason: "Mở lại ngày để sửa số lượng",
      idempotencyKey: "revenue-entry-reversal-test",
    });
    await expect(invalidReversal.validate()).rejects.toThrow("không dương");
  });

  test("validates stock-count variance with exact decimal arithmetic", async () => {
    const count = new StockCount({
      organizationId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      businessDate: "2026-08-12",
      countCode: "OPENING-20260812-TEST",
      countType: "opening",
      status: "posted",
      lines: [
        {
          lineKey: "item:lot",
          inventoryItemId: new Types.ObjectId(),
          inventoryLotId: new Types.ObjectId(),
          itemCodeSnapshot: "RAW-POTATO",
          itemNameSnapshot: "Khoai",
          unitSnapshot: "g",
          expectedQuantity: "100000000000000000000.1",
          countedQuantity: "100000000000000000000.2",
          varianceQuantity: "0.1",
          unitCostVnd: "12.5",
          varianceValueVnd: 1,
          adjustmentMovementId: new Types.ObjectId(),
        },
      ],
      countedAt: new Date(),
      postedAt: new Date(),
      idempotencyKey: "opening-count-model-test",
      requestHash: "a".repeat(64),
      actor,
    });
    await expect(count.validate()).resolves.toBeUndefined();
    count.lines[0].varianceQuantity = "0.1000000001";
    await expect(count.validate()).rejects.toThrow("Sai chênh lệch");
  });

  test("declares exactly one unique opening-count index", () => {
    const openingIndexes = StockCount.schema.indexes().filter(
      (entry: [Record<string, unknown>, Record<string, unknown>]) =>
        entry[1].partialFilterExpression &&
        JSON.stringify(entry[1].partialFilterExpression) ===
          JSON.stringify({ countType: "opening" }),
    );
    expect(openingIndexes).toHaveLength(1);
  });
});
