import { describe, expect, test } from "bun:test";
import { calculateCapitalRecovery } from "./capital-recovery";

describe("calculateCapitalRecovery", () => {
  test("tracks the amount still needed without changing the investment total", () => {
    expect(calculateCapitalRecovery(5_000_000, 2_000_000)).toEqual({
      investmentTotal: 5_000_000,
      withdrawnTotal: 2_000_000,
      remainingCapital: 3_000_000,
      excessWithdrawal: 0,
      recoveryRate: 40,
      isRecovered: false,
    });
  });

  test("marks the initial capital as recovered and keeps the excess separate", () => {
    expect(calculateCapitalRecovery(5_000_000, 6_000_000)).toEqual({
      investmentTotal: 5_000_000,
      withdrawnTotal: 6_000_000,
      remainingCapital: 0,
      excessWithdrawal: 1_000_000,
      recoveryRate: 120,
      isRecovered: true,
    });
  });

  test("normalizes invalid totals", () => {
    expect(calculateCapitalRecovery(Number.NaN, -100)).toEqual({
      investmentTotal: 0,
      withdrawnTotal: 0,
      remainingCapital: 0,
      excessWithdrawal: 0,
      recoveryRate: 0,
      isRecovered: false,
    });
  });
});
