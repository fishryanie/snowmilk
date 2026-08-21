import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const ProductGroupSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      maxlength: 64,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  schemaOptions,
);

export const ProductGroup =
  mongoose.models.ProductGroup ??
  mongoose.model("ProductGroup", ProductGroupSchema);
