import mongoose, { Schema } from "mongoose";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import { schemaOptions, traceFields } from "./helpers";

const EquipmentSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    purchaseDate: { type: Date, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    quantity: { type: Number, min: 0, required: true },
    unitPrice: { type: Number, min: 0, required: true },
    totalAmount: { type: Number, min: 0, required: true },
    fundingSource: {
      type: String,
      enum: PURCHASE_FUNDING_SOURCES,
      default: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      required: true,
      index: true,
    },
    residualValue: { type: Number, min: 0, default: 0 },
    usefulLifeMonths: { type: Number, min: 1 },
    monthlyDepreciation: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["using", "broken", "disposed"],
      default: "using",
    },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

const cachedEquipmentModel = mongoose.models.Equipment;

if (
  process.env.NODE_ENV !== "production" &&
  cachedEquipmentModel &&
  !cachedEquipmentModel.schema.path("fundingSource")
) {
  mongoose.deleteModel("Equipment");
}

export const Equipment =
  mongoose.models.Equipment ?? mongoose.model("Equipment", EquipmentSchema);
