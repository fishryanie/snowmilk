import { z } from "zod";
import {
  idempotencyKeySchema,
  objectIdSchema,
  positiveDecimalSchema,
  versionSchema,
} from "./common";

const configuredComponentSchema = z.strictObject({
  inventoryItemId: objectIdSchema,
  inputQuantity: positiveDecimalSchema,
  expectedYieldPercent: positiveDecimalSchema.refine(
    (value) => Number(value) <= 100,
    "Yield không được vượt 100%",
  ),
});

export const createRecipeVersionSchema = z
  .strictObject({
    baseVersionId: objectIdSchema,
    baseVersion: versionSchema,
    idempotencyKey: idempotencyKeySchema,
    shelfLifeHours: z.number().int().positive().max(30 * 24),
    components: z.array(configuredComponentSchema).min(1).max(100),
  })
  .superRefine((input, context) => {
    const ids = input.components.map((component) => component.inventoryItemId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "Mỗi nguyên liệu chỉ được cấu hình một lần.",
      });
    }
  });

export const releaseRecipeVersionSchema = z.strictObject({
  version: versionSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type CreateRecipeVersionInput = z.infer<
  typeof createRecipeVersionSchema
>;
export type ReleaseRecipeVersionInput = z.infer<
  typeof releaseRecipeVersionSchema
>;
