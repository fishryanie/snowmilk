import { describe, expect, test } from "bun:test";
import { productOnboardingSchema } from "./product-onboarding";

const id = "64b000000000000000000001";

describe("product onboarding validator", () => {
  test("accepts a no-topping bottled product with a new recipe and package", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Sữa tươi có đường 430ml",
      sellingPrice: 20_000,
      servingMl: 430,
      recipe: {
        mode: "new",
        name: "Sữa tươi có đường 430ml",
        yieldMl: 430,
        ingredients: [
          { ingredientId: id, quantity: 400, unit: "ml" },
        ],
      },
      packagingItems: [
        {
          source: "new",
          name: "Chai sữa",
          purchaseUnit: "Lốc",
          packageQuantity: 200,
          costUnit: "chai",
          packagePrice: 145_000,
          quantity: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.packagingItems[0]).toMatchObject({ packageCount: 1 });
      expect(parsed.data.isActive).toBe(true);
    }
  });

  test("rejects an empty packaging list", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Sữa chai",
      sellingPrice: 20_000,
      servingMl: 430,
      recipe: { mode: "existing", recipeId: id },
      packagingItems: [],
    });

    expect(parsed.success).toBe(false);
  });

  test("accepts the first purchase for an existing zero-cost package", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Sữa chai",
      sellingPrice: 20_000,
      servingMl: 430,
      recipe: { mode: "existing", recipeId: id },
      packagingItems: [
        {
          source: "existing",
          ingredientId: id,
          quantity: 1,
          openingPurchase: {
            packagePrice: 145_000,
            packageCount: 1,
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.packagingItems[0]).toMatchObject({
        openingPurchase: { packagePrice: 145_000, packageCount: 1 },
      });
    }
  });
});
