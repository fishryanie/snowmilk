export function activeRevenueSales<
  T extends {
    _id: unknown;
    entryType: "sale" | "reversal";
    reversalOfId?: unknown;
  },
>(entries: readonly T[]) {
  const reversedSaleIds = new Set(
    entries
      .filter(
        (entry) => entry.entryType === "reversal" && entry.reversalOfId != null,
      )
      .map((entry) => String(entry.reversalOfId)),
  );
  return entries.filter(
    (entry) =>
      entry.entryType === "sale" && !reversedSaleIds.has(String(entry._id)),
  );
}
