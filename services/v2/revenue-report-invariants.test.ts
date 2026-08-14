import { describe, expect, test } from "bun:test";
import { activeRevenueSales } from "@/services/v2/revenue-report-invariants";

describe("append-only revenue report projection", () => {
  test("drops a reversed missing-cost sale instead of poisoning active totals", () => {
    const entries = [
      {
        _id: "sale-v1",
        entryType: "sale" as const,
        cogsVnd: null,
        dataQuality: "missing_cost",
      },
      {
        _id: "reverse-v1",
        entryType: "reversal" as const,
        reversalOfId: "sale-v1",
        cogsVnd: null,
        dataQuality: "missing_cost",
      },
    ];
    expect(activeRevenueSales(entries)).toEqual([]);
  });

  test("keeps only the new sale after reopen and reclose", () => {
    const entries = [
      { _id: "sale-v1", entryType: "sale" as const, netRevenueVnd: 20_000 },
      {
        _id: "reverse-v1",
        entryType: "reversal" as const,
        reversalOfId: "sale-v1",
        netRevenueVnd: -20_000,
      },
      { _id: "sale-v3", entryType: "sale" as const, netRevenueVnd: 40_000 },
    ];
    expect(activeRevenueSales(entries).map((entry) => entry._id)).toEqual([
      "sale-v3",
    ]);
  });
});
