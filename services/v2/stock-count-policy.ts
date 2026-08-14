import type { CreateStockCountInput } from "@/lib/validators/v2/stock-counts";
import type { V2Context } from "@/services/v2/context";
import { DomainError } from "@/services/v2/errors";

export function assertOpeningCostPolicy(
  context: Pick<V2Context, "role">,
  input: Pick<CreateStockCountInput, "lines">,
  countType: "opening" | "cycle",
) {
  const hasSuppliedCost = input.lines.some((line) => line.unitCostVnd != null);
  if (hasSuppliedCost && countType !== "opening") {
    throw new DomainError(
      "Chỉ phiếu mở kho đầu tiên được phép xác nhận đơn giá mở kho.",
      422,
      "UNIT_COST_ONLY_FOR_OPENING",
    );
  }
  if (countType === "opening" && context.role !== "owner") {
    throw new DomainError(
      "Chỉ owner có quyền xác nhận giá vốn mở kho.",
      403,
      "OPENING_COST_OWNER_REQUIRED",
    );
  }
}

export function assertCompleteOpeningCount(
  activeInventoryItemIds: readonly string[],
  countedInventoryItemIds: readonly string[],
) {
  const counted = new Set(countedInventoryItemIds);
  const missing = activeInventoryItemIds.filter((itemId) => !counted.has(itemId));
  const unexpected = countedInventoryItemIds.filter(
    (itemId) => !activeInventoryItemIds.includes(itemId),
  );
  if (missing.length || unexpected.length) {
    throw new DomainError(
      "Phiếu mở kho phải kiểm đủ toàn bộ hàng hóa đang hoạt động.",
      422,
      "OPENING_COUNT_INCOMPLETE",
      { missingInventoryItemIds: missing, unexpectedInventoryItemIds: unexpected },
    );
  }
}
