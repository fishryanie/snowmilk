import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import mongoose, { type Connection, type Model } from 'mongoose';
import { Sale } from '../models/Sale';
import { parseSalesHistoryQuery } from './sales-history';

const uri = process.env.DB_PERFORMANCE_TEST_MONGODB_URI;
describe.skipIf(!uri)('simple daily closings (isolated MongoDB)', () => {
  let connection: Connection;
  let sales: Model<{ saleDate: Date; cashReceived: number; bankTransferReceived: number }>;
  const dbName = `snowmilk_sales_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const row = { saleDate: new Date('2026-10-01T17:00:00Z'), cashReceived: 123_000, bankTransferReceived: 456_000 };
  beforeAll(async () => {
    if (!uri?.startsWith('mongodb://127.0.0.1:27030/')) throw new Error('Only the isolated local test DB is allowed.');
    connection = await mongoose.createConnection(uri, { dbName }).asPromise();
    sales = connection.model<{ saleDate: Date; cashReceived: number; bankTransferReceived: number }>('SimpleSaleTest', Sale.schema, 'sales');
    await sales.init();
  });
  beforeEach(async () => { await sales.deleteMany({}); });
  afterAll(async () => { if (connection) { await connection.dropDatabase(); await connection.close(); } });
  test('stores three business fields without automatic snapshots or timestamps', async () => {
    await sales.create({ ...row, netRevenue: 999, items: [{ name: 'obsolete' }], estimatedProfit: 123 } as never);
    const saved = await sales.findOne().lean();
    expect(Object.keys(saved!).sort()).toEqual(['_id', 'saleDate', 'cashReceived', 'bankTransferReceived'].sort());
  });
  test('concurrent creates cannot duplicate a day', async () => {
    const results = await Promise.allSettled([sales.create(row), sales.create(row)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await sales.countDocuments()).toBe(1);
  });
  test('replacing an old closing removes every obsolete stored field', async () => {
    await connection.db!.collection('sales').insertOne({ ...row, netRevenue: 999, sizeSummaries: [{}], note: 'old', createdAt: new Date() });
    await sales.findOneAndReplace({ saleDate: row.saleDate }, { ...row, cashReceived: 99 }, { runValidators: true });
    const saved = await connection.db!.collection('sales').findOne();
    expect(Object.keys(saved!).sort()).toEqual(['_id', 'saleDate', 'cashReceived', 'bankTransferReceived'].sort());
    expect(saved!.cashReceived).toBe(99);
  });
  test('pages ordered history with the date index and no skip or missing days', async () => {
    await sales.insertMany(Array.from({ length: 85 }, (_, day) => ({ ...row, saleDate: new Date(row.saleDate.getTime() - day * 86400000) })));
    const read = (cursor?: string) => {
      const params = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) });
      return sales.find(parseSalesHistoryQuery(params).filter).sort({ saleDate: -1 }).limit(51).lean();
    };
    const first = (await read()).slice(0, 50);
    const next = await read(first.at(-1)!.saleDate.toISOString());
    expect(first).toHaveLength(50);
    expect(next).toHaveLength(35);
    expect(new Set([...first, ...next].map(record => record.saleDate.toISOString())).size).toBe(85);
    const plan = await connection.db!.collection('sales').find().sort({ saleDate: -1 }).limit(51).explain('executionStats');
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"');
    expect(plan.executionStats.totalDocsExamined).toBe(51);
  });
});
