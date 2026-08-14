import { z } from "zod";
import {
  idempotencyKeySchema,
  isoDateTimeSchema,
  noteSchema,
  objectIdSchema,
  positiveDecimalSchema,
  versionSchema,
} from "./common";
import { isVietnamDateKey } from "@/lib/vietnam-date";

export const createProductionBatchSchema = z
  .strictObject({
    businessDate: z
      .string()
      .refine(isVietnamDateKey, "Ngày kinh doanh không hợp lệ"),
    idempotencyKey: idempotencyKeySchema,
    recipeVersionId: objectIdSchema,
    startedAt: isoDateTimeSchema.optional(),
    plannedOutputQuantity: z.number().int().positive().max(100_000),
    expiresAt: isoDateTimeSchema.optional(),
    note: noteSchema,
  })
  .superRefine((input, context) => {
    if (
      input.startedAt &&
      input.expiresAt &&
      new Date(input.expiresAt) <= new Date(input.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Hạn dùng phải sau thời điểm bắt đầu.",
      });
    }
  });

const consumedComponentSchema = z.strictObject({
  inventoryItemId: objectIdSchema,
  inventoryLotId: objectIdSchema.optional(),
  quantity: positiveDecimalSchema,
});

export const completeProductionBatchSchema = z
  .strictObject({
    version: versionSchema,
    idempotencyKey: idempotencyKeySchema,
    completedAt: isoDateTimeSchema,
    components: z
      .array(consumedComponentSchema)
      .min(1, "Cần ghi ít nhất một nguyên liệu thực dùng")
      .max(100),
    goodOutputQuantity: z.number().int().min(0).max(100_000),
    wasteOutputQuantity: z.number().int().min(0).max(100_000),
    expiresAt: isoDateTimeSchema.optional(),
    note: noteSchema,
  })
  .superRefine((input, context) => {
    if (input.goodOutputQuantity + input.wasteOutputQuantity <= 0) {
      context.addIssue({
        code: "custom",
        path: ["goodOutputQuantity"],
        message: "Tổng thành phẩm đạt và hỏng phải lớn hơn 0.",
      });
    }
    const componentKeys = input.components.map(
      ({ inventoryItemId, inventoryLotId }) =>
        `${inventoryItemId}:${inventoryLotId ?? "no-lot"}`,
    );
    if (new Set(componentKeys).size !== componentKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "Nguyên liệu và lot thực dùng bị trùng.",
      });
    }
    if (
      input.expiresAt &&
      new Date(input.expiresAt) <= new Date(input.completedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Hạn dùng phải sau thời điểm hoàn tất.",
      });
    }
  });

export type CreateProductionBatchInput = z.infer<
  typeof createProductionBatchSchema
>;
export type CompleteProductionBatchInput = z.infer<
  typeof completeProductionBatchSchema
>;
