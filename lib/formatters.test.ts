import { describe, expect, test } from "bun:test";
import { formatDate, formatVndInput, parseVndInput } from "./formatters";

describe("Vietnamese currency input", () => {
  test("parses formatted revenue as the full integer amount", () => {
    expect(parseVndInput("2.500.000 ₫")).toBe(2_500_000);
    expect(parseVndInput("2.200.000 ₫")).toBe(2_200_000);
    expect(parseVndInput("2500000")).toBe(2_500_000);
  });

  test("formats revenue with Vietnamese thousands separators", () => {
    expect(formatVndInput(2_500_000)).toBe("2.500.000 ₫");
  });

  test("formats calendar dates in Vietnam regardless of the server timezone", () => {
    expect(formatDate("2026-09-03T17:00:00.000Z")).toBe("04/09/2026");
    expect(formatDate("2026-09-04T00:00:00.000Z")).toBe("04/09/2026");
  });
});
