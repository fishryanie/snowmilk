import mongoose, { Schema } from "mongoose";
import { schemaOptions } from "./helpers";

const PayrollAllocationSchema = new Schema(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "PayrollEmployee",
      required: true,
    },
    employeeName: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    sharePercent: {
      type: Number,
      required: true,
      min: 0.01,
      max: 100,
    },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const PayrollPeriodSettlementSchema = new Schema(
  {
    period: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
      index: true,
    },
    closedAt: { type: Date, required: true, index: true },
    periodRevenue: { type: Number, required: true, min: 0 },
    periodPurchaseTotal: { type: Number, required: true, min: 0 },
    periodExpenseTotal: { type: Number, required: true, min: 0 },
    periodEquipmentTotal: { type: Number, required: true, min: 0 },
    cumulativeRevenue: { type: Number, required: true, min: 0 },
    cumulativeCosts: { type: Number, required: true, min: 0 },
    businessCashBalance: { type: Number, required: true },
    outstandingOwnerCapital: { type: Number, required: true, min: 0 },
    workingCapitalReserve: { type: Number, required: true, min: 0 },
    distributablePool: { type: Number, required: true, min: 0 },
    allocatedTotal: { type: Number, required: true, min: 0 },
    unallocatedPool: { type: Number, required: true, min: 0 },
    allocations: {
      type: [PayrollAllocationSchema],
      default: [],
    },
  },
  schemaOptions,
);

const cachedPayrollPeriodSettlement =
  mongoose.models.PayrollPeriodSettlement;

if (
  process.env.NODE_ENV !== "production" &&
  cachedPayrollPeriodSettlement &&
  (!cachedPayrollPeriodSettlement.schema.path("businessCashBalance") ||
    !cachedPayrollPeriodSettlement.schema.path("outstandingOwnerCapital"))
) {
  mongoose.deleteModel("PayrollPeriodSettlement");
}

export const PayrollPeriodSettlement =
  mongoose.models.PayrollPeriodSettlement ??
  mongoose.model(
    "PayrollPeriodSettlement",
    PayrollPeriodSettlementSchema,
  );
