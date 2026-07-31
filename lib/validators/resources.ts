import { z } from "zod";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import {
  DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
  EXPENSE_PAYMENT_STATUSES,
} from "@/lib/expense-payment-status";

const nonNegative = z.coerce.number().min(0);
const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().default("");

export const resourceSchemas = {
  products: z
    .object({
      toppingIngredientId: z
        .string()
        .regex(/^[a-f\d]{24}$/i, "Topping không hợp lệ"),
      sizeId: z.string().regex(/^[a-f\d]{24}$/i, "Size không hợp lệ"),
      toppingGrams: nonNegative,
      isActive: z.boolean().optional().default(true),
    })
    .strict(),
  sizes: z
    .object({
      code: requiredText,
      name: requiredText,
      milkMl: nonNegative,
      cupSetName: requiredText,
      sellingPrice: nonNegative,
      isActive: z.boolean().optional().default(true),
    })
    .strict(),
  ingredients: z
    .object({
      code: requiredText,
      name: requiredText,
      category: z.enum(["Nguyên liệu", "Topping", "Bao bì", "Khác"]),
      purchaseUnit: optionalText,
      packageQuantity: nonNegative.optional().default(1),
      costUnit: optionalText,
      referencePackagePrice: nonNegative.optional().default(0),
      isActive: z.boolean().optional().default(true),
      note: optionalText,
    })
    .strict(),
  purchases: z
    .object({
      purchaseDate: z.coerce.date(),
      ingredientId: z
        .string()
        .regex(/^[a-f\d]{24}$/i, "Hàng hóa không hợp lệ"),
      packageCount: z.coerce.number().positive(),
      totalAmount: nonNegative.optional(),
      actualPackagePrice: nonNegative.optional(),
      fundingSource: z
        .enum(PURCHASE_FUNDING_SOURCES)
        .optional()
        .default(DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE),
      supplier: optionalText,
      note: optionalText,
    })
    .refine(
      (purchase) =>
        purchase.totalAmount !== undefined ||
        purchase.actualPackagePrice !== undefined,
      {
        message: "Cần nhập tổng tiền thanh toán",
        path: ["totalAmount"],
      },
    )
    .strict(),
  expenses: z
    .object({
      expenseDate: z.coerce.date(),
      category: requiredText,
      description: requiredText,
      amount: nonNegative,
      paymentStatus: z
        .enum(EXPENSE_PAYMENT_STATUSES)
        .optional()
        .default(DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS),
      fundingSource: z
        .enum(PURCHASE_FUNDING_SOURCES)
        .optional()
        .default(DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE),
      isRecurring: z.boolean().optional().default(false),
      note: optionalText,
    })
    .strict(),
  divestments: z
    .object({
      withdrawalDate: z.coerce.date(),
      amount: z.coerce.number().positive(),
      note: optionalText,
    })
    .strict(),
  equipment: z
    .object({
      purchaseDate: z.coerce.date(),
      name: requiredText,
      category: optionalText,
      quantity: z.coerce.number().positive(),
      unitPrice: nonNegative,
      fundingSource: z
        .enum(PURCHASE_FUNDING_SOURCES)
        .optional()
        .default(DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE),
      residualValue: nonNegative.optional().default(0),
      usefulLifeMonths: z.coerce.number().int().positive().optional(),
      isActive: z.boolean().optional().default(true),
      note: optionalText,
    })
    .strict(),
  batches: z
    .object({
      name: requiredText,
      actualLiters: z.coerce.number().positive(),
      cookingHours: nonNegative,
      ingredients: z
        .array(
          z
            .object({
              ingredientId: z
                .string()
                .regex(/^[a-f\d]{24}$/i, "Nguyên liệu không hợp lệ"),
              quantity: z.coerce.number().positive(),
              note: optionalText,
            })
            .strict(),
        )
        .min(1),
      note: optionalText,
    })
    .strict(),
} as const;

export type ResourceName = keyof typeof resourceSchemas;

export function isResourceName(value: string): value is ResourceName {
  return value in resourceSchemas;
}
