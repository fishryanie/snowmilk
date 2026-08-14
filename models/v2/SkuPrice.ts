import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

const SkuPriceSchema = new Schema(
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
      default: null,
      immutable: true,
    },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      required: true,
      immutable: true,
    },
    unitPriceVnd: vndField({ immutable: true }),
    currency: {
      type: String,
      enum: ["VND"],
      required: true,
      default: "VND",
      immutable: true,
    },
    effectiveFrom: { type: Date, required: true, immutable: true },
    effectiveTo: { type: Date, default: null },
    note: { type: String, trim: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.skuPrices),
);

SkuPriceSchema.index(
  { organizationId: 1, locationId: 1, skuId: 1, effectiveFrom: 1 },
  { unique: true, name: "uq_sku_price_effective_start" },
);
SkuPriceSchema.index(
  { organizationId: 1, locationId: 1, skuId: 1, isActive: 1, effectiveTo: 1 },
  { name: "ix_sku_price_current" },
);

SkuPriceSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.effectiveTo && doc.effectiveTo <= doc.effectiveFrom) {
    doc.invalidate("effectiveTo", "Ngày kết thúc phải sau ngày bắt đầu.");
  }
});

export const SkuPrice =
  mongoose.models.V2SkuPrice ?? mongoose.model("V2SkuPrice", SkuPriceSchema);
