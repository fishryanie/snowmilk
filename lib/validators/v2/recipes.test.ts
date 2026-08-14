import { describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import {
  createRecipeVersionSchema,
  releaseRecipeVersionSchema,
} from "./recipes";

const objectId = () => new Types.ObjectId().toString();

describe("recipe v2 validators", () => {
  test("requires an idempotency key for configuration and release", () => {
    expect(
      createRecipeVersionSchema.safeParse({
        baseVersionId: objectId(),
        baseVersion: 1,
        shelfLifeHours: 24,
        components: [
          {
            inventoryItemId: objectId(),
            inputQuantity: "250",
            expectedYieldPercent: "80",
          },
        ],
      }).success,
    ).toBe(false);
    expect(releaseRecipeVersionSchema.safeParse({ version: 1 }).success).toBe(
      false,
    );
  });

  test("rejects duplicate components and yield above 100 percent", () => {
    const inventoryItemId = objectId();
    const result = createRecipeVersionSchema.safeParse({
      baseVersionId: objectId(),
      baseVersion: 1,
      idempotencyKey: "recipe-config-validator-test",
      shelfLifeHours: 24,
      components: [
        {
          inventoryItemId,
          inputQuantity: "250",
          expectedYieldPercent: "101",
        },
        {
          inventoryItemId,
          inputQuantity: "250",
          expectedYieldPercent: "80",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
