import { describe, expect, test } from "bun:test";
import { isProductionRecipeEligible } from "@/services/v2/production-invariants";

describe("production recipe eligibility", () => {
  const recipe = { _id: "hbf-recipe-v2", skuId: "hbf-sku" };

  test("offers only the active current version of a preproduced SKU", () => {
    expect(
      isProductionRecipeEligible(recipe, {
        _id: "hbf-sku",
        fulfillmentMode: "preproduced",
        currentRecipeVersionId: "hbf-recipe-v2",
        isActive: true,
      }),
    ).toBe(true);
    expect(
      isProductionRecipeEligible(recipe, {
        _id: "hbf-sku",
        fulfillmentMode: "preproduced",
        currentRecipeVersionId: "hbf-recipe-v1",
        isActive: true,
      }),
    ).toBe(false);
  });

  test("does not expose legacy made-to-order milk recipes", () => {
    expect(
      isProductionRecipeEligible(
        { _id: "ct-001-v1", skuId: "snow-milk-sku" },
        {
          _id: "snow-milk-sku",
          fulfillmentMode: "made_to_order",
          currentRecipeVersionId: "ct-001-v1",
          isActive: true,
        },
      ),
    ).toBe(false);
  });

  test("does not expose an inactive SKU", () => {
    expect(
      isProductionRecipeEligible(recipe, {
        _id: "hbf-sku",
        fulfillmentMode: "preproduced",
        currentRecipeVersionId: "hbf-recipe-v2",
        isActive: false,
      }),
    ).toBe(false);
  });
});
