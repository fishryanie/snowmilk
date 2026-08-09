import mongoose, { Schema } from "mongoose";
import { schemaOptions, traceFields } from "./helpers";

const ProductPackagingItemSchema = new Schema(
  {
    ingredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    ingredientCode: { type: String, trim: true },
    ingredientName: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0, required: true },
    costUnit: { type: String, trim: true },
    unitCost: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const ProductSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    toppingIngredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    sizeId: { type: Schema.Types.ObjectId, ref: "ProductSize" },
    milkBatchId: { type: Schema.Types.ObjectId, ref: "MilkBatch" },
    recipeId: { type: Schema.Types.ObjectId, ref: "Recipe", index: true },
    recipeCode: { type: String, trim: true },
    recipeName: { type: String, trim: true },
    productMode: {
      type: String,
      enum: ["legacy", "recipe"],
      default: "legacy",
      index: true,
    },
    milkBatchCode: { type: String, trim: true },
    milkBatchName: { type: String, trim: true },
    toppingName: { type: String, trim: true },
    sizeName: { type: String, trim: true },
    milkMl: { type: Number, min: 0, default: 0 },
    toppingGrams: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, required: true },
    milkCost: { type: Number, min: 0, default: 0 },
    recipeCost: { type: Number, min: 0, default: 0 },
    toppingCost: { type: Number, min: 0, default: 0 },
    packagingCost: { type: Number, min: 0, default: 0 },
    packagingItems: { type: [ProductPackagingItemSchema], default: [] },
    overheadCost: { type: Number, min: 0, default: 0 },
    variableCost: { type: Number, min: 0, default: 0 },
    allocatedFixedCost: { type: Number, min: 0, default: 0 },
    fullCost: { type: Number, min: 0, default: 0 },
    hasCostWarning: { type: Boolean, default: false },
    note: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    ...traceFields,
  },
  schemaOptions,
);

const cachedProductModel = mongoose.models.Product;

if (
  process.env.NODE_ENV !== "production" &&
  cachedProductModel &&
  !cachedProductModel.schema.path("recipeId")
) {
  mongoose.deleteModel("Product");
}

export const Product =
  mongoose.models.Product ?? mongoose.model("Product", ProductSchema);
