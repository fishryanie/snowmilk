import { describe, expect, test } from "bun:test";
import {
  areV2OperationsEnabled,
  assertV2OperationsEnabled,
} from "./feature-flag";

describe("v2 operations rollout flag", () => {
  test("defaults to disabled", () => {
    expect(areV2OperationsEnabled({})).toBe(false);
    expect(() => assertV2OperationsEnabled({})).toThrow("chưa được cutover");
  });

  test("requires the explicit enabled value", () => {
    expect(areV2OperationsEnabled({ V2_OPERATIONS_ENABLED: "enabled" })).toBe(
      true,
    );
  });
});
