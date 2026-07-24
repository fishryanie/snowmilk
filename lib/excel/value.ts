import dayjs from "dayjs";
import type ExcelJS from "exceljs";

export function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    return "result" in value ? value.result ?? null : null;
  }
  if (value && typeof value === "object" && "text" in value) {
    return value.text;
  }
  return value ?? null;
}

export function textValue(cell: ExcelJS.Cell): string {
  const value = cellValue(cell);
  return value == null ? "" : String(value).trim();
}

export function numberValue(cell: ExcelJS.Cell): number {
  const value = cellValue(cell);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function dateValue(cell: ExcelJS.Cell): Date | null {
  const value = cellValue(cell);
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86_400_000);
  }
  const parsed = dayjs(String(value ?? ""));
  return parsed.isValid() ? parsed.toDate() : null;
}
