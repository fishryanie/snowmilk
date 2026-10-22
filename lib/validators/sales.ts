import { z } from "zod";
import { isVietnamDateKey } from "@/lib/vietnam-date";

const money = z.number().int().min(0).max(1_000_000_000_000);

export const dailySaleSchema = z.strictObject({
  saleDate: z.string().refine(isVietnamDateKey, "Ngày bán không hợp lệ"),
  cashReceived: money,
  bankTransferReceived: money,
  overwrite: z.boolean().optional().default(false),
});
