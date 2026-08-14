import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  LegacySourceSchema,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const CatalogProductSchema = new Schema(
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
    description: { type: String, trim: true },
    defaultBusinessLineId: {
      type: Schema.Types.ObjectId,
      ref: "V2BusinessLine",
      required: true,
    },
    defaultCategoryId: {
      type: Schema.Types.ObjectId,
      ref: "V2Category",
      required: true,
    },
    imageUrl: { type: String, trim: true },
    sortOrder: { type: Number, required: true, min: 0, default: 0 },
    legacySource: { type: LegacySourceSchema },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.catalogProducts),
);

CatalogProductSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_catalog_product_org_code" },
);
CatalogProductSchema.index(
  { organizationId: 1, defaultCategoryId: 1, isActive: 1, sortOrder: 1 },
  { name: "ix_catalog_product_category" },
);
CatalogProductSchema.index(
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
    name: "uq_catalog_product_legacy_source",
  },
);

export const CatalogProduct =
  mongoose.models.V2CatalogProduct ??
  mongoose.model("V2CatalogProduct", CatalogProductSchema);
