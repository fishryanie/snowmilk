import { describe, expect, test } from "bun:test";
import {
  compatibleUnitOptions,
  convertQuantity,
  convertUnitCost,
} from "./units";

describe("cost unit conversions", () => {
  test("converts milliliters to liters", () => {
    expect(convertQuantity(300, "ml", "lít")).toBeCloseTo(0.3);
  });

  test("converts grams to kilograms", () => {
    expect(convertQuantity(15, "g", "kg")).toBeCloseTo(0.015);
  });

  test("converts a cost per gram to a cost per kilogram", () => {
    expect(convertUnitCost(237.5, "gram", "kg")).toBe(237_500);
  });

  test("keeps non-convertible cost units unchanged when they match", () => {
    expect(convertQuantity(12, "cái", "cái")).toBe(12);
    expect(compatibleUnitOptions("cái")).toEqual([
      { value: "cái", label: "cái" },
    ]);
  });

  test("rejects incompatible units", () => {
    expect(() => convertQuantity(1, "kg", "lít")).toThrow(
      "Không thể quy đổi",
    );
  });
});
