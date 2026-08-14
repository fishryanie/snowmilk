import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  DATA_QUALITY_VALUES,
  decimalField,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

export const INVENTORY_LOT_STATUSES = [
  "available",
  "quarantined",
  "depleted",
  "expired",
  "discarded",
] as const;

const InventoryLotSchema = new Schema(
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
    lotCode: { type: String, required: true, trim: true, immutable: true },
    sourceType: {
      type: String,
      enum: ["purchase", "production", "opening", "adjustment"],
      required: true,
      immutable: true,
    },
    sourceId: { type: Schema.Types.ObjectId, immutable: true },
    receivedAt: { type: Date, immutable: true },
    producedAt: { type: Date, immutable: true },
    expiresAt: { type: Date, default: null },
    initialQuantity: decimalField({ positive: true, immutable: true }),
    onHandQuantity: decimalField({ default: "0" }),
    unitCostVnd: decimalField({ required: false, default: null, immutable: true }),
    costDataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "missing_cost",
    },
    status: {
      type: String,
      enum: INVENTORY_LOT_STATUSES,
      required: true,
      default: "available",
    },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.inventoryLots),
);

InventoryLotSchema.index(
  { organizationId: 1, locationId: 1, inventoryItemId: 1, lotCode: 1 },
  { unique: true, name: "uq_inventory_lot_code" },
);
InventoryLotSchema.index(
  {
    organizationId: 1,
    locationId: 1,
    inventoryItemId: 1,
    status: 1,
    expiresAt: 1,
  },
  { name: "ix_inventory_lot_fefo" },
);

InventoryLotSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const origin = doc.producedAt ?? doc.receivedAt;
  if (doc.expiresAt && origin && doc.expiresAt <= origin) {
    doc.invalidate("expiresAt", "Hạn dùng phải sau thời điểm nhập hoặc sản xuất.");
  }
  if (doc.costDataQuality === "complete" && doc.unitCostVnd == null) {
    doc.invalidate("unitCostVnd", "Lot có cost hoàn chỉnh phải có đơn giá cost.");
  }
  if (doc.costDataQuality === "missing_cost" && doc.unitCostVnd != null) {
    doc.invalidate(
      "unitCostVnd",
      "Lot thiếu cost không được lưu đơn giá cost giả định.",
    );
  }
});

export const InventoryLot =
  mongoose.models.V2InventoryLot ??
  mongoose.model("V2InventoryLot", InventoryLotSchema);
