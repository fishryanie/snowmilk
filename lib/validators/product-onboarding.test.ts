import { describe, expect, test } from "bun:test";
import { productOnboardingSchema } from "./product-onboarding";

const preparedIngredientId = "64b000000000000000000001";
const dryToppingId = "64b000000000000000000002";
const packagingId = "64b000000000000000000003";

describe("product onboarding validator", () => {
  test("accepts prepared ingredients and dry toppings in one list", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Tuyết Trân Châu - M",
      sellingPrice: 35_000,
      ingredientItems: [
        {
          source: "batch",
          batchId: preparedIngredientId,
          quantity: 350,
          unit: "ml",
        },
        {
          source: "ingredient",
          ingredientId: dryToppingId,
          quantity: 10,
          unit: "g",
        },
      ],
      packagingItems: [
        {
          source: "new",
          name: "Ly M",
          purchaseUnit: "lốc",
          packageQuantity: 50,
          costUnit: "cái",
          packagePrice: 50_000,
          quantity: 1,
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ingredientItems).toHaveLength(2);
      expect(parsed.data.packagingItems[0]).toMatchObject({ packageCount: 1 });
      expect(parsed.data.isActive).toBe(true);
    }
  });

  test("accepts a product made only from a dry imported topping", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Hũ dâu sấy",
      sellingPrice: 42_000,
      ingredientItems: [
        {
          source: "ingredient",
          ingredientId: dryToppingId,
          quantity: 50,
          unit: "g",
        },
      ],
      packagingItems: [
        { source: "existing", ingredientId: packagingId, quantity: 1 },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects a product without ingredients", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Sữa Tuyết - M",
      sellingPrice: 30_000,
      ingredientItems: [],
      packagingItems: [
        { source: "existing", ingredientId: packagingId, quantity: 1 },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects an empty packaging list", () => {
    const parsed = productOnboardingSchema.safeParse({
      name: "Sữa Tuyết - M",
      sellingPrice: 30_000,
      ingredientItems: [
        {
          source: "batch",
          batchId: preparedIngredientId,
          quantity: 350,
          unit: "ml",
        },
      ],
      packagingItems: [],
    });

    expect(parsed.success).toBe(false);
  });
});
