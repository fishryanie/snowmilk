import { MongoClient, ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getMongoConfig } from "../lib/mongodb-config";
// Chạy từ Snowmilk: bun scripts/setup-online-admin.ts
// Chỉ tạo nền tảng truy cập quản trị, không migration dữ liệu kho/doanh thu.
const { uri, dbName } = getMongoConfig();
const client = await new MongoClient(uri).connect();
try {
  const db = client.db(dbName);
  const now = new Date();
  const actor = {
    userId: "storefront-setup",
    displayName: "Thiết lập cửa hàng online",
    source: "migration",
    requestId: "storefront-setup",
  };
  const organizations = await db
    .collection("v2_organizations")
    .find({ isActive: { $ne: false } })
    .limit(2)
    .toArray();
  if (organizations.length > 1 && !process.env.STOREFRONT_ORGANIZATION_ID)
    throw new Error(
      "Có nhiều tổ chức. Đặt STOREFRONT_ORGANIZATION_ID trước khi chạy.",
    );
  let organization = process.env.STOREFRONT_ORGANIZATION_ID
    ? await db
        .collection("v2_organizations")
        .findOne({ _id: new ObjectId(process.env.STOREFRONT_ORGANIZATION_ID) })
    : organizations[0];
  if (process.env.STOREFRONT_ORGANIZATION_ID && !organization)
    throw new Error("Không tìm thấy tổ chức đã cấu hình.");
  if (!organization) {
    const _id = new ObjectId();
    await db
      .collection("v2_organizations")
      .insertOne({
        _id,
        code: "MILK_SHOP",
        profile: {
          displayName: "Cái Tiệm Sữa",
          wordmark: "Cái Tiệm Sữa",
          timezone: "Asia/Ho_Chi_Minh",
          currency: "VND",
          locale: "vi-VN",
        },
        isActive: true,
        version: 1,
        actor,
        createdAt: now,
        updatedAt: now,
      });
    organization = { _id };
  }
  await db
    .collection("v2_locations")
    .updateOne(
      { organizationId: organization._id, isDefault: true },
      {
        $setOnInsert: {
          code: "MAIN",
          name: "Tiệm chính",
          timezone: "Asia/Ho_Chi_Minh",
          isActive: true,
          version: 1,
          actor,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  const file = ".env.local";
  let env = await readFile(file, "utf8").catch(() => "");
  const values: Record<string, string> = {
    STOREFRONT_STORE_ID: process.env.STOREFRONT_STORE_ID || "milk-shop",
    STOREFRONT_ORGANIZATION_ID: String(organization._id),
  };
  if (!process.env.BETTER_AUTH_SECRET)
    values.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  if (!process.env.AUTH_BOOTSTRAP_TOKEN)
    values.AUTH_BOOTSTRAP_TOKEN = randomBytes(32).toString("hex");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    env = pattern.test(env)
      ? env.replace(pattern, line)
      : `${env.trimEnd()}\n${line}\n`;
  }
  await writeFile(file, env, { mode: 0o600 });
  console.log(
    "Đã chuẩn bị tổ chức/điểm bán và ghi cấu hình vào .env.local. Không thay dữ liệu kinh doanh. Khởi động lại Snowmilk rồi dùng Cửa hàng → Tạo owner lần đầu. Token nằm trong AUTH_BOOTSTRAP_TOKEN; không đưa token vào app config. Khi deploy Vercel, cấu hình các biến tương ứng trên server rồi xóa token sau khi tạo owner.",
  );
} finally {
  await client.close();
}
