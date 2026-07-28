import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  type PurchaseFundingSource,
} from "@/lib/purchase-funding";

export type InvestmentRecord = {
  id: string;
  amount: number;
  fundingSource?: PurchaseFundingSource | string | null;
};

export type InvestmentClaimRecord = {
  sourceId: string;
  sourceType: "equipment" | "purchase";
  amount: number;
};

function safeAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isOwnerFunded(record: InvestmentRecord) {
  return (
    (record.fundingSource ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE) ===
    "owner_capital"
  );
}

/**
 * Keeps the original owner investment stable after a recovery claim changes
 * the source record from owner capital to sales revenue.
 */
export function calculateOwnerInvestmentTotal(input: {
  purchases: InvestmentRecord[];
  equipment: InvestmentRecord[];
  claims: InvestmentClaimRecord[];
}) {
  const purchasesById = new Map(
    input.purchases.map((record) => [record.id, record]),
  );
  const equipmentById = new Map(
    input.equipment.map((record) => [record.id, record]),
  );
  const currentOwnerCapital = [...input.purchases, ...input.equipment].reduce(
    (total, record) =>
      isOwnerFunded(record) ? total + safeAmount(record.amount) : total,
    0,
  );
  const recoveredOwnerCapital = input.claims.reduce((total, claim) => {
    const source =
      claim.sourceType === "equipment"
        ? equipmentById.get(claim.sourceId)
        : purchasesById.get(claim.sourceId);

    // A deleted source still has a valid historical snapshot in the claim.
    if (!source || !isOwnerFunded(source)) {
      return total + safeAmount(claim.amount);
    }
    return total;
  }, 0);

  return currentOwnerCapital + recoveredOwnerCapital;
}
