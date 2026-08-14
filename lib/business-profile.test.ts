import { describe, expect, test } from "bun:test";
import {
  DEFAULT_BUSINESS_PROFILE,
  normalizeBusinessProfile,
} from "@/lib/business-profile";

describe("BusinessProfile", () => {
  test("uses the approved Bếp Nhà Nè identity by default", () => {
    const profile = normalizeBusinessProfile();
    expect(profile.displayName).toBe("Bếp Nhà Nè");
    expect(profile.tagline).toBe(
      "làm ở nhà, ngon thiệt nè.",
    );
    expect(profile.brandColors).toEqual({
      cream: "#eef7fa",
      terracotta: "#287f96",
      green: "#25845d",
      ink: "#17323a",
    });
  });

  test("keeps missing colors from the safe fallback", () => {
    const profile = normalizeBusinessProfile({
      displayName: "Chi nhánh thử nghiệm",
      brandColors: { green: "#123456" },
    });
    expect(profile.wordmark).toBe("Chi nhánh thử nghiệm");
    expect(profile.brandColors.green).toBe("#123456");
    expect(profile.brandColors.cream).toBe(
      DEFAULT_BUSINESS_PROFILE.brandColors.cream,
    );
  });

  test("upgrades a persisted brown palette to the legacy blue palette", () => {
    const profile = normalizeBusinessProfile({
      brandColors: {
        cream: "#FFF8ED",
        terracotta: "#C96545",
        green: "#47745A",
        ink: "#29251F",
      },
    });

    expect(profile.brandColors).toEqual(
      DEFAULT_BUSINESS_PROFILE.brandColors,
    );
  });

  test("upgrades every brown brand variant used during the redesign", () => {
    for (const terracotta of [
      "#A84F32",
      "#B65A39",
      "#C96545",
      "#C9694B",
    ]) {
      expect(
        normalizeBusinessProfile({ brandColors: { terracotta } }).brandColors
          .terracotta,
      ).toBe(DEFAULT_BUSINESS_PROFILE.brandColors.terracotta);
    }
  });
});
