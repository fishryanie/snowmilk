import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const PayrollEmployeeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    sharePercent: { type: Number, required: true, min: 0.01, max: 100 },
    joinedAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  schemaOptions,
);

PayrollEmployeeSchema.index({ name: 1, role: 1 });

export const PayrollEmployee =
  mongoose.models.PayrollEmployee ??
  mongoose.model("PayrollEmployee", PayrollEmployeeSchema);
