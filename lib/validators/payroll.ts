import { z } from "zod";

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().optional().default("");

export const payrollEmployeeSchema = z
  .object({
    name: requiredText,
    role: requiredText,
    phone: optionalText,
    email: z.union([z.literal(""), z.email("Email không hợp lệ")]).optional().default(""),
    sharePercent: z.coerce.number().positive().max(100),
    joinedAt: z.coerce.date(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const payrollWithdrawalSchema = z
  .object({
    employeeId: z.string().regex(/^[a-f\d]{24}$/i, "Nhân sự không hợp lệ"),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng không hợp lệ"),
    withdrawalDate: z.coerce.date(),
    amount: z.coerce.number().positive(),
    entitlementSnapshot: z.coerce.number().positive(),
    note: optionalText,
  })
  .strict()
  .refine((value) => value.amount <= value.entitlementSnapshot, {
    message: "Số tiền rút không được vượt quá phần được lãnh",
    path: ["amount"],
  });

export const payrollPayslipPreviewSchema = z
  .object({
    employeeId: z.string().regex(/^[a-f\d]{24}$/i, "Nhân sự không hợp lệ"),
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng không hợp lệ"),
    withdrawalDate: z.coerce.date(),
    note: optionalText,
  })
  .strict();
