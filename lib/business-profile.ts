export type BusinessProfile = {
  displayName: string;
  wordmark: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  legalName?: string;
  timezone: string;
  currency: "VND";
  locale: "vi-VN";
  brandColors: {
    cream: string;
    terracotta: string;
    green: string;
    ink: string;
  };
};

export const DEFAULT_BUSINESS_PROFILE: Readonly<BusinessProfile> = {
  displayName: "Bếp Nhà Nè",
  wordmark: "Bếp Nhà Nè",
  tagline: "làm ở nhà, ngon thiệt nè.",
  description:
    "Quản lý bán hàng, sản xuất, kho và tài chính cho Bếp Nhà Nè",
  timezone: "Asia/Ho_Chi_Minh",
  currency: "VND",
  locale: "vi-VN",
  brandColors: {
    cream: "#eef7fa",
    terracotta: "#287f96",
    green: "#25845d",
    ink: "#17323a",
  },
};

const DEPRECATED_BROWN_BRAND_COLORS = {
  cream: new Set(["#fff8ed", "#fffdf8"]),
  terracotta: new Set([
    "#a84f32",
    "#b65a39",
    "#c96545",
    "#c9694b",
  ]),
  green: new Set(["#47745a", "#4f7355", "#4f7c52"]),
  ink: new Set(["#29251f", "#2d2926", "#392820"]),
} as const;

function replaceDeprecatedBrandColor(
  color: string | undefined,
  fallback: string,
  deprecatedColors: ReadonlySet<string>,
) {
  const normalizedColor = color?.trim().toLowerCase();
  return normalizedColor && !deprecatedColors.has(normalizedColor)
    ? color!.trim()
    : fallback;
}

type ProfileDocument = Omit<Partial<BusinessProfile>, "brandColors"> & {
  brandColors?: Partial<BusinessProfile["brandColors"]>;
};

export function normalizeBusinessProfile(
  profile?: ProfileDocument | null,
): BusinessProfile {
  return {
    ...DEFAULT_BUSINESS_PROFILE,
    ...profile,
    displayName:
      profile?.displayName?.trim() || DEFAULT_BUSINESS_PROFILE.displayName,
    wordmark:
      profile?.wordmark?.trim() ||
      profile?.displayName?.trim() ||
      DEFAULT_BUSINESS_PROFILE.wordmark,
    tagline: profile?.tagline?.trim() || DEFAULT_BUSINESS_PROFILE.tagline,
    description:
      profile?.description?.trim() || DEFAULT_BUSINESS_PROFILE.description,
    currency: "VND",
    locale: "vi-VN",
    brandColors: {
      cream: replaceDeprecatedBrandColor(
        profile?.brandColors?.cream,
        DEFAULT_BUSINESS_PROFILE.brandColors.cream,
        DEPRECATED_BROWN_BRAND_COLORS.cream,
      ),
      terracotta: replaceDeprecatedBrandColor(
        profile?.brandColors?.terracotta,
        DEFAULT_BUSINESS_PROFILE.brandColors.terracotta,
        DEPRECATED_BROWN_BRAND_COLORS.terracotta,
      ),
      green: replaceDeprecatedBrandColor(
        profile?.brandColors?.green,
        DEFAULT_BUSINESS_PROFILE.brandColors.green,
        DEPRECATED_BROWN_BRAND_COLORS.green,
      ),
      ink: replaceDeprecatedBrandColor(
        profile?.brandColors?.ink,
        DEFAULT_BUSINESS_PROFILE.brandColors.ink,
        DEPRECATED_BROWN_BRAND_COLORS.ink,
      ),
    },
  };
}
