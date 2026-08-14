import { describe, expect, test } from "bun:test";
import { buildLegacySalesBackfillPlan } from "./migration-plan";
import {
  materializeLegacyPostings,
  materializeLegacySalesDay,
} from "./migration-materializer";
import { SalesDay } from "@/models/v2/SalesDay";
import { RevenueEntry } from "@/models/v2/RevenueEntry";
import { DailyRevenueFact } from "@/models/v2/DailyRevenueFact";

const ids = {
  organization: "507f1f77bcf86cd799439001",
  location: "507f1f77bcf86cd799439002",
  snow: "507f1f77bcf86cd799439003",
  fresh: "507f1f77bcf86cd799439004",
  salesDay: "507f1f77bcf86cd799439005",
};

describe("legacy migration canonical materializer", () => {
  test("emits documents accepted by strict v2 Mongoose contracts", async () => {
    const logical = buildLegacySalesBackfillPlan([
      {
        _id: "legacy-sale-1",
        saleDate: "2026-08-11",
        items: [],
        totalCups: 2,
        grossRevenue: 100_000,
        discountAmount: 0,
        netRevenue: 100_000,
        snowMilkRevenue: 80_000,
        freshMilkRevenue: 20_000,
        freshMilkBottleCount: 1,
        freshMilkBottleUnitPrice: 20_000,
        cashReceived: 60_000,
        bankTransferReceived: 40_000,
        totalVariableCost: 40_123.45,
        estimatedProfit: 59_876.55,
      },
    ]);
    expect(logical.canApply).toBe(true);
    const references = {
      organizationId: ids.organization,
      locationId: ids.location,
      businessLineIds: {
        SNOW_MILK: ids.snow,
        FRESH_MILK: ids.fresh,
      },
      actor: {
        userId: "migration:test",
        displayName: "Migration test",
        source: "migration" as const,
      },
      occurredAt: new Date("2026-08-12T00:00:00.000Z"),
    };
    const salesDay = materializeLegacySalesDay(
      logical.salesDays[0] as unknown as Parameters<
        typeof materializeLegacySalesDay
      >[0],
      references,
    );
    const postings = materializeLegacyPostings(
      salesDay,
      ids.salesDay,
      references,
    );

    await expect(new SalesDay(salesDay).validate()).resolves.toBeUndefined();
    for (const entry of postings.revenueEntries) {
      await expect(new RevenueEntry(entry).validate()).resolves.toBeUndefined();
    }
    await expect(
      new DailyRevenueFact(postings.dailyRevenueFact).validate(),
    ).resolves.toBeUndefined();
    expect(salesDay.lines.every(({ unitPriceVnd }) => unitPriceVnd === null)).toBe(
      true,
    );
    expect(salesDay.lines.every(({ cogsVnd }) => cogsVnd === null)).toBe(true);
    expect(salesDay.lines[0].legacyFinancialSnapshot).toMatchObject({
      totalVariableCost: 40_123.45,
      estimatedProfit: 59_876.55,
    });
  });

  test("blocks materialization if a canonical ObjectId was not resolved", () => {
    const logical = buildLegacySalesBackfillPlan([
      {
        _id: "legacy-sale-2",
        saleDate: "2026-08-10",
        totalCups: 1,
        grossRevenue: 40_000,
        netRevenue: 40_000,
        cashReceived: 40_000,
        bankTransferReceived: 0,
      },
    ]);
    expect(() =>
      materializeLegacySalesDay(
        logical.salesDays[0] as unknown as Parameters<
          typeof materializeLegacySalesDay
        >[0],
        {
          organizationId: ids.organization,
          locationId: ids.location,
          businessLineIds: {
            SNOW_MILK: undefined,
            FRESH_MILK: ids.fresh,
          },
          actor: { userId: "migration:test", source: "migration" },
          occurredAt: new Date(),
        },
      ),
    ).toThrow("Chưa resolve ObjectId");
  });
});

