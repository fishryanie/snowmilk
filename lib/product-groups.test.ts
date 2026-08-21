import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PRODUCT_GROUP,
  normalizeProductGroupName,
  productGroupBusinessLineCode,
} from "./product-groups";

describe("product groups", () => {
  test("normalizes whitespace and keeps the user-facing Vietnamese name", () => {
    expect(normalizeProductGroupName("  Bánh   mì  ")).toBe("Bánh mì");
  });

  test("uses a stable business-line code for reporting", () => {
    expect(productGroupBusinessLineCode("Bánh mì")).toBe("BREAKFAST_BANH_MI");
    expect(productGroupBusinessLineCode("Banh mi")).toBe("BREAKFAST_BANH_MI");
  });

  test("keeps old products in the existing default business line", () => {
    expect(normalizeProductGroupName(undefined)).toBe(DEFAULT_PRODUCT_GROUP);
    expect(productGroupBusinessLineCode(undefined)).toBe("BREAKFAST");
    expect(productGroupBusinessLineCode("đồ ăn sáng / healthy")).toBe(
      "BREAKFAST",
    );
  });
});
