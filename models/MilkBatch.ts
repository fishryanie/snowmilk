import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const BatchIngredientSchema = new Schema(
  {
    ingredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    ingredientName: { type: String, required: true },
    quantity: { type: Number, min: 0, required: true },
    unit: { type: String, required: true },
    unitCost: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
    note: String,
  },
  { _id: false },
);

const MilkBatchSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    cookedAt: Date,
    actualLiters: { type: Number, min: 0, required: true },
    cookingHours: { type: Number, min: 0, default: 0 },
    stoveKw: { type: Number, min: 0, default: 0 },
    electricityPrice: { type: Number, min: 0, default: 0 },
    otherElectricityCost: { type: Number, min: 0, default: 0 },
    waterCleaningCost: { type: Number, min: 0, default: 0 },
    ingredientCost: { type: Number, min: 0, default: 0 },
    electricityCost: { type: Number, min: 0, default: 0 },
    totalCost: { type: Number, min: 0, default: 0 },
    costPerLiter: { type: Number, min: 0, default: 0 },
    costPerMl: { type: Number, min: 0, default: 0 },
    ingredients: { type: [BatchIngredientSchema], default: [] },
    note: String,
    ...traceFields,
  },
  schemaOptions,
);

export const MilkBatch =
  mongoose.models.MilkBatch ?? mongoose.model("MilkBatch", MilkBatchSchema);
