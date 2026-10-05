import { z } from "zod";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredient-code";
import { resourceSchemas } from "@/lib/validators/resources";
import { isVietnamDateKey, vietnamDateKey } from "@/lib/vietnam-date";

export const MAX_RECEIPT_BASE64 = 4_000_000;
export const receiptScanSchema = z.strictObject({
  imageBase64: z.string().min(16).max(MAX_RECEIPT_BASE64)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Ảnh bill không hợp lệ."),
});

const nullableText = z.string().trim().max(300).nullable();
export const receiptExtractionSchema = z.object({
  purchaseDate: z.string().nullable(),
  supplier: nullableText,
  invoiceNumber: nullableText,
  totalAmount: z.number().finite().nonnegative().safe().nullable(),
  warnings: z.array(z.string().max(500)).max(20),
  lines: z.array(z.object({
    itemName: z.string().trim().min(1).max(200),
    ingredientId: nullableText,
    category: z.enum(INGREDIENT_CATEGORIES).nullable(),
    purchaseUnit: nullableText,
    packageQuantity: z.number().finite().positive().nullable(),
    costUnit: nullableText,
    packageCount: z.number().finite().positive().nullable(),
    totalAmount: z.number().finite().nonnegative().safe().nullable(),
    warnings: z.array(z.string().max(500)).max(10),
  })).min(1).max(40),
});

export const receiptImportSchema = z.strictObject({
  receiptId: z.string().regex(/^[a-f0-9]{64}$/),
  lines: z.array(resourceSchemas.purchases).min(1).max(40),
}).superRefine((input, context) => {
  let date: string | undefined;
  for (const [index, line] of input.lines.entries()) {
    const day = vietnamDateKey(line.purchaseDate);
    if (!isVietnamDateKey(day) || day > vietnamDateKey(new Date())) {
      context.addIssue({ code: "custom", path: ["lines", index, "purchaseDate"],
        message: "Ngày nhập hàng không hợp lệ hoặc sau hôm nay." });
    }
    date ??= day;
    if (date !== day) {
      context.addIssue({ code: "custom", path: ["lines", index, "purchaseDate"],
        message: "Các mặt hàng trên cùng bill phải có cùng ngày nhập." });
    }
    if (!Number.isSafeInteger(line.totalAmount)) {
      context.addIssue({ code: "custom", path: ["lines", index, "totalAmount"],
        message: "Tổng tiền phải là số nguyên đồng." });
    }
    if (line.sterilizationOutsourcedLiters > 0) {
      context.addIssue({ code: "custom", path: ["lines", index],
        message: "Hãy ghi chi phí thuê tiệt trùng riêng trong phiếu nhập sau khi lưu bill." });
    }
  }
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
export type ReceiptImportInput = z.infer<typeof receiptImportSchema>;
