import { describe, expect, test } from "bun:test";
import { Recipe } from "@/models/v2/Recipe";
import { RecipeVersion } from "@/models/v2/RecipeVersion";
import { buildLegacyRecipeBackfillPlan } from "./recipe-migration";
import {
  materializeLegacyRecipe,
  materializeLegacyRecipeVersion,
} from "./recipe-materializer";

const ids = {
  organization: "507f1f77bcf86cd799439001",
  recipe: "507f1f77bcf86cd799439002",
  sku: "507f1f77bcf86cd799439003",
  output: "507f1f77bcf86cd799439004",
  milk: "507f1f77bcf86cd799439005",
  sugar: "507f1f77bcf86cd799439006",
  bottle: "507f1f77bcf86cd799439007",
};

const recipes = [
  {
    _id: "6a7741e81977b7f8b9e70278",
    code: "CT-001",
    name: "L",
    yieldMl: 1000,
    ingredientCost: 25549.715257118572,
    costPerMl: 25.54971525711857,
    ingredients: [
      {
        ingredientId: "6a61d5fdbd0f6178769b6703",
        ingredientCode: "NL001",
        ingredientName: "Sữa tươi",
        quantity: 1,
        unit: "lít",
        costUnit: "lít",
        unitCost: 24128.17679558011,
        amount: 24128.17679558011,
      },
      {
        ingredientId: "6a61d5fdbd0f6178769b6709",
        ingredientCode: "NL003",
        ingredientName: "Đường",
        quantity: 70,
        unit: "g",
        costUnit: "kg",
        unitCost: 20307.69230769231,
        amount: 1421.5384615384617,
      },
    ],
    note: "",
    isActive: true,
  },
  {
    _id: "6a7752b41977b7f8b9e7027b",
    code: "CT-002",
    name: "Sữa tươi không đường",
    yieldMl: 1000,
    ingredientCost: 24431.088082901555,
    costPerMl: 24.431088082901557,
    ingredients: [
      {
        ingredientId: "6a61d5fdbd0f6178769b6703",
        ingredientCode: "NL001",
        ingredientName: "Sữa tươi",
        quantity: 1,
        unit: "lít",
        costUnit: "lít",
        unitCost: 24431.088082901555,
        amount: 24431.088082901555,
      },
    ],
    isActive: true,
  },
] as const;

const packaging = [
  {
    ingredientId: "6a760905035c33ccceb8dfef",
    ingredientCode: "BB018",
    ingredientName: "Chai sữa",
    quantity: 1,
    costUnit: "chai",
    unitCost: 725,
    amount: 725,
  },
] as const;

const products = [
  {
    _id: "6a7741e81977b7f8b9e70279",
    code: "SP-001",
    name: "Sữa tươi có đường",
    productMode: "recipe",
    recipeId: "6a7741e81977b7f8b9e70278",
    recipeCode: "CT-001",
    milkMl: 400,
    packagingItems: packaging,
    isActive: true,
  },
  {
    _id: "6a7752b41977b7f8b9e7027c",
    code: "SP-002",
    name: "Sữa tươi không đường",
    productMode: "recipe",
    recipeId: "6a7752b41977b7f8b9e7027b",
    recipeCode: "CT-002",
    milkMl: 400,
    packagingItems: packaging,
    isActive: true,
  },
] as const;

const ingredients = [
  {
    _id: "6a61d5fdbd0f6178769b6703",
    code: "NL001",
    name: "Sữa tươi",
    category: "Nguyên liệu",
    purchaseUnit: "can",
    packageQuantity: 1,
    costUnit: "lít",
    referencePackagePrice: 25_000,
    averageUnitCost: 24936.405529953918,
    isActive: true,
  },
  {
    _id: "6a61d5fdbd0f6178769b6709",
    code: "NL003",
    name: "Đường",
    category: "Nguyên liệu",
    purchaseUnit: "bao",
    packageQuantity: 50,
    costUnit: "kg",
    referencePackagePrice: 1_000_000,
    averageUnitCost: 20307.69230769231,
    isActive: true,
  },
  {
    _id: "6a760905035c33ccceb8dfef",
    code: "BB018",
    name: "Chai sữa",
    category: "Bao bì",
    purchaseUnit: "thùng",
    packageQuantity: 100,
    costUnit: "chai",
    referencePackagePrice: 72_500,
    averageUnitCost: 725,
    isActive: true,
  },
] as const;

const catalogSkus = products.map((product) => ({
  code: product.code,
  name: product.name,
  legacySourceId: product._id,
  legacyProductCode: product.code,
  legacyRecipeId: product.recipeId,
  legacyRecipeCode: product.recipeCode,
  legacyProductMode: "recipe",
  isActive: true,
}));

describe("legacy recipe migration", () => {
  test("converts CT-001/CT-002 exactly without fabricating yield", () => {
    const plan = buildLegacyRecipeBackfillPlan({
      products,
      recipes,
      ingredients,
      catalogSkus,
    });
    expect(plan.canApply).toBe(true);
    expect(plan.issues).toEqual([]);
    expect(plan.recipes).toHaveLength(2);
    expect(plan.recipeVersions).toHaveLength(2);
    expect(plan.mappedIngredientCount).toBe(3);
    expect(plan.sourceIngredientCount).toBe(3);
    expect(plan.outputInventoryItems).toHaveLength(2);

    const ct001 = plan.recipeVersions.find(
      ({ recipeCode }) => recipeCode === "CT-001",
    )!;
    const milk = (ct001.components as Array<Record<string, unknown>>).find(
      ({ inventoryItemCode }) => inventoryItemCode === "NL001",
    );
    const sugar = (ct001.components as Array<Record<string, unknown>>).find(
      ({ inventoryItemCode }) => inventoryItemCode === "NL003",
    );
    expect(milk).toMatchObject({
      inputQuantity: "400",
      unit: "ml",
      expectedYieldPercent: null,
      estimatedUnitCostVnd: "24.12817679558011",
    });
    expect(sugar).toMatchObject({
      inputQuantity: "28",
      unit: "g",
      expectedYieldPercent: null,
      estimatedUnitCostVnd: "20.30769230769231",
    });
    expect(ct001.legacyCostSnapshot).toMatchObject({
      yieldMl: "1000",
      servingMl: "400",
      ingredientCostVnd: "25549.715257118572",
      costPerMlVnd: "25.54971525711857",
    });
    expect(plan.inventoryItems.find(({ code }) => code === "NL001"))
      .toMatchObject({
        baseUnit: "ml",
        itemType: "raw_material",
        legacyCostSnapshot: {
          category: "Nguyên liệu",
          costUnit: "lít",
          legacyAverageUnitCostVnd: "24936.405529953918",
        },
      });
  });

  test("materializes legacy aggregate/version accepted by strict models", async () => {
    const plan = buildLegacyRecipeBackfillPlan({
      products,
      recipes,
      ingredients,
      catalogSkus,
    });
    const logicalRecipe = plan.recipes.find(({ code }) => code === "CT-001")!;
    const logicalVersion = plan.recipeVersions.find(
      ({ recipeCode }) => recipeCode === "CT-001",
    )!;
    const actor = { userId: "migration:test", source: "migration" as const };
    const aggregate = materializeLegacyRecipe(
      logicalRecipe as unknown as Parameters<typeof materializeLegacyRecipe>[0],
      {
        organizationId: ids.organization,
        skuId: ids.sku,
        outputInventoryItemId: ids.output,
        actor,
      },
    );
    const version = materializeLegacyRecipeVersion(
      logicalVersion as unknown as Parameters<
        typeof materializeLegacyRecipeVersion
      >[0],
      {
        organizationId: ids.organization,
        recipeId: ids.recipe,
        skuId: ids.sku,
        outputInventoryItemId: ids.output,
        inventoryItemIds: new Map([
          ["FG-SP-001", ids.output],
          ["NL001", ids.milk],
          ["NL003", ids.sugar],
          ["BB018", ids.bottle],
        ]),
        actor,
      },
    );

    await expect(new Recipe(aggregate).validate()).resolves.toBeUndefined();
    await expect(new RecipeVersion(version).validate()).resolves.toBeUndefined();
    expect(version.components.every((line) => !("expectedYieldPercent" in line)))
      .toBe(true);
    expect(version.legacySource).toEqual({
      sourceCollection: "recipes",
      sourceId: "6a7741e81977b7f8b9e70278",
      migrationVersion: "bep-nha-ne-v2.2026-08-12.1",
    });
  });

  test("blocks unknown ingredient category/unit instead of inferring by name", () => {
    const broken = ingredients.map((ingredient, index) => ({
      ...ingredient,
      category: index === 0 ? String("Khác") : String(ingredient.category),
    }));
    const plan = buildLegacyRecipeBackfillPlan({
      products,
      recipes,
      ingredients: broken,
      catalogSkus,
    });
    expect(plan.canApply).toBe(false);
    expect(plan.issues).toContainEqual(
      expect.objectContaining({
        sourceCode: "NL001",
        message: expect.stringContaining("Category ingredient"),
      }),
    );
  });

  test("maps legacy roll packaging to countable each while preserving its source unit", () => {
    const rollPackaging = {
      _id: "6a61d5fdbd0f6178769b673f",
      code: "BB-017",
      name: "Màng bọc",
      category: "Bao bì",
      purchaseUnit: "cuộn",
      packageQuantity: 1,
      costUnit: "cuộn",
      referencePackagePrice: 30_000,
      averageUnitCost: 30_000,
      isActive: true,
    };
    const plan = buildLegacyRecipeBackfillPlan({
      products,
      recipes,
      ingredients: [...ingredients, rollPackaging],
      catalogSkus,
    });

    expect(plan.canApply).toBe(true);
    expect(plan.inventoryItems.find(({ code }) => code === "BB-017"))
      .toMatchObject({
        baseUnit: "each",
        itemType: "packaging",
        legacyCostSnapshot: {
          purchaseUnit: "cuộn",
          costUnit: "cuộn",
        },
      });
  });
});
