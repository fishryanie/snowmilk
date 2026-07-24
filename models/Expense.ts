import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const ExpenseSchema = new Schema(
  {
    expenseDate: { type: Date, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, required: true },
    paymentMethod: { type: String, trim: true },
    isRecurring: { type: Boolean, default: false },
    note: String,
    ...traceFields,
  },
  schemaOptions,
);

export const Expense =
  mongoose.models.Expense ?? mongoose.model("Expense", ExpenseSchema);
