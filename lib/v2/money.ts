const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function assertSafeNonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} phải là số nguyên không âm an toàn.`);
  }
  return value;
}

function safeBigIntToNumber(value: bigint, label: string) {
  if (value < BigInt(0) || value > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError(`${label} vượt quá giới hạn số nguyên an toàn.`);
  }
  return Number(value);
}

export function assertVnd(value: number, label = "Số tiền VND") {
  return assertSafeNonNegativeInteger(value, label);
}

export function multiplyVnd(
  quantity: number,
  unitPriceVnd: number,
  label = "Thành tiền",
) {
  assertSafeNonNegativeInteger(quantity, "Số lượng");
  assertVnd(unitPriceVnd, "Đơn giá VND");
  return safeBigIntToNumber(BigInt(quantity) * BigInt(unitPriceVnd), label);
}

type ParsedDecimal = { coefficient: bigint; scale: number };

function parseUnsignedDecimal(value: string, label: string): ParsedDecimal {
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

/**
 * Multiplies fixed-precision decimal quantity and cost rate, then rounds the
 * resulting VND to the nearest integer using round-half-up. No Number-based
 * floating point participates in the calculation.
 */
export function multiplyDecimalRateToVnd(
  quantityDecimal: string,
  unitCostDecimal: string,
) {
  const quantity = parseUnsignedDecimal(quantityDecimal, "Số lượng");
  const unitCost = parseUnsignedDecimal(unitCostDecimal, "Đơn giá cost");
  const scale = quantity.scale + unitCost.scale;
  const raw = quantity.coefficient * unitCost.coefficient;
  if (scale === 0) return safeBigIntToNumber(raw, "Thành tiền cost");
  const divisor = powerOfTen(scale);
  const rounded = (raw * BigInt(2) + divisor) / (divisor * BigInt(2));
  return safeBigIntToNumber(rounded, "Thành tiền cost");
}

export type ProportionalWeight = {
  key: string;
  weight: number;
};

/**
 * Allocate an integer VND amount using the largest-remainder method. Ties are
 * resolved by key, so retries and differently ordered inputs produce the same
 * allocation.
 */
export function allocateVndProportionally(
  amountVnd: number,
  weightedItems: readonly ProportionalWeight[],
) {
  assertVnd(amountVnd, "Số tiền cần phân bổ");
  if (new Set(weightedItems.map(({ key }) => key)).size !== weightedItems.length) {
    throw new Error("Khóa phân bổ phải duy nhất.");
  }

  const weights = weightedItems.map(({ key, weight }, index) => ({
    key,
    index,
    weight: assertSafeNonNegativeInteger(weight, `Trọng số ${key}`),
  }));
  const totalWeight = weights.reduce(
    (sum, item) => sum + BigInt(item.weight),
    BigInt(0),
  );

  if (totalWeight === BigInt(0)) {
    if (amountVnd > 0) {
      throw new Error("Không thể phân bổ tiền khi tổng trọng số bằng 0.");
    }
    return Object.fromEntries(weights.map(({ key }) => [key, 0]));
  }

  const amount = BigInt(amountVnd);
  const allocations = weights.map((item) => {
    const numerator = amount * BigInt(item.weight);
    return {
      ...item,
      allocated: numerator / totalWeight,
      remainder: numerator % totalWeight,
    };
  });
  const allocatedFloor = allocations.reduce(
    (sum, item) => sum + item.allocated,
    BigInt(0),
  );
  const leftover = safeBigIntToNumber(amount - allocatedFloor, "Phần dư");

  const remainderOrder = [...allocations].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.key.localeCompare(right.key) || left.index - right.index;
  });
  for (let index = 0; index < leftover; index += 1) {
    remainderOrder[index].allocated += BigInt(1);
  }

  return Object.fromEntries(
    allocations.map(({ key, allocated }) => [
      key,
      safeBigIntToNumber(allocated, `Phân bổ ${key}`),
    ]),
  );
}

export type SalesCalculationLineInput = {
  lineKey: string;
  skuId: string;
  quantity: number;
  unitPriceVnd: number;
  discountVnd?: number;
  refundVnd?: number;
};

export type SalesPaymentInput = {
  cashVnd?: number;
  bankTransferVnd?: number;
  otherVnd?: number;
};

function sumSafeVnd(values: readonly number[], label: string) {
  const total = values.reduce((sum, value) => sum + BigInt(value), BigInt(0));
  return safeBigIntToNumber(total, label);
}

export function calculateSalesDay(
  inputLines: readonly SalesCalculationLineInput[],
  globalDiscountVnd = 0,
  payments: SalesPaymentInput = {},
) {
  if (new Set(inputLines.map(({ lineKey }) => lineKey)).size !== inputLines.length) {
    throw new Error("lineKey phải duy nhất trong một ngày bán.");
  }

  const baseLines = inputLines.map((line) => {
    const grossRevenueVnd = multiplyVnd(
      line.quantity,
      line.unitPriceVnd,
      `Doanh thu ${line.lineKey}`,
    );
    const directDiscountVnd = assertVnd(
      line.discountVnd ?? 0,
      `Giảm giá ${line.lineKey}`,
    );
    const refundVnd = assertVnd(line.refundVnd ?? 0, `Hoàn tiền ${line.lineKey}`);
    if (directDiscountVnd + refundVnd > grossRevenueVnd) {
      throw new Error(
        `Giảm giá và hoàn tiền của ${line.lineKey} vượt doanh thu gộp.`,
      );
    }
    return { ...line, grossRevenueVnd, directDiscountVnd, refundVnd };
  });

  const allocatedGlobalDiscount = allocateVndProportionally(
    assertVnd(globalDiscountVnd, "Giảm giá chung"),
    baseLines.map(({ lineKey, grossRevenueVnd }) => ({
      key: lineKey,
      weight: grossRevenueVnd,
    })),
  );
  const lines = baseLines.map((line) => {
    const sharedDiscountVnd = allocatedGlobalDiscount[line.lineKey] ?? 0;
    const discountVnd = line.directDiscountVnd + sharedDiscountVnd;
    const netRevenueVnd =
      line.grossRevenueVnd - discountVnd - line.refundVnd;
    if (netRevenueVnd < 0) {
      throw new Error(
        `Phân bổ giảm giá làm doanh thu ${line.lineKey} âm; hãy giảm chiết khấu.`,
      );
    }
    return {
      lineKey: line.lineKey,
      skuId: line.skuId,
      quantity: line.quantity,
      unitPriceVnd: line.unitPriceVnd,
      grossRevenueVnd: line.grossRevenueVnd,
      directDiscountVnd: line.directDiscountVnd,
      sharedDiscountVnd,
      discountVnd,
      refundVnd: line.refundVnd,
      netRevenueVnd,
    };
  });

  const sum = (
    key: "grossRevenueVnd" | "discountVnd" | "refundVnd" | "netRevenueVnd",
  ) => sumSafeVnd(lines.map((line) => line[key]), `Tổng ${key}`);
  const cashVnd = assertVnd(payments.cashVnd ?? 0, "Tiền mặt");
  const bankTransferVnd = assertVnd(
    payments.bankTransferVnd ?? 0,
    "Tiền chuyển khoản",
  );
  const otherVnd = assertVnd(payments.otherVnd ?? 0, "Tiền phương thức khác");
  const collectedVnd = sumSafeVnd(
    [cashVnd, bankTransferVnd, otherVnd],
    "Tổng tiền đã thu",
  );
  const totals = {
    grossRevenueVnd: sum("grossRevenueVnd"),
    discountVnd: sum("discountVnd"),
    refundVnd: sum("refundVnd"),
    netRevenueVnd: sum("netRevenueVnd"),
    collectedVnd,
    paymentDifferenceVnd: collectedVnd - sum("netRevenueVnd"),
  };

  return {
    lines,
    payments: { cashVnd, bankTransferVnd, otherVnd },
    totals,
    canClose: totals.paymentDifferenceVnd === 0,
  };
}
