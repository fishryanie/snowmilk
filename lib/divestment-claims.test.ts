import { describe, expect, test } from "bun:test";
import {
  calculateBusinessCashBalance,
  resolveClaimSelection,
  type ClaimableInvestment,
} from "./divestment-claims";

const history: ClaimableInvestment[] = [
  {
    key: "equipment:1",
    sourceType: "equipment",
    sourceId: "1",
    code: "TS-001",
    name: "Máy xay",
    category: "Máy móc",
    purchaseDate: "2026-07-20T00:00:00.000Z",
    amount: 2_000_000,
  },
  {
    key: "purchase:2",
    sourceType: "purchase",
    sourceId: "2",
    code: "NL001",
    name: "Sữa tươi",
    category: "Nguyên liệu",
    purchaseDate: "2026-07-21T00:00:00.000Z",
    amount: 500_000,
  },
];

describe("divestment claim selection", () => {
  test("subtracts every company-funded outflow from remaining business cash", () => {
    expect(
      calculateBusinessCashBalance(5_720_000, 2_697_000, 250_000, 370_000),
    ).toEqual({
      totalRevenue: 5_720_000,
      salesFundedPurchaseTotal: 2_697_000,
      salesFundedExpenseTotal: 250_000,
      salesFundedEquipmentTotal: 370_000,
      totalCompanyFundedOutflow: 3_317_000,
      remainingBalance: 2_403_000,
    });
  });

  test("keeps backward-compatible zero totals for sources not provided", () => {
    expect(calculateBusinessCashBalance(5_720_000, 2_697_000)).toEqual({
      totalRevenue: 5_720_000,
      salesFundedPurchaseTotal: 2_697_000,
      salesFundedExpenseTotal: 0,
      salesFundedEquipmentTotal: 0,
      totalCompanyFundedOutflow: 2_697_000,
      remainingBalance: 3_023_000,
    });
  });

  test("derives the exact amount from historical items", () => {
    const result = resolveClaimSelection(
      history,
      ["equipment:1", "purchase:2"],
      3_000_000,
    );

    expect(result.total).toBe(2_500_000);
    expect(result.selectedItems).toHaveLength(2);
  });

  test("rejects a key that is not in eligible history", () => {
    expect(() =>
      resolveClaimSelection(history, ["purchase:unknown"], 3_000_000),
    ).toThrow("không còn tồn tại");
  });

  test("rejects a selection above the business withdrawal limit", () => {
    expect(() =>
      resolveClaimSelection(history, ["equipment:1"], 1_500_000),
    ).toThrow("phải nhỏ hơn số tiền còn lại");
  });

  test("rejects a selection equal to the remaining business cash", () => {
    expect(() =>
      resolveClaimSelection(history, ["purchase:2"], 500_000),
    ).toThrow("phải nhỏ hơn số tiền còn lại");
  });

  test("rejects duplicate history keys", () => {
    expect(() =>
      resolveClaimSelection(
        history,
        ["purchase:2", "purchase:2"],
        3_000_000,
      ),
    ).toThrow("bị trùng");
  });
});
