import { z } from "zod";
import { isVietnamDateKey } from "@/lib/vietnam-date";
import {
  idempotencyKeySchema,
  isoDateTimeSchema,
  noteSchema,
  objectIdSchema,
  positiveDecimalSchema,
  vndSchema,
} from "./common";

const purchaseReceiptLineSchema = z.strictObject({
  inventoryItemId: objectIdSchema,
  quantity: positiveDecimalSchema,
  totalAmountVnd: vndSchema.refine(
    (value) => value > 0,
    "Thành tiền dòng nhập phải lớn hơn 0",
  ),
});

export const createPurchaseReceiptSchema = z
  .strictObject({
    idempotencyKey: idempotencyKeySchema,
    businessDate: z
      .string()
      .refine(isVietnamDateKey, "Ngày kinh doanh không hợp lệ"),
    receivedAt: isoDateTimeSchema,
    supplierName: z.string().trim().min(1, "Cần nhập tên nhà cung cấp").max(200),
    supplierContact: z.string().trim().max(300).optional().default(""),
    lines: z.array(purchaseReceiptLineSchema).min(1).max(500),
    note: noteSchema,
  })
  .superRefine((input, context) => {
    const keys = input.lines.map(({ inventoryItemId }) => inventoryItemId);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Một hàng hóa chỉ được nhập một lần trong phiếu.",
      });
    }

  });

export type CreatePurchaseReceiptInput = z.infer<
  typeof createPurchaseReceiptSchema
>;
