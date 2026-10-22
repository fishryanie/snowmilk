import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadEnvConfig } from '@next/env';
import { BSON, MongoClient, type Document } from 'mongodb';
import { getMongoConfig } from '@/lib/mongodb-config';
import { vietnamDateKey, vietnamDayBoundary } from '@/lib/vietnam-date';

loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const { uri, dbName } = getMongoConfig();
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, appName: 'snowmilk-simplify-sales' });

function compact(row: Document) {
  for (const field of ['cashReceived', 'bankTransferReceived']) {
    if (!Number.isSafeInteger(row[field]) || row[field] < 0) throw new Error(`Bản ${row._id}: thiếu hoặc sai ${field}; dừng để tránh suy đoán tiền.`);
  }
  if (row.netRevenue != null && row.netRevenue !== row.cashReceived + row.bankTransferReceived) {
    throw new Error(`Bản ${row._id}: doanh thu cũ không khớp hai khoản tiền.`);
  }
  const date = new Date(row.saleDate);
  if (Number.isNaN(date.getTime())) throw new Error(`Bản ${row._id}: ngày không hợp lệ.`);
  return { _id: row._id, saleDate: vietnamDayBoundary(vietnamDateKey(date)), cashReceived: row.cashReceived, bankTransferReceived: row.bankTransferReceived };
}

try {
  await client.connect();
  const sales = client.db(dbName).collection('sales');
  const before = await sales.find().sort({ _id: 1 }).toArray();
  const after = before.map(compact);
  if (new Set(after.map(row => row.saleDate.toISOString())).size !== after.length) {
    throw new Error('Có nhiều bản cùng ngày; dừng để không tự cộng hoặc mất số tiền.');
  }
  const totals = (rows: Document[]) => rows.reduce((sum, row) => ({ cash: sum.cash + row.cashReceived, bank: sum.bank + row.bankTransferReceived }), { cash: 0, bank: 0 });
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: before.length, totals: totals(before), beforeBytes: BSON.calculateObjectSize({ rows: before }), afterBytes: BSON.calculateObjectSize({ rows: after }) }));
  if (apply) {
    const directory = path.resolve('backups/sales-simplify');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const backupPath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.ejson`);
    await writeFile(backupPath, BSON.EJSON.stringify({ dbName, collection: 'sales', documents: before, indexes: await sales.indexes() }, { relaxed: false }), { mode: 0o600, flag: 'wx' });
    console.log(`Backup: ${backupPath}`);
    const indexes = await sales.indexes();
    const dateIndex = indexes.find(index => isDeepStrictEqual(index.key, { saleDate: 1 }));
    if (dateIndex && !dateIndex.unique) await sales.dropIndex(dateIndex.name!);
    await sales.createIndex({ saleDate: 1 }, { name: 'saleDate_1', unique: true });
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const current = await sales.find({}, { session }).sort({ _id: 1 }).toArray();
        if (!isDeepStrictEqual(current, before)) throw new Error('Dữ liệu vừa thay đổi; hãy chạy lại để sao lưu bản mới nhất.');
        if (after.length) await sales.bulkWrite(after.map(row => ({ replaceOne: { filter: { _id: row._id }, replacement: row } })), { session });
      });
    } finally { await session.endSession(); }
    const actual = await sales.find().sort({ _id: 1 }).toArray();
    if (!isDeepStrictEqual(actual, after) || !isDeepStrictEqual(totals(actual), totals(before))) throw new Error('Đối soát sau khi dọn không khớp bản sao lưu.');
    for (const index of await sales.indexes()) {
      if (['_id_', 'saleDate_1'].includes(index.name!)) continue;
      await sales.dropIndex(index.name!);
    }
    const plan = await sales.find({}, { projection: { _id: 0, saleDate: 1, cashReceived: 1, bankTransferReceived: 1 } }).sort({ saleDate: -1 }).limit(51).explain('executionStats');
    console.log(JSON.stringify({ verified: true, records: actual.length, totals: totals(actual), indexes: (await sales.indexes()).map(index => index.name), docsExamined: plan.executionStats.totalDocsExamined, hasBlockingSort: JSON.stringify(plan.queryPlanner.winningPlan).includes('"stage":"SORT"') }));
  }
} finally { await client.close(); }
