import { describe, expect, test } from "bun:test";
import { LEGACY_BASELINE } from "./constants";
import {
  buildLegacySalesBackfillPlan,
  buildMigrationPlan,
  type LegacySaleRecord,
} from "./migration-plan";

const dailyNetRevenue = [
  2_290_000,
  3_430_000,
  4_465_000,
  5_158_000,
  6_205_000,
  7_033_000,
  5_560_000,
  6_644_000,
  7_575_000,
  8_033_000,
  6_440_000,
  5_645_000,
  5_055_000,
  5_520_000,
  4_737_000,
  5_267_000,
  6_230_000,
  4_340_000,
  5_435_000,
  5_439_000,
] as const;

const freshMilkRevenue = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  360_000, 520_000, 420_000, 320_000, 380_000,
] as const;

const freshMilkBottleCount = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18, 26, 21, 16, 19,
] as const;

const estimatedCups = [
  60, 90, 115, 135, 160, 185, 145, 175, 200, 210,
  170, 150, 130, 145, 125, 139, 150, 110, 139, 160,
] as const;

export const onlineSalesFixture: LegacySaleRecord[] = dailyNetRevenue.map(
  (netRevenue, index) => {
    const date = new Date(
      Date.UTC(2026, 6, 21 + index, 17, 0, 0),
    );
    const freshRevenue = freshMilkRevenue[index];
    const cashReceived =
      index === dailyNetRevenue.length - 1
        ? 70_030_000 -
          dailyNetRevenue
            .slice(0, -1)
            .reduce((sum, value) => sum + Math.floor(value * 0.63), 0)
        : Math.floor(netRevenue * 0.63);
    const sale: LegacySaleRecord = {
      _id: `sale-${String(index + 1).padStart(2, "0")}`,
      saleDate: date,
      entryMode: "daily-summary",
      items: [],
      totalCups: estimatedCups[index],
      cupCountSource: "estimated",
      grossRevenue: netRevenue,
      discountAmount: 0,
      netRevenue,
      cashReceived,
      bankTransferReceived: netRevenue - cashReceived,
      batchCode: index < 2 ? "ME-003" : "ME-004",
      batchName: index < 2 ? "6L Nhiều Béo" : "6L Thường",
      estimatedProfit: Math.floor(netRevenue * 0.4),
      note: "fixture",
    };
    if (index >= 15) {
      sale.snowMilkRevenue = netRevenue - freshRevenue;
      sale.freshMilkRevenue = freshRevenue;
      sale.freshMilkBottleCount = freshMilkBottleCount[index];
      sale.freshMilkBottleUnitPrice = 20_000;
    }
    return sale;
  },
);

describe("v2 legacy sales backfill planner", () => {
  test("reconciles the verified 20-day Atlas baseline exactly", () => {
    const result = buildLegacySalesBackfillPlan(
      onlineSalesFixture,
      LEGACY_BASELINE,
    );
    expect(result.canApply).toBe(true);
    expect(result.totals).toEqual({
      saleCount: 20,
      grossRevenueVnd: 110_501_000,
      netRevenueVnd: 110_501_000,
      snowMilkRevenueVnd: 108_501_000,
      freshMilkRevenueVnd: 2_000_000,
      cashVnd: 70_030_000,
      bankTransferVnd: 40_471_000,
      freshMilkBottleCount: 100,
      estimatedSnowMilkCups: 2_893,
    });
    expect(result.salesDays).toHaveLength(20);
    expect(result.stockMovements).toEqual([]);
    expect(
      result.salesDays.slice(0, 15).every((sale) =>
        (sale.lines as Array<{ businessLineCode: string }>).every(
          ({ businessLineCode }) => businessLineCode === "SNOW_MILK",
        ),
      ),
    ).toBe(true);
  });

  test("does not fabricate SKUs or retroactive stock movements", () => {
    const result = buildLegacySalesBackfillPlan(onlineSalesFixture);
    const lines = result.salesDays.flatMap(
      (sale) => sale.lines as Array<Record<string, unknown>>,
    );
    expect(lines.every(({ skuId }) => skuId === null)).toBe(true);
    expect(lines.every(({ unitPriceVnd }) => unitPriceVnd === null)).toBe(true);
    expect(
      lines
        .filter(({ businessLineCode }) => businessLineCode === "SNOW_MILK")
        .every(({ quantitySource }) => quantitySource === "estimated"),
    ).toBe(true);
    expect(result.stockMovements).toHaveLength(0);
  });

  test("blocks a payment mismatch", () => {
    const broken = onlineSalesFixture.map((sale) => ({ ...sale }));
    broken[0].cashReceived = Number(broken[0].cashReceived) - 1;
    const result = buildLegacySalesBackfillPlan(broken);
    expect(result.canApply).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "PAYMENT_MISMATCH" }),
    );
  });

  test("keeps the frozen baseline exact while planning a later sale", () => {
    const extraSale: LegacySaleRecord = {
      _id: "sale-after-baseline",
      saleDate: "2026-08-12",
      items: [],
      totalCups: 1,
      grossRevenue: 40_000,
      discountAmount: 0,
      netRevenue: 40_000,
      cashReceived: 20_000,
      bankTransferReceived: 20_000,
    };
    const result = buildLegacySalesBackfillPlan(
      [...onlineSalesFixture, extraSale],
      LEGACY_BASELINE,
    );
    expect(result.canApply).toBe(true);
    expect(result.baselineTotals).toEqual({
      saleCount: 20,
      ...LEGACY_BASELINE.totals,
    });
    expect(result.totals).toMatchObject({
      saleCount: 21,
      grossRevenueVnd: 110_541_000,
      netRevenueVnd: 110_541_000,
      snowMilkRevenueVnd: 108_541_000,
      cashVnd: 70_050_000,
      bankTransferVnd: 40_491_000,
      estimatedSnowMilkCups: 2_894,
    });
    expect(result.salesDays).toHaveLength(21);
    expect(result.stockMovements).toEqual([]);
  });

  test("produces the same checksum independent of source order", () => {
    const products = [
      {
        _id: "product-m",
        code: "M-OREO",
        name: "Oreo M",
        sellingPrice: 35_000,
      },
      {
        _id: "product-l",
        code: "L-OREO",
        name: "Oreo L",
        sellingPrice: 40_000,
      },
    ];
    const first = buildMigrationPlan({
      targetDigest: "target",
      products,
      sales: onlineSalesFixture,
    });
    const second = buildMigrationPlan({
      targetDigest: "target",
      products: products.toReversed(),
      sales: onlineSalesFixture.toReversed(),
    });
    expect(first.checksum).toBe(second.checksum);
    expect(first.sales.salesDays).toEqual(second.sales.salesDays);
  });
});
