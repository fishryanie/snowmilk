import { describe, expect, test } from "bun:test";
import {
  buildDailySaleAssumptionsFromProducts,
  calculateDailySaleEstimate,
  calculateDailySaleEstimateFromRevenue,
  deriveDailyRevenueSplit,
  estimateSizeQuantitiesFromRevenue,
  isSnowMilkRevenueEstimateProduct,
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
  test("uses current snow-milk recipes for revenue-only estimation", () => {
    expect(
      isSnowMilkRevenueEstimateProduct({
        groupName: "Sữa tuyết",
        productMode: "recipe",
      }),
    ).toBe(true);
    expect(
      isSnowMilkRevenueEstimateProduct({
        groupName: "Sữa tươi",
        productMode: "composed",
      }),
    ).toBe(false);
    expect(
      isSnowMilkRevenueEstimateProduct({ productMode: "legacy" }),
    ).toBe(true);
    expect(
      isSnowMilkRevenueEstimateProduct({ productMode: "recipe" }),
    ).toBe(false);
  });

  test("builds legacy estimation groups from product milk volume", () => {
    const result = buildDailySaleAssumptionsFromProducts(
      [
        {
          milkMl: 350,
          sellingPrice: 35_000,
          milkCost: 10_000,
          toppingCost: 2_000,
          packagingCost: 1_000,
        },
        {
          milkMl: 350,
          sellingPrice: 35_000,
          milkCost: 12_000,
          toppingCost: 4_000,
          packagingCost: 1_200,
        },
        {
          milkMl: 550,
          sellingPrice: 40_000,
          milkCost: 18_000,
          toppingCost: 3_000,
          packagingCost: 1_500,
        },
      ],
      0.05,
      100,
    );

    expect(result.map((item) => item.sizeCode)).toEqual(["350ml", "550ml"]);
    expect(result[0]).toMatchObject({
      sizeName: "350 ml",
      referenceSellingPrice: 35_000,
      milkCostPerCup: 11_000,
      toppingCostPerCup: 3_000,
      packagingCostPerCup: 1_100,
      sampleCount: 2,
    });
  });

  test("keeps a volume group visible when all of its product costs are blocked", () => {
    const [result] = buildDailySaleAssumptionsFromProducts(
      [
        {
          milkMl: 350,
          sellingPrice: 35_000,
          milkCost: 10_000,
          toppingCost: 2_000,
          packagingCost: 1_000,
          hasCostWarning: true,
        },
      ],
      0.05,
      100,
    );

    expect(result).toMatchObject({
      sizeCode: "350ml",
      referenceSellingPrice: 35_000,
      sampleCount: 0,
    });
  });

  test("derives product revenue from total cash and fresh-milk bottles", () => {
    expect(deriveDailyRevenueSplit(6_230_000, 23, 20_000)).toEqual({
      totalRevenue: 6_230_000,
      snowMilkRevenue: 5_770_000,
      freshMilkRevenue: 460_000,
      freshMilkBottleCount: 23,
      freshMilkBottleUnitPrice: 20_000,
    });
  });

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
