import { describe, expect, test } from "bun:test";
import { LEGACY_SOURCE_COUNT_BASELINE } from "./constants";
import {
  buildLegacySourceManifest,
  validateLegacySourceManifest,
  type LegacySourceDocuments,
} from "./source-manifest";

function records(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `${prefix}-${index}`,
    value: index,
  }));
}

function baselineSources(): LegacySourceDocuments {
  return {
    products: records(LEGACY_SOURCE_COUNT_BASELINE.products, "product"),
    recipes: records(LEGACY_SOURCE_COUNT_BASELINE.recipes, "recipe"),
    ingredients: records(LEGACY_SOURCE_COUNT_BASELINE.ingredients, "ingredient"),
    sales: records(LEGACY_SOURCE_COUNT_BASELINE.sales, "sale"),
    milkBatches: records(LEGACY_SOURCE_COUNT_BASELINE.milkBatches, "batch"),
    purchases: records(LEGACY_SOURCE_COUNT_BASELINE.purchases, "purchase"),
    inventorySnapshots: records(
      LEGACY_SOURCE_COUNT_BASELINE.inventorySnapshots,
      "snapshot",
    ),
    expenses: records(LEGACY_SOURCE_COUNT_BASELINE.expenses, "expense"),
    equipment: records(LEGACY_SOURCE_COUNT_BASELINE.equipment, "equipment"),
  };
}

describe("legacy source manifest", () => {
  test("checksums every rollout collection and records preservation strategy", () => {
    const sources = baselineSources();
    const first = buildLegacySourceManifest(sources);
    const reordered = buildLegacySourceManifest({
      ...sources,
      purchases: sources.purchases.toReversed(),
      equipment: sources.equipment.toReversed(),
    });
    expect(first).toEqual(reordered);
    expect(validateLegacySourceManifest(first)).toEqual({
      issues: [],
      canApply: true,
    });
    expect(first.find(({ key }) => key === "purchases")).toMatchObject({
      count: 144,
      disposition: "preserve_read_only",
      canonicalTargets: [],
      checksum: expect.stringMatching(/^[a-f\d]{64}$/),
    });
    expect(first.find(({ key }) => key === "inventorySnapshots")).toMatchObject({
      count: 4,
      disposition: "preserve_for_physical_opening_reference",
      canonicalTargets: [],
    });
  });

  test("blocks apply when a source collection was silently omitted", () => {
    const sources = baselineSources();
    sources.expenses = [];
    const validation = validateLegacySourceManifest(
      buildLegacySourceManifest(sources),
    );
    expect(validation.canApply).toBe(false);
    expect(validation.issues).toEqual([
      expect.objectContaining({
        sourceKey: "expenses",
        expectedMinimum: 19,
        actual: 0,
      }),
    ]);
  });

  test("allows appendable preserved collections to grow after dry-run baseline", () => {
    const sources = baselineSources();
    sources.purchases = [...sources.purchases, { _id: "purchase-new" }];
    sources.expenses = [...sources.expenses, { _id: "expense-new" }];
    const validation = validateLegacySourceManifest(
      buildLegacySourceManifest(sources),
    );
    expect(validation).toEqual({ issues: [], canApply: true });
  });
});
