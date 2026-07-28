import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const InventoryItemSchema = new Schema(
  {
    itemKey: { type: String, required: true },
    itemCode: { type: String, required: true, trim: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    unit: { type: String, trim: true },
    totalPurchasedQuantity: { type: Number, min: 0, default: 0 },
    onHandQuantity: { type: Number, min: 0, required: true },
    unitCost: { type: Number, min: 0, default: 0 },
    inventoryValue: { type: Number, min: 0, default: 0 },
    inferredUsedQuantity: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const InventoryMilkBatchSchema = new Schema(
  {
    batchKey: { type: String, required: true },
    batchCode: { type: String, required: true, trim: true },
    batchName: { type: String, required: true, trim: true },
    producedLiters: { type: Number, min: 0, required: true },
    remainingLiters: { type: Number, min: 0, required: true },
    costPerLiter: { type: Number, min: 0, default: 0 },
    inventoryValue: { type: Number, min: 0, default: 0 },
    inferredUsedLiters: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const InventorySnapshotSchema = new Schema(
  {
    snapshotDate: { type: Date, required: true, unique: true, index: true },
    items: { type: [InventoryItemSchema], default: [] },
    milkBatches: { type: [InventoryMilkBatchSchema], default: [] },
    averageMilkMlPerCup: { type: Number, min: 0, default: 0 },
    ingredientInventoryValue: { type: Number, min: 0, default: 0 },
    finishedMilkInventoryValue: { type: Number, min: 0, default: 0 },
    totalInventoryValue: { type: Number, min: 0, default: 0 },
    inferredCupsFromPackaging: { type: Number, min: 0, default: 0 },
    inferredMilkLitersUsed: { type: Number, min: 0, default: 0 },
    inferredCupsFromMilk: { type: Number, min: 0, default: 0 },
    estimatedCups: { type: Number, min: 0, default: 0 },
    estimatedCupsSincePrevious: { type: Number, default: 0 },
    estimationBasis: {
      type: String,
      enum: ["packaging", "finished-milk"],
      required: true,
    },
    note: { type: String, trim: true },
    ...traceFields,
  },
  schemaOptions,
);

export const InventorySnapshot =
  mongoose.models.InventorySnapshot ??
  mongoose.model("InventorySnapshot", InventorySnapshotSchema);
