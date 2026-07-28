import { describe, expect, test } from "bun:test";
import {
  calculateDailySaleEstimate,
  calculateDailySaleEstimateFromRevenue,
  estimateSizeQuantitiesFromRevenue,
  type DailySaleAssumption,
} from "./daily-sales";

const assumptions: DailySaleAssumption[] = [
  {
    sizeCode: "M",
    sizeName: "Size M",
    milkMl: 400,
    referenceSellingPrice: 35_000,
    milkCostPerCup: 12_000,
    packagingCostPerCup: 900,
    toppingCostPerCup: 2_500,
    toppingCostLowPerCup: 1_500,
    toppingCostHighPerCup: 3_500,
    overheadRate: 0.05,
    fixedCostPerCup: 100,
    sampleCount: 2,
  },
  {
    sizeCode: "L",
    sizeName: "Size L",
    milkMl: 550,
    referenceSellingPrice: 40_000,
    milkCostPerCup: 16_500,
    packagingCostPerCup: 900,
    toppingCostPerCup: 2_500,
    toppingCostLowPerCup: 1_500,
    toppingCostHighPerCup: 3_500,
    overheadRate: 0.05,
    fixedCostPerCup: 100,
    sampleCount: 2,
  },
];

describe("daily sales estimated only from revenue", () => {
  test("finds the closest neutral M/L mix for the entered revenue", () => {
    expect(
      estimateSizeQuantitiesFromRevenue(6_205_000, assumptions),
    ).toEqual({ M: 79, L: 86 });
    expect(
      estimateSizeQuantitiesFromRevenue(5_158_000, assumptions),
    ).toEqual({ M: 72, L: 66 });
    expect(
      estimateSizeQuantitiesFromRevenue(4_465_000, assumptions),
    ).toEqual({ M: 59, L: 60 });
  });

  test("estimates cups, milk, and costs without entered cup or liter counts", () => {
    const estimate = calculateDailySaleEstimateFromRevenue(
      6_205_000,
      assumptions,
    );

    expect(estimate.totalCups).toBe(165);
    expect(estimate.estimatedReferenceRevenue).toBe(6_205_000);
    expect(estimate.revenueDifference).toBe(0);
    expect(estimate.milkLitersSold).toBeCloseTo(78.9);
    expect(estimate.estimatedMilkLiters).toBeCloseTo(78.9);
    expect(estimate.milkDifferenceLiters).toBe(0);
    expect(estimate.totalMilkCost).toBe(2_367_000);
  });

  test("keeps profit proportional when revenue grows under the same cost assumptions", () => {
    const lowerRevenue = calculateDailySaleEstimateFromRevenue(
      2_290_000,
      assumptions,
    );
    const higherRevenue = calculateDailySaleEstimateFromRevenue(
      4_465_000,
      assumptions,
    );

    expect(higherRevenue.estimatedProfit).toBeGreaterThan(
      lowerRevenue.estimatedProfit * 1.8,
    );
    expect(higherRevenue.estimatedMargin).toBeCloseTo(
      lowerRevenue.estimatedMargin,
      2,
    );
  });

  test("returns no estimated cups when revenue is zero", () => {
    expect(estimateSizeQuantitiesFromRevenue(0, assumptions)).toEqual({
      M: 0,
      L: 0,
    });
  });

  test("supports a catalog with one active size", () => {
    expect(
      estimateSizeQuantitiesFromRevenue(350_000, [assumptions[0]]),
    ).toEqual({ M: 10 });
  });

  test("preserves direct count-based calculations for existing callers", () => {
    const estimate = calculateDailySaleEstimate(
      { M: 10, L: 5 },
      550_000,
      assumptions,
    );

    expect(estimate.milkLitersSold).toBeCloseTo(6.75);
    expect(estimate.totalMilkCost).toBe(202_500);
  });
});
