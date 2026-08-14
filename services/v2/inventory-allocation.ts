import { DomainError } from "@/services/v2/errors";

export type AvailableLot = {
  balanceId: string;
  inventoryLotId: string | null;
  availableQuantity: string;
  unitCostVnd: string | null;
  costDataQuality?: "complete" | "missing_cost" | "estimated" | "legacy";
  expiresAt?: Date | null;
  producedAt?: Date | null;
};

export type LotAllocation = AvailableLot & { quantity: number };

export function allocateFefo(
  lots: readonly AvailableLot[],
  requestedQuantity: number,
): LotAllocation[] {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 0) {
    throw new DomainError("Số lượng bán phải là số nguyên không âm.");
  }
  let remaining = requestedQuantity;
  const allocations: LotAllocation[] = [];
  const sorted = [...lots].sort((left, right) => {
    const leftExpiry = left.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightExpiry = right.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
    const leftProduced = left.producedAt?.getTime() ?? 0;
    const rightProduced = right.producedAt?.getTime() ?? 0;
    return leftProduced - rightProduced || left.balanceId.localeCompare(right.balanceId);
  });

  for (const lot of sorted) {
    if (remaining === 0) break;
    const available = Number(lot.availableQuantity);
    if (!Number.isSafeInteger(available) || available <= 0) continue;
    const quantity = Math.min(remaining, available);
    allocations.push({ ...lot, quantity });
    remaining -= quantity;
  }
  if (remaining > 0) {
    throw new DomainError(
      `Không đủ thành phẩm: cần ${requestedQuantity}, còn ${requestedQuantity - remaining}.`,
      409,
      "INSUFFICIENT_FINISHED_STOCK",
      { requestedQuantity, availableQuantity: requestedQuantity - remaining },
    );
  }
  return allocations;
}
