import type { CreateProductionBatchInput } from "@/lib/validators/v2/production-batches";
import type { CreateStockCountInput } from "@/lib/validators/v2/stock-counts";
import type { CreatePurchaseReceiptInput } from "@/lib/validators/v2/purchase-receipts";
import { sha256Canonical } from "@/lib/v2/canonical";
import { DomainError } from "@/services/v2/errors";
function canonicalDecimal(value: string | undefined) {
  if (value == null) return null;
  const [whole, fraction = ""] = value.split(".");
  const canonicalFraction = fraction.replace(/0+$/, "");
  return canonicalFraction ? `${whole}.${canonicalFraction}` : whole;
}

function canonicalInstant(value: string | undefined) {
  return value == null ? null : new Date(value).toISOString();
}

export function productionBatchRequestHash(input: CreateProductionBatchInput) {
  return sha256Canonical({
    businessDate: input.businessDate,
    recipeVersionId: input.recipeVersionId.toLowerCase(),
    startedAt: canonicalInstant(input.startedAt),
    plannedOutputQuantity: input.plannedOutputQuantity,
    expiresAt: canonicalInstant(input.expiresAt),
    note: input.note,
  });
}

export function stockCountRequestHash(input: CreateStockCountInput) {
  return sha256Canonical({
    countedAt: canonicalInstant(input.countedAt),
    note: input.note,
    lines: [...input.lines]
      .map((line) => ({
        inventoryItemId: line.inventoryItemId.toLowerCase(),
        inventoryLotId: line.inventoryLotId?.toLowerCase() ?? null,
        countedQuantity: canonicalDecimal(line.countedQuantity),
        unitCostVnd: canonicalDecimal(line.unitCostVnd),
        note: line.note,
      }))
      .sort((left, right) => {
        const leftKey = `${left.inventoryItemId}:${left.inventoryLotId ?? ""}`;
        const rightKey = `${right.inventoryItemId}:${right.inventoryLotId ?? ""}`;
        return leftKey.localeCompare(rightKey);
      }),
  });
}

export function purchaseReceiptRequestHash(input: CreatePurchaseReceiptInput) {
  return sha256Canonical({
    businessDate: input.businessDate,
    receivedAt: canonicalInstant(input.receivedAt),
    supplierName: input.supplierName,
    supplierContact: input.supplierContact,
    note: input.note,
    lines: input.lines.map((line) => ({
      inventoryItemId: line.inventoryItemId.toLowerCase(),
      quantity: canonicalDecimal(line.quantity),
      totalAmountVnd: line.totalAmountVnd,
      lotCode: line.lotCode?.toLocaleUpperCase("vi-VN") ?? null,
      expiresAt: canonicalInstant(line.expiresAt),
    })),
  });
}

export function assertWriteReplay(
  storedRequestHash: unknown,
  expectedRequestHash: string,
  label: string,
) {
  if (storedRequestHash !== expectedRequestHash) {
    throw new DomainError(
      `Idempotency key đã được dùng với ${label} khác.`,
      409,
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
}
