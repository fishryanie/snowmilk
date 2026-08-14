import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  DATA_QUALITY_VALUES,
  decimalField,
  LegacySourceSchema,
  SALES_UNIT_VALUES,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

export const SALES_DAY_STATUSES = ["draft", "closed", "reopened"] as const;
export const QUANTITY_SOURCES = ["actual", "estimated", "legacy"] as const;
export const TENDER_METHODS = [
  "cash",
  "bank_transfer",
  "delivery_app",
  "other",
] as const;

const BusinessLineSnapshotSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: "V2BusinessLine", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    pathCodes: {
      type: [{ type: String, required: true, trim: true, uppercase: true }],
      required: true,
      default: [],
    },
  },
  { _id: false },
);

const CategorySnapshotSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, ref: "V2Category", required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const SalesDayLineSchema = new Schema(
  {
    lineKey: { type: String, required: true, trim: true },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      default: null,
    },
    skuCodeSnapshot: { type: String, required: true, trim: true },
    skuNameSnapshot: { type: String, required: true, trim: true },
    businessLineSnapshot: {
      type: BusinessLineSnapshotSchema,
      required: true,
    },
    categorySnapshot: {
      type: CategorySnapshotSchema,
      default: null,
    },
    quantity: decimalField(),
    quantitySource: {
      type: String,
      enum: QUANTITY_SOURCES,
      required: true,
    },
    salesUnitSnapshot: {
      type: String,
      enum: SALES_UNIT_VALUES,
      required: true,
    },
    unitPriceVnd: vndField({ required: false }),
    grossRevenueVnd: vndField(),
    discountVnd: vndField({ default: 0 }),
    refundVnd: vndField({ default: 0 }),
    netRevenueVnd: vndField(),
    unitCostVnd: decimalField({ required: false }),
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
    },
    legacySource: { type: LegacySourceSchema },
    legacyFinancialSnapshot: { type: Schema.Types.Mixed },
    legacyBatchSnapshot: { type: Schema.Types.Mixed },
    legacySplitProvenance: { type: Schema.Types.Mixed },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const TenderSchema = new Schema(
  {
    method: { type: String, enum: TENDER_METHODS, required: true },
    amountVnd: vndField(),
    reference: { type: String, trim: true },
  },
  { _id: false },
);

const SalesDaySchema = new Schema(
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
    status: {
      type: String,
      enum: SALES_DAY_STATUSES,
      required: true,
      default: "draft",
    },
    lines: { type: [SalesDayLineSchema], required: true, default: [] },
    tenders: { type: [TenderSchema], required: true, default: [] },
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
      default: "complete",
    },
    calculationVersion: {
      type: String,
      required: true,
      trim: true,
      default: "v2",
    },
    idempotencyKey: { type: String, trim: true },
    closedAt: { type: Date, default: null },
    closedBy: { type: ActorSchema, default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: ActorSchema, default: null },
    reopenReason: { type: String, trim: true },
    previousClosedRevisionId: {
      type: Schema.Types.ObjectId,
      ref: "V2SalesDay",
      default: null,
    },
    legacySource: { type: LegacySourceSchema },
    note: { type: String, trim: true },
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.salesDays),
);

SalesDaySchema.index(
  { organizationId: 1, locationId: 1, businessDate: 1 },
  { unique: true, name: "uq_sales_day_business_date" },
);
SalesDaySchema.index(
  { organizationId: 1, locationId: 1, status: 1, businessDate: -1 },
  { name: "ix_sales_day_status_date" },
);
SalesDaySchema.index(
  { organizationId: 1, locationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "uq_sales_day_idempotency",
  },
);
SalesDaySchema.index(
  {
    organizationId: 1,
    "legacySource.sourceCollection": 1,
    "legacySource.sourceId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "legacySource.sourceCollection": { $type: "string" },
      "legacySource.sourceId": { $type: "string" },
    },
    name: "uq_sales_day_legacy_source",
  },
);

SalesDaySchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const lineKeys = doc.lines.map((line: { lineKey: string }) => line.lineKey);
  if (lineKeys.length !== new Set(lineKeys).size) {
    doc.invalidate("lines", "lineKey trong ngày bán phải duy nhất.");
  }
  const tenderMethods = doc.tenders.map(
    (tender: { method: string }) => tender.method,
  );
  if (tenderMethods.length !== new Set(tenderMethods).size) {
    doc.invalidate("tenders", "Mỗi phương thức thanh toán chỉ được xuất hiện một lần.");
  }

  let gross = 0;
  let discount = 0;
  let refund = 0;
  let net = 0;
  let cogs = 0;
  let profit = 0;
  // An empty draft has no cost evidence yet. Treating the vacuous set as
  // complete would force aggregate COGS/profit to zero instead of null.
  let hasCompleteLineCosts = doc.lines.length > 0;
  for (const line of doc.lines) {
    gross += line.grossRevenueVnd;
    discount += line.discountVnd;
    refund += line.refundVnd;
    net += line.netRevenueVnd;
    const hasLineCost = line.cogsVnd != null && line.profitVnd != null;
    if (hasLineCost) {
      cogs += line.cogsVnd;
      profit += line.profitVnd;
    } else {
      hasCompleteLineCosts = false;
    }
    if (line.netRevenueVnd !== line.grossRevenueVnd - line.discountVnd - line.refundVnd) {
      doc.invalidate("lines", `Sai doanh thu thuần tại dòng ${line.lineKey}.`);
    }
    if ((line.cogsVnd == null) !== (line.profitVnd == null)) {
      doc.invalidate("lines", `Cost và lợi nhuận phải cùng có hoặc cùng thiếu tại dòng ${line.lineKey}.`);
    }
    if (hasLineCost && line.profitVnd !== line.netRevenueVnd - line.cogsVnd) {
      doc.invalidate("lines", `Sai lợi nhuận tại dòng ${line.lineKey}.`);
    }
    if (line.dataQuality === "complete" && !hasLineCost) {
      doc.invalidate("lines", `Dòng ${line.lineKey} hoàn chỉnh phải có cost và lợi nhuận.`);
    }
    if (line.dataQuality === "missing_cost" && hasLineCost) {
      doc.invalidate("lines", `Dòng ${line.lineKey} thiếu cost không được ghi lợi nhuận.`);
    }
    if (!line.skuId && !["legacy", "estimated"].includes(line.quantitySource)) {
      doc.invalidate("lines", "Chỉ dòng legacy/estimated được phép không có skuId.");
    }
    if (!line.skuId && !line.legacySource) {
      doc.invalidate("lines", "Dòng không có skuId phải lưu nguồn legacy.");
    }
    if (line.skuId && line.unitPriceVnd == null) {
      doc.invalidate("lines", "Dòng có SKU phải có đơn giá snapshot.");
    }
  }
  const collected = doc.tenders.reduce(
    (total: number, tender: { amountVnd: number }) => total + tender.amountVnd,
    0,
  );
  const matches =
    gross === doc.grossRevenueVnd &&
    discount === doc.discountVnd &&
    refund === doc.refundVnd &&
    net === doc.netRevenueVnd &&
    collected === doc.collectedVnd &&
    (hasCompleteLineCosts
      ? cogs === doc.cogsVnd && profit === doc.profitVnd
      : doc.cogsVnd == null && doc.profitVnd == null);
  if (!matches) {
    doc.invalidate("lines", "Tổng ngày phải bằng tổng các dòng và thanh toán.");
  }
  if (doc.netRevenueVnd !== doc.grossRevenueVnd - doc.discountVnd - doc.refundVnd) {
    doc.invalidate("netRevenueVnd", "Sai công thức doanh thu thuần.");
  }
  if ((doc.cogsVnd == null) !== (doc.profitVnd == null)) {
    doc.invalidate("profitVnd", "Cost và lợi nhuận tổng phải cùng có hoặc cùng thiếu.");
  }
  if (
    doc.cogsVnd != null &&
    doc.profitVnd !== doc.netRevenueVnd - doc.cogsVnd
  ) {
    doc.invalidate("profitVnd", "Sai công thức lợi nhuận.");
  }
  if (doc.dataQuality === "complete" && doc.cogsVnd == null) {
    doc.invalidate("dataQuality", "Ngày hoàn chỉnh phải có cost và lợi nhuận.");
  }
  if (doc.dataQuality === "missing_cost" && doc.cogsVnd != null) {
    doc.invalidate("dataQuality", "Ngày thiếu cost không được ghi lợi nhuận.");
  }
  if (doc.status === "closed") {
    if (!doc.closedAt || !doc.closedBy) {
      doc.invalidate("closedAt", "Ngày đã chốt phải có người và thời điểm chốt.");
    }
    if (!doc.idempotencyKey) {
      doc.invalidate("idempotencyKey", "Chốt ngày phải có idempotency key.");
    }
    if (doc.collectedVnd !== doc.netRevenueVnd) {
      doc.invalidate("collectedVnd", "Tiền đã thu phải bằng doanh thu thuần khi chốt.");
    }
  }
  if (doc.status === "reopened") {
    if (!doc.reopenedAt || !doc.reopenedBy || !doc.reopenReason) {
      doc.invalidate("reopenReason", "Mở lại ngày phải có người, thời điểm và lý do.");
    }
  }
});

export const SalesDay =
  mongoose.models.V2SalesDay ?? mongoose.model("V2SalesDay", SalesDaySchema);
