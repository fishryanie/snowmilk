import { z } from "zod";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import {
  DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
  EXPENSE_PAYMENT_STATUSES,
} from "@/lib/expense-payment-status";
import {
  MILK_STERILIZATION_EXPENSE_CATEGORY,
  milkSterilizationDescription,
} from "@/lib/expense-categories";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredient-code";
import { DEFAULT_STERILIZATION_UNIT_PRICE } from "@/lib/milk-sterilization";

const nonNegative = z.coerce.number().min(0);
const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().default("");

const purchaseCommonFields = {
  purchaseDate: z.coerce.date(),
  packageCount: z.coerce.number().positive(),
  totalAmount: nonNegative.optional(),
  actualPackagePrice: nonNegative.optional(),
  fundingSource: z
    .enum(PURCHASE_FUNDING_SOURCES)
    .optional()
    .default(DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE),
  sterilizationOutsourcedLiters: nonNegative.optional().default(0),
  sterilizationUnitPrice: nonNegative
    .optional()
    .default(DEFAULT_STERILIZATION_UNIT_PRICE),
  sterilizationProvider: optionalText,
  supplier: optionalText,
  note: optionalText,
};

const existingPurchaseSchema = z.strictObject({
  ...purchaseCommonFields,
  source: z.literal("existing"),
  ingredientId: z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Hàng hóa không hợp lệ"),
});

const newPurchaseSchema = z.strictObject({
  ...purchaseCommonFields,
  source: z.literal("new"),
  itemName: requiredText,
  category: z.enum(INGREDIENT_CATEGORIES),
  purchaseUnit: requiredText,
  packageQuantity: z.coerce.number().positive(),
  costUnit: requiredText,
  saveToCatalog: z.boolean().optional().default(true),
});

const purchaseSchema = z
  .preprocess(
    (value) =>
      value && typeof value === "object" && !("source" in value)
        ? { ...value, source: "existing" }
        : value,
    z.discriminatedUnion("source", [
      existingPurchaseSchema,
      newPurchaseSchema,
    ]),
  )
  .refine(
    (purchase) =>
      purchase.totalAmount !== undefined ||
      purchase.actualPackagePrice !== undefined,
    {
      message: "Cần nhập tổng tiền thanh toán",
      path: ["totalAmount"],
    },
  );

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
      code: z.string().trim().optional(),
      name: requiredText,
      category: z.enum(INGREDIENT_CATEGORIES),
      purchaseUnit: optionalText,
      packageQuantity: nonNegative.optional().default(1),
      costUnit: optionalText,
      referencePackagePrice: nonNegative.optional().default(0),
      isActive: z.boolean().optional().default(true),
      note: optionalText,
    })
    .strict(),
  purchases: purchaseSchema,
  expenses: z
    .strictObject({
      expenseDate: z.coerce.date(),
      category: requiredText,
      description: z.string().trim().optional().default(""),
      amount: nonNegative,
      milkLiters: z.coerce.number().positive().optional(),
      milkUnitPrice: z.coerce.number().positive().optional(),
      provider: optionalText,
      accountingTreatment: z
        .enum(["operating_expense", "inventory_cost"])
        .optional(),
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
    .superRefine((expense, context) => {
      if (
        expense.category !== MILK_STERILIZATION_EXPENSE_CATEGORY &&
        !expense.description
      ) {
        context.addIssue({
          code: "custom",
          message: "Vui lòng nhập nội dung",
          path: ["description"],
        });
      }
      if (expense.category !== MILK_STERILIZATION_EXPENSE_CATEGORY) return;
      if (expense.milkLiters === undefined) {
        context.addIssue({
          code: "custom",
          message: "Vui lòng nhập số lít sữa",
          path: ["milkLiters"],
        });
      }
      if (expense.milkUnitPrice === undefined) {
        context.addIssue({
          code: "custom",
          message: "Vui lòng nhập giá mỗi lít sữa",
          path: ["milkUnitPrice"],
        });
      }
    })
    .transform((expense) => {
      if (expense.category === MILK_STERILIZATION_EXPENSE_CATEGORY) {
        return {
          ...expense,
          amount:
            Number(expense.milkLiters ?? 0) *
            Number(expense.milkUnitPrice ?? 0),
          description: milkSterilizationDescription(
            Number(expense.milkLiters ?? 0),
            Number(expense.milkUnitPrice ?? 0),
          ),
        };
      }
      const normalized = { ...expense };
      delete normalized.milkLiters;
      delete normalized.milkUnitPrice;
      return normalized;
    }),
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
      batchType: z.enum(["milk_base", "topping"]).optional().default("milk_base"),
      outputQuantity: z.coerce.number().positive().optional(),
      outputUnit: z.enum(["ml", "lít", "g", "kg"]).optional(),
      actualLiters: z.coerce.number().positive().optional(),
      cookingHours: nonNegative,
      ingredients: z
        .array(
          z
            .object({
              ingredientId: z
                .string()
                .regex(/^[a-f\d]{24}$/i, "Nguyên liệu không hợp lệ"),
              quantity: z.coerce.number().positive(),
              unit: optionalText,
              note: optionalText,
            })
            .strict(),
        )
        .min(1),
      note: optionalText,
    })
    .strict()
    .superRefine((batch, context) => {
      if (batch.outputQuantity == null && batch.actualLiters == null) {
        context.addIssue({
          code: "custom",
          path: ["outputQuantity"],
          message: "Nhập sản lượng thành phẩm thực tế",
        });
      }
      if (batch.outputQuantity != null && !batch.outputUnit) {
        context.addIssue({
          code: "custom",
          path: ["outputUnit"],
          message: "Chọn đơn vị thành phẩm",
        });
      }
      const volumeUnits = new Set(["ml", "lít"]);
      const massUnits = new Set(["g", "kg"]);
      if (
        batch.outputUnit &&
        ((batch.batchType === "milk_base" && !volumeUnits.has(batch.outputUnit)) ||
          (batch.batchType === "topping" && !massUnits.has(batch.outputUnit)))
      ) {
        context.addIssue({
          code: "custom",
          path: ["outputUnit"],
          message:
            batch.batchType === "milk_base"
              ? "Nền sữa phải dùng ml hoặc lít"
              : "Topping phải dùng g hoặc kg",
        });
      }
    }),
} as const;

export type ResourceName = keyof typeof resourceSchemas;

export function isResourceName(value: string): value is ResourceName {
  return value in resourceSchemas;
}
