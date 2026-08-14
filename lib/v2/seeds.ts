import type { PostingBusinessLineCode } from "./constants";

export const HEALTHY_BREAKFAST_PRODUCT = {
  code: "HBF-BOX",
  name: "Hộp ăn sáng Healthy",
  businessLineCode: "BREAKFAST" satisfies PostingBusinessLineCode,
  categoryCode: "BREAKFAST_HEALTHY",
  isActive: true,
} as const;

export const HEALTHY_BREAKFAST_SKU = {
  code: "HBF-BOX-001",
  name: "Hộp ăn sáng Healthy",
  catalogProductCode: HEALTHY_BREAKFAST_PRODUCT.code,
  businessLineCode: HEALTHY_BREAKFAST_PRODUCT.businessLineCode,
  categoryCode: HEALTHY_BREAKFAST_PRODUCT.categoryCode,
  sellingUnit: "box",
  sellingUnitLabel: "hộp",
  fulfillment: "preproduced",
  unitPriceVnd: 20_000,
  isActive: true,
} as const;

export const HEALTHY_BREAKFAST_RECIPE = {
  code: "HBF-BOX-001",
  name: "Hộp ăn sáng Healthy",
  skuCode: HEALTHY_BREAKFAST_SKU.code,
  outputInventoryItemCode: "FG-HBF-BOX-001",
  note:
    "Định lượng nguyên liệu thô, yield và hạn dùng cần được chủ quán xác nhận trước khi phát hành.",
  isActive: true,
} as const;

export const HEALTHY_BREAKFAST_INVENTORY_ITEMS = [
  {
    code: "RAW-HBF-SWEET-POTATO",
    name: "Khoai",
    kind: "raw_material",
    baseUnit: "g",
  },
  {
    code: "RAW-HBF-AMERICAN-CORN",
    name: "Bắp Mỹ",
    kind: "raw_material",
    baseUnit: "g",
  },
  {
    code: "RAW-HBF-SAP-BANANA",
    name: "Chuối sáp",
    kind: "raw_material",
    baseUnit: "each",
  },
  {
    code: "RAW-HBF-CHICKEN-EGG",
    name: "Trứng gà",
    kind: "raw_material",
    baseUnit: "each",
  },
  {
    code: "PKG-HBF-BOX",
    name: "Hộp đựng Hộp ăn sáng Healthy",
    kind: "packaging",
    baseUnit: "each",
  },
  {
    code: "FG-HBF-BOX-001",
    name: "Hộp ăn sáng Healthy đã chuẩn bị",
    kind: "finished_good",
    baseUnit: "each",
  },
] as const;

/**
 * The finished specification is sellable as-is. Raw input quantities/yields
 * deliberately remain unconfigured: steaming and peeling losses must be
 * entered from the owner's actual process instead of being guessed by code.
 */
export const HEALTHY_BREAKFAST_RECIPE_VERSION = {
  code: "HBF-BOX-001-R1",
  recipeCode: "HBF-BOX-001",
  name: "Hộp ăn sáng Healthy — công thức 1",
  version: 1,
  skuCode: HEALTHY_BREAKFAST_SKU.code,
  status: "draft",
  outputInventoryItemCode: "FG-HBF-BOX-001",
  outputQuantity: "1",
  outputUnit: "each",
  finishedSpec: [
    {
      inventoryItemCode: "RAW-HBF-SWEET-POTATO",
      name: "Khoai đã hấp, lột vỏ",
      quantity: "200",
      unit: "g",
    },
    {
      inventoryItemCode: "RAW-HBF-AMERICAN-CORN",
      name: "Bắp Mỹ phần ăn được đã hấp, lột",
      quantity: "200",
      unit: "g",
    },
    {
      inventoryItemCode: "RAW-HBF-SAP-BANANA",
      name: "Chuối sáp đã chuẩn bị",
      quantity: "1",
      unit: "each",
    },
    {
      inventoryItemCode: "RAW-HBF-CHICKEN-EGG",
      name: "Trứng gà đã chuẩn bị",
      quantity: "1",
      unit: "each",
    },
    {
      inventoryItemCode: "PKG-HBF-BOX",
      name: "Hộp bao bì",
      quantity: "1",
      unit: "each",
    },
  ],
  components: [
    {
      inventoryItemCode: "RAW-HBF-SWEET-POTATO",
      expectedInputQuantity: null,
      inputUnit: "g",
      expectedYieldPercent: null,
      requiresYieldConfiguration: true,
    },
    {
      inventoryItemCode: "RAW-HBF-AMERICAN-CORN",
      expectedInputQuantity: null,
      inputUnit: "g",
      expectedYieldPercent: null,
      requiresYieldConfiguration: true,
    },
    {
      inventoryItemCode: "RAW-HBF-SAP-BANANA",
      expectedInputQuantity: null,
      inputUnit: "each",
      expectedYieldPercent: null,
      requiresYieldConfiguration: true,
    },
    {
      inventoryItemCode: "RAW-HBF-CHICKEN-EGG",
      expectedInputQuantity: null,
      inputUnit: "each",
      expectedYieldPercent: null,
      requiresYieldConfiguration: true,
    },
    {
      inventoryItemCode: "PKG-HBF-BOX",
      expectedInputQuantity: "1",
      inputUnit: "each",
      expectedYieldPercent: "100",
      requiresYieldConfiguration: false,
    },
  ],
  dataQuality: {
    costCompleteness: "missing",
    requiresOwnerConfiguration: true,
    missingFields: [
      "raw component quantities",
      "expected steaming/peeling yields",
      "unit costs",
      "shelf life",
    ],
  },
} as const;
