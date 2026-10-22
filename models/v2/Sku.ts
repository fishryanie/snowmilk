import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  LegacySourceSchema,
  SALES_UNIT_VALUES,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

export const FULFILLMENT_MODES = [
  "made_to_order",
  "preproduced",
] as const;

const SkuSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    catalogProductId: {
      type: Schema.Types.ObjectId,
      ref: "V2CatalogProduct",
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
    variantName: { type: String, trim: true },
    businessLineId: {
      type: Schema.Types.ObjectId,
      ref: "V2BusinessLine",
      required: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "V2Category",
      required: true,
    },
    salesUnit: { type: String, enum: SALES_UNIT_VALUES, required: true },
    fulfillmentMode: {
      type: String,
      enum: FULFILLMENT_MODES,
      required: true,
    },
    outputInventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      default: null,
    },
    currentRecipeVersionId: {
      type: Schema.Types.ObjectId,
      ref: "V2RecipeVersion",
      default: null,
    },
    sortOrder: { type: Number, required: true, min: 0, default: 0 },
    legacySource: { type: LegacySourceSchema },
    // Historical reference retained for migrated catalogue records.
    legacyCostSnapshot: { type: Schema.Types.Mixed, immutable: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.skus),
);

SkuSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_sku_org_code" },
);
SkuSchema.index(
  { organizationId: 1, businessLineId: 1, isActive: 1, sortOrder: 1 },
  { name: "ix_sku_business_line" },
);
SkuSchema.index(
  { organizationId: 1, catalogProductId: 1, isActive: 1 },
  { name: "ix_sku_catalog_product" },
);
SkuSchema.index(
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
    name: "uq_sku_legacy_source",
  },
);

export const Sku =
  mongoose.models.V2Sku ?? mongoose.model("V2Sku", SkuSchema);
