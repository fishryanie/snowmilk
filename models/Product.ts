import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const ProductSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    toppingIngredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    sizeId: { type: Schema.Types.ObjectId, ref: "ProductSize" },
    milkBatchId: { type: Schema.Types.ObjectId, ref: "MilkBatch" },
    milkBatchCode: { type: String, trim: true },
    milkBatchName: { type: String, trim: true },
    toppingName: { type: String, trim: true },
    sizeName: { type: String, trim: true },
    milkMl: { type: Number, min: 0, default: 0 },
    toppingGrams: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, required: true },
    milkCost: { type: Number, min: 0, default: 0 },
    toppingCost: { type: Number, min: 0, default: 0 },
    packagingCost: { type: Number, min: 0, default: 0 },
    overheadCost: { type: Number, min: 0, default: 0 },
    variableCost: { type: Number, min: 0, default: 0 },
    allocatedFixedCost: { type: Number, min: 0, default: 0 },
    fullCost: { type: Number, min: 0, default: 0 },
    hasCostWarning: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    ...traceFields,
  },
  schemaOptions,
);

export const Product =
  mongoose.models.Product ?? mongoose.model("Product", ProductSchema);
