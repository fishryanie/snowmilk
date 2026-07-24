import { describe, expect, test } from "bun:test";
import { calculateDivestmentSuggestion } from "./divestment-suggestion";

describe("calculateDivestmentSuggestion", () => {
  test("does not suggest a withdrawal while recorded cumulative cash is negative", () => {
    const result = calculateDivestmentSuggestion({
      cumulativeCashIn: 5_720_000,
      cumulativeCashOut: 9_143_500,
      withdrawnTotal: 0,
      remainingCapital: 9_143_500,
      periodRevenue: 5_720_000,
      periodOperatingCashOut: 3_160_500,
      periodDays: 24,
      salesDays: 2,
    });

    expect(result.status).toBe("wait");
    expect(result.suggestedAmount).toBe(0);
    expect(result.recordedCashBalance).toBe(-3_423_500);
    expect(result.reserveTarget).toBe(3_950_625);
    expect(result.estimatedDaysUntilEligible).toBeNull();
  });

  test("suggests only the cash above a 30-day operating reserve", () => {
    const result = calculateDivestmentSuggestion({
      cumulativeCashIn: 12_000_000,
      cumulativeCashOut: 5_000_000,
      withdrawnTotal: 1_000_000,
      remainingCapital: 4_000_000,
      periodRevenue: 9_000_000,
      periodOperatingCashOut: 3_000_000,
      periodDays: 30,
      salesDays: 12,
    });

    expect(result.status).toBe("ready");
    expect(result.recordedCashBalance).toBe(6_000_000);
    expect(result.reserveTarget).toBe(3_000_000);
    expect(result.suggestedAmount).toBe(3_000_000);
    expect(result.estimatedDaysUntilEligible).toBe(0);
  });

  test("never suggests more than the capital still unrecovered", () => {
    const result = calculateDivestmentSuggestion({
      cumulativeCashIn: 20_000_000,
      cumulativeCashOut: 5_000_000,
      withdrawnTotal: 0,
      remainingCapital: 2_500_000,
      periodRevenue: 9_000_000,
      periodOperatingCashOut: 3_000_000,
      periodDays: 30,
      salesDays: 12,
    });

    expect(result.suggestedAmount).toBe(2_500_000);
  });

  test("waits for enough selling days before making a recommendation", () => {
    const result = calculateDivestmentSuggestion({
      cumulativeCashIn: 12_000_000,
      cumulativeCashOut: 5_000_000,
      withdrawnTotal: 0,
      remainingCapital: 5_000_000,
      periodRevenue: 4_000_000,
      periodOperatingCashOut: 1_000_000,
      periodDays: 14,
      salesDays: 3,
    });

    expect(result.status).toBe("insufficient-data");
    expect(result.suggestedAmount).toBe(0);
    expect(result.checks.hasEnoughSalesData).toBe(false);
  });

  test("stops suggesting withdrawals after the initial capital is recovered", () => {
    const result = calculateDivestmentSuggestion({
      cumulativeCashIn: 20_000_000,
      cumulativeCashOut: 5_000_000,
      withdrawnTotal: 5_000_000,
      remainingCapital: 0,
      periodRevenue: 9_000_000,
      periodOperatingCashOut: 3_000_000,
      periodDays: 30,
      salesDays: 12,
    });

    expect(result.status).toBe("capital-recovered");
    expect(result.suggestedAmount).toBe(0);
  });
});
