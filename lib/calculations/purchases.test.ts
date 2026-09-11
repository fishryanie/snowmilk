import { describe, expect, test } from "bun:test";
import {
  normalizePurchaseUnit,
  summarizePurchases,
} from "./purchases";

describe("purchase unit normalization", () => {
  test("combines gram and kilogram purchase history in one target unit", () => {
    expect(
      summarizePurchases(
        [
          {
            packageCount: 1,
            convertedQuantity: 400,
            costUnit: "gram",
            totalAmount: 95_000,
          },
          {
            packageCount: 3,
            convertedQuantity: 1.2,
            costUnit: "kg",
            totalAmount: 285_000,
          },
        ],
        "kg",
      ),
    ).toEqual({
      totalPurchasedPackages: 4,
      totalPurchasedQuantity: 1.6,
      totalPurchasedAmount: 380_000,
      averageUnitCost: 237_500,
    });
  });

  test("normalizes both package and total quantities", () => {
    expect(
      normalizePurchaseUnit(
        {
          packageQuantity: 400,
          convertedQuantity: 1_600,
          costUnit: "gram",
        },
        "kg",
      ),
    ).toEqual({
      costUnit: "kg",
      packageQuantity: 0.4,
      convertedQuantity: 1.6,
    });
  });

  test("relabels incompatible historical units when correcting a data-entry mistake", () => {
    expect(
      normalizePurchaseUnit(
        {
          packageQuantity: 1_284,
          convertedQuantity: 2_568,
          costUnit: "ml",
        },
        "g",
        { reinterpretIncompatibleUnit: true },
      ),
    ).toEqual({
      costUnit: "g",
      packageQuantity: 1_284,
      convertedQuantity: 2_568,
    });
  });

  test("still rejects incompatible units without explicit correction mode", () => {
    expect(() =>
      normalizePurchaseUnit(
        {
          packageQuantity: 1_284,
          convertedQuantity: 1_284,
          costUnit: "ml",
        },
        "g",
      ),
    ).toThrow("Không thể quy đổi");
  });

  test("uses landed inventory cost when a purchase has processing fees", () => {
    expect(
      summarizePurchases(
        [
          {
            packageCount: 60,
            convertedQuantity: 60,
            costUnit: "lít",
            totalAmount: 1_500_000,
            inventoryCostAmount: 1_650_000,
          },
        ],
        "lít",
      ).averageUnitCost,
    ).toBe(27_500);
  });
});
