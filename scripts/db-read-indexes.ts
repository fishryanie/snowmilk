import { loadEnvConfig } from "@next/env";
import { MongoClient } from "mongodb";
import { dbReadIndexes } from "@/lib/db-read-indexes";
import { getMongoConfig } from "@/lib/mongodb-config";

loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const collectionFilter = process.argv.find((arg) => arg.startsWith("--collection="))?.slice("--collection=".length);
if (collectionFilter && !dbReadIndexes[collectionFilter]) throw new Error("Collection không có trong danh sách index đọc.");
const { uri, dbName } = getMongoConfig();
const client = new MongoClient(uri, {
  appName: "snowmilk-read-indexes",
  serverSelectionTimeoutMS: 8_000,
});

try {
  await client.connect();
  const db = client.db(dbName);
  const collections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  console.log(`${apply ? "Apply" : "Dry-run"} read indexes: ${dbName}`);
  for (const [collection, indexes] of Object.entries(dbReadIndexes)) {
    if (collectionFilter && collection !== collectionFilter) continue;
    // Never create collections or migrate documents as part of index tuning.
    if (!collections.has(collection)) continue;
    const existing = await db.collection(collection).listIndexes().toArray();
    for (const { name, key } of indexes) {
      if (existing.some((index) => JSON.stringify(index.key) === JSON.stringify(key))) continue;
      console.log(`${collection}: ${name} ${JSON.stringify(key)}`);
      if (apply) await db.collection(collection).createIndex(key, { name });
    }
  }
  if (!apply) console.log("Dùng --apply để thêm các index trên; không xóa index hay sửa dữ liệu.");
} finally {
  await client.close();
}
