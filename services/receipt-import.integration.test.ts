import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReceiptImportInput } from "@/lib/validators/receipt";

// Opt in with a disposable, local replica set. Never use the app's MongoDB URI.
const uri = process.env.RECEIPT_TEST_MONGODB_URI;
describe.skipIf(!uri)("atomic receipt imports (isolated MongoDB)", () => {
  let mongo: typeof import("mongoose").default;
  let importReceipt: typeof import("./receipt-import.service").importReceipt;
  let Ingredient: typeof import("@/models/Ingredient").Ingredient;
  let Purchase: typeof import("@/models/Purchase").Purchase;
  let ReceiptImport: typeof import("@/models/ReceiptImport").ReceiptImport;
  let consumeReceiptScanBudget: typeof import("./receipt-scan-budget").consumeReceiptScanBudget;
  let ingredientId: string;
  const dbName = "snowmilk_receipt_test_" + crypto.randomUUID().replaceAll("-", "");
  const originalEnv = { uri: process.env.MONGODB_URI, username: process.env.MONGODB_USERNAME,
    password: process.env.MONGODB_PASSWORD, dbName: process.env.MONGODB_DB_NAME };

  beforeAll(async () => {
    if (!uri || !/^mongodb:\/\/127\.0\.0\.1:27029\//.test(uri)) throw new Error("Only the dedicated localhost:27029 test replica set is allowed.");
    process.env.MONGODB_URI = uri;
    process.env.MONGODB_USERNAME = "";
    process.env.MONGODB_PASSWORD = "";
    process.env.MONGODB_DB_NAME = dbName;
    mock.module("server-only", () => ({}));
    ({ importReceipt } = await import("./receipt-import.service"));
    ({ Ingredient } = await import("@/models/Ingredient"));
    ({ Purchase } = await import("@/models/Purchase"));
    ({ ReceiptImport } = await import("@/models/ReceiptImport"));
    ({ consumeReceiptScanBudget } = await import("./receipt-scan-budget"));
    const { connectMongo } = await import("@/lib/mongodb");
    mongo = await connectMongo();
    await Promise.all(Object.values(mongo.models).map((model) => model.init()));
  });
  beforeEach(async () => {
    for (const model of Object.values(mongo.models)) await model.deleteMany({});
    const ingredient = await Ingredient.create({ code: "NL001", name: "Hàng kiểm thử", category: "Nguyên liệu",
      purchaseUnit: "gói", packageQuantity: 500, costUnit: "g", referencePackagePrice: 10000, isActive: true });
    ingredientId = String(ingredient._id);
  });
  afterAll(async () => {
    if (mongo) {
      if (mongo.connection.name !== dbName) throw new Error("Refusing to clean up another database.");
      await mongo.connection.dropDatabase();
      await mongo.disconnect();
      global.mongooseCache = undefined;
    }
    for (const [key, value] of Object.entries({ MONGODB_URI: originalEnv.uri, MONGODB_USERNAME: originalEnv.username,
      MONGODB_PASSWORD: originalEnv.password, MONGODB_DB_NAME: originalEnv.dbName })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    mock.restore();
  });

  function input(key = "a"): ReceiptImportInput {
    return { receiptId: key.repeat(64), lines: [{ source: "existing", ingredientId,
      purchaseDate: new Date("2026-09-30T12:00:00+07:00"), packageCount: 2, totalAmount: 20000,
      fundingSource: "sales_revenue", sterilizationOutsourcedLiters: 0, sterilizationUnitPrice: 5000,
      sterilizationProvider: "", supplier: "Test", note: "Test" }] };
  }
  test("commits the full bill, correct date and quantity, and updates inventory cost", async () => {
    const request = input();
    request.lines.push({ source: "new", itemName: "Hàng mới kiểm thử", category: "Bao bì", purchaseUnit: "thùng",
      packageQuantity: 100, costUnit: "cái", saveToCatalog: true, purchaseDate: request.lines[0].purchaseDate,
      packageCount: 3, totalAmount: 90000, fundingSource: "sales_revenue", sterilizationOutsourcedLiters: 0,
      sterilizationUnitPrice: 5000, sterilizationProvider: "", supplier: "Test", note: "Test" });
    const saved = await importReceipt(request);
    expect(saved.purchaseIds).toHaveLength(2);
    expect(await Purchase.countDocuments()).toBe(2);
    expect(await Ingredient.countDocuments()).toBe(2);
    const purchase = await Purchase.findById(saved.purchaseIds[0]);
    expect(purchase?.convertedQuantity).toBe(1000);
    expect(purchase?.purchaseDate.toISOString()).toBe("2026-09-30T05:00:00.000Z");
    expect((await Ingredient.findById(ingredientId))?.averageUnitCost).toBe(20);
  });
  test("rolls back earlier purchases and newly created catalog items if a later row fails", async () => {
    const request = input("b");
    request.lines.unshift({ source: "new", itemName: "Phải được hoàn tác", category: "Bao bì", purchaseUnit: "gói",
      packageQuantity: 20, costUnit: "cái", saveToCatalog: true, purchaseDate: request.lines[0].purchaseDate,
      packageCount: 1, totalAmount: 10000, fundingSource: "sales_revenue", sterilizationOutsourcedLiters: 0,
      sterilizationUnitPrice: 5000, sterilizationProvider: "", supplier: "Test", note: "Test" });
    request.lines.push({ ...input().lines[0], source: "existing", ingredientId: "f".repeat(24) });
    await expect(importReceipt(request)).rejects.toThrow("không còn tồn tại");
    expect(await Purchase.countDocuments()).toBe(0);
    expect(await ReceiptImport.countDocuments()).toBe(0);
    expect(await Ingredient.countDocuments()).toBe(1);
    request.lines.pop();
    expect((await importReceipt(request)).purchaseIds).toHaveLength(2);
    expect(await Purchase.countDocuments()).toBe(2);
  });
  test("replays a request whose response was lost without duplicating purchases", async () => {
    const request = input("c");
    const first = await importReceipt(request);
    const second = await importReceipt(request);
    expect(second.replayed).toBe(true);
    expect(second.purchaseIds).toEqual(first.purchaseIds);
    expect(await Purchase.countDocuments()).toBe(1);
    await expect(importReceipt({ ...request, lines: [{ ...request.lines[0], totalAmount: 30000 }] })).rejects.toThrow("dữ liệu khác");
    expect(await Purchase.countDocuments()).toBe(1);
  });
  test("serializes concurrent submissions of the same image", async () => {
    const request = input("d");
    const results = await Promise.all([importReceipt(request), importReceipt(request)]);
    expect(results[0].purchaseIds).toEqual(results[1].purchaseIds);
    expect(await Purchase.countDocuments()).toBe(1);
    expect(await ReceiptImport.countDocuments()).toBe(1);
  });
  test("reuses a new catalog item repeated on two bill rows", async () => {
    const request = input("e");
    const common = request.lines[0];
    const line = { purchaseDate: common.purchaseDate, packageCount: common.packageCount, totalAmount: common.totalAmount,
      fundingSource: common.fundingSource, supplier: common.supplier, note: common.note,
      sterilizationOutsourcedLiters: 0, sterilizationUnitPrice: 5000, sterilizationProvider: "",
      source: "new" as const, itemName: "Hàng mới lặp lại", category: "Bao bì" as const,
      purchaseUnit: "gói", packageQuantity: 20, costUnit: "cái", saveToCatalog: true };
    request.lines = [line, line];
    expect((await importReceipt(request)).purchaseIds).toHaveLength(2);
    expect(await Ingredient.countDocuments()).toBe(2);
    const purchases = await Purchase.find().lean();
    expect(String(purchases[0].ingredientId)).toBe(String(purchases[1].ingredientId));
  });
  test("bounds concurrent paid scans and resets the minute window", async () => {
    const now = Math.ceil(Date.now() / 3600000) * 3600000;
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeReceiptScanBudget(now)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(6);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);
    await expect(consumeReceiptScanBudget(now + 60000)).resolves.toBeUndefined();
    for (let index = 7; index < 30; index++) await consumeReceiptScanBudget(now + Math.floor(index / 6) * 60000);
    await expect(consumeReceiptScanBudget(now + 10 * 60000)).rejects.toThrow("giới hạn");
  });
});
