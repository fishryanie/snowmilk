type ProductionRecipeCandidate = Record<string, unknown> & {
  _id?: unknown;
  skuId?: unknown;
};

type ProductionSkuCandidate = Record<string, unknown> & {
  _id?: unknown;
  fulfillmentMode?: unknown;
  currentRecipeVersionId?: unknown;
  isActive?: unknown;
};

/** Keeps made-to-order and stale recipe versions out of batch production. */
export function isProductionRecipeEligible(
  recipe: ProductionRecipeCandidate,
  sku: ProductionSkuCandidate | null | undefined,
) {
  return (
    sku?.isActive === true &&
    sku.fulfillmentMode === "preproduced" &&
    String(sku.currentRecipeVersionId ?? "") === String(recipe._id)
  );
}
