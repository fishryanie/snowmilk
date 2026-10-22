import { describe, expect, test } from 'bun:test';
import { dailySaleSchema } from './sales';

const sale = { saleDate: '2026-08-08', cashReceived: 700_000, bankTransferReceived: 500_000 };

describe('simple daily closing validation', () => {
  test('accepts just the date and two amounts, including a day with zero takings', () => {
    expect(dailySaleSchema.parse(sale)).toEqual({ ...sale, overwrite: false });
    expect(dailySaleSchema.safeParse({ ...sale, cashReceived: 0, bankTransferReceived: 0 }).success).toBe(true);
  });
  test('rejects missing, negative, fractional, nonnumeric and excessive amounts', () => {
    for (const value of [undefined, null, '', '1000', -1, 0.5, NaN, Infinity, 1_000_000_000_001]) {
      for (const key of ['cashReceived', 'bankTransferReceived']) {
        expect(dailySaleSchema.safeParse({ ...sale, [key]: value }).success).toBe(false);
      }
    }
  });
  test('rejects invalid dates and every removed field', () => {
    expect(dailySaleSchema.safeParse({ ...sale, saleDate: '2026-02-30' }).success).toBe(false);
    for (const key of ['batchId', 'freshMilkBottleCount', 'productQuantities', 'note', 'netRevenue', 'totalVariableCost', 'estimatedProfit']) {
      expect(dailySaleSchema.safeParse({ ...sale, [key]: 1 }).success).toBe(false);
    }
  });
});
