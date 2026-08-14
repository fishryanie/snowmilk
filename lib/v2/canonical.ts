import { createHash } from "node:crypto";

function normalizeCanonical(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Không thể tạo checksum từ số không hữu hạn.");
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "_bsontype" in value &&
    (value as { _bsontype?: unknown })._bsontype === "Decimal128" &&
    "toString" in value
  ) {
    return String(value);
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toHexString" in value &&
    typeof (value as { toHexString?: unknown }).toHexString === "function"
  ) {
    return String(
      (value as { toHexString: () => string }).toHexString(),
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCanonical(item) ?? null);
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .flatMap((key) => {
          const normalized = normalizeCanonical(source[key]);
          return normalized === undefined ? [] : [[key, normalized]];
        }),
    );
  }
  throw new TypeError(`Không thể tạo checksum từ kiểu ${typeof value}.`);
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(normalizeCanonical(value));
}

export function sha256Canonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
