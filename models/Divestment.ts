import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const DivestmentSchema = new Schema(
  {
    withdrawalDate: { type: Date, required: true, index: true },
    amount: { type: Number, min: 1, required: true },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

export const Divestment =
  mongoose.models.Divestment ??
  mongoose.model("Divestment", DivestmentSchema);
