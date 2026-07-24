import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  ownerCapitalPurchaseFilter,
  purchaseFundingSourceLabel,
} from "./purchase-funding";

describe("purchase funding sources", () => {
  test("treats purchases without a saved source as owner capital", () => {
    expect(DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE).toBe("owner_capital");
    expect(purchaseFundingSourceLabel()).toBe("Vốn chủ");
  });

  test("uses a clear label for each selectable source", () => {
    expect(purchaseFundingSourceLabel("sales_revenue")).toBe("Tiền bán hàng");
    expect(purchaseFundingSourceLabel("owner_capital")).toBe("Vốn chủ");
    expect(purchaseFundingSourceLabel("loan")).toBe("Tiền vay");
    expect(purchaseFundingSourceLabel("other")).toBe("Nguồn khác");
  });

  test("includes owner capital and legacy records in invested capital", () => {
    expect(ownerCapitalPurchaseFilter()).toEqual({
      $or: [
        { fundingSource: "owner_capital" },
        { fundingSource: { $exists: false } },
        { fundingSource: null },
        { fundingSource: "" },
      ],
    });
  });
});
