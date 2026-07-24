import { describe, expect, test } from "bun:test";
import { formatVndInput, parseVndInput } from "./formatters";

describe("Vietnamese currency input", () => {
  test("parses formatted revenue as the full integer amount", () => {
    expect(parseVndInput("2.500.000 ₫")).toBe(2_500_000);
    expect(parseVndInput("2.200.000 ₫")).toBe(2_200_000);
    expect(parseVndInput("2500000")).toBe(2_500_000);
  });

  test("formats revenue with Vietnamese thousands separators", () => {
    expect(formatVndInput(2_500_000)).toBe("2.500.000 ₫");
  });
});
