import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  decimalField,
  decimalDifferenceExact,
  decimalStringsEqual,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

const StockCountLineSchema = new Schema(
  {
    lineKey: { type: String, required: true, trim: true },
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
    },
    inventoryLotId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryLot",
      default: null,
    },
    itemCodeSnapshot: { type: String, required: true, trim: true },
    itemNameSnapshot: { type: String, required: true, trim: true },
    unitSnapshot: { type: String, enum: ["g", "ml", "each"], required: true },
    expectedQuantity: decimalField({ default: "0" }),
    countedQuantity: decimalField({ default: "0" }),
    varianceQuantity: decimalField({ signed: true, default: "0" }),
    unitCostVnd: decimalField({ required: false }),
    varianceValueVnd: vndField({
      required: false,
      default: null,
      signed: true,
    }),
    adjustmentMovementId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      default: null,
    },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const StockCountSchema = new Schema(
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
    businessDate: businessDateField,
    countCode: { type: String, required: true, trim: true, immutable: true },
    countType: {
      type: String,
      enum: ["opening", "cycle", "full"],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["draft", "posted", "cancelled"],
      required: true,
      default: "draft",
    },
    lines: { type: [StockCountLineSchema], required: true, default: [] },
    countedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true },
    idempotencyKey: { type: String, trim: true, immutable: true },
    requestHash: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    note: { type: String, trim: true },
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.stockCounts),
);

StockCountSchema.index(
  { organizationId: 1, locationId: 1, countCode: 1 },
  { unique: true, name: "uq_stock_count_code" },
);
StockCountSchema.index(
  { organizationId: 1, locationId: 1, countType: 1 },
  {
    unique: true,
    partialFilterExpression: { countType: "opening" },
    name: "uq_stock_count_one_opening_per_location",
  },
);
StockCountSchema.index(
  { organizationId: 1, locationId: 1, businessDate: -1, status: 1 },
  { name: "ix_stock_count_date_status" },
);
StockCountSchema.index(
  { organizationId: 1, locationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "uq_stock_count_idempotency",
  },
);
StockCountSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const keys = doc.lines.map((line: { lineKey: string }) => line.lineKey);
  if (new Set(keys).size !== keys.length) {
    doc.invalidate("lines", "lineKey trong phiếu kiểm kho phải duy nhất.");
  }
  for (const line of doc.lines) {
    if (
      !decimalStringsEqual(
        String(line.varianceQuantity),
        decimalDifferenceExact(
          String(line.countedQuantity),
          String(line.expectedQuantity),
        ),
      )
    ) {
      doc.invalidate("lines", `Sai chênh lệch tại dòng ${line.lineKey}.`);
    }
  }
  if (doc.status === "posted") {
    if (!doc.postedAt || doc.lines.length === 0) {
      doc.invalidate("postedAt", "Phiếu đã ghi sổ phải có dòng và thời điểm ghi sổ.");
    }
    const missingMovement = doc.lines.some(
      (line: { varianceQuantity: unknown; adjustmentMovementId?: unknown }) =>
        !decimalStringsEqual(String(line.varianceQuantity), "0") &&
        !line.adjustmentMovementId,
    );
    if (missingMovement) {
      doc.invalidate("lines", "Mọi chênh lệch đã ghi sổ phải có stock movement.");
    }
  }
  if (doc.status === "cancelled" && !doc.cancellationReason) {
    doc.invalidate("cancellationReason", "Phiếu hủy phải có lý do.");
  }
});

export const StockCount =
  mongoose.models.V2StockCount ??
  mongoose.model("V2StockCount", StockCountSchema);
