import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const SizeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true, unique: true },
    milkMl: { type: Number, min: 0, required: true },
    cupSetName: { type: String, required: true, trim: true },
    sellingPrice: { type: Number, min: 0, required: true },
    isActive: { type: Boolean, default: true },
    ...traceFields,
  },
  schemaOptions,
);

export const ProductSize =
  mongoose.models.ProductSize ??
  mongoose.model("ProductSize", SizeSchema);
