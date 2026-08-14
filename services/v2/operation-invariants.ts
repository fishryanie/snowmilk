import { createHash } from "node:crypto";
import { sha256Canonical } from "@/lib/v2/canonical";
import { multiplyDecimalRateToVnd } from "@/lib/v2/money";

export type PersistedSalesTotals = {
  grossRevenueVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  collectedVnd: number;
};

export function persistedSalesTotals(
  totals: PersistedSalesTotals & { paymentDifferenceVnd?: number },
): PersistedSalesTotals {
  return {
    grossRevenueVnd: totals.grossRevenueVnd,
    discountVnd: totals.discountVnd,
    refundVnd: totals.refundVnd,
    netRevenueVnd: totals.netRevenueVnd,
    collectedVnd: totals.collectedVnd,
  };
}

export function operationKeySuffix(idempotencyKey: string) {
  return createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12);
}

export function salesOperationRequestHash(
  operation: "close" | "reopen",
  businessDate: string,
  input: { version: number; reason?: string },
) {
  return sha256Canonical({
    operation,
    businessDate,
    version: input.version,
    ...(operation === "reopen" ? { reason: input.reason ?? "" } : {}),
  });
}

export function decimalDifference(left: string, right: string) {
  const places = Math.max(
    left.split(".")[1]?.length ?? 0,
    right.split(".")[1]?.length ?? 0,
  );
  const scale = BigInt(10) ** BigInt(places);
  const scaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * scale + BigInt(fraction.padEnd(places, "0") || "0");
  };
  const result = scaled(left) - scaled(right);
  const sign = result < BigInt(0) ? "-" : "";
  const absolute = result < BigInt(0) ? -result : result;
  const whole = absolute / scale;
  const fraction = String(absolute % scale)
    .padStart(places, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function reversalRevenueSnapshot(entry: {
  quantity: string;
  quantitySource: string;
  salesUnitSnapshot: string;
  grossRevenueVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  cogsVnd: number | null;
  profitVnd: number | null;
}) {
  return {
    quantity: decimalDifference("0", entry.quantity),
    quantitySource: entry.quantitySource,
    salesUnitSnapshot: entry.salesUnitSnapshot,
    grossRevenueVnd: -entry.grossRevenueVnd,
    discountVnd: -entry.discountVnd,
    refundVnd: -entry.refundVnd,
    netRevenueVnd: -entry.netRevenueVnd,
    cogsVnd: entry.cogsVnd == null ? null : -entry.cogsVnd,
    profitVnd: entry.profitVnd == null ? null : -entry.profitVnd,
  };
}

export function stockCountAmounts({
  expectedQuantity,
  countedQuantity,
  averageUnitCostVnd,
  costDataQuality,
}: {
  expectedQuantity: string;
  countedQuantity: string;
  averageUnitCostVnd: string | null;
  costDataQuality: string | null | undefined;
}) {
  const varianceQuantity = decimalDifference(
    countedQuantity,
    expectedQuantity,
  );
  const hasKnownCost =
    costDataQuality === "complete" && averageUnitCostVnd != null;
  const varianceValueAbsolute = hasKnownCost
    ? multiplyDecimalRateToVnd(
        varianceQuantity.replace(/^-/, ""),
        averageUnitCostVnd,
      )
    : null;
  const varianceValueVnd =
    varianceValueAbsolute == null
      ? null
      : varianceQuantity.startsWith("-")
        ? -varianceValueAbsolute
        : varianceValueAbsolute;
  const countedInventoryValueVnd = hasKnownCost
    ? multiplyDecimalRateToVnd(countedQuantity, averageUnitCostVnd)
    : null;
  return {
    varianceQuantity,
    unitCostVnd: hasKnownCost ? averageUnitCostVnd : null,
    varianceValueVnd,
    countedInventoryValueVnd,
    costDataQuality: hasKnownCost ? "complete" : "missing_cost",
  } as const;
}
