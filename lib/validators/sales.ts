import { z } from "zod";
import { isVietnamDateKey } from "@/lib/vietnam-date";

export const dailySaleSchema = z
  .object({
    saleDate: z
      .string()
      .refine(isVietnamDateKey, "Ngày bán không hợp lệ"),
    batchId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Mẻ sữa không hợp lệ")
      .optional(),
    freshMilkBottleCount: z.coerce.number().int().min(0),
    productQuantities: z
      .array(
        z
          .strictObject({
            productId: z
              .string()
              .regex(/^[a-f\d]{24}$/i, "Sản phẩm không hợp lệ"),
            quantity: z.coerce.number().int().min(0).max(1_000_000),
          }),
      )
      .max(250)
      .default([]),
    cashReceived: z.coerce.number().int().min(0),
    bankTransferReceived: z.coerce.number().int().min(0),
    note: z.string().trim().optional().default(""),
    overwrite: z.boolean().optional().default(false),
  })
  .superRefine((input, context) => {
    const productIds = input.productQuantities.map(({ productId }) => productId);
    if (new Set(productIds).size !== productIds.length) {
      context.addIssue({
        code: "custom",
        path: ["productQuantities"],
        message: "Mỗi sản phẩm chỉ được nhập số lượng một lần",
      });
    }
    if (input.cashReceived + input.bankTransferReceived <= 0) {
      context.addIssue({
        code: "custom",
        path: ["cashReceived"],
        message: "Tổng tiền mặt và chuyển khoản phải lớn hơn 0",
      });
    }
  })
  .strict();
