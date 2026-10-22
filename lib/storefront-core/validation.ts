import { z } from "zod";
const amount = z.number().int().min(0).max(10_000_000);
export const imageUrlSchema = z
  .string()
  .max(1_500_000)
  .refine(
    (v) =>
      !v ||
      /^https:\/\//.test(v) ||
      /^\/images\/[a-zA-Z0-9._/-]+$/.test(v) ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Ảnh phải là HTTPS, ảnh trong /images hoặc ảnh tải lên.",
  );
export const productSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(800),
  price: amount,
  imageUrl: imageUrlSchema,
  imagePosition: z.string().max(30).optional(),
  badge: z.string().trim().max(30),
  unit: z.string().trim().min(1).max(40),
  status: z.enum(["available", "sold_out", "hidden"]),
  toppingSelection: z.enum(["single", "multiple"]).optional(),
  maxToppings: z.number().int().positive().nullable().optional(),
  toppings: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
        name: z.string().trim().min(1).max(60),
        price: amount,
        available: z.boolean(),
      }),
    )
    .max(12)
    .refine(
      (v) => new Set(v.map((t) => t.id)).size === v.length,
      "Mã topping không được trùng.",
    ),
  sortOrder: z.number().int().min(0).max(10000),
});
export const settingsSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(500),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(300),
  isOpen: z.boolean(),
  deliveryFee: amount,
  freeDeliveryFrom: amount,
  deliveryNote: z.string().trim().max(300),
  qrImage: imageUrlSchema,
  paymentNote: z.string().trim().max(300),
});
export const productUpdateSchema = productSchema.extend({
  expectedRevision: z.number().int().min(0).optional(),
});
export const productDeleteSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
});
export const cartSchema = z
  .array(
    z.strictObject({
      productId: z.string().regex(/^[a-f0-9]{24}$/),
      quantity: z.number().int().min(1).max(30),
      toppingIds: z
        .array(z.string().min(1).max(40))
        .max(12)
        .refine((v) => new Set(v).size === v.length),
    }),
  )
  .min(1)
  .max(30)
  .refine(
    (lines) => lines.reduce((n, l) => n + l.quantity, 0) <= 100,
    "Mỗi đơn tối đa 100 món.",
  );
export const normalizePhone = (value: string) =>
  value.replace(/[\s.()-]/g, "").replace(/^\+?84/, "0");
export const customerSchema = z.strictObject({
  name: z.string().trim().min(2, "Nhập tên người nhận.").max(80),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(
      z
        .string()
        .regex(/^0[35789]\d{8}$/, "Nhập số điện thoại Việt Nam hợp lệ."),
    ),
  address: z.string().trim().min(8, "Nhập địa chỉ giao hàng đầy đủ.").max(300),
  note: z.string().trim().max(500),
  location: z
    .strictObject({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000),
    })
    .nullable(),
});
export const checkoutSchema = z.strictObject({
  cart: cartSchema,
  customer: customerSchema,
  paymentMethod: z.enum(["cod", "bank_transfer"]).default("bank_transfer"),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.uuid(),
});
export class CommerceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
