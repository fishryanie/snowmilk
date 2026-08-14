import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  LegacySourceSchema,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const RecipeSchema = new Schema(
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
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      required: true,
      immutable: true,
    },
    outputInventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: "V2RecipeVersion",
      default: null,
    },
    legacySource: { type: LegacySourceSchema },
    note: { type: String, trim: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.recipes),
);

RecipeSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, name: "uq_recipe_org_code" },
);
RecipeSchema.index(
  { organizationId: 1, skuId: 1, isActive: 1 },
  { name: "ix_recipe_sku_active" },
);
RecipeSchema.index(
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
    name: "uq_recipe_legacy_source",
  },
);

export const Recipe =
  mongoose.models.V2Recipe ?? mongoose.model("V2Recipe", RecipeSchema);
