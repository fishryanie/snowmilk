import { vietnamDateKey, vietnamDayBoundary } from './vietnam-date';

/** Workbook rows are folded into one closing per Vietnam day before persistence. */
export function dailyClosingsFromWorkbook(rows: Record<string, unknown>[]) {
  const days = new Map<string, { saleDate: Date; cashReceived: number; bankTransferReceived: number }>();
  for (const row of rows) {
    const day = vietnamDateKey(new Date(row.saleDate as string | Date));
    const amount = Number(row.netRevenue ?? 0);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Doanh thu workbook ngày ${day} không hợp lệ.`);
    if (!['Tiền mặt', 'Chuyển khoản'].includes(String(row.paymentMethod))) {
      throw new Error(`Ngày ${day}: cần phân loại tiền mặt hoặc chuyển khoản trước khi nhập workbook.`);
    }
    const record = days.get(day) ?? { saleDate: vietnamDayBoundary(day), cashReceived: 0, bankTransferReceived: 0 };
    if (row.paymentMethod === 'Tiền mặt') record.cashReceived += amount;
    else record.bankTransferReceived += amount;
    if (!Number.isSafeInteger(record.cashReceived + record.bankTransferReceived)) throw new Error(`Doanh thu ngày ${day} quá lớn.`);
    days.set(day, record);
  }
  return [...days.values()];
}
