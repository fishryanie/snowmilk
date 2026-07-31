import type { Model } from "mongoose";
import { Divestment } from "@/models/Divestment";
import { Equipment } from "@/models/Equipment";
import { Expense } from "@/models/Expense";
import { Ingredient } from "@/models/Ingredient";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { ProductSize } from "@/models/Size";
import type { ResourceName } from "@/lib/validators/resources";

export const resourceModels: Record<
  ResourceName,
  Model<Record<string, unknown>>
> = {
  products: Product,
  sizes: ProductSize,
  ingredients: Ingredient,
  purchases: Purchase,
  expenses: Expense,
  divestments: Divestment,
  equipment: Equipment,
  batches: MilkBatch,
} as unknown as Record<ResourceName, Model<Record<string, unknown>>>;

export const resourceSearchFields: Record<ResourceName, string[]> = {
  products: ["name", "code", "toppingName", "sizeName"],
  sizes: ["name", "code", "cupSetName"],
  ingredients: ["name", "code", "category"],
  purchases: [
    "itemName",
    "itemCode",
    "supplier",
    "category",
    "fundingSource",
  ],
  expenses: [
    "description",
    "category",
    "paymentStatus",
    "fundingSource",
  ],
  divestments: ["note"],
  equipment: ["name", "code", "category", "fundingSource"],
  batches: ["name", "code"],
};
