import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  LegacySourceSchema,
  UNIT_VALUES,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

export const INVENTORY_ITEM_TYPES = [
  "raw_material",
  "packaging",
  "semi_finished",
  "finished_good",
] as const;

const InventoryItemSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9][A-Z0-9_-]*$/,
      immutable: true,
    },
    name: { type: String, required: true, trim: true },
    itemType: { type: String, enum: INVENTORY_ITEM_TYPES, required: true },
    baseUnit: { type: String, enum: UNIT_VALUES, required: true, immutable: true },
    costingMethod: {
      type: String,
      enum: ["weighted_average", "fifo"],
      required: true,
      default: "weighted_average",
    },
    lotTracked: { type: Boolean, required: true, default: false },
    expiryTracked: { type: Boolean, required: true, default: false },
    allowNegativeStock: { type: Boolean, required: true, default: false },
    linkedSkuId: { type: Schema.Types.ObjectId, ref: "V2Sku", default: null },
    legacySource: { type: LegacySourceSchema },
    // Historical source reference only; an owner-confirmed opening count must
    // explicitly choose whether to use a cost for the operational ledger.
    legacyCostSnapshot: { type: Schema.Types.Mixed, immutable: true },
    note: { type: String, trim: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.inventoryItems),
);

InventoryItemSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_inventory_item_org_code" },
);
InventoryItemSchema.index(
  { organizationId: 1, itemType: 1, isActive: 1, name: 1 },
  { name: "ix_inventory_item_type" },
);
InventoryItemSchema.index(
  {
    organizationId: 1,
    "legacySource.sourceCollection": 1,
    "legacySource.sourceId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "legacySource.sourceCollection": { $type: "string" },
      "legacySource.sourceId": { $type: "string" },
    },
    name: "uq_inventory_item_legacy_source",
  },
);

InventoryItemSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.expiryTracked && !doc.lotTracked) {
    doc.invalidate("expiryTracked", "Theo dõi hạn dùng yêu cầu theo dõi lot.");
  }
  if (doc.itemType === "finished_good" && !doc.linkedSkuId) {
    doc.invalidate("linkedSkuId", "Thành phẩm bán phải liên kết với SKU.");
  }
});

export const InventoryItem =
  mongoose.models.V2InventoryItem ??
  mongoose.model("V2InventoryItem", InventoryItemSchema);
