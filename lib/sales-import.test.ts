import { describe, expect, test } from 'bun:test';
import { dailyClosingsFromWorkbook } from './sales-import';

describe('workbook closing import', () => {
  test('folds known payment methods into one Vietnam day without cost snapshots', () => {
    expect(dailyClosingsFromWorkbook([
      { saleDate: '2026-10-01T10:00:00Z', paymentMethod: 'Tiền mặt', netRevenue: 100, totalVariableCost: 10 },
      { saleDate: '2026-10-01T16:00:00Z', paymentMethod: 'Chuyển khoản', netRevenue: 200 },
      { saleDate: '2026-10-01T17:00:00Z', paymentMethod: 'Tiền mặt', netRevenue: 50 },
    ])).toEqual([
      { saleDate: new Date('2026-09-30T17:00:00Z'), cashReceived: 100, bankTransferReceived: 200 },
      { saleDate: new Date('2026-10-01T17:00:00Z'), cashReceived: 50, bankTransferReceived: 0 },
    ]);
  });
  test('refuses to invent a payment split for unknown methods', () => {
    expect(() => dailyClosingsFromWorkbook([{ saleDate: '2026-10-01', paymentMethod: 'Khác', netRevenue: 100 }])).toThrow('phân loại');
  });
});
