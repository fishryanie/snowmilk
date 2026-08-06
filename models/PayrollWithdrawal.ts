import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const PayrollPayslipSnapshotSchema = new Schema(
  {
    calculationVersion: { type: String, required: true, trim: true },
    employeeRole: { type: String, required: true, trim: true },
    periodRevenue: { type: Number, required: true, min: 0 },
    periodPurchaseTotal: { type: Number, required: true, min: 0 },
    periodExpenseTotal: { type: Number, required: true, min: 0 },
    periodEquipmentTotal: { type: Number, required: true, min: 0 },
    cumulativeRevenue: { type: Number, required: true, min: 0 },
    companyFundedOutflow: { type: Number, required: true, min: 0 },
    businessCashBalance: { type: Number, required: true },
    outstandingOwnerCapital: { type: Number, required: true, min: 0 },
    previouslySettledPools: { type: Number, required: true, min: 0 },
    workingCapitalReserve: { type: Number, required: true, min: 0 },
    distributablePool: { type: Number, required: true, min: 0 },
    allocatedTotal: { type: Number, required: true, min: 0 },
    unallocatedPool: { type: Number, required: true, min: 0 },
    employeeEntitlement: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

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
    payslipSnapshot: {
      type: PayrollPayslipSnapshotSchema,
      required: false,
    },
  },
  schemaOptions,
);

PayrollWithdrawalSchema.index(
  { employeeId: 1, period: 1 },
  { unique: true },
);

const cachedPayrollWithdrawal = mongoose.models.PayrollWithdrawal;

if (
  process.env.NODE_ENV !== "production" &&
  cachedPayrollWithdrawal &&
  !cachedPayrollWithdrawal.schema.path("payslipSnapshot")
) {
  mongoose.deleteModel("PayrollWithdrawal");
}

export const PayrollWithdrawal =
  mongoose.models.PayrollWithdrawal ??
  mongoose.model("PayrollWithdrawal", PayrollWithdrawalSchema);
