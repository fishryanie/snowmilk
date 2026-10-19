import { describe, expect, test } from 'bun:test';
import { parseSalesHistoryQuery, salesHistoryCursor } from './sales-history';

const query = (value: string) => parseSalesHistoryQuery(new URLSearchParams(value));

describe('sales history query', () => {
  test('keeps the existing full context API capped at 250', () => {
    expect(query('')).toEqual({ filter: { entryMode: 'daily-summary' }, limit: 250, view: null });
  });
  test('bounds both ends of a Vietnam day before limiting history', () => {
    const { filter, limit, view } = query('view=history&from=2026-10-07&to=2026-10-13&limit=50');
    expect(view).toBe('history');
    expect(limit).toBe(50);
    expect(filter.saleDate).toEqual({
      $gte: new Date('2026-10-06T17:00:00.000Z'),
      $lte: new Date('2026-10-13T16:59:59.999Z'),
    });
  });
  test('all history has no date restriction and still uses small pages', () => {
    expect(query('view=history')).toEqual({ filter: { entryMode: 'daily-summary' }, limit: 50, view: 'history' });
  });
  test('cursor orders tied dates by id without widening the selected range', () => {
    const sale = { saleDate: new Date('2026-10-07T17:00:00Z'), _id: '507f1f77bcf86cd799439011' };
    const cursor = salesHistoryCursor(sale);
    const parsed = query('view=history&from=2026-10-01&cursor=' + encodeURIComponent(cursor));
    expect(parsed.filter.saleDate).toEqual({ $gte: new Date('2026-09-30T17:00:00Z') });
    expect(parsed.filter.$or).toEqual([{ saleDate: { $lt: sale.saleDate } }, { saleDate: sale.saleDate, _id: { $lt: sale._id } }]);
  });
  test('rejects invalid ranges, limits, views and cursors', () => {
    for (const input of [
      'from=2026-02-30',
      'to=2026-13-01',
      'from=',
      'from=2026-10-14&to=2026-10-13',
      'limit=0',
      'limit=251',
      'limit=1.5',
      'limit=',
      'view=unknown',
      'view=history&cursor=bad',
      'view=history&cursor=2026-10-08|bad',
      'cursor=2026-10-07T17:00:00.000Z|507f1f77bcf86cd799439011',
    ])
      expect(() => query(input)).toThrow();
  });
});
