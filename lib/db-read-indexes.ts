export type ReadIndex = {
  name: string;
  key: Record<string, 1 | -1>;
};

// Used by both Mongoose schemas and the additive deployment script.
// Do not use syncIndexes(): it can drop indexes outside this manifest.
export const dbReadIndexes: Record<string, ReadIndex[]> = {
  storefront_orders: [
    { name: "ix_storefront_order_history", key: { storeId: 1, _id: -1 } },
    { name: "ix_storefront_order_status_history", key: { storeId: 1, status: 1, _id: -1 } },
  ],
  purchases: [
    { name: "ix_purchase_history", key: { purchaseDate: -1, createdAt: -1 } },
    { name: "ix_purchase_ingredient_date", key: { ingredientId: 1, purchaseDate: -1 } },
    { name: "ix_purchase_item_date", key: { itemCode: 1, purchaseDate: -1 } },
    { name: "ix_purchase_category_date", key: { category: 1, purchaseDate: -1 } },
  ],
  ingredients: [
    { name: "ix_ingredient_created", key: { createdAt: -1 } },
    { name: "ix_ingredient_active_category_name", key: { isActive: 1, category: 1, name: 1 } },
  ],
  products: [
    { name: "ix_product_created", key: { createdAt: -1 } },
  ],
  productsizes: [
    { name: "ix_size_created", key: { createdAt: -1 } },
  ],
  milkbatches: [
    { name: "ix_batch_created", key: { createdAt: -1 } },
    { name: "ix_batch_cooked_created", key: { cookedAt: -1, createdAt: -1 } },
  ],
  expenses: [
    { name: "ix_expense_created", key: { createdAt: -1 } },
  ],
  equipment: [
    { name: "ix_equipment_created", key: { createdAt: -1 } },
  ],
  divestments: [
    { name: "ix_divestment_history", key: { withdrawalDate: -1, createdAt: -1 } },
  ],
};
