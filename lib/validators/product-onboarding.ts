import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Dữ liệu liên kết không hợp lệ");
const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().default("");
const positive = z.coerce.number().positive();
const nonNegative = z.coerce.number().min(0);

const existingRecipeSchema = z
  .strictObject({
    mode: z.literal("existing"),
    recipeId: objectId,
  });

const newRecipeSchema = z
  .strictObject({
    mode: z.literal("new"),
    name: requiredText,
    yieldMl: positive,
    ingredients: z
      .array(
        z
          .strictObject({
            ingredientId: objectId,
            quantity: positive,
            unit: requiredText,
          }),
      )
      .min(1, "Công thức cần ít nhất một nguyên liệu"),
    note: optionalText,
  });

const existingPackagingSchema = z
  .strictObject({
    source: z.literal("existing"),
    ingredientId: objectId,
    quantity: positive,
    openingPurchase: z
      .strictObject({
        packagePrice: positive,
        packageCount: positive.optional().default(1),
        supplier: optionalText,
      })
      .optional(),
  });

const newPackagingSchema = z
  .strictObject({
    source: z.literal("new"),
    name: requiredText,
    purchaseUnit: requiredText,
    packageQuantity: positive,
    costUnit: requiredText,
    packagePrice: positive,
    packageCount: positive.optional().default(1),
    supplier: optionalText,
    quantity: positive,
  });

export const productOnboardingSchema = z
  .strictObject({
    name: requiredText,
    sellingPrice: nonNegative,
    servingMl: positive,
    recipe: z.discriminatedUnion("mode", [
      existingRecipeSchema,
      newRecipeSchema,
    ]),
    packagingItems: z
      .array(
        z.discriminatedUnion("source", [
          existingPackagingSchema,
          newPackagingSchema,
        ]),
      )
      .min(1, "Sản phẩm cần ít nhất một loại bao bì"),
    isActive: z.boolean().optional().default(true),
    note: optionalText,
  });

export type ProductOnboardingInput = z.infer<
  typeof productOnboardingSchema
>;
