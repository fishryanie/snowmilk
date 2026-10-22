import { loadEnvConfig } from "@next/env";
import { isDeepStrictEqual } from "node:util";
import { MongoClient, type Document } from "mongodb";
import { getMongoConfig } from "@/lib/mongodb-config";

// Read only: never call store list/detail methods, which also expire orders.
loadEnvConfig(process.cwd());
const { uri, dbName } = getMongoConfig();
const client = new MongoClient(uri, {
  appName: "snowmilk-storefront-orders-profile",
  serverSelectionTimeoutMS: 8_000,
  maxPoolSize: 2,
});

const withoutImages = (rows: Document[]) => rows.map((row) => ({
  ...row,
  quote: {
    ...row.quote,
    lines: row.quote.lines.map((line: Document) => ({ ...line, imageUrl: "" })),
  },
}));

try {
  const started = performance.now();
  await client.connect();
  console.log(JSON.stringify({ connectionMs: Math.round(performance.now() - started) }));
  const orders = client.db(dbName).collection("storefront_orders");
  const filter = { storeId: process.env.STOREFRONT_STORE_ID || "milk-shop" };
  let full: Document[] = [];
  let compact: Document[] = [];
  for (const includeImages of [true, false]) {
    const projection = { receipt: 0, payment: 0, ...(!includeImages ? { "quote.lines.imageUrl": 0 } : {}) };
    const times: number[] = [];
    let rows: Document[] = [];
    for (let run = 0; run < 3; run++) {
      const before = performance.now();
      rows = await orders.find(filter, { projection, maxTimeMS: 5_000 }).sort({ _id: -1 }).limit(51).toArray();
      times.push(Math.round(performance.now() - before));
    }
    if (includeImages) full = rows;
    else compact = withoutImages(rows);
    const explanation = await orders.find(filter, { projection, maxTimeMS: 5_000 })
      .sort({ _id: -1 }).limit(51).explain("executionStats");
    console.log(JSON.stringify({
      query: includeImages ? "orders-with-images" : "orders-without-images",
      roundTripMs: times,
      returned: rows.length,
      bytes: Buffer.byteLength(JSON.stringify(includeImages ? rows : compact)),
      serverMs: explanation.executionStats.executionTimeMillis,
      docsExamined: explanation.executionStats.totalDocsExamined,
      keysExamined: explanation.executionStats.totalKeysExamined,
    }));
  }
  console.log(JSON.stringify({ sameOrdersExceptImages: isDeepStrictEqual(withoutImages(full), compact) }));
  const summaryProjection = { code: 1, status: 1, createdAt: 1, "customer.name": 1, "customer.phone": 1, "quote.total": 1 };
  const summaryTimes: number[] = [];
  let summaries: Document[] = [];
  for (let run = 0; run < 3; run++) {
    const before = performance.now();
    summaries = await orders.find(filter, { projection: summaryProjection, maxTimeMS: 5_000 })
      .sort({ _id: -1 }).limit(51).toArray();
    summaryTimes.push(Math.round(performance.now() - before));
  }
  const summaryDto = summaries.slice(0, 50).map((o) => ({
    id: String(o._id), code: o.code, status: o.status, createdAt: o.createdAt.toISOString(), customer: o.customer, total: o.quote.total,
  }));
  const expectedSummary = full.slice(0, 50).map((o) => ({
    id: String(o._id), code: o.code, status: o.status, createdAt: o.createdAt.toISOString(),
    customer: { name: o.customer.name, phone: o.customer.phone }, total: o.quote.total,
  }));
  if (!isDeepStrictEqual(summaryDto, expectedSummary)) throw new Error("Admin summary changed table values.");
  const plan = await orders.find(filter, { projection: summaryProjection, maxTimeMS: 5_000 })
    .sort({ _id: -1 }).limit(51).explain("executionStats");
  console.log(JSON.stringify({
    query: "admin-orders-summary", roundTripMs: summaryTimes, returned: summaryDto.length,
    queryBytes: Buffer.byteLength(JSON.stringify(summaries)), responseBytes: Buffer.byteLength(JSON.stringify({ orders: summaryDto, nextCursor: summaries.length > 50 ? String(summaries[49]._id) : null })),
    sameTableValues: true, serverMs: plan.executionStats.executionTimeMillis,
    docsExamined: plan.executionStats.totalDocsExamined, keysExamined: plan.executionStats.totalKeysExamined,
    hasBlockingSort: JSON.stringify(plan.queryPlanner.winningPlan).includes('"stage":"SORT"'),
  }));
  console.log(JSON.stringify({ orderIndexes: (await orders.listIndexes().toArray()).map(({ key }) => key) }));
  // Only identifiers are transferred for the expiry scan; no order mutations.
  const before = performance.now();
  const stale = await orders.find({
    ...filter, status: "awaiting_payment", expiresAt: { $lte: new Date() },
  }, { projection: { _id: 1 }, maxTimeMS: 5_000 }).limit(100).toArray();
  console.log(JSON.stringify({ query: "orders-expiry-scan", roundTripMs: Math.round(performance.now() - before), returned: stale.length }));
} finally {
  await client.close();
}
