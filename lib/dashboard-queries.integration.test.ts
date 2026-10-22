import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, ObjectId, type Db } from "mongodb";
import {
  cumulativeSalesPipeline,
  expenseFacetPipeline,
  investmentFacetPipeline,
  type CumulativeSalesSummary,
  type ExpenseFacet,
  type InvestmentFacet,
} from "./dashboard-queries";
import { calculateOwnerInvestmentTotal } from "./investment-total";
import { dbReadIndexes } from "./db-read-indexes";
import { vietnamDayBoundary } from "./vietnam-date";

// Never use the application's Atlas credentials for fixtures.
const uri = process.env.DB_PERFORMANCE_TEST_MONGODB_URI;
describe.skipIf(!uri)("dashboard aggregates and read indexes (isolated MongoDB)", () => {
  let client: MongoClient;
  let db: Db;
  const dbName = `snowmilk_query_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const range = { $gte: vietnamDayBoundary("2026-10-01"), $lte: vietnamDayBoundary("2026-10-13", true) };

  beforeAll(async () => {
    if (!uri || !/^mongodb:\/\/127\.0\.0\.1:27030\//.test(uri)) {
      throw new Error("Only the dedicated localhost:27030 test database is allowed.");
    }
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
  });
  beforeEach(async () => {
    for (const name of ["purchases", "expenses", "sales", "ingredients"]) {
      await db.collection(name).deleteMany({});
    }
  });
  afterAll(async () => {
    if (db) {
      if (db.databaseName !== dbName) throw new Error("Refusing to clean up another database.");
      await db.dropDatabase();
    }
    await client?.close();
  });

  test("empty collections return empty period rows and no invented revenue", async () => {
    const [finance] = await db.collection("purchases")
      .aggregate<InvestmentFacet>(investmentFacetPipeline(range)).toArray();
    expect(finance).toEqual({ period: [], investments: [], summary: [] });
    expect(await db.collection("sales").aggregate(cumulativeSalesPipeline).toArray()).toEqual([]);
  });

  test("keeps legacy paid defaults and unpaid expenses distinct", async () => {
    await db.collection("expenses").insertMany([
      { expenseDate: range.$gte, amount: 100, fundingSource: "sales_revenue", paymentStatus: "paid" },
      { expenseDate: range.$gte, amount: 200, fundingSource: "sales_revenue", paymentStatus: "unpaid" },
      { expenseDate: range.$lte, amount: 300, fundingSource: "sales_revenue", paymentStatus: null },
      { expenseDate: new Date("2026-09-01"), amount: 400 },
      { expenseDate: range.$gte, amount: 500, fundingSource: null, paymentStatus: "unpaid", accountingTreatment: "inventory_cost" },
    ]);
    const [facet] = await db.collection("expenses")
      .aggregate<ExpenseFacet>(expenseFacetPipeline(range)).toArray();
    expect(facet.summary[0]).toMatchObject({ total: 800, salesFundedTotal: 400 });
    expect(facet.period).toHaveLength(4);
    expect(facet.period.find((row) => row.amount === 500)?.accountingTreatment).toBe("inventory_cost");
  });

  test("preserves owner investment when claimed sources change funding or are deleted", async () => {
    const owner = new ObjectId();
    const claimed = new ObjectId();
    const rows = [
      { _id: owner, purchaseDate: range.$gte, totalAmount: 100, fundingSource: "owner_capital" },
      { _id: claimed, purchaseDate: range.$gte, totalAmount: 200, fundingSource: "sales_revenue" },
      { _id: new ObjectId(), purchaseDate: new Date("2026-09-01"), totalAmount: 300 },
      { _id: new ObjectId(), purchaseDate: range.$lte, totalAmount: 400, fundingSource: null },
      { _id: new ObjectId(), purchaseDate: range.$lte, totalAmount: 500, fundingSource: "loan" },
    ];
    await db.collection("purchases").insertMany(rows);
    const [facet] = await db.collection("purchases")
      .aggregate<InvestmentFacet>(investmentFacetPipeline(range)).toArray();
    expect(facet.summary[0]).toMatchObject({ total: 1500, salesFundedTotal: 200 });
    expect(facet.period).toHaveLength(4);
    const claims = [
      { sourceId: String(owner), sourceType: "purchase" as const, amount: 100 },
      { sourceId: String(claimed), sourceType: "purchase" as const, amount: 200 },
      { sourceId: String(new ObjectId()), sourceType: "purchase" as const, amount: 50 },
    ];
    const toInvestment = (row: InvestmentFacet["investments"][number]) => ({
      id: String(row._id), amount: row.totalAmount, fundingSource: row.fundingSource,
    });
    const original = calculateOwnerInvestmentTotal({ purchases: rows.map(toInvestment), equipment: [], claims });
    expect(calculateOwnerInvestmentTotal({ purchases: facet.investments.map(toInvestment), equipment: [], claims })).toBe(original);
    expect(original).toBe(1050);
  });

  test("revenue comes directly from the two amounts, ignoring stale computed values", async () => {
    await db.collection("sales").insertMany([
      { saleDate: new Date("2026-10-01T17:00:00Z"), cashReceived: 60, bankTransferReceived: 40, netRevenue: 999 },
      { saleDate: new Date("2026-10-02T17:00:00Z"), cashReceived: 10, bankTransferReceived: 20 },
      { saleDate: new Date("2026-10-03T17:00:00Z"), cashReceived: 0, bankTransferReceived: 0 },
    ]);
    const [summary] = await db.collection("sales").aggregate<CumulativeSalesSummary>(cumulativeSalesPipeline).toArray();
    expect(summary).toMatchObject({ totalRevenue: 130 });
  });

  test("purchase history returns the same ordered rows without a blocking sort", async () => {
    await db.collection("purchases").insertMany(Array.from({ length: 400 }, (_, index) => ({
      purchaseDate: new Date(Date.UTC(2026, 9, 1 + index % 10)),
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)),
      totalAmount: index,
    })));
    const query = () => db.collection("purchases").find().sort({ purchaseDate: -1, createdAt: -1 }).limit(25);
    const before = await query().toArray();
    const index = dbReadIndexes.purchases[0];
    await db.collection("purchases").createIndex(index.key, { name: index.name });
    expect(await query().toArray()).toEqual(before);
    const explanation = await query().explain("executionStats");
    expect(JSON.stringify(explanation.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
    expect(explanation.executionStats.totalDocsExamined).toBe(25);
  });
});
