import assert from "node:assert/strict";
import { Types } from "mongoose";
import type { V2Context } from "@/services/v2/context";
import { createPurchaseReceiptSchema } from "@/lib/validators/v2/purchase-receipts";
import { saveSalesDayDraftSchema } from "@/lib/validators/v2/sales-days";

// Explicit opt-in to a disposable local replica set; never use the app database.
const uri = process.env.WITHOUT_INVENTORY_TEST_MONGODB_URI;
async function run() {
  if (!uri) throw new Error("Set WITHOUT_INVENTORY_TEST_MONGODB_URI to the dedicated local test replica set.");
  let mongo: typeof import("mongoose").default;
  let purchases: typeof import("@/services/v2/purchase-receipt.service");
  let sales: typeof import("@/services/v2/sales-day.service");
  let catalog: typeof import("@/services/v2/catalog.service");
  const dbName = `snowmilk_without_inventory_${crypto.randomUUID().replaceAll("-", "")}`;
  const context: V2Context = {
    organizationId: new Types.ObjectId(), locationId: new Types.ObjectId(), role: "owner",
    actor: { userId: "test", displayName: "Test", source: "system" },
  };
  const original = { MONGODB_URI: process.env.MONGODB_URI, MONGODB_USERNAME: process.env.MONGODB_USERNAME,
    MONGODB_PASSWORD: process.env.MONGODB_PASSWORD, MONGODB_DB_NAME: process.env.MONGODB_DB_NAME };

  async function setup() {
    if (!uri || !/^mongodb:\/\/127\.0\.0\.1:27030\//.test(uri)) throw new Error("Only localhost:27030 is allowed.");
    Object.assign(process.env, { MONGODB_URI: uri, MONGODB_USERNAME: "", MONGODB_PASSWORD: "", MONGODB_DB_NAME: dbName });
    purchases = await import("@/services/v2/purchase-receipt.service");
    sales = await import("@/services/v2/sales-day.service");
    catalog = await import("@/services/v2/catalog.service");
    mongo = await (await import("@/lib/mongodb")).connectMongo();
    await Promise.all(Object.values(mongo.models).map((model) => model.init()));
  }
  async function reset() {
    for (const model of Object.values(mongo.models)) await model.collection.deleteMany({});
  }
  async function cleanup() {
    if (mongo) {
      if (mongo.connection.name !== dbName) throw new Error("Refusing to clean another database.");
      await mongo.connection.dropDatabase();
      await mongo.disconnect();
      global.mongooseCache = undefined;
    }
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }

  async function expectNoWarehouseCollections() {
    const names = (await mongo.connection.db!.listCollections().toArray()).map((collection) => collection.name);
    assert.deepEqual(names.filter((name) => /inventory_(balances|lots)|stock_(counts|movements)|production_batches/.test(name)), []);
  }

  async function purchaseQuantities() {
    const itemId = new Types.ObjectId();
    await mongo.connection.collection("v2_inventory_items").insertOne({
      _id: itemId, organizationId: context.organizationId, code: "RAW-TEST", name: "Hàng thử",
      itemType: "raw_material", baseUnit: "g", isActive: true, lotTracked: true, expiryTracked: true,
    });
    const input = createPurchaseReceiptSchema.parse({
      idempotencyKey: "purchase-without-stock", businessDate: "2026-10-22", receivedAt: "2026-10-22T08:00:00+07:00",
      supplierName: "Nhà cung cấp", lines: [{ inventoryItemId: String(itemId), quantity: "12.5", totalAmountVnd: 125_000 }],
    });
    const saved = await purchases.createPurchaseReceipt(context, input);
    assert.equal(saved.lines[0].quantity, "12.5");
    assert.equal(saved.lines[0].unitCostVnd, "10000");
    assert.equal(saved.totalAmountVnd, 125_000);
    assert.equal((await purchases.createPurchaseReceipt(context, input)).id, saved.id);
    assert.equal((await purchases.listPurchaseReceipts(context)).receipts.length, 1);
    assert.equal((await purchases.listPurchaseItems(context)).items[0].inventoryItemId, String(itemId));
    await expectNoWarehouseCollections();
  }

  async function salesWithoutStock() {
    const skuId = new Types.ObjectId(), businessLineId = new Types.ObjectId(), categoryId = new Types.ObjectId();
    const scope = { organizationId: context.organizationId, isActive: true };
    await mongo.connection.collection("v2_business_lines").insertOne({ ...scope, _id: businessLineId, code: "TEST", name: "Test", isPosting: true, pathCodes: [] });
    await mongo.connection.collection("v2_categories").insertOne({ ...scope, _id: categoryId, code: "TEST", name: "Test" });
    await mongo.connection.collection("v2_skus").insertOne({ ...scope, _id: skuId, code: "SKU-TEST", name: "Món thử", businessLineId, categoryId, salesUnit: "box", fulfillmentMode: "preproduced" });
    await mongo.connection.collection("v2_sku_prices").insertOne({ ...scope, skuId, locationId: null, unitPriceVnd: 20_000, effectiveFrom: new Date("2026-01-01"), effectiveTo: null });
    await mongo.connection.collection("products").insertOne({ code: "SKU-TEST", fullCost: 12_000 });
    assert.equal((await catalog.listCatalogSkus(context)).skus[0].canSell, true);
    const draft = await sales.saveSalesDayDraft(context, "2026-10-22", saveSalesDayDraftSchema.parse({
      version: 0, idempotencyKey: "sales-without-stock", lines: [{ skuId: String(skuId), quantity: 3 }], payments: { cashVnd: 60_000 },
    }));
    const closed = await sales.closeSalesDay(context, "2026-10-22", { version: draft.version, idempotencyKey: "close-without-stock" });
    assert.equal(closed.status, "closed");
    assert.equal(closed.totals.cogsVnd, 36_000);
    assert.equal(closed.totals.profitVnd, 24_000);
    const reopened = await sales.reopenSalesDay(context, "2026-10-22", { version: closed.version, idempotencyKey: "reopen-without-stock", reason: "Sửa số tiền đã thu" });
    assert.equal(reopened.status, "reopened");
    await expectNoWarehouseCollections();
  }
  try {
    await setup();
    await reset();
    await purchaseQuantities();
    await reset();
    await salesWithoutStock();
    console.log(JSON.stringify({ passed: 2, purchaseQuantity: "12.5", salesCogsVnd: 36_000, warehouseCollectionsCreated: 0 }));
  } finally {
    await cleanup();
  }
}
await run();
