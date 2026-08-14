import { describe, expect, test } from "bun:test";
import { parseBusinessDate } from "@/services/v2/context";

describe("business date", () => {
  test("accepts canonical calendar dates", () => {
    expect(parseBusinessDate("2026-08-12")).toBe("2026-08-12");
  });

  test("rejects normalized-over invalid dates", () => {
    expect(() => parseBusinessDate("2026-02-30")).toThrow();
  });
});
