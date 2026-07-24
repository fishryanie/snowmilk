import { describe, expect, test } from "bun:test";
import {
  isVietnamDateKey,
  vietnamDateKey,
  vietnamDayBoundary,
} from "./vietnam-date";

describe("Vietnam date boundaries", () => {
  test("stores the start of a selected day independently of server timezone", () => {
    expect(vietnamDayBoundary("2026-07-22").toISOString()).toBe(
      "2026-07-21T17:00:00.000Z",
    );
    expect(vietnamDayBoundary("2026-07-22", true).toISOString()).toBe(
      "2026-07-22T16:59:59.999Z",
    );
  });

  test("maps stored timestamps back to the correct Vietnam calendar day", () => {
    expect(vietnamDateKey(new Date("2026-07-21T17:00:00.000Z"))).toBe(
      "2026-07-22",
    );
  });

  test("rejects impossible or malformed calendar dates", () => {
    expect(isVietnamDateKey("2026-07-22")).toBe(true);
    expect(isVietnamDateKey("2026-02-30")).toBe(false);
    expect(isVietnamDateKey("22/07/2026")).toBe(false);
  });
});
