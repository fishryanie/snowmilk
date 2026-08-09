import { describe, expect, test } from "bun:test";
import { dailySaleSchema } from "./sales";

const baseSale = {
  saleDate: "2026-08-08",
  batchId: "507f1f77bcf86cd799439011",
  totalRevenue: 1_200_000,
  freshMilkBottleCount: 8,
  cashReceived: 700_000,
  bankTransferReceived: 500_000,
};

describe("daily sale revenue validation", () => {
  test("accepts total revenue, bottle count, and matching payments", () => {
    expect(dailySaleSchema.safeParse(baseSale).success).toBe(true);
  });

  test("allows zero fresh-milk bottles", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        freshMilkBottleCount: 0,
      }).success,
    ).toBe(true);
  });

  test("rejects a payment total that differs from revenue", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        bankTransferReceived: 400_000,
      }).success,
    ).toBe(false);
  });

  test("allows no batch because the server derives whether snow milk was sold", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        batchId: undefined,
        totalRevenue: 200_000,
        freshMilkBottleCount: 10,
        cashReceived: 200_000,
        bankTransferReceived: 0,
      }).success,
    ).toBe(true);
  });

  test("rejects client-computed revenue splits", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        snowMilkRevenue: 1_000_000,
        freshMilkRevenue: 200_000,
      }).success,
    ).toBe(false);
  });
});
