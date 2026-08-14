import { z } from "zod";

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "ID liên kết không hợp lệ");

export const versionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency key quá ngắn")
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "Idempotency key chứa ký tự không hợp lệ");

export const vndSchema = z
  .number()
  .int("Tiền VND phải là số nguyên")
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

const decimalTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^(?:0|[1-9]\d{0,29})(?:\.\d{1,9})?$/, "Số lượng thập phân không hợp lệ");

export const nonNegativeDecimalSchema = z
  .union([decimalTextSchema, z.number().finite().nonnegative()])
  .transform((value) => String(value));

export const positiveDecimalSchema = nonNegativeDecimalSchema.refine(
  (value) => !/^0(?:\.0+)?$/.test(value),
  "Số lượng phải lớn hơn 0",
);

export const noteSchema = z.string().trim().max(2_000).optional().default("");

