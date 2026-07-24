import mongoose, { Schema } from "mongoose";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import { schemaOptions, traceFields } from "./helpers";

const PurchaseSchema = new Schema(
  {
    purchaseDate: { type: Date, required: true, index: true },
    ingredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    itemCode: { type: String, trim: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    packageCount: { type: Number, min: 0, required: true },
    packageQuantity: { type: Number, min: 0, default: 1 },
    costUnit: { type: String, trim: true },
    referencePackagePrice: { type: Number, min: 0, default: 0 },
    actualPackagePrice: { type: Number, min: 0, required: true },
    convertedQuantity: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, required: true },
    fundingSource: {
      type: String,
      enum: PURCHASE_FUNDING_SOURCES,
      default: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      required: true,
      index: true,
    },
    supplier: { type: String, trim: true },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

const cachedPurchaseModel = mongoose.models.Purchase;

if (
  process.env.NODE_ENV !== "production" &&
  cachedPurchaseModel &&
  !cachedPurchaseModel.schema.path("fundingSource")
) {
  mongoose.deleteModel("Purchase");
}

export const Purchase =
  mongoose.models.Purchase ?? mongoose.model("Purchase", PurchaseSchema);
