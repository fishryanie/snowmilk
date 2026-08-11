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
    cashReceived: z.coerce.number().int().min(0),
    bankTransferReceived: z.coerce.number().int().min(0),
    note: z.string().trim().optional().default(""),
    overwrite: z.boolean().optional().default(false),
  })
  .superRefine((input, context) => {
    if (input.cashReceived + input.bankTransferReceived <= 0) {
      context.addIssue({
        code: "custom",
        path: ["cashReceived"],
        message: "Tổng tiền mặt và chuyển khoản phải lớn hơn 0",
      });
    }
  })
  .strict();
