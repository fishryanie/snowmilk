import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  compareDecimalStringsExact,
  DATA_QUALITY_VALUES,
  decimalField,
  LegacySourceSchema,
  rejectAppendOnlyMutations,
  SALES_UNIT_VALUES,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

const RevenueEntrySchema = new Schema(
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
    salesDayId: {
      type: Schema.Types.ObjectId,
      ref: "V2SalesDay",
      required: true,
      immutable: true,
    },
    lineKey: { type: String, required: true, trim: true, immutable: true },
    businessDate: { ...businessDateField, immutable: true },
    entryType: {
      type: String,
      enum: ["sale", "reversal"],
      required: true,
      immutable: true,
    },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      default: null,
      immutable: true,
    },
    skuCodeSnapshot: { type: String, required: true, trim: true, immutable: true },
    skuNameSnapshot: { type: String, required: true, trim: true, immutable: true },
    businessLineId: {
      type: Schema.Types.ObjectId,
      ref: "V2BusinessLine",
      required: true,
      immutable: true,
    },
    businessLineCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    businessLineNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    businessLinePathCodesSnapshot: {
      type: [{ type: String, trim: true, uppercase: true }],
      required: true,
      default: [],
      immutable: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "V2Category",
      default: null,
      immutable: true,
    },
    categoryCodeSnapshot: { type: String, trim: true, immutable: true },
    categoryNameSnapshot: { type: String, trim: true, immutable: true },
    quantity: decimalField({ signed: true, immutable: true }),
    quantitySource: {
      type: String,
      enum: ["actual", "estimated", "legacy"],
      required: true,
      immutable: true,
    },
    salesUnitSnapshot: {
      type: String,
      enum: SALES_UNIT_VALUES,
      required: true,
      immutable: true,
    },
    grossRevenueVnd: vndField({ signed: true, immutable: true }),
    discountVnd: vndField({ signed: true, immutable: true }),
    refundVnd: vndField({ signed: true, immutable: true }),
    netRevenueVnd: vndField({ signed: true, immutable: true }),
    cogsVnd: vndField({
      required: false,
      default: null,
      signed: true,
      immutable: true,
    }),
    profitVnd: vndField({
      required: false,
      default: null,
      signed: true,
      immutable: true,
    }),
    dataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      immutable: true,
    },
    calculationVersion: { type: String, required: true, trim: true, immutable: true },
    reversalOfId: {
      type: Schema.Types.ObjectId,
      ref: "V2RevenueEntry",
      default: null,
      immutable: true,
    },
    reversalReason: { type: String, trim: true, immutable: true },
    legacySource: { type: LegacySourceSchema, immutable: true },
    idempotencyKey: { type: String, required: true, trim: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    version: { ...versionField, immutable: true },
    actor: { type: ActorSchema, required: true, immutable: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.revenueEntries),
);

RevenueEntrySchema.index(
  { organizationId: 1, salesDayId: 1, lineKey: 1, entryType: 1 },
  { unique: true, name: "uq_revenue_entry_sales_line" },
);
RevenueEntrySchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, name: "uq_revenue_entry_idempotency" },
);
RevenueEntrySchema.index(
  { organizationId: 1, locationId: 1, businessDate: 1, businessLineId: 1 },
  { name: "ix_revenue_entry_reporting" },
);
RevenueEntrySchema.index(
  { organizationId: 1, reversalOfId: 1 },
  {
    unique: true,
    partialFilterExpression: { reversalOfId: { $type: "objectId" } },
    name: "uq_revenue_entry_reversal",
  },
);

RevenueEntrySchema.pre("validate", function () {
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
    doc.invalidate("dataQuality", "Bút toán hoàn chỉnh phải có cost và lợi nhuận.");
  }
  if (doc.dataQuality === "missing_cost" && doc.cogsVnd != null) {
    doc.invalidate("dataQuality", "Bút toán thiếu cost không được ghi lợi nhuận.");
  }
  if (doc.entryType === "reversal" && (!doc.reversalOfId || !doc.reversalReason)) {
    doc.invalidate("reversalOfId", "Bút toán đảo phải có bút toán gốc và lý do.");
  }
  const quantitySign = compareDecimalStringsExact(doc.quantity, "0");
  if (doc.entryType === "sale" && quantitySign < 0) {
    doc.invalidate("quantity", "Bút toán bán phải có số lượng không âm.");
  }
  if (doc.entryType === "reversal" && quantitySign > 0) {
    doc.invalidate("quantity", "Bút toán đảo phải có số lượng không dương.");
  }
  if (!doc.skuId && !doc.legacySource) {
    doc.invalidate("skuId", "Dòng không có skuId phải lưu nguồn legacy.");
  }
});

rejectAppendOnlyMutations(RevenueEntrySchema, "RevenueEntry");

export const RevenueEntry =
  mongoose.models.V2RevenueEntry ??
  mongoose.model("V2RevenueEntry", RevenueEntrySchema);
