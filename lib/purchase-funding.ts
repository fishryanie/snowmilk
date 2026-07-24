export const PURCHASE_FUNDING_SOURCES = [
  "sales_revenue",
  "owner_capital",
  "loan",
  "other",
] as const;

export type PurchaseFundingSource =
  (typeof PURCHASE_FUNDING_SOURCES)[number];

export const DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE: PurchaseFundingSource =
  "owner_capital";

export const PURCHASE_FUNDING_SOURCE_OPTIONS: Array<{
  label: string;
  value: PurchaseFundingSource;
}> = [
  { value: "sales_revenue", label: "Tiền bán hàng" },
  { value: "owner_capital", label: "Vốn chủ" },
  { value: "loan", label: "Tiền vay" },
  { value: "other", label: "Nguồn khác" },
];

const purchaseFundingSourceLabels = new Map(
  PURCHASE_FUNDING_SOURCE_OPTIONS.map((option) => [
    option.value,
    option.label,
  ]),
);

export function purchaseFundingSourceLabel(
  value?: PurchaseFundingSource | null,
) {
  return purchaseFundingSourceLabels.get(
    value ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  )!;
}

export function ownerCapitalPurchaseFilter() {
  return {
    $or: [
      { fundingSource: "owner_capital" },
      { fundingSource: { $exists: false } },
      { fundingSource: null },
      { fundingSource: "" },
    ],
  };
}
