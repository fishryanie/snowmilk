import mongoose, { Schema } from "mongoose";
import {
  ActorSchema,
  compareDecimalStringsExact,
  DATA_QUALITY_VALUES,
  decimalDifferenceExact,
  decimalField,
  decimalStringsEqual,
  type V2HookDocument,
  v2SchemaOptions,
  versionField,
  vndField,
  V2_COLLECTIONS,
} from "./helpers";

const InventoryBalanceSchema = new Schema(
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
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryItem",
      required: true,
      immutable: true,
    },
    inventoryLotId: {
      type: Schema.Types.ObjectId,
      ref: "V2InventoryLot",
      default: null,
      immutable: true,
    },
    onHandQuantity: decimalField({ default: "0" }),
    reservedQuantity: decimalField({ default: "0" }),
    availableQuantity: decimalField({ default: "0" }),
    averageUnitCostVnd: decimalField({ required: false, default: null }),
    inventoryValueVnd: vndField({ required: false, default: null }),
    costDataQuality: {
      type: String,
      enum: DATA_QUALITY_VALUES,
      required: true,
      default: "missing_cost",
    },
    lastMovementId: {
      type: Schema.Types.ObjectId,
      ref: "V2StockMovement",
      required: true,
    },
    lastMovementAt: { type: Date, required: true },
    version: versionField,
    actor: { type: ActorSchema, required: true },
  },
  v2SchemaOptions(V2_COLLECTIONS.inventoryBalances),
);

InventoryBalanceSchema.index(
  { organizationId: 1, locationId: 1, inventoryItemId: 1, inventoryLotId: 1 },
  { unique: true, name: "uq_inventory_balance_dimension" },
);
InventoryBalanceSchema.index(
  { organizationId: 1, locationId: 1, availableQuantity: 1 },
  { name: "ix_inventory_balance_available" },
);

InventoryBalanceSchema.pre("validate", function () {
  const doc = this as V2HookDocument;
  const onHand = String(doc.onHandQuantity);
  const reserved = String(doc.reservedQuantity);
  const available = String(doc.availableQuantity);
  if (compareDecimalStringsExact(reserved, onHand) > 0) {
    doc.invalidate("reservedQuantity", "Số giữ chỗ không thể vượt tồn kho.");
  }
  const expectedAvailable = decimalDifferenceExact(onHand, reserved);
  if (!decimalStringsEqual(available, expectedAvailable)) {
    doc.invalidate("availableQuantity", "Tồn khả dụng phải bằng tồn thực trừ giữ chỗ.");
  }
  const hasCost =
    doc.averageUnitCostVnd != null && doc.inventoryValueVnd != null;
  if (doc.costDataQuality === "complete" && !hasCost) {
    doc.invalidate(
      "costDataQuality",
      "Balance có cost hoàn chỉnh phải có đơn giá và giá trị tồn.",
    );
  }
  if (
    doc.costDataQuality === "missing_cost" &&
    (doc.averageUnitCostVnd != null || doc.inventoryValueVnd != null)
  ) {
    doc.invalidate(
      "costDataQuality",
      "Balance thiếu cost không được lưu giá trị cost giả định.",
    );
  }
});

export const InventoryBalance =
  mongoose.models.V2InventoryBalance ??
  mongoose.model("V2InventoryBalance", InventoryBalanceSchema);
