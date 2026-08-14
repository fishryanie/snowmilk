import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  businessDateField,
  compareDecimalStringsExact,
  DATA_QUALITY_VALUES,
  decimalField,
  type V2HookDocument,
  UNIT_VALUES,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

export const PRODUCTION_BATCH_STATUSES = [
  "draft",
  "completed",
  "voided",
] as const;

const ProductionInputSchema = new Schema(
  {
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
    },
    inventoryLotId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryLot",
      default: null,
    },
    itemCodeSnapshot: { type: String, required: true, trim: true },
    itemNameSnapshot: { type: String, required: true, trim: true },
    plannedQuantity: decimalField({ required: false }),
    actualQuantity: decimalField({ positive: true }),
    unit: { type: String, enum: UNIT_VALUES, required: true },
    unitCostVnd: decimalField({ required: false }),
    amountVnd: vndField({ required: false, default: null }),
    stockMovementId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      default: null,
    },
  },
  { _id: false },
);

const ProductionBatchSchema = new Schema(
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
    businessDate: businessDateField,
    batchCode: { type: String, required: true, trim: true, immutable: true },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      required: true,
      immutable: true,
    },
    skuCodeSnapshot: { type: String, required: true, trim: true, immutable: true },
    skuNameSnapshot: { type: String, required: true, trim: true, immutable: true },
    recipeVersionId: {
      type: Schema.Types.ObjectId,
      ref: "V2RecipeVersion",
      required: true,
      immutable: true,
    },
    recipeVersionSnapshot: {
      recipeCode: { type: String, required: true, trim: true, immutable: true },
      versionNumber: { type: Number, required: true, min: 1, immutable: true },
      contentHash: { type: String, required: true, trim: true, immutable: true },
    },
    outputInventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    outputItemCodeSnapshot: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    outputItemNameSnapshot: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    outputUnit: { type: String, enum: UNIT_VALUES, required: true, immutable: true },
    plannedOutputQuantity: decimalField({ required: false }),
    goodOutputQuantity: decimalField({ default: "0" }),
    wasteOutputQuantity: decimalField({ default: "0" }),
    actualInputs: { type: [ProductionInputSchema], required: true, default: [] },
    totalActualCostVnd: vndField({ required: false, default: null }),
    actualCostVnd: vndField({ required: false, default: null }),
    actualCostPerOutputUnitVnd: decimalField({ required: false, default: null }),
    costPerOutputVnd: decimalField({ required: false, default: null }),
    costDataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "missing_cost",
    },
    actualYieldPercent: decimalField({ required: false }),
    shelfLifeHours: { type: Number, min: 1, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    outputInventoryLotId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryLot",
      default: null,
    },
    outputStockMovementId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      default: null,
    },
    status: {
      type: String,
      enum: PRODUCTION_BATCH_STATUSES,
      required: true,
      default: "draft",
    },
    voidReason: { type: String, trim: true },
    idempotencyKey: { type: String, trim: true, immutable: true },
    requestHash: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    completionIdempotencyKey: { type: String, trim: true, default: null },
    note: { type: String, trim: true },
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.productionBatches),
);

ProductionBatchSchema.index(
  { organizationId: 1, locationId: 1, batchCode: 1 },
  { unique: true, name: "uq_production_batch_code" },
);
ProductionBatchSchema.index(
  { organizationId: 1, locationId: 1, completionIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { completionIdempotencyKey: { $type: "string" } },
    name: "uq_production_batch_completion_idempotency",
  },
);
ProductionBatchSchema.index(
  { organizationId: 1, locationId: 1, businessDate: -1, status: 1 },
  { name: "ix_production_batch_date_status" },
);
ProductionBatchSchema.index(
  { organizationId: 1, locationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
    name: "uq_production_batch_idempotency",
  },
);

ProductionBatchSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (doc.status === "completed") {
    if (compareDecimalStringsExact(doc.goodOutputQuantity, "0") <= 0) {
      doc.invalidate(
        "goodOutputQuantity",
        "Mẻ hoàn thành phải có thành phẩm đạt lớn hơn 0.",
      );
    }
    if (!doc.completedAt || !doc.outputInventoryLotId) {
      doc.invalidate(
        "completedAt",
        "Mẻ hoàn thành phải có thời điểm hoàn tất và lot thành phẩm.",
      );
    }
    if (!doc.completionIdempotencyKey) {
      doc.invalidate(
        "completionIdempotencyKey",
        "Mẻ hoàn thành phải lưu idempotency key của thao tác hoàn tất.",
      );
    }
    if (doc.actualInputs.length === 0) {
      doc.invalidate("actualInputs", "Mẻ hoàn thành phải có nguyên liệu thực dùng.");
    }
    const completeCostFields = [
      doc.totalActualCostVnd,
      doc.actualCostVnd,
      doc.actualCostPerOutputUnitVnd,
      doc.costPerOutputVnd,
    ];
    if (
      doc.costDataQuality === "complete" &&
      completeCostFields.some((value) => value == null)
    ) {
      doc.invalidate(
        "costDataQuality",
        "Mẻ có cost hoàn chỉnh phải lưu đủ tổng cost và cost mỗi thành phẩm.",
      );
    }
    if (
      doc.costDataQuality === "missing_cost" &&
      completeCostFields.some((value) => value != null)
    ) {
      doc.invalidate(
        "costDataQuality",
        "Mẻ thiếu cost không được lưu cost hoặc lợi nhuận giả định.",
      );
    }
  }
  if (doc.status === "voided" && !doc.voidReason) {
    doc.invalidate("voidReason", "Mẻ hủy phải có lý do.");
  }
  if (doc.expiresAt && doc.completedAt && doc.expiresAt <= doc.completedAt) {
    doc.invalidate("expiresAt", "Hạn dùng phải sau thời điểm hoàn thành.");
  }
});

export const ProductionBatch =
  mongoose.models.V2ProductionBatch ??
  mongoose.model("V2ProductionBatch", ProductionBatchSchema);
