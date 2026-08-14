type ParsedDecimal = {
  coefficient: bigint;
  scale: number;
};

function powerOfTen(exponent: number) {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError("Số chữ số thập phân không hợp lệ.");
  }
  return BigInt(10) ** BigInt(exponent);
}

function expandExponential(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) return value;
  const integer = match[1];
  const fraction = match[2] ?? "";
  const exponent = Number(match[3]);
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError("Số mũ thập phân không hợp lệ.");
  }
  const digits = `${integer}${fraction}`;
  const point = integer.length + exponent;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${"0".repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function parseDecimal(value: unknown, label: string): ParsedDecimal {
  const source =
    typeof value === "number"
      ? Number.isFinite(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? value.trim()
        : value && typeof value === "object" && "toString" in value
          ? String(value)
          : "";
  const normalized = expandExponential(source);
  const match = normalized.match(/^(?:0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) {
    throw new RangeError(`${label} không phải số thập phân không âm.`);
  }
  const fraction = match[1] ?? "";
  return {
    coefficient: BigInt(normalized.replace(".", "")),
    scale: fraction.length,
  };
}

function formatDecimal({ coefficient, scale }: ParsedDecimal) {
  if (coefficient === BigInt(0)) return "0";
  let digits = coefficient.toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, "0");
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    digits = digits.replace(/0+$/, "").replace(/\.$/, "");
  }
  return digits.replace(/^0+(?=\d)/, "");
}

function greatestCommonDivisor(left: bigint, right: bigint) {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function exactDecimalString(value: unknown, label = "Giá trị") {
  return formatDecimal(parseDecimal(value, label));
}

export function shiftDecimal(
  value: unknown,
  decimalPlaces: number,
  label = "Giá trị",
) {
  const parsed = parseDecimal(value, label);
  if (!Number.isSafeInteger(decimalPlaces)) {
    throw new RangeError("Số vị trí dịch thập phân không hợp lệ.");
  }
  if (decimalPlaces >= 0) {
    if (parsed.scale >= decimalPlaces) {
      return formatDecimal({
        coefficient: parsed.coefficient,
        scale: parsed.scale - decimalPlaces,
      });
    }
    return formatDecimal({
      coefficient:
        parsed.coefficient * powerOfTen(decimalPlaces - parsed.scale),
      scale: 0,
    });
  }
  return formatDecimal({
    coefficient: parsed.coefficient,
    scale: parsed.scale - decimalPlaces,
  });
}

/**
 * Computes value × numerator ÷ denominator as a terminating decimal. It
 * refuses repeating results instead of rounding legacy recipe quantities.
 */
export function multiplyDecimalRatioExact(
  value: unknown,
  numerator: unknown,
  denominator: unknown,
  label = "Tỷ lệ",
) {
  const multiplicand = parseDecimal(value, `${label} value`);
  const top = parseDecimal(numerator, `${label} numerator`);
  const bottom = parseDecimal(denominator, `${label} denominator`);
  if (bottom.coefficient === BigInt(0)) {
    throw new RangeError(`${label} không thể chia cho 0.`);
  }

  let resultNumerator = multiplicand.coefficient * top.coefficient;
  let resultDenominator = bottom.coefficient;
  const exponent = bottom.scale - multiplicand.scale - top.scale;
  if (exponent >= 0) resultNumerator *= powerOfTen(exponent);
  else resultDenominator *= powerOfTen(-exponent);

  const divisor = greatestCommonDivisor(resultNumerator, resultDenominator);
  resultNumerator /= divisor;
  resultDenominator /= divisor;
  let twos = 0;
  let fives = 0;
  while (resultDenominator % BigInt(2) === BigInt(0)) {
    resultDenominator /= BigInt(2);
    twos += 1;
  }
  while (resultDenominator % BigInt(5) === BigInt(0)) {
    resultDenominator /= BigInt(5);
    fives += 1;
  }
  if (resultDenominator !== BigInt(1)) {
    throw new RangeError(`${label} tạo số thập phân lặp; từ chối tự làm tròn.`);
  }
  const scale = Math.max(twos, fives);
  resultNumerator *=
    BigInt(2) ** BigInt(scale - twos) *
    (BigInt(5) ** BigInt(scale - fives));
  return formatDecimal({ coefficient: resultNumerator, scale });
}

export type BaseInventoryUnit = "g" | "ml" | "each";

export function normalizeLegacyQuantity(
  quantity: unknown,
  unit: unknown,
  label = "Số lượng legacy",
): { quantity: string; unit: BaseInventoryUnit } {
  const normalizedUnit = String(unit ?? "")
    .trim()
    .toLocaleLowerCase("vi");
  if (["l", "lit", "liter", "litre", "lít"].includes(normalizedUnit)) {
    return { quantity: shiftDecimal(quantity, 3, label), unit: "ml" };
  }
  if (["ml", "milliliter", "millilitre"].includes(normalizedUnit)) {
    return { quantity: exactDecimalString(quantity, label), unit: "ml" };
  }
  if (["kg", "kilogram"].includes(normalizedUnit)) {
    return { quantity: shiftDecimal(quantity, 3, label), unit: "g" };
  }
  if (["g", "gram"].includes(normalizedUnit)) {
    return { quantity: exactDecimalString(quantity, label), unit: "g" };
  }
  if (
    ["each", "cái", "chai", "hộp", "bộ", "trái", "quả", "cuộn"].includes(
      normalizedUnit,
    )
  ) {
    return { quantity: exactDecimalString(quantity, label), unit: "each" };
  }
  throw new RangeError(`${label} dùng đơn vị chưa hỗ trợ: ${String(unit ?? "")}.`);
}

export function normalizeLegacyCostRate(
  unitCost: unknown,
  costUnit: unknown,
  expectedBaseUnit: BaseInventoryUnit,
  label = "Đơn giá legacy",
) {
  const normalized = normalizeLegacyQuantity(1, costUnit, `${label} costUnit`);
  if (normalized.unit !== expectedBaseUnit) {
    throw new RangeError(
      `${label} có costUnit không cùng chiều với nguyên liệu (${normalized.unit}/${expectedBaseUnit}).`,
    );
  }
  return multiplyDecimalRatioExact(
    unitCost,
    1,
    normalized.quantity,
    `${label} về đơn vị gốc`,
  );
}
