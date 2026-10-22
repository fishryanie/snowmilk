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
