import { z } from "zod";
import {
  idempotencyKeySchema,
  noteSchema,
  objectIdSchema,
  versionSchema,
  vndSchema,
} from "./common";

const salesDayLineSchema = z.strictObject({
  skuId: objectIdSchema,
  quantity: z.number().int().min(0).max(1_000_000),
  discountVnd: vndSchema.optional().default(0),
  refundVnd: vndSchema.optional().default(0),
});

const salesDayPaymentsSchema = z.strictObject({
  cashVnd: vndSchema.optional().default(0),
  bankTransferVnd: vndSchema.optional().default(0),
  otherVnd: vndSchema.optional().default(0),
});

export const saveSalesDayDraftSchema = z
  .strictObject({
    version: versionSchema,
    idempotencyKey: idempotencyKeySchema,
    lines: z.array(salesDayLineSchema).max(500),
    globalDiscountVnd: vndSchema.optional().default(0),
    payments: salesDayPaymentsSchema,
    note: noteSchema,
  })
  .superRefine((input, context) => {
    const skuIds = input.lines.map(({ skuId }) => skuId);
    if (new Set(skuIds).size !== skuIds.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Một SKU chỉ được xuất hiện một lần trong ngày.",
      });
    }
  });

export const closeSalesDaySchema = z.strictObject({
  version: versionSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const reopenSalesDaySchema = z.strictObject({
  version: versionSchema,
  idempotencyKey: idempotencyKeySchema,
  reason: z.string().trim().min(5, "Cần ghi rõ lý do mở lại").max(500),
});

export type SaveSalesDayDraftInput = z.infer<typeof saveSalesDayDraftSchema>;
export type CloseSalesDayInput = z.infer<typeof closeSalesDaySchema>;
export type ReopenSalesDayInput = z.infer<typeof reopenSalesDaySchema>;

