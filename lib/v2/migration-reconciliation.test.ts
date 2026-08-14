import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { LEGACY_BASELINE } from "./constants";
import { onlineSalesFixture } from "./migration-plan.test";
import {
  buildLegacySalesBackfillPlan,
  type LegacySaleRecord,
} from "./migration-plan";
import {
  materializeLegacyPostings,
  materializeLegacySalesDay,
} from "./migration-materializer";
import {
  assertReconciliationMatches,
  buildAppliedMigrationReconciliation,
  summarizeAppliedDailyFacts,
  summarizeAppliedRevenueEntries,
  summarizeAppliedSalesDays,
} from "./migration-reconciliation";

function appliedFixture(sales: readonly LegacySaleRecord[] = onlineSalesFixture) {
  const logical = buildLegacySalesBackfillPlan(sales);
  const references = {
    organizationId: new ObjectId(),
    locationId: new ObjectId(),
    businessLineIds: {
      SNOW_MILK: new ObjectId(),
      FRESH_MILK: new ObjectId(),
    },
    actor: { userId: "migration:test", source: "migration" as const },
    occurredAt: new Date("2026-08-12T00:00:00.000Z"),
  };
  const salesDays = logical.salesDays.map((sale) =>
    materializeLegacySalesDay(
      sale as unknown as Parameters<typeof materializeLegacySalesDay>[0],
      references,
    ),
  );
  const postings = salesDays.map((salesDay) =>
    materializeLegacyPostings(salesDay, new ObjectId(), references),
  );
  return {
    salesDays,
    revenueEntries: postings.flatMap(({ revenueEntries }) => revenueEntries),
    dailyFacts: postings.map(({ dailyRevenueFact }) => dailyRevenueFact),
  };
}

describe("applied migration read-back reconciliation", () => {
  test("reconciles persisted sales days, append-only entries, and facts independently", () => {
    const applied = appliedFixture();
    const layer = {
      salesDays: summarizeAppliedSalesDays(applied.salesDays),
      revenueEntries: summarizeAppliedRevenueEntries(applied.revenueEntries),
      dailyFacts: summarizeAppliedDailyFacts(applied.dailyFacts),
    };
    const reconciliation = buildAppliedMigrationReconciliation({
      frozenBaseline: layer,
      overall: layer,
      retroactiveStockMovementCount: 0,
    }, {
      saleCount: 20,
      entryCount: 25,
      factCount: 20,
      ...LEGACY_BASELINE.totals,
    });

    expect(reconciliation.every(({ matches }) => matches)).toBe(true);
    expect(() => assertReconciliationMatches(reconciliation)).not.toThrow();
    expect(
      reconciliation.find(
        ({ metric }) => metric === "frozenBaseline.salesDays.netRevenueVnd",
      ),
    ).toMatchObject({ expected: "110501000", actual: "110501000" });
    expect(
      reconciliation.find(
        ({ metric }) =>
          metric === "frozenBaseline.revenueEntries.freshMilkBottleCount",
      ),
    ).toMatchObject({ expected: "100", actual: "100" });
  });

  test("fails if read-back differs even when the in-memory plan was correct", () => {
    const applied = appliedFixture();
    applied.salesDays[0].tenders[0].amountVnd -= 1;
    const layer = {
      salesDays: summarizeAppliedSalesDays(applied.salesDays),
      revenueEntries: summarizeAppliedRevenueEntries(applied.revenueEntries),
      dailyFacts: summarizeAppliedDailyFacts(applied.dailyFacts),
    };
    const reconciliation = buildAppliedMigrationReconciliation({
      frozenBaseline: layer,
      overall: layer,
      retroactiveStockMovementCount: 0,
    }, {
      saleCount: 20,
      entryCount: 25,
      factCount: 20,
      ...LEGACY_BASELINE.totals,
    });
    expect(() => assertReconciliationMatches(reconciliation)).toThrow(
      "frozenBaseline.salesDays.cashVnd",
    );
    expect(
      reconciliation.find(
        ({ metric }) =>
          metric === "frozenBaseline.salesDays.paymentParityVnd",
      ),
    ).toMatchObject({ matches: false });
  });

  test("blocks any retroactive stock movement linked to legacy sales dates", () => {
    const applied = appliedFixture();
    const layer = {
      salesDays: summarizeAppliedSalesDays(applied.salesDays),
      revenueEntries: summarizeAppliedRevenueEntries(applied.revenueEntries),
      dailyFacts: summarizeAppliedDailyFacts(applied.dailyFacts),
    };
    const reconciliation = buildAppliedMigrationReconciliation({
      frozenBaseline: layer,
      overall: layer,
      retroactiveStockMovementCount: 1,
    }, {
      saleCount: 20,
      entryCount: 25,
      factCount: 20,
      ...LEGACY_BASELINE.totals,
    });
    expect(() => assertReconciliationMatches(reconciliation)).toThrow(
      "stockMovements.retroactiveLegacyCount",
    );
  });

  test("reconciles the frozen baseline and a larger overall incremental plan", () => {
    const applied = appliedFixture([
      ...onlineSalesFixture,
      {
        _id: "incremental-sale",
        saleDate: "2026-08-12",
        totalCups: 1,
        grossRevenue: 40_000,
        netRevenue: 40_000,
        cashReceived: 20_000,
        bankTransferReceived: 20_000,
      },
    ]);
    const isFrozen = (document: { businessDate: string }) =>
      document.businessDate <= LEGACY_BASELINE.toBusinessDate;
    const layer = {
      salesDays: summarizeAppliedSalesDays(applied.salesDays),
      revenueEntries: summarizeAppliedRevenueEntries(applied.revenueEntries),
      dailyFacts: summarizeAppliedDailyFacts(applied.dailyFacts),
    };
    const frozenLayer = {
      salesDays: summarizeAppliedSalesDays(applied.salesDays.filter(isFrozen)),
      revenueEntries: summarizeAppliedRevenueEntries(
        applied.revenueEntries.filter(isFrozen),
      ),
      dailyFacts: summarizeAppliedDailyFacts(applied.dailyFacts.filter(isFrozen)),
    };
    const reconciliation = buildAppliedMigrationReconciliation(
      {
        frozenBaseline: frozenLayer,
        overall: layer,
        retroactiveStockMovementCount: 0,
      },
      {
        saleCount: 21,
        entryCount: 26,
        factCount: 21,
        grossRevenueVnd: 110_541_000,
        netRevenueVnd: 110_541_000,
        snowMilkRevenueVnd: 108_541_000,
        freshMilkRevenueVnd: 2_000_000,
        cashVnd: 70_050_000,
        bankTransferVnd: 40_491_000,
        freshMilkBottleCount: 100,
        estimatedSnowMilkCups: 2_894,
      },
    );
    expect(() => assertReconciliationMatches(reconciliation)).not.toThrow();
    expect(
      reconciliation.find(
        ({ metric }) => metric === "frozenBaseline.salesDays.netRevenueVnd",
      ),
    ).toMatchObject({ actual: "110501000" });
    expect(
      reconciliation.find(({ metric }) => metric === "overall.salesDays.netRevenueVnd"),
    ).toMatchObject({ actual: "110541000" });
  });
});
