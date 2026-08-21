import { describe, expect, test } from "bun:test";
import { dailySaleSchema } from "./sales";

const baseSale = {
  saleDate: "2026-08-08",
  batchId: "507f1f77bcf86cd799439011",
  freshMilkBottleCount: 8,
  cashReceived: 700_000,
  bankTransferReceived: 500_000,
};

describe("daily sale revenue validation", () => {
  test("accepts payments and lets the server derive total revenue", () => {
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

  test("accepts quantities for newly added products", () => {
    const result = dailySaleSchema.safeParse({
      ...baseSale,
      productQuantities: [
        { productId: "507f1f77bcf86cd799439012", quantity: 3 },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects duplicate product quantities", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        productQuantities: [
          { productId: "507f1f77bcf86cd799439012", quantity: 1 },
          { productId: "507f1f77bcf86cd799439012", quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects a zero payment total", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        cashReceived: 0,
        bankTransferReceived: 0,
      }).success,
    ).toBe(false);
  });

  test("allows no batch because the server derives whether snow milk was sold", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        batchId: undefined,
        freshMilkBottleCount: 10,
        cashReceived: 200_000,
        bankTransferReceived: 0,
      }).success,
    ).toBe(true);
  });

  test("rejects a client-supplied total revenue", () => {
    expect(
      dailySaleSchema.safeParse({
        ...baseSale,
        totalRevenue: 1_200_000,
      }).success,
    ).toBe(false);
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
