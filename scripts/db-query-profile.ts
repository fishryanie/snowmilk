import { loadEnvConfig } from "@next/env";
import { MongoClient, type Document, type Sort } from "mongodb";
import { getMongoConfig } from "@/lib/mongodb-config";

loadEnvConfig(process.cwd());
const { uri, dbName } = getMongoConfig();
const client = new MongoClient(uri, {
  appName: "snowmilk-query-profile",
  serverSelectionTimeoutMS: 8_000,
  maxPoolSize: 4,
});

const queries: Array<{
  name: string;
  collection: string;
  filter: Document;
  sort: Sort;
}> = [
  { name: "purchase-list", collection: "purchases", filter: {}, sort: { purchaseDate: -1, createdAt: -1 } },
  { name: "ingredients-list", collection: "ingredients", filter: {}, sort: { createdAt: -1 } },
  { name: "sales-history", collection: "sales", filter: {}, sort: { saleDate: -1 } },
  { name: "catalogue-ingredients", collection: "ingredients", filter: { isActive: true }, sort: { category: 1, name: 1 } },
  { name: "products-list", collection: "products", filter: {}, sort: { createdAt: -1 } },
  { name: "expenses-list", collection: "expenses", filter: {}, sort: { createdAt: -1 } },
  { name: "equipment-list", collection: "equipment", filter: {}, sort: { createdAt: -1 } },
  { name: "batch-history", collection: "milkbatches", filter: {}, sort: { cookedAt: -1, createdAt: -1 } },
];

function planStages(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [
    ...(typeof object.stage === "string" ? [object.stage] : []),
    ...Object.values(object).flatMap(planStages),
  ];
}

try {
  const started = performance.now();
  await client.connect();
  const db = client.db(dbName);
  console.log(JSON.stringify({ database: dbName, connectionMs: Math.round(performance.now() - started) }));
  for (const query of queries) {
    const times: number[] = [];
    let bytes = 0;
    for (let run = 0; run < 3; run += 1) {
      const before = performance.now();
      const rows = await db.collection(query.collection)
        .find(query.filter, { maxTimeMS: 10_000 })
        .sort(query.sort).limit(250).toArray();
      times.push(Math.round(performance.now() - before));
      bytes = Buffer.byteLength(JSON.stringify(rows));
    }
    const explanation = await db.collection(query.collection)
      .find(query.filter, { maxTimeMS: 10_000 })
      .sort(query.sort).limit(250).explain("executionStats");
    console.log(JSON.stringify({
      query: query.name,
      roundTripMs: times,
      medianMs: times.toSorted((a, b) => a - b)[1],
      bytes,
      returned: explanation.executionStats.nReturned,
      docsExamined: explanation.executionStats.totalDocsExamined,
      keysExamined: explanation.executionStats.totalKeysExamined,
      serverMs: explanation.executionStats.executionTimeMillis,
      stages: [...new Set(planStages(explanation.queryPlanner.winningPlan))],
    }));
  }
} finally {
  await client.close();
}
