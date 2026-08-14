import { describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import {
  assertRecipeConfigurationReplay,
  recipeConfigurationRequestHash,
} from "@/services/v2/recipe-invariants";

const recipeId = new Types.ObjectId().toString();
const baseVersionId = new Types.ObjectId().toString();
const potatoId = new Types.ObjectId().toString();
const cornId = new Types.ObjectId().toString();

function payload() {
  return {
    baseVersionId,
    baseVersion: 1,
    idempotencyKey: "recipe-config-20260812-healthy",
    shelfLifeHours: 24,
    components: [
      {
        inventoryItemId: potatoId,
        inputQuantity: "250",
        expectedYieldPercent: "80",
      },
      {
        inventoryItemId: cornId,
        inputQuantity: "300",
        expectedYieldPercent: "66.6667",
      },
    ],
  };
}

describe("recipe configuration idempotency", () => {
  test("is stable when component order changes", () => {
    const input = payload();
    const reordered = { ...input, components: [...input.components].reverse() };
    expect(recipeConfigurationRequestHash(recipeId, input)).toBe(
      recipeConfigurationRequestHash(recipeId, reordered),
    );
  });

  test("same key cannot replay with a different payload", () => {
    const input = payload();
    const firstHash = recipeConfigurationRequestHash(recipeId, input);
    const changedHash = recipeConfigurationRequestHash(recipeId, {
      ...input,
      shelfLifeHours: 48,
    });
    expect(() =>
      assertRecipeConfigurationReplay(firstHash, changedHash),
    ).toThrow("nội dung công thức khác");
  });

  test("accepts an exact replay", () => {
    const hash = recipeConfigurationRequestHash(recipeId, payload());
    expect(() => assertRecipeConfigurationReplay(hash, hash)).not.toThrow();
  });
});
