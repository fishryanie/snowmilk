import mongoose, { Schema } from "mongoose";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import { schemaOptions, traceFields } from "./helpers";

const ExpenseSchema = new Schema(
  {
    expenseDate: { type: Date, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, required: true },
    fundingSource: {
      type: String,
      enum: PURCHASE_FUNDING_SOURCES,
      default: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      required: true,
      index: true,
    },
    paymentMethod: { type: String, trim: true },
    isRecurring: { type: Boolean, default: false },
    note: String,
    ...traceFields,
  },
  schemaOptions,
);

const cachedExpenseModel = mongoose.models.Expense;

if (
  process.env.NODE_ENV !== "production" &&
  cachedExpenseModel &&
  !cachedExpenseModel.schema.path("fundingSource")
) {
  mongoose.deleteModel("Expense");
}

export const Expense =
  mongoose.models.Expense ?? mongoose.model("Expense", ExpenseSchema);
