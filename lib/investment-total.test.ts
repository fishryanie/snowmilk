import { describe, expect, test } from "bun:test";
import { calculateOwnerInvestmentTotal } from "./investment-total";

describe("owner investment total", () => {
  test("keeps claimed capital in the original investment total", () => {
    expect(
      calculateOwnerInvestmentTotal({
        purchases: [
          { id: "claimed", amount: 500_000, fundingSource: "sales_revenue" },
          { id: "open", amount: 300_000, fundingSource: "owner_capital" },
        ],
        equipment: [],
        claims: [
          {
            sourceId: "claimed",
            sourceType: "purchase",
            amount: 500_000,
          },
        ],
      }),
    ).toBe(800_000);
  });

  test("does not double count a claimed source changed back to owner capital", () => {
    expect(
      calculateOwnerInvestmentTotal({
        purchases: [
          { id: "claimed", amount: 500_000, fundingSource: "owner_capital" },
        ],
        equipment: [],
        claims: [
          {
            sourceId: "claimed",
            sourceType: "purchase",
            amount: 500_000,
          },
        ],
      }),
    ).toBe(500_000);
  });

  test("treats legacy records and deleted claimed sources as owner investment", () => {
    expect(
      calculateOwnerInvestmentTotal({
        purchases: [{ id: "legacy", amount: 200_000 }],
        equipment: [],
        claims: [
          {
            sourceId: "deleted",
            sourceType: "equipment",
            amount: 400_000,
          },
        ],
      }),
    ).toBe(600_000);
  });
});
