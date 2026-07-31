import { convertQuantity } from "./units";

export type PurchaseQuantityRecord = {
  packageCount?: number | null;
  packageQuantity?: number | null;
  convertedQuantity?: number | null;
  costUnit?: string | null;
  totalAmount?: number | null;
};

export type PurchaseSummary = {
  totalPurchasedPackages: number;
  totalPurchasedQuantity: number;
  totalPurchasedAmount: number;
  averageUnitCost: number;
};

function finiteNumber(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function purchaseQuantityInUnit(
  purchase: PurchaseQuantityRecord,
  targetUnit: string,
) {
  const quantity = finiteNumber(purchase.convertedQuantity);
  const sourceUnit = String(purchase.costUnit ?? "").trim() || targetUnit;
  return convertQuantity(quantity, sourceUnit, targetUnit);
}

export function summarizePurchases(
  purchases: PurchaseQuantityRecord[],
  targetUnit: string,
): PurchaseSummary {
  const totals = purchases.reduce(
    (summary, purchase) => ({
      totalPurchasedPackages:
        summary.totalPurchasedPackages +
        finiteNumber(purchase.packageCount),
      totalPurchasedQuantity:
        summary.totalPurchasedQuantity +
        purchaseQuantityInUnit(purchase, targetUnit),
      totalPurchasedAmount:
        summary.totalPurchasedAmount +
        finiteNumber(purchase.totalAmount),
    }),
    {
      totalPurchasedPackages: 0,
      totalPurchasedQuantity: 0,
      totalPurchasedAmount: 0,
    },
  );

  return {
    ...totals,
    averageUnitCost:
      totals.totalPurchasedQuantity > 0
        ? totals.totalPurchasedAmount / totals.totalPurchasedQuantity
        : 0,
  };
}

export function normalizePurchaseUnit(
  purchase: PurchaseQuantityRecord,
  targetUnit: string,
) {
  const sourceUnit = String(purchase.costUnit ?? "").trim() || targetUnit;
  return {
    costUnit: targetUnit,
    packageQuantity: convertQuantity(
      finiteNumber(purchase.packageQuantity),
      sourceUnit,
      targetUnit,
    ),
    convertedQuantity: convertQuantity(
      finiteNumber(purchase.convertedQuantity),
      sourceUnit,
      targetUnit,
    ),
  };
}
