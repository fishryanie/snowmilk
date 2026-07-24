import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const IngredientSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Nguyên liệu", "Topping", "Bao bì", "Khác"],
      default: "Khác",
    },
    purchaseUnit: { type: String, trim: true },
    packageQuantity: { type: Number, min: 0, default: 1 },
    costUnit: { type: String, trim: true },
    referencePackagePrice: { type: Number, min: 0, default: 0 },
    averageUnitCost: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

export const Ingredient =
  mongoose.models.Ingredient ?? mongoose.model("Ingredient", IngredientSchema);
