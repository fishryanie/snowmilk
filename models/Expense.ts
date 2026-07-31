import mongoose, { Schema } from "mongoose";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCES,
} from "@/lib/purchase-funding";
import {
  DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
  EXPENSE_PAYMENT_STATUSES,
} from "@/lib/expense-payment-status";
import { schemaOptions, traceFields } from "./helpers";

const ExpenseSchema = new Schema(
  {
    expenseDate: { type: Date, required: true, index: true },
    category: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0, required: true },
    paymentStatus: {
      type: String,
      enum: EXPENSE_PAYMENT_STATUSES,
      default: DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
      required: true,
      index: true,
    },
    fundingSource: {
      type: String,
      enum: PURCHASE_FUNDING_SOURCES,
      default: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      required: true,
      index: true,
    },
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
  (!cachedExpenseModel.schema.path("fundingSource") ||
    !cachedExpenseModel.schema.path("paymentStatus") ||
    Boolean(cachedExpenseModel.schema.path("paymentMethod")))
) {
  mongoose.deleteModel("Expense");
}

export const Expense =
  mongoose.models.Expense ?? mongoose.model("Expense", ExpenseSchema);
