import mongoose, { Schema } from "mongoose";
import { DEFAULT_PRODUCT_GROUP } from "@/lib/product-groups";
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

const ProductIngredientItemSchema = new Schema(
  {
    source: {
      type: String,
      enum: ["batch", "ingredient"],
      required: true,
    },
    batchType: { type: String, enum: ["milk_base", "topping"] },
    batchId: { type: Schema.Types.ObjectId, ref: "MilkBatch" },
    ingredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    batchCode: { type: String, trim: true },
    ingredientCode: { type: String, trim: true },
    batchName: { type: String, trim: true },
    itemName: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0, required: true },
    unit: { type: String, required: true, trim: true },
    costUnit: { type: String, required: true, trim: true },
    unitCost: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const ProductSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    groupName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      default: DEFAULT_PRODUCT_GROUP,
      index: true,
    },
    toppingIngredientId: { type: Schema.Types.ObjectId, ref: "Ingredient" },
    sizeId: { type: Schema.Types.ObjectId, ref: "ProductSize" },
    milkBatchId: { type: Schema.Types.ObjectId, ref: "MilkBatch" },
    recipeId: { type: Schema.Types.ObjectId, ref: "Recipe", index: true },
    recipeCode: { type: String, trim: true },
    recipeName: { type: String, trim: true },
    productMode: {
      type: String,
      enum: ["legacy", "recipe", "composed"],
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
    ingredientItems: { type: [ProductIngredientItemSchema], default: [] },
    toppingItems: { type: [ProductIngredientItemSchema], default: [] },
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
  (!cachedProductModel.schema.path("recipeId") ||
    !cachedProductModel.schema.path("ingredientItems") ||
    !cachedProductModel.schema.path("groupName"))
) {
  mongoose.deleteModel("Product");
}

export const Product =
  mongoose.models.Product ?? mongoose.model("Product", ProductSchema);
