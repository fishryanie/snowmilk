import { z } from "zod";
import { isVietnamDateKey } from "@/lib/vietnam-date";
import { objectIdSchema } from "./common";

const dateKeySchema = z
  .string()
  .refine(isVietnamDateKey, "Ngày báo cáo không hợp lệ");

export const revenueReportFiltersSchema = z
  .strictObject({
    from: dateKeySchema,
    to: dateKeySchema,
    locationId: objectIdSchema.optional(),
    businessLineId: objectIdSchema.optional(),
    skuId: objectIdSchema.optional(),
  })
  .superRefine((input, context) => {
    if (input.from > input.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
      });
    }
  });

export type RevenueReportFilters = z.infer<typeof revenueReportFiltersSchema>;

