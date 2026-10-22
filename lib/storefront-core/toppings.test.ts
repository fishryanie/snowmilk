import { expect, test } from "bun:test";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { quoteCart } from "./quote";
import { CommerceStore } from "./store";
import { defaultSettings, getMaxToppings, type ShopProduct } from "./types";
import { productSchema } from "./validation";

const product: ShopProduct = {
  id: "507f1f77bcf86cd799439012", name: "Sữa tuyết", category: "Sữa",
  description: "", price: 25_000, imageUrl: "", badge: "", unit: "ly",
  status: "available", stock: null, sortOrder: 0,
  toppings: [
    { id: "oreo", name: "Oreo", price: 5_000, available: true },
    { id: "flan", name: "Flan", price: 6_000, available: true },
    { id: "pearl", name: "Trân châu", price: 4_000, available: true },
  ],
};
const { id: productId, ...input } = product;

test("mặc định chọn một topping, giữ cấu hình cũ và ưu tiên giới hạn mới", () => {
  expect(getMaxToppings({})).toBe(1);
  expect(getMaxToppings({ toppingSelection: "single" })).toBe(1);
  expect(getMaxToppings({ toppingSelection: "multiple" })).toBeNull();
  expect(getMaxToppings({ toppingSelection: "single", maxToppings: 2 })).toBe(2);
  expect(getMaxToppings({ toppingSelection: "single", maxToppings: null })).toBeNull();
  expect(getMaxToppings({ toppingSelection: "multiple", maxToppings: 1 })).toBe(1);
});

test("API chỉ nhận số nguyên dương hoặc không giới hạn", () => {
  for (const maxToppings of [1, 2, 12, 100, null]) {
    expect(productSchema.parse({ ...input, maxToppings }).maxToppings).toBe(maxToppings);
  }
  expect(getMaxToppings(productSchema.parse(input))).toBe(1);
  for (const maxToppings of [0, -1, 1.5, "2", NaN, Infinity]) {
    expect(productSchema.safeParse({ ...input, maxToppings }).success).toBe(false);
  }
});

test("báo giá áp dụng giới hạn cho mỗi phần và vẫn cho phép không topping", () => {
  for (const maxToppings of [undefined, 1, 2, null]) {
    for (let count = 0; count <= product.toppings.length; count++) {
      const toppings = product.toppings.slice(0, count);
      const quote = quoteCart(
        [{ productId: product.id, quantity: 3, toppingIds: toppings.map(t => t.id) }],
        [{ ...product, maxToppings }],
        defaultSettings,
      );
      const limit = maxToppings === undefined ? 1 : maxToppings;
      const valid = limit === null || count <= limit;
      expect(quote.valid).toBe(valid);
      expect(quote.lines[0].available).toBe(valid);
      expect(quote.subtotal).toBe(3 * (product.price + toppings.reduce((sum, t) => sum + t.price, 0)));
      if (!valid) expect(quote.lines[0].issue).toContain(`tối đa ${limit} topping`);
    }
  }
});

test("báo giá vô hiệu khi chủ tiệm giảm giới hạn dưới số topping trong giỏ", () => {
  const cart = [{ productId, quantity: 1, toppingIds: ["oreo", "flan"] }];
  const before = quoteCart(cart, [{ ...product, maxToppings: null }], defaultSettings);
  const after = quoteCart(cart, [{ ...product, maxToppings: 1 }], defaultSettings);
  expect(before.valid).toBe(true);
  expect(after.valid).toBe(false);
  expect(after.digest).not.toBe(before.digest);
});

test("API lưu và trả lại giới hạn tùy chỉnh, không giới hạn và mặc định cho món cũ", async () => {
  let document: Record<string, unknown>;
  const products = {
    countDocuments: async () => 0,
    insertOne: async (value: Record<string, unknown>) => {
      document = value;
      return { insertedId: value._id };
    },
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      document = { ...document, ...update.$set, revision: Number(document.revision) + 1 };
      return { matchedCount: 1 };
    },
    find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [document] }) }) }),
  };
  const db = { collection: () => products } as unknown as Db;
  const store = new CommerceStore(db, {} as MongoClient, "test-store");
  store.settings = async () => ({ ...defaultSettings });
  await store.saveProduct(input);
  const created = (await store.catalog(true)).products[0];
  expect(created.maxToppings).toBe(1);
  expect(ObjectId.isValid(created.id)).toBe(true);
  for (const maxToppings of [2, null, 1]) {
    const current = (await store.catalog(true)).products[0];
    await store.saveProduct({ ...input, maxToppings, expectedRevision: current.revision }, current.id);
    expect((await store.catalog(true)).products[0].maxToppings).toBe(maxToppings);
    expect(document!.maxToppings).toBe(maxToppings);
  }
});
