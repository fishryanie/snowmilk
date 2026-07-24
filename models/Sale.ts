import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const SaleItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    productCode: { type: String, required: true },
    productName: { type: String, required: true },
    sizeName: String,
    quantity: { type: Number, min: 0, required: true },
    unitPrice: { type: Number, min: 0, required: true },
    unitVariableCost: { type: Number, min: 0, default: 0 },
    revenue: { type: Number, min: 0, default: 0 },
    variableCost: { type: Number, min: 0, default: 0 },
    contributionProfit: { type: Number, default: 0 },
  },
  { _id: false },
);

const DailySizeSummarySchema = new Schema(
  {
    sizeCode: { type: String, required: true },
    sizeName: { type: String, required: true },
    milkMl: { type: Number, min: 0, default: 0 },
    referenceSellingPrice: { type: Number, min: 0, default: 0 },
    quantity: { type: Number, min: 0, required: true },
    milkCostPerCup: { type: Number, min: 0, default: 0 },
    packagingCostPerCup: { type: Number, min: 0, default: 0 },
    toppingCostPerCup: { type: Number, min: 0, default: 0 },
    toppingCostLowPerCup: { type: Number, min: 0, default: 0 },
    toppingCostHighPerCup: { type: Number, min: 0, default: 0 },
    overheadRate: { type: Number, min: 0, default: 0 },
    fixedCostPerCup: { type: Number, min: 0, default: 0 },
    sampleCount: { type: Number, min: 0, default: 0 },
    milkCost: { type: Number, min: 0, default: 0 },
    packagingCost: { type: Number, min: 0, default: 0 },
    toppingCost: { type: Number, min: 0, default: 0 },
    overheadCost: { type: Number, min: 0, default: 0 },
    variableCostPerCup: { type: Number, min: 0, default: 0 },
    variableCost: { type: Number, min: 0, default: 0 },
    fixedCost: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const SaleSchema = new Schema(
  {
    saleDate: { type: Date, required: true, index: true },
    entryMode: {
      type: String,
      enum: ["itemized", "daily-summary"],
      default: "itemized",
      index: true,
    },
    batchId: { type: Schema.Types.ObjectId, ref: "MilkBatch" },
    batchCode: String,
    batchName: { type: String, required: true },
    paymentMethod: {
      type: String,
      enum: ["Tiền mặt", "Chuyển khoản", "Ứng dụng giao hàng", "Khác"],
      default: "Tiền mặt",
    },
    items: { type: [SaleItemSchema], default: [] },
    sizeSummaries: { type: [DailySizeSummarySchema], default: [] },
    totalCups: { type: Number, min: 0, default: 0 },
    cupCountSource: {
      type: String,
      enum: ["estimated", "actual-total", "actual"],
      default: "estimated",
    },
    milkLitersSold: { type: Number, min: 0, default: 0 },
    estimatedMilkLiters: { type: Number, min: 0, default: 0 },
    milkDifferenceLiters: { type: Number, default: 0 },
    estimatedReferenceRevenue: { type: Number, min: 0, default: 0 },
    revenueDifference: { type: Number, default: 0 },
    grossRevenue: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    netRevenue: { type: Number, default: 0 },
    cashReceived: { type: Number, min: 0, default: null },
    bankTransferReceived: { type: Number, min: 0, default: null },
    averageRevenuePerCup: { type: Number, min: 0, default: 0 },
    totalMilkCost: { type: Number, min: 0, default: 0 },
    totalPackagingCost: { type: Number, min: 0, default: 0 },
    estimatedToppingCost: { type: Number, min: 0, default: 0 },
    estimatedOverheadCost: { type: Number, min: 0, default: 0 },
    totalVariableCost: { type: Number, min: 0, default: 0 },
    contributionProfit: { type: Number, default: 0 },
    allocatedFixedCost: { type: Number, min: 0, default: 0 },
    estimatedProfit: { type: Number, default: 0 },
    estimatedProfitLow: { type: Number, default: 0 },
    estimatedProfitHigh: { type: Number, default: 0 },
    estimatedMargin: { type: Number, default: 0 },
    estimationMethod: String,
    note: String,
    ...traceFields,
  },
  schemaOptions,
);

SaleSchema.index(
  { saleDate: 1, batchName: 1, paymentMethod: 1 },
  { unique: true },
);

const cachedSaleModel = mongoose.models.Sale;
const cachedCupCountSourcePath = cachedSaleModel?.schema.path(
  "cupCountSource",
) as { enumValues?: string[] } | undefined;

if (
  process.env.NODE_ENV !== "production" &&
  cachedSaleModel &&
  (!cachedSaleModel.schema.path("cashReceived") ||
    !cachedSaleModel.schema.path("bankTransferReceived") ||
    !cachedCupCountSourcePath?.enumValues?.includes("actual-total"))
) {
  mongoose.deleteModel("Sale");
}

export const Sale = mongoose.models.Sale ?? mongoose.model("Sale", SaleSchema);
