import { isVietnamDateKey, vietnamDayBoundary } from './vietnam-date';

export class SalesHistoryQueryError extends Error {}

export function parseSalesHistoryQuery(params: URLSearchParams) {
  const view = params.get('view');
  const from = params.get('from');
  const to = params.get('to');
  const cursor = params.get('cursor');
  const limit = Number(params.get('limit') ?? (view === 'history' ? 50 : 250));
  if (view !== null && view !== 'history' && view !== 'record') throw new SalesHistoryQueryError('Chế độ xem doanh thu không hợp lệ.');
  if ((from !== null && !isVietnamDateKey(from)) || (to !== null && !isVietnamDateKey(to)))
    throw new SalesHistoryQueryError('Khoảng ngày doanh thu không hợp lệ.');
  if (from && to && from > to) throw new SalesHistoryQueryError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw new SalesHistoryQueryError('Giới hạn lịch sử phải từ 1 đến 250.');

  const filter: Record<string, unknown> = { entryMode: 'daily-summary' };
  if (from || to)
    filter.saleDate = {
      ...(from ? { $gte: vietnamDayBoundary(from) } : {}),
      ...(to ? { $lte: vietnamDayBoundary(to, true) } : {}),
    };
  if (cursor !== null) {
    const [date, id, extra] = cursor.split('|');
    const timestamp = new Date(date);
    if (view !== 'history' || extra !== undefined || !/^[a-f\d]{24}$/i.test(id ?? '') || Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== date)
      throw new SalesHistoryQueryError('Vị trí lịch sử không hợp lệ.');
    filter.$or = [{ saleDate: { $lt: timestamp } }, { saleDate: timestamp, _id: { $lt: id } }];
  }
  return { filter, limit, view };
}

export function salesHistoryCursor(sale: { saleDate: Date; _id: unknown }) {
  return sale.saleDate.toISOString() + '|' + String(sale._id);
}
