const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

type ParsedUnsignedDecimal = {
  coefficient: bigint;
  scale: number;
};

function parseUnsignedDecimal(value: string, label: string): ParsedUnsignedDecimal {
  const normalized = value.trim();
  const match = normalized.match(/^(?:0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new RangeError(`${label} không phải số thập phân không âm.`);
  const fraction = match[1] ?? "";
  return {
    coefficient: BigInt(normalized.replace(".", "")),
    scale: fraction.length,
  };
}

function powerOfTen(exponent: number) {
  return BigInt(10) ** BigInt(exponent);
}

function formatDecimal(coefficient: bigint, scale: number) {
  if (coefficient < BigInt(0)) throw new RangeError("Giá trị thập phân phải không âm.");
  if (scale === 0) return String(coefficient);
  const raw = String(coefficient).padStart(scale + 1, "0");
  const whole = raw.slice(0, -scale);
  const fraction = raw.slice(-scale).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function addUnsignedDecimals(leftValue: string, rightValue: string) {
  const left = parseUnsignedDecimal(leftValue, "Số lượng hiện tại");
  const right = parseUnsignedDecimal(rightValue, "Số lượng nhập");
  const scale = Math.max(left.scale, right.scale);
  const coefficient =
    left.coefficient * powerOfTen(scale - left.scale) +
    right.coefficient * powerOfTen(scale - right.scale);
  return formatDecimal(coefficient, scale);
}

/**
 * Derives a fixed-precision VND/base-unit rate using integer arithmetic only.
 * The final Decimal128 string is rounded half-up at nine decimal places.
 */
export function deriveUnitCostVnd(
  totalAmountVnd: number,
  quantityValue: string,
  precision = 9,
) {
  if (!Number.isSafeInteger(totalAmountVnd) || totalAmountVnd <= 0) {
    throw new RangeError("Thành tiền phải là số nguyên VND dương an toàn.");
  }
  const quantity = parseUnsignedDecimal(quantityValue, "Số lượng nhập");
  if (quantity.coefficient === BigInt(0)) {
    throw new RangeError("Số lượng nhập phải lớn hơn 0.");
  }
  const numerator =
    BigInt(totalAmountVnd) * powerOfTen(quantity.scale + precision);
  const rounded =
    (numerator * BigInt(2) + quantity.coefficient) /
    (quantity.coefficient * BigInt(2));
  return formatDecimal(rounded, precision);
}

export function sumVndExact(values: readonly number[], label = "Tổng tiền") {
  const sum = values.reduce((current, value) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} phải gồm các số nguyên VND không âm an toàn.`);
    }
    return current + BigInt(value);
  }, BigInt(0));
  if (sum > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError(`${label} vượt quá giới hạn số nguyên an toàn.`);
  }
  return Number(sum);
}
