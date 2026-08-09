import { describe, expect, test } from "bun:test";
import {
  calculateMilkPurchaseCost,
  isFreshMilkIngredient,
  resolveOutsourcedSterilizationLiters,
} from "./milk-sterilization";

describe("milk sterilization purchase cost", () => {
  test("keeps all liters outsourced when the hidden full-mode field is absent", () => {
    expect(resolveOutsourcedSterilizationLiters("full", 60)).toBe(60);
  });

  test("resolves self and partial choices explicitly", () => {
    expect(resolveOutsourcedSterilizationLiters("self", 60, 30)).toBe(0);
    expect(resolveOutsourcedSterilizationLiters("partial", 60, 30)).toBe(30);
  });

  test("capitalizes a partial outsourced sterilization charge", () => {
    expect(
      calculateMilkPurchaseCost({
        goodsAmount: 1_500_000,
        totalLiters: 60,
        outsourcedLiters: 30,
        sterilizationUnitPrice: 5_000,
      }),
    ).toEqual({
      outsourcedLiters: 30,
      selfProcessedLiters: 30,
      sterilizationUnitPrice: 5_000,
      sterilizationCost: 150_000,
      inventoryCostAmount: 1_650_000,
      landedUnitCost: 27_500,
    });
  });

  test("keeps landed cost equal to goods cost when sterilized in house", () => {
    expect(
      calculateMilkPurchaseCost({
        goodsAmount: 1_500_000,
        totalLiters: 60,
        outsourcedLiters: 0,
      }).landedUnitCost,
    ).toBe(25_000);
  });

  test("rejects outsourced volume above the purchased volume", () => {
    expect(() =>
      calculateMilkPurchaseCost({
        goodsAmount: 1_500_000,
        totalLiters: 60,
        outsourcedLiters: 61,
      }),
    ).toThrow("không thể lớn hơn");
  });
});

describe("fresh milk ingredient detection", () => {
  test("recognizes Vietnamese fresh milk measured in liters", () => {
    expect(isFreshMilkIngredient({ name: "Sữa tươi", costUnit: "lít" })).toBe(
      true,
    );
    expect(isFreshMilkIngredient({ name: "Đường", costUnit: "kg" })).toBe(
      false,
    );
  });
});
