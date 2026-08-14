import mongoose, { Schema } from "mongoose";
import {
  businessDateField,
  DATA_QUALITY_VALUES,
  decimalField,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

const RevenueDimensionFactSchema = new Schema(
  {
    dimensionType: {
      type: String,
      enum: ["business_line", "sku", "tender"],
      required: true,
    },
    dimensionId: { type: Schema.Types.ObjectId, default: null },
    dimensionCode: { type: String, required: true, trim: true },
    dimensionName: { type: String, required: true, trim: true },
    quantity: decimalField({ default: "0" }),
    grossRevenueVnd: vndField({ default: 0 }),
    discountVnd: vndField({ default: 0 }),
    refundVnd: vndField({ default: 0 }),
    netRevenueVnd: vndField({ default: 0 }),
    collectedVnd: vndField({ default: 0 }),
    cogsVnd: vndField({ required: false, default: null }),
    profitVnd: vndField({
      required: false,
      signed: true,
      default: null,
    }),
    dataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "missing_cost",
    },
  },
  { _id: false },
);

const DailyRevenueFactSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    locationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Location",
      required: true,
      immutable: true,
    },
    businessDate: { ...businessDateField, immutable: true },
    salesDayId: {
      type: Schema.Types.ObjectId,
      ref: "V2SalesDay",
      required: true,
    },
    salesDayVersion: { type: Number, required: true, min: 1 },
    grossRevenueVnd: vndField({ default: 0 }),
    discountVnd: vndField({ default: 0 }),
    refundVnd: vndField({ default: 0 }),
    netRevenueVnd: vndField({ default: 0 }),
    collectedVnd: vndField({ default: 0 }),
    cogsVnd: vndField({ required: false, default: null }),
    profitVnd: vndField({
      required: false,
      signed: true,
      default: null,
    }),
    dimensions: { type: [RevenueDimensionFactSchema], required: true, default: [] },
    dataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "complete",
    },
    calculationVersion: { type: String, required: true, trim: true },
    rebuiltAt: { type: Date, required: true },
    sourceChecksum: { type: String, required: true, trim: true },
    version: versionField,
  },
  v2SchemaOptions(V2_COLLECTIONS.dailyRevenueFacts),
);

DailyRevenueFactSchema.index(
  { organizationId: 1, locationId: 1, businessDate: 1 },
  { unique: true, name: "uq_daily_revenue_fact_date" },
);
DailyRevenueFactSchema.index(
  { organizationId: 1, businessDate: 1, "dimensions.dimensionCode": 1 },
  { name: "ix_daily_revenue_fact_dimension" },
);

DailyRevenueFactSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.netRevenueVnd !== doc.grossRevenueVnd - doc.discountVnd - doc.refundVnd) {
    doc.invalidate("netRevenueVnd", "Sai công thức doanh thu thuần.");
  }
  if ((doc.cogsVnd == null) !== (doc.profitVnd == null)) {
    doc.invalidate("profitVnd", "Cost và lợi nhuận phải cùng có hoặc cùng thiếu.");
  }
  if (doc.cogsVnd != null && doc.profitVnd !== doc.netRevenueVnd - doc.cogsVnd) {
    doc.invalidate("profitVnd", "Sai công thức lợi nhuận.");
  }
  if (doc.dataQuality === "complete" && doc.cogsVnd == null) {
    doc.invalidate("dataQuality", "Fact hoàn chỉnh phải có cost và lợi nhuận.");
  }
  if (doc.dataQuality === "missing_cost" && doc.cogsVnd != null) {
    doc.invalidate("dataQuality", "Fact thiếu cost không được ghi lợi nhuận.");
  }
  for (const dimension of doc.dimensions) {
    if (
      dimension.netRevenueVnd !==
      dimension.grossRevenueVnd - dimension.discountVnd - dimension.refundVnd
    ) {
      doc.invalidate(
        "dimensions",
        `Sai doanh thu thuần tại dimension ${dimension.dimensionCode}.`,
      );
    }
    if ((dimension.cogsVnd == null) !== (dimension.profitVnd == null)) {
      doc.invalidate(
        "dimensions",
        `Cost và lợi nhuận không đồng nhất tại dimension ${dimension.dimensionCode}.`,
      );
    }
    if (
      dimension.cogsVnd != null &&
      dimension.profitVnd !== dimension.netRevenueVnd - dimension.cogsVnd
    ) {
      doc.invalidate(
        "dimensions",
        `Sai lợi nhuận tại dimension ${dimension.dimensionCode}.`,
      );
    }
  }
});

export const DailyRevenueFact =
  mongoose.models.V2DailyRevenueFact ??
  mongoose.model("V2DailyRevenueFact", DailyRevenueFactSchema);
