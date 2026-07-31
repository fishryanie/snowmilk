import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const PayrollWithdrawalSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "PayrollEmployee",
      required: true,
      index: true,
    },
    employeeName: { type: String, required: true, trim: true },
    period: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },
    withdrawalDate: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    entitlementSnapshot: { type: Number, required: true, min: 1 },
    sharePercentSnapshot: {
      type: Number,
      required: true,
      min: 0.01,
      max: 100,
    },
    note: { type: String, trim: true },
  },
  schemaOptions,
);

PayrollWithdrawalSchema.index(
  { employeeId: 1, period: 1 },
  { unique: true },
);

export const PayrollWithdrawal =
  mongoose.models.PayrollWithdrawal ??
  mongoose.model("PayrollWithdrawal", PayrollWithdrawalSchema);
