import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const RecipeIngredientSchema = new Schema(
  {
    ingredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    ingredientCode: { type: String, trim: true },
    ingredientName: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0, required: true },
    unit: { type: String, required: true, trim: true },
    costUnit: { type: String, required: true, trim: true },
    unitCost: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const RecipeSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    yieldMl: { type: Number, min: 0.001, required: true },
    ingredientCost: { type: Number, min: 0, default: 0 },
    costPerMl: { type: Number, min: 0, default: 0 },
    ingredients: { type: [RecipeIngredientSchema], default: [] },
    note: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    ...traceFields,
  },
  schemaOptions,
);

export const Recipe =
  mongoose.models.Recipe ?? mongoose.model("Recipe", RecipeSchema);
