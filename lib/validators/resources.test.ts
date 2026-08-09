import { describe, expect, it } from "bun:test";
import { resourceSchemas } from "./resources";
import { MILK_STERILIZATION_EXPENSE_CATEGORY } from "@/lib/expense-categories";

const baseExpense = {
  expenseDate: "2026-07-31",
  category: "Điện",
  description: "Tiền điện tháng 7",
  amount: 500_000,
};

describe("ingredient validation", () => {
  it("allows the server to generate a missing item code", () => {
    const result = resourceSchemas.ingredients.parse({
      name: "Sữa đặc",
      category: "Nguyên liệu",
    });

    expect(result.code).toBeUndefined();
  });
});

describe("expense payment status validation", () => {
  it("treats legacy expenses without a status as paid", () => {
    const result = resourceSchemas.expenses.parse(baseExpense);

    expect(result.paymentStatus).toBe("paid");
  });

  it("accepts an unpaid expense", () => {
    const result = resourceSchemas.expenses.parse({
      ...baseExpense,
      paymentStatus: "unpaid",
    });

    expect(result.paymentStatus).toBe("unpaid");
  });

  it("rejects an unsupported payment status", () => {
    const result = resourceSchemas.expenses.safeParse({
      ...baseExpense,
      paymentStatus: "pending",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the removed payment method field", () => {
    const result = resourceSchemas.expenses.safeParse({
      ...baseExpense,
      paymentMethod: "Tiền mặt",
    });

    expect(result.success).toBe(false);
  });
});

describe("milk sterilization expense validation", () => {
  it("calculates the total from liters and unit price", () => {
    const result = resourceSchemas.expenses.parse({
      ...baseExpense,
      category: MILK_STERILIZATION_EXPENSE_CATEGORY,
      milkLiters: 12.5,
      milkUnitPrice: 8_000,
      amount: 1,
    });

    expect(result.amount).toBe(100_000);
    expect(result.description).toBe("12,5 lít × 8.000 ₫/lít");
    expect(result.milkLiters).toBe(12.5);
    expect(result.milkUnitPrice).toBe(8_000);
  });

  it("requires liters and unit price for milk sterilization", () => {
    const result = resourceSchemas.expenses.safeParse({
      ...baseExpense,
      category: MILK_STERILIZATION_EXPENSE_CATEGORY,
    });

    expect(result.success).toBe(false);
  });

  it("removes milk details from other expense categories", () => {
    const result = resourceSchemas.expenses.parse({
      ...baseExpense,
      milkLiters: 10,
      milkUnitPrice: 8_000,
    });

    expect("milkLiters" in result).toBe(false);
    expect("milkUnitPrice" in result).toBe(false);
  });
});

describe("milk purchase sterilization validation", () => {
  it("accepts a partial outsourced volume and provider", () => {
    const result = resourceSchemas.purchases.parse({
      purchaseDate: "2026-08-08",
      ingredientId: "507f1f77bcf86cd799439011",
      packageCount: 60,
      totalAmount: 1_500_000,
      sterilizationOutsourcedLiters: 30,
      sterilizationUnitPrice: 5_000,
      sterilizationProvider: "Cơ sở A",
    });

    expect(result.sterilizationOutsourcedLiters).toBe(30);
    expect(result.sterilizationUnitPrice).toBe(5_000);
    expect(result.sterilizationProvider).toBe("Cơ sở A");
  });

  it("defaults legacy purchases to no outsourced sterilization", () => {
    const result = resourceSchemas.purchases.parse({
      purchaseDate: "2026-08-08",
      ingredientId: "507f1f77bcf86cd799439011",
      packageCount: 60,
      totalAmount: 1_500_000,
    });

    expect(result.sterilizationOutsourcedLiters).toBe(0);
    expect(result.sterilizationUnitPrice).toBe(5_000);
  });
});
