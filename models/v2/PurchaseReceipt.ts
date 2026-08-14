import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  decimalField,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

export const PURCHASE_RECEIPT_STATUSES = ["draft", "posted", "voided"] as const;

const SupplierSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, immutable: true },
    contact: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

const PurchaseReceiptLineSchema = new Schema(
  {
    lineKey: { type: String, required: true, trim: true, immutable: true },
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
    unitSnapshot: {
      type: String,
      enum: ["g", "ml", "each"],
      required: true,
      immutable: true,
    },
    quantity: decimalField({ positive: true, immutable: true }),
    unitCostVnd: decimalField({ positive: true, immutable: true }),
    totalAmountVnd: vndField({ immutable: true }),
    lotCodeSnapshot: { type: String, trim: true, default: null, immutable: true },
    expiresAt: { type: Date, default: null, immutable: true },
    stockMovementId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      required: true,
      immutable: true,
    },
  },
  { _id: false },
);

const PurchaseReceiptSchema = new Schema(
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
    receiptCode: { type: String, required: true, trim: true, immutable: true },
    supplierSnapshot: {
      type: SupplierSnapshotSchema,
      required: true,
      immutable: true,
    },
    businessDate: { ...businessDateField, immutable: true },
    receivedAt: { type: Date, required: true, immutable: true },
    lines: {
      type: [PurchaseReceiptLineSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (value: unknown[]) => value.length > 0,
        message: "Phiếu nhập phải có ít nhất một dòng.",
      },
    },
    totalAmountVnd: vndField({ immutable: true }),
    status: {
      type: String,
      enum: PURCHASE_RECEIPT_STATUSES,
      required: true,
      default: "posted",
    },
    postedAt: { type: Date, required: true, immutable: true },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    requestHash: {
      type: String,
      required: true,
      trim: true,
      match: /^[a-f\d]{64}$/,
      immutable: true,
    },
    note: { type: String, trim: true, immutable: true },
    version: versionField,
    actor: { type: ActorSchema, required: true, immutable: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.purchaseReceipts),
);

PurchaseReceiptSchema.index(
  { organizationId: 1, locationId: 1, receiptCode: 1 },
  { unique: true, name: "uq_purchase_receipt_code" },
);
PurchaseReceiptSchema.index(
  { organizationId: 1, locationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "uq_purchase_receipt_idempotency",
  },
);
PurchaseReceiptSchema.index(
  { organizationId: 1, locationId: 1, businessDate: -1, receivedAt: -1 },
  { name: "ix_purchase_receipt_history" },
);

PurchaseReceiptSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const total = (doc.lines as V2HookDocument[]).reduce(
    (sum, line) => sum + BigInt(line.totalAmountVnd),
    BigInt(0),
  );
  if (total !== BigInt(doc.totalAmountVnd)) {
    doc.invalidate("totalAmountVnd", "Tổng phiếu phải bằng tổng thành tiền các dòng.");
  }
  const keys = (doc.lines as V2HookDocument[]).map((line) => line.lineKey);
  if (new Set(keys).size !== keys.length) {
    doc.invalidate("lines", "lineKey trong phiếu nhập phải duy nhất.");
  }
});

export const PurchaseReceipt =
  mongoose.models.V2PurchaseReceipt ??
  mongoose.model("V2PurchaseReceipt", PurchaseReceiptSchema);
