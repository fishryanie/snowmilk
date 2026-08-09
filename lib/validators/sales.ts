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
    totalRevenue: z.coerce.number().int().positive(
      "Tổng tiền cuối ngày phải lớn hơn 0",
    ),
    freshMilkBottleCount: z.coerce.number().int().min(0),
    cashReceived: z.coerce.number().int().min(0),
    bankTransferReceived: z.coerce.number().int().min(0),
    note: z.string().trim().optional().default(""),
    overwrite: z.boolean().optional().default(false),
  })
  .superRefine((input, context) => {
    if (
      input.cashReceived + input.bankTransferReceived !==
      input.totalRevenue
    ) {
      context.addIssue({
        code: "custom",
        path: ["cashReceived"],
        message:
          "Tiền mặt cộng chuyển khoản phải bằng tổng doanh thu",
      });
    }
  })
  .strict();
