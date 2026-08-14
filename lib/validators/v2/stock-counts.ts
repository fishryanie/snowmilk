import { z } from "zod";
import {
  idempotencyKeySchema,
  isoDateTimeSchema,
  nonNegativeDecimalSchema,
  noteSchema,
  objectIdSchema,
} from "./common";

const stockCountLineSchema = z.strictObject({
  inventoryItemId: objectIdSchema,
  inventoryLotId: objectIdSchema.optional(),
  countedQuantity: nonNegativeDecimalSchema,
  unitCostVnd: nonNegativeDecimalSchema.optional(),
  note: noteSchema,
});

export const createStockCountSchema = z
  .strictObject({
    idempotencyKey: idempotencyKeySchema,
    countedAt: isoDateTimeSchema,
    lines: z.array(stockCountLineSchema).min(1).max(1_000),
    note: noteSchema,
  })
  .superRefine((input, context) => {
    const keys = input.lines.map(
      ({ inventoryItemId, inventoryLotId }) =>
        `${inventoryItemId}:${inventoryLotId ?? "no-lot"}`,
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Một hàng hóa/lot chỉ được kiểm một lần trong phiếu.",
      });
    }
    input.lines.forEach((line, index) => {
      if (
        line.unitCostVnd != null &&
        Number(line.countedQuantity) === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "unitCostVnd"],
          message: "Không cần đơn giá mở kho khi số lượng bằng 0.",
        });
      }
    });
  });

export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;
