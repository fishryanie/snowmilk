import { describe, expect, test } from "bun:test";
import {
  buildEstimatedSizeMix,
  calculateDailySaleEstimate,
  calculateDailySaleEstimateFromMilk,
  calculateDailySaleEstimateFromTotalCups,
  estimateSizeQuantities,
  estimateSizeQuantitiesFromTotalCups,
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

describe("daily sales estimated from liters and revenue", () => {
  test("uses the preferred historical size mix", () => {
    expect(
      estimateSizeQuantities(33, 2_705_000, assumptions, {
        M: 51,
        L: 23,
      }),
    ).toEqual({
      M: 51,
      L: 23,
    });
  });

  test("uses a neutral mix when no actual size history exists", () => {
    expect(estimateSizeQuantities(33, 2_875_000, assumptions)).toEqual({
      M: 35,
      L: 35,
    });
  });

  test("keeps an entered total cup count and infers the size split", () => {
    expect(
      estimateSizeQuantitiesFromTotalCups(
        74,
        2_705_000,
        assumptions,
      ),
    ).toEqual({
      M: 51,
      L: 23,
    });

    const estimate = calculateDailySaleEstimateFromTotalCups(
      74,
      33.05,
      2_705_000,
      assumptions,
    );
    expect(estimate.totalCups).toBe(74);
    expect(estimate.estimatedMilkLiters).toBeCloseTo(33.05);
    expect(estimate.revenueDifference).toBe(0);
  });

  test("does not use milk liters to split a known total between sizes", () => {
    const lowMilkEstimate = calculateDailySaleEstimateFromTotalCups(
      74,
      1,
      2_705_000,
      assumptions,
    );
    const highMilkEstimate = calculateDailySaleEstimateFromTotalCups(
      74,
      100,
      2_705_000,
      assumptions,
    );
    const sizeQuantities = (estimate: typeof lowMilkEstimate) =>
      estimate.sizeSummaries.map(({ sizeCode, quantity }) => ({
        sizeCode,
        quantity,
      }));

    expect(sizeQuantities(lowMilkEstimate)).toEqual([
      { sizeCode: "M", quantity: 51 },
      { sizeCode: "L", quantity: 23 },
    ]);
    expect(sizeQuantities(highMilkEstimate)).toEqual([
      { sizeCode: "M", quantity: 51 },
      { sizeCode: "L", quantity: 23 },
    ]);
  });

  test("splits a known total from the 35k M and 40k L prices", () => {
    expect(
      estimateSizeQuantitiesFromTotalCups(
        98,
        3_430_000,
        assumptions,
      ),
    ).toEqual({ M: 98, L: 0 });
    expect(
      estimateSizeQuantitiesFromTotalCups(
        98,
        3_675_000,
        assumptions,
      ),
    ).toEqual({ M: 49, L: 49 });
  });

  test("learns the mix only from actual counts, not earlier estimates", () => {
    expect(
      buildEstimatedSizeMix(
        [
          {
            cupCountSource: "estimated",
            sizeSummaries: [
              { sizeCode: "M", quantity: 81 },
              { sizeCode: "L", quantity: 1 },
            ],
          },
          {
            cupCountSource: "actual",
            sizeSummaries: [
              { sizeCode: "M", quantity: 6 },
              { sizeCode: "L", quantity: 4 },
            ],
          },
        ],
        ["M", "L"],
      ),
    ).toEqual({
      shares: { M: 0.6, L: 0.4 },
      actualSampleCups: 10,
      source: "actual-history",
    });
  });

  test("uses entered liters as the source of truth for milk cost", () => {
    const estimate = calculateDailySaleEstimateFromMilk(
      33,
      2_705_000,
      assumptions,
      { M: 51, L: 23 },
    );

    expect(estimate.totalCups).toBe(74);
    expect(estimate.estimatedMilkLiters).toBeCloseTo(33.05);
    expect(estimate.milkDifferenceLiters).toBeCloseTo(0.05);
    expect(estimate.estimatedReferenceRevenue).toBe(2_705_000);
    expect(estimate.revenueDifference).toBe(0);
    expect(estimate.totalMilkCost).toBeCloseTo(990_000);
  });

  test("preserves count-based calculations for existing callers", () => {
    const estimate = calculateDailySaleEstimate(
      { M: 10, L: 5 },
      550_000,
      assumptions,
    );

    expect(estimate.milkLitersSold).toBeCloseTo(6.75);
    expect(estimate.totalMilkCost).toBe(202_500);
  });

  test("uses actual cup counts while keeping entered liters as milk cost basis", () => {
    const estimate = calculateDailySaleEstimate(
      { M: 8, L: 2 },
      360_000,
      assumptions,
      4.5,
    );

    expect(estimate.totalCups).toBe(10);
    expect(estimate.milkLitersSold).toBe(4.5);
    expect(estimate.estimatedMilkLiters).toBeCloseTo(4.3);
    expect(estimate.milkDifferenceLiters).toBeCloseTo(-0.2);
    expect(estimate.totalMilkCost).toBeCloseTo(135_000);
  });
});
