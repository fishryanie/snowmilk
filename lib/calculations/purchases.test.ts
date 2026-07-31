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
});
