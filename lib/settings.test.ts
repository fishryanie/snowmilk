import { describe, expect, test } from "bun:test";
import { resolveSettingValue } from "./settings";

describe("setting defaults", () => {
  test("uses the electricity defaults when settings have not been saved", () => {
    const settings = new Map<string, number>();

    expect(
      resolveSettingValue(settings, "cong_suat_bep_mac_dinh_kw"),
    ).toBe(2);
    expect(resolveSettingValue(settings, "gia_dien_d_kwh")).toBe(3_000);
  });

  test("preserves an explicitly saved zero", () => {
    const settings = new Map([["dien_khac_moi_me_d", 0]]);

    expect(resolveSettingValue(settings, "dien_khac_moi_me_d")).toBe(0);
  });
});
