import { describe, expect, test } from "bun:test";
import { ingredientCodePrefix, nextIngredientCode } from "./ingredient-code";

describe("ingredient codes", () => {
  test.each([
    ["Nguyên liệu", "NL"],
    ["Topping", "TP"],
    ["Bao bì", "BB"],
    ["Khác", "HH"],
  ] as const)("uses the prefix for %s", (category, prefix) => {
    expect(ingredientCodePrefix(category)).toBe(prefix);
  });

  test("increments both legacy and generated code formats", () => {
    expect(nextIngredientCode("Bao bì", ["BB001", "BB-017", "NL999"]))
      .toBe("BB018");
  });

  test("starts a new category at 001", () => {
    expect(nextIngredientCode("Khác", [])).toBe("HH001");
  });
});
