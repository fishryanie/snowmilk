import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { CommerceStore } from "./store";
import type { OrderStatus } from "./types";

const uri = process.env.DB_PERFORMANCE_TEST_MONGODB_URI;
const imageUrl = `data:image/webp;base64,${"A".repeat(150_000)}`;

function order(status: OrderStatus = "preparing", index = 1) {
  const now = new Date("2026-10-22T00:00:00Z");
  return {
    _id: new ObjectId(index.toString(16).padStart(24, "0")),
    storeId: "test-shop",
    ownerHash: "test-owner",
    idempotencyKey: `test-${index}`,
    requestHash: `request-${index}`,
    code: `ORDER${index}`,
    status,
    // Omit paymentMethod to exercise inference for legacy orders.
    customer: { name: "Test", phone: "0900000000", address: "Test", note: "", location: null },
    quote: {
      lines: [{
        productId: "507f1f77bcf86cd799439012", quantity: 2, toppingIds: [],
        key: "test-line", name: "Sữa", imageUrl, toppings: [],
        unitPrice: 25_000, total: 50_000, available: true,
      }],
      subtotal: 50_000, deliveryFee: 10_000, total: 60_000, valid: true, digest: "test-digest",
    },
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date("2100-01-01T00:00:00Z"),
    events: [{ status, at: now.toISOString(), note: "Test event" }],
  };
}

describe.skipIf(!uri)("storefront order list (isolated MongoDB)", () => {
  let client: MongoClient;
  let db: Db;
  let store: CommerceStore;
  const dbName = `snowmilk_orders_test_${crypto.randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    if (!uri || !/^mongodb:\/\/127\.0\.0\.1:27030\//.test(uri)) {
      throw new Error("Only the dedicated localhost:27030 test database is allowed.");
    }
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    store = new CommerceStore(db, client, "test-shop");
  });
  beforeEach(async () => {
    await db.collection("storefront_orders").deleteMany({});
    await db.collection("storefront_products").deleteMany({});
  });
  afterAll(async () => {
    if (db) {
      if (db.databaseName !== dbName) throw new Error("Refusing to clean up another database.");
      await db.dropDatabase();
    }
    await client?.close();
  });

  test("compact polling removes image bytes while preserving totals, legacy payment and receipt flags", async () => {
    await db.collection("storefront_orders").insertMany([
      order("preparing", 1), order("awaiting_payment", 2), order("payment_review", 3),
      { ...order("completed", 4), events: [...order("payment_review", 4).events, ...order("completed", 4).events] },
    ]);
    const full = await store.listOrders();
    const compact = await store.listOrders(undefined, undefined, undefined, undefined, { includeImages: false });

    expect(compact).toEqual({
      ...full,
      orders: full.orders.map((o) => ({
        ...o,
        quote: { ...o.quote, lines: o.quote.lines.map((line) => ({ ...line, imageUrl: "" })) },
      })),
    });
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(Buffer.byteLength(JSON.stringify(full)) / 50);
    expect(compact.orders.map((o) => [o.paymentMethod, o.hasReceipt])).toEqual([
      ["bank_transfer", true], ["bank_transfer", true], ["bank_transfer", false], ["cod", false],
    ]);
  });

  test("compact mode preserves tenant, owner, phone, status filters and cursor pagination", async () => {
    await db.collection("storefront_orders").insertMany([
      ...Array.from({ length: 52 }, (_, index) => order("preparing", index + 1)),
      { ...order("preparing", 53), storeId: "other-shop" },
      { ...order("preparing", 54), ownerHash: "other-owner" },
      { ...order("preparing", 55), customer: { ...order().customer, phone: "0911111111" } },
      order("completed", 56),
    ]);
    const page = (before?: string) => store.listOrders("test-owner", "0900000000", before, "preparing", { includeImages: false });
    const first = await page();
    expect(first.orders).toHaveLength(50);
    expect(first.orders[0].code).toBe("ORDER52");
    expect(first.orders[49].code).toBe("ORDER3");
    expect(first.nextCursor).toBe(first.orders[49].id);
    const second = await page(first.nextCursor!);
    expect(second.orders.map((o) => o.code)).toEqual(["ORDER2", "ORDER1"]);
    expect(second.nextCursor).toBeNull();
  });

  test("compact reads keep the stored snapshot and subsequent detail/default reads intact", async () => {
    const doc = order();
    await db.collection("storefront_orders").insertOne(doc);
    await store.listOrders(undefined, undefined, undefined, undefined, { includeImages: false });
    expect((await store.order(String(doc._id))).quote.lines[0].imageUrl).toBe(imageUrl);
    expect((await store.listOrders()).orders[0].quote.lines[0].imageUrl).toBe(imageUrl);
  });

  test("admin list only returns table fields, preserving filters, tenants and pagination", async () => {
    await db.collection("storefront_orders").insertMany([
      ...Array.from({ length: 52 }, (_, index) => order("preparing", index + 1)),
      { ...order("preparing", 53), storeId: "other-shop" },
      { ...order("preparing", 54), customer: { ...order().customer, phone: "0911111111" } },
      order("completed", 55),
    ]);
    const first = await store.listAdminOrders("0900000000", undefined, "preparing");
    expect(first.orders).toHaveLength(50);
    expect(first.orders[0]).toEqual({
      id: String(order("preparing", 52)._id), code: "ORDER52", status: "preparing",
      createdAt: order().createdAt.toISOString(), total: 60_000,
      customer: { name: "Test", phone: "0900000000" },
    });
    expect(first.nextCursor).toBe(first.orders[49].id);
    const second = await store.listAdminOrders("0900000000", first.nextCursor!, "preparing");
    expect(second.orders.map((o) => o.code)).toEqual(["ORDER2", "ORDER1"]);
    expect(second.nextCursor).toBeNull();
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(20_000);
  });

  test("admin detail returns product names, quantities and prices without images or receipt bytes", async () => {
    const doc = {
      ...order("payment_review"),
      payment: { qrImage: imageUrl, note: "Payment note" },
      receipt: { data: Buffer.from("receipt"), mime: "image/webp", uploadedAt: new Date() },
    };
    await db.collection("storefront_orders").insertOne(doc);
    const detail = await store.adminOrder(String(doc._id));
    expect(detail.quote).toEqual({
      subtotal: 50_000, deliveryFee: 10_000, total: 60_000,
      lines: [{ key: "test-line", name: "Sữa", quantity: 2, unitPrice: 25_000, total: 50_000, toppings: [] }],
    });
    expect(detail.paymentMethod).toBe("bank_transfer");
    expect(detail.hasReceipt).toBe(true);
    expect(detail).not.toHaveProperty("payment");
    expect(JSON.stringify(detail)).not.toContain("base64");
    expect((await store.order(String(doc._id))).quote.lines[0].imageUrl).toBe(imageUrl);
    expect((await store.order(String(doc._id))).payment?.qrImage).toBe(imageUrl);
    // Legacy payment metadata can be the only evidence of a bank transfer.
    await db.collection("storefront_orders").updateOne({ _id: doc._id }, { $set: { events: order().events } });
    expect((await store.adminOrder(String(doc._id))).paymentMethod).toBe("bank_transfer");
    await db.collection("storefront_orders").updateOne({ _id: doc._id }, { $unset: { receipt: "", payment: "" } });
    const cod = await store.adminOrder(String(doc._id));
    expect(cod.paymentMethod).toBe("cod");
    expect(cod.hasReceipt).toBe(false);
    await db.collection("storefront_orders").updateOne({ _id: doc._id }, { $set: { receipt: null, payment: { qrImage: "", note: "" } } });
    const emptyPayment = await store.adminOrder(String(doc._id));
    expect(emptyPayment.paymentMethod).toBe("cod");
    expect(emptyPayment.hasReceipt).toBe(false);
    const otherStore = new CommerceStore(db, client, "other-shop");
    await expect(otherStore.adminOrder(String(doc._id))).rejects.toMatchObject({ status: 404 });
    await expect(store.adminOrder("invalid")).rejects.toMatchObject({ status: 404 });
  });

  test("deleting active orders leaves the catalogue untouched, including concurrent retries", async () => {
    const doc = order();
    const productId = new ObjectId(doc.quote.lines[0].productId);
    await db.collection("storefront_products").insertOne({ _id: productId, storeId: "test-shop", stock: 3, revision: 1 });
    await db.collection("storefront_orders").insertOne(doc);
    const otherStore = new CommerceStore(db, client, "other-shop");
    await expect(otherStore.deleteOrder(String(doc._id))).rejects.toMatchObject({ status: 404 });
    const results = await Promise.allSettled([store.deleteOrder(String(doc._id)), store.deleteOrder(String(doc._id))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection("storefront_products").findOne({ _id: productId }))?.stock).toBe(3);
    expect(await db.collection("storefront_orders").findOne({ _id: doc._id })).toBeNull();
    await expect(store.deleteOrder(String(doc._id))).rejects.toMatchObject({ status: 404 });
    await expect(store.deleteOrder("invalid")).rejects.toMatchObject({ status: 404 });
  });

  test("deleting completed/cancelled/expired orders leaves the catalogue untouched", async () => {
    const productId = new ObjectId(order().quote.lines[0].productId);
    await db.collection("storefront_products").insertOne({ _id: productId, storeId: "test-shop", stock: 3, revision: 1 });
    for (const [index, status] of (["completed", "cancelled", "expired"] as const).entries()) {
      const doc = order(status, index + 1);
      await db.collection("storefront_orders").insertOne(doc);
      await store.deleteOrder(String(doc._id));
    }
    expect((await db.collection("storefront_products").findOne({ _id: productId }))?.stock).toBe(3);
  });

  test("cancelling requires a reason, leaves the catalogue untouched and keeps history", async () => {
    const doc = order();
    const productId = new ObjectId(doc.quote.lines[0].productId);
    await db.collection("storefront_products").insertOne({ _id: productId, storeId: "test-shop", stock: 3, revision: 1 });
    await db.collection("storefront_orders").insertOne(doc);
    await expect(store.changeStatus(String(doc._id), "cancelled", "")).rejects.toMatchObject({ status: 400 });
    await store.changeStatus(String(doc._id), "cancelled", "Khách đổi ý");
    await expect(store.changeStatus(String(doc._id), "cancelled", "Thử lại")).rejects.toMatchObject({ status: 409 });
    const cancelled = await store.adminOrder(String(doc._id));
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.events.at(-1)?.note).toBe("Khách đổi ý");
    expect((await db.collection("storefront_products").findOne({ _id: productId }))?.stock).toBe(3);
    await store.deleteOrder(String(doc._id));
    expect((await db.collection("storefront_products").findOne({ _id: productId }))?.stock).toBe(3);
  });

  test("summary reads expire only this store's unpaid orders without changing the catalogue", async () => {
    const doc = { ...order("awaiting_payment"), expiresAt: new Date("2020-01-01T00:00:00Z") };
    const other = { ...order("awaiting_payment", 2), storeId: "other-shop", expiresAt: doc.expiresAt };
    const productId = new ObjectId(doc.quote.lines[0].productId);
    await db.collection("storefront_products").insertOne({ _id: productId, storeId: "test-shop", stock: 3, revision: 1 });
    await db.collection("storefront_orders").insertMany([doc, other]);
    expect((await store.listAdminOrders()).orders[0].status).toBe("expired");
    expect((await store.listAdminOrders()).orders[0].status).toBe("expired");
    expect((await db.collection("storefront_products").findOne({ _id: productId }))?.stock).toBe(3);
    expect((await db.collection("storefront_orders").findOne({ _id: other._id }))?.status).toBe("awaiting_payment");
    expect((await store.order(String(doc._id))).quote.lines[0].imageUrl).toBe(imageUrl);
  });
  test("legacy zero stock never limits checkout or changes product revisions", async () => {
    const productId = new ObjectId("507f1f77bcf86cd799439012");
    await db.collection("storefront_products").insertOne({
      _id: productId, storeId: "test-shop", name: "Sữa", category: "Sữa",
      description: "", price: 25_000, imageUrl: "", badge: "", unit: "ly",
      status: "available", stock: 0, toppings: [], sortOrder: 0, revision: 1,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const cart = [{ productId: String(productId), quantity: 30, toppingIds: [] }];
    const quote = await store.quote(cart);
    expect(quote.valid).toBe(true);
    expect((await store.catalog()).products[0]).not.toHaveProperty("stock");
    const input = {
      cart, digest: quote.digest, paymentMethod: "cod",
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Khách thử", phone: "0900000000", address: "123 Đường kiểm thử", note: "", location: null },
    };
    const first = await store.checkout(input, "test-owner");
    expect(first.quote.total).toBe(750_000);
    expect((await store.checkout(input, "test-owner")).id).toBe(first.id);
    await store.checkout({ ...input, idempotencyKey: crypto.randomUUID() }, "test-owner");
    expect(await db.collection("storefront_orders").countDocuments()).toBe(2);
    const product = await db.collection("storefront_products").findOne({ _id: productId });
    expect(product?.stock).toBe(0);
    expect(product?.revision).toBe(1);
  });

});
