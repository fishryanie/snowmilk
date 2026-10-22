import { describe, expect, test } from 'bun:test';
import { parseSalesHistoryQuery } from './sales-history';

const query = (value: string) => parseSalesHistoryQuery(new URLSearchParams(value));

describe('compact sales history', () => {
  test('loads 50 rows by default without filtering by a removed mode', () => {
    expect(query('')).toEqual({ filter: {}, limit: 50 });
  });
  test('bounds both ends of a Vietnam day before limiting history', () => {
    expect(query('from=2026-10-07&to=2026-10-13&limit=50')).toEqual({
      filter: { saleDate: {
        $gte: new Date('2026-10-06T17:00:00.000Z'),
        $lte: new Date('2026-10-13T16:59:59.999Z'),
      } }, limit: 50,
    });
  });
  test('cursor narrows the selected date range without skip', () => {
    expect(query('from=2026-10-01&cursor=2026-10-07T17%3A00%3A00.000Z').filter).toEqual({ saleDate: {
      $gte: new Date('2026-09-30T17:00:00Z'), $lt: new Date('2026-10-07T17:00:00Z'),
    } });
  });
  test('rejects invalid ranges, limits and cursors', () => {
    for (const input of ['from=2026-02-30', 'to=2026-13-01', 'from=', 'from=2026-10-14&to=2026-10-13', 'limit=0', 'limit=251', 'limit=1.5', 'limit=', 'cursor=bad', 'cursor=2026-10-08', 'cursor='])
      expect(() => query(input)).toThrow();
  });
});
