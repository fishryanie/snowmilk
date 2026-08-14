import type { Decimal128 } from "mongodb";

export function decimalString(value: unknown) {
  if (value == null) return "0";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return (value as Decimal128).toString();
}

export function documentId(value: unknown) {
  return value == null ? null : String(value);
}
