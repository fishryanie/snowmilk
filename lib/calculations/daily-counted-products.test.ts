import { describe, expect, test } from "bun:test";
import { calculateDailyCountedProducts } from "./daily-counted-products";

const products = [
  {
    id: "healthy",
    code: "SP-004",
    name: "Đồ ăn healthy",
    groupName: "Đồ ăn vặt",
    sellingPrice: 15_000,
    fullCost: 8_571,
    allocatedFixedCost: 571,
  },
];

describe("daily counted products", () => {
  test("calculates revenue and full cost from entered quantities", () => {
    expect(
      calculateDailyCountedProducts(products, [
        { productId: "healthy", quantity: 3 },
      ]),
    ).toEqual({
      items: [
        {
          productId: "healthy",
          productCode: "SP-004",
          productName: "Đồ ăn healthy",
          groupName: "Đồ ăn vặt",
          quantity: 3,
          unitPrice: 15_000,
          unitVariableCost: 8_000,
          revenue: 45_000,
          variableCost: 24_000,
          allocatedFixedCost: 1_713,
          contributionProfit: 21_000,
          profit: 19_287,
        },
      ],
      revenue: 45_000,
      variableCost: 24_000,
      allocatedFixedCost: 1_713,
      contributionProfit: 21_000,
      profit: 19_287,
    });
  });

  test("omits products with zero quantity", () => {
    expect(
      calculateDailyCountedProducts(products, [
        { productId: "healthy", quantity: 0 },
      ]).items,
    ).toEqual([]);
  });
});
