import mongoose, { Schema } from "mongoose";
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

export const Equipment =
  mongoose.models.Equipment ?? mongoose.model("Equipment", EquipmentSchema);
