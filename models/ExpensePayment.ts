import mongoose, { Schema } from "mongoose";
import { PURCHASE_FUNDING_SOURCES } from "@/lib/purchase-funding";
import { schemaOptions } from "./helpers";

const ExpensePaymentLineSchema = new Schema(
  {
    expenseId: {
      type: Schema.Types.ObjectId,
      ref: "Expense",
      required: true,
    },
    sourcePurchaseId: { type: Schema.Types.ObjectId, ref: "Purchase" },
    milkLiters: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const ExpensePaymentSchema = new Schema(
  {
    paidAt: { type: Date, required: true, index: true },
    provider: { type: String, trim: true, required: true },
    fundingSource: {
      type: String,
      enum: PURCHASE_FUNDING_SOURCES,
      required: true,
    },
    totalLiters: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, required: true },
    lines: { type: [ExpensePaymentLineSchema], default: [] },
  },
  schemaOptions,
);

export const ExpensePayment =
  mongoose.models.ExpensePayment ??
  mongoose.model("ExpensePayment", ExpensePaymentSchema);
