import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  compareDecimalStringsExact,
  decimalField,
  rejectAppendOnlyMutations,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

export const STOCK_MOVEMENT_TYPES = [
  "purchase_receive",
  "production_consume",
  "production_output",
  "sale_consume",
  "waste",
  "adjustment",
  "count_reconcile",
  "opening",
  "reversal",
] as const;

const StockMovementSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Location",
      required: true,
      immutable: true,
    },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    inventoryLotId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryLot",
      default: null,
      immutable: true,
    },
    itemCodeSnapshot: { type: String, required: true, trim: true, immutable: true },
    itemNameSnapshot: { type: String, required: true, trim: true, immutable: true },
    unitSnapshot: { type: String, enum: ["g", "ml", "each"], required: true },
    movementType: {
      type: String,
      enum: STOCK_MOVEMENT_TYPES,
      required: true,
      immutable: true,
    },
    quantityDelta: decimalField({ signed: true, immutable: true }),
    unitCostVnd: decimalField({ required: false, immutable: true }),
    inventoryValueDeltaVnd: vndField({
      required: false,
      default: null,
      signed: true,
      immutable: true,
    }),
    businessDate: { ...businessDateField, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    sourceType: {
      type: String,
      enum: [
        "purchase",
        "production_batch",
        "sales_day",
        "stock_count",
        "manual_adjustment",
        "migration",
        "reversal",
      ],
      required: true,
      immutable: true,
    },
    sourceId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sourceLineKey: { type: String, trim: true, immutable: true },
    reversalOfId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      default: null,
      immutable: true,
    },
    reason: { type: String, trim: true, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, immutable: true },
    version: { ...versionField, immutable: true },
    actor: { type: ActorSchema, required: true, immutable: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.stockMovements),
);

StockMovementSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, name: "uq_stock_movement_idempotency" },
);
StockMovementSchema.index(
  { organizationId: 1, locationId: 1, inventoryItemId: 1, inventoryLotId: 1, occurredAt: 1 },
  { name: "ix_stock_movement_ledger" },
);
StockMovementSchema.index(
  { organizationId: 1, sourceType: 1, sourceId: 1, sourceLineKey: 1 },
  { unique: true, name: "uq_stock_movement_source_line" },
);
StockMovementSchema.index(
  { organizationId: 1, reversalOfId: 1 },
  {
    unique: true,
    partialFilterExpression: { reversalOfId: { $type: "objectId" } },
    name: "uq_stock_movement_reversal",
  },
);

StockMovementSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const quantitySign = compareDecimalStringsExact(doc.quantityDelta, "0");
  if (quantitySign === 0) {
    doc.invalidate("quantityDelta", "Stock movement không được có số lượng 0.");
  }
  const positiveTypes = new Set([
    "purchase_receive",
    "production_output",
    "opening",
  ]);
  const negativeTypes = new Set([
    "production_consume",
    "sale_consume",
    "waste",
  ]);
  if (positiveTypes.has(doc.movementType) && quantitySign <= 0) {
    doc.invalidate("quantityDelta", "Loại nhập kho phải có số lượng dương.");
  }
  if (negativeTypes.has(doc.movementType) && quantitySign >= 0) {
    doc.invalidate("quantityDelta", "Loại xuất kho phải có số lượng âm.");
  }
  if (doc.movementType === "reversal" && !doc.reversalOfId) {
    doc.invalidate("reversalOfId", "Bút toán đảo phải tham chiếu bút toán gốc.");
  }
  if (
    ["adjustment", "count_reconcile", "reversal"].includes(doc.movementType) &&
    !doc.reason
  ) {
    doc.invalidate("reason", "Điều chỉnh hoặc đảo kho phải có lý do.");
  }
});

rejectAppendOnlyMutations(StockMovementSchema, "StockMovement");

export const StockMovement =
  mongoose.models.V2StockMovement ??
  mongoose.model("V2StockMovement", StockMovementSchema);
