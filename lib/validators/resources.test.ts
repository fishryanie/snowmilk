import { describe, expect, it } from "bun:test";
import { resourceSchemas } from "./resources";

const baseExpense = {
  expenseDate: "2026-07-31",
  category: "Điện",
  description: "Tiền điện tháng 7",
  amount: 500_000,
};

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
