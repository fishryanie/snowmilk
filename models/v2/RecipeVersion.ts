import mongoose, { Schema } from "mongoose";
import {
  activeField,
  ActorSchema,
  DATA_QUALITY_VALUES,
  decimalField,
  LegacySourceSchema,
  UNIT_VALUES,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  V2_COLLECTIONS,
} from "./helpers";

const FinishedSpecLineSchema = new Schema(
  {
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      default: null,
      immutable: true,
    },
    itemCode: { type: String, required: true, trim: true, immutable: true },
    itemName: { type: String, required: true, trim: true, immutable: true },
    quantity: decimalField({ positive: true, immutable: true }),
    unit: { type: String, enum: UNIT_VALUES, required: true, immutable: true },
    preparationNote: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

const RecipeComponentSchema = new Schema(
  {
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    itemCode: { type: String, required: true, trim: true, immutable: true },
    itemName: { type: String, required: true, trim: true, immutable: true },
    inputQuantity: decimalField({ required: false, positive: true, immutable: true }),
    unit: { type: String, enum: UNIT_VALUES, required: true, immutable: true },
    expectedYieldPercent: decimalField({
      required: false,
      positive: true,
      immutable: true,
    }),
    estimatedUnitCostVnd: decimalField({ required: false, immutable: true }),
    preparationNote: { type: String, trim: true, immutable: true },
  },
  { _id: false },
);

const RecipeVersionSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "V2Organization",
      required: true,
      immutable: true,
    },
    recipeCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      immutable: true,
    },
    recipeId: {
      type: Schema.Types.ObjectId,
      ref: "V2Recipe",
      default: null,
    },
    versionNumber: { type: Number, required: true, min: 1, immutable: true },
    name: { type: String, required: true, trim: true, immutable: true },
    skuId: {
      type: Schema.Types.ObjectId,
      ref: "V2Sku",
      required: true,
      immutable: true,
    },
    outputInventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    outputQuantity: decimalField({ positive: true, immutable: true }),
    outputUnit: {
      type: String,
      enum: UNIT_VALUES,
      required: true,
      immutable: true,
    },
    shelfLifeHours: {
      type: Number,
      min: 1,
      validate: {
        validator: (value: unknown) =>
          value == null || (Number.isSafeInteger(value) && Number(value) > 0),
        message: "Hạn dùng phải là số giờ nguyên dương.",
      },
      default: null,
      immutable: true,
    },
    finishedSpec: {
      type: [FinishedSpecLineSchema],
      required: true,
      immutable: true,
    },
    components: {
      type: [RecipeComponentSchema],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ["draft", "released", "retired"],
      required: true,
      default: "draft",
    },
    releasedAt: { type: Date, default: null },
    configurationIdempotencyKey: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },
    configurationRequestHash: {
      type: String,
      trim: true,
      default: null,
      immutable: true,
    },
    releaseIdempotencyKey: { type: String, trim: true, default: null },
    contentHash: { type: String, required: true, trim: true, immutable: true },
    costDataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "missing_cost",
    },
    legacySource: { type: LegacySourceSchema },
    legacyCostSnapshot: { type: Schema.Types.Mixed, immutable: true },
    isActive: activeField,
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.recipeVersions),
);

RecipeVersionSchema.index(
  { organizationId: 1, recipeCode: 1, versionNumber: 1 },
  { unique: true, name: "uq_recipe_version" },
);
RecipeVersionSchema.index(
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
    name: "uq_recipe_version_legacy_source",
  },
);
RecipeVersionSchema.index(
  { organizationId: 1, skuId: 1, status: 1, isActive: 1 },
  { name: "ix_recipe_version_sku_status" },
);
RecipeVersionSchema.index(
  { organizationId: 1, contentHash: 1 },
  { unique: true, name: "uq_recipe_content_hash" },
);
RecipeVersionSchema.index(
  { organizationId: 1, releaseIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { releaseIdempotencyKey: { $type: "string" } },
    name: "uq_recipe_release_idempotency",
  },
);
RecipeVersionSchema.index(
  { organizationId: 1, configurationIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      configurationIdempotencyKey: { $type: "string" },
    },
    name: "uq_recipe_configuration_idempotency",
  },
);

RecipeVersionSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  if (
    (doc.configurationIdempotencyKey == null) !==
    (doc.configurationRequestHash == null)
  ) {
    doc.invalidate(
      "configurationIdempotencyKey",
      "Idempotency key cấu hình và request hash phải cùng có hoặc cùng thiếu.",
    );
  }
  if (doc.finishedSpec.length === 0) {
    doc.invalidate("finishedSpec", "Công thức phải có quy cách thành phẩm.");
  }
  if (doc.components.length === 0) {
    doc.invalidate("components", "Công thức phải có ít nhất một nguyên liệu.");
  }
  if (doc.status === "released" && !doc.releasedAt) {
    doc.invalidate("releasedAt", "Công thức phát hành phải có thời điểm phát hành.");
  }
  if (doc.status === "released" && !doc.recipeId) {
    doc.invalidate("recipeId", "Công thức phát hành phải thuộc một recipe ổn định.");
  }
  if (doc.status === "released" && !doc.releaseIdempotencyKey) {
    doc.invalidate(
      "releaseIdempotencyKey",
      "Công thức phát hành phải lưu idempotency key.",
    );
  }
  if (doc.status === "released") {
    const missingInput = doc.components.some(
      (component: { inputQuantity?: unknown }) => !component.inputQuantity,
    );
    const mayKeepUnknownLegacyYield =
      doc.legacySource && ["legacy", "estimated"].includes(doc.costDataQuality);
    const missingYield = doc.components.some(
      (component: { expectedYieldPercent?: unknown }) =>
        !component.expectedYieldPercent,
    );
    if (missingInput || (!mayKeepUnknownLegacyYield && missingYield)) {
      doc.invalidate(
        "components",
        mayKeepUnknownLegacyYield
          ? "Công thức legacy phát hành vẫn phải có lượng đầu vào cho mọi nguyên liệu."
          : "Công thức phát hành phải có lượng đầu vào và yield cho mọi nguyên liệu.",
      );
    }
  }
});

export const RecipeVersion =
  mongoose.models.V2RecipeVersion ??
  mongoose.model("V2RecipeVersion", RecipeVersionSchema);
