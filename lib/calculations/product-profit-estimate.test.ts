import { describe, expect, test } from "bun:test";
import { calculateWeightedProductProfitEstimate } from "./product-profit-estimate";

describe("calculateWeightedProductProfitEstimate", () => {
  test("ưu tiên topping nhập nhiều và chia đều trọng số giữa các size", () => {
    const estimate = calculateWeightedProductProfitEstimate({
      products: [
        {
          name: "Oreo - Size M",
          toppingName: "Oreo",
          sellingPrice: 35_000,
          fullCost: 15_000,
          isActive: true,
        },
        {
          name: "Oreo - Size L",
          toppingName: "Oreo",
          sellingPrice: 40_000,
          fullCost: 20_000,
          isActive: true,
        },
        {
          name: "Dừa non - Size M",
          toppingName: "Dừa non",
          sellingPrice: 35_000,
          fullCost: 21_000,
          isActive: true,
        },
      ],
      toppingRanking: [
        {
          rank: 1,
          code: "TP-OREO",
          name: "Oreo",
          totalKg: 8,
          sharePercent: 80,
          purchaseCount: 2,
          lastPurchaseDate: null,
        },
        {
          rank: 2,
          code: "TP-DUA",
          name: "Dừa non",
          totalKg: 2,
          sharePercent: 20,
          purchaseCount: 1,
          lastPurchaseDate: null,
        },
      ],
    });

    expect(estimate).toMatchObject({
      averageSellingPrice: 37_000,
      averageFullCost: 18_200,
      averageGrossProfit: 18_800,
      costPercent: 49.2,
      grossMarginPercent: 50.8,
      matchedProductCount: 3,
      matchedToppingCount: 2,
      purchaseCoveragePercent: 100,
    });
  });

  test("báo độ phủ và bỏ topping chưa có sản phẩm tương ứng", () => {
    const estimate = calculateWeightedProductProfitEstimate({
      products: [
        {
          name: "Oreo - Size M",
          ingredientItems: [{ ingredientCode: "TP01", itemName: "Oreo" }],
          sellingPrice: 35_000,
          fullCost: 17_500,
        },
      ],
      toppingRanking: [
        {
          rank: 1,
          code: "TP01",
          name: "Bánh Oreo",
          totalKg: 3,
          sharePercent: 75,
          purchaseCount: 1,
          lastPurchaseDate: null,
        },
        {
          rank: 2,
          code: "TP02",
          name: "Chưa lên món",
          totalKg: 1,
          sharePercent: 25,
          purchaseCount: 1,
          lastPurchaseDate: null,
        },
      ],
    });

    expect(estimate).toMatchObject({
      costPercent: 50,
      grossMarginPercent: 50,
      matchedPurchaseKg: 3,
      totalPurchaseKg: 4,
      purchaseCoveragePercent: 75,
      unmatchedToppingNames: ["Chưa lên món"],
    });
  });

  test("trả về null khi chưa có lượng nhập khớp sản phẩm", () => {
    expect(
      calculateWeightedProductProfitEstimate({
        products: [
          { name: "Oreo", sellingPrice: 35_000, fullCost: 17_500 },
        ],
        toppingRanking: [],
      }),
    ).toBeNull();
  });
});
