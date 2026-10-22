import { isVietnamDateKey, vietnamDayBoundary } from './vietnam-date';

export class SalesHistoryQueryError extends Error {}

export function parseSalesHistoryQuery(params: URLSearchParams) {
  const from = params.get('from');
  const to = params.get('to');
  const cursor = params.get('cursor');
  const limit = Number(params.get('limit') ?? 50);
  if ((from !== null && !isVietnamDateKey(from)) || (to !== null && !isVietnamDateKey(to)))
    throw new SalesHistoryQueryError('Khoảng ngày doanh thu không hợp lệ.');
  if (from && to && from > to) throw new SalesHistoryQueryError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 250)
    throw new SalesHistoryQueryError('Giới hạn lịch sử phải từ 1 đến 250.');

  const dateFilter: Record<string, Date> = {
    ...(from ? { $gte: vietnamDayBoundary(from) } : {}),
    ...(to ? { $lte: vietnamDayBoundary(to, true) } : {}),
  };
  if (cursor !== null) {
    const timestamp = new Date(cursor);
    if (Number.isNaN(timestamp.valueOf()) || timestamp.toISOString() !== cursor)
      throw new SalesHistoryQueryError('Vị trí lịch sử không hợp lệ.');
    dateFilter.$lt = timestamp;
  }
  return { filter: Object.keys(dateFilter).length ? { saleDate: dateFilter } : {}, limit };
}
