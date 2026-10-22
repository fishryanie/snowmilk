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
  displayName: "Cái Tiệm Sữa",
  wordmark: "Cái Tiệm Sữa",
  tagline: "làm ở nhà, ngon thiệt nè.",
  description:
    "Quản lý bán hàng, sản xuất, kho và tài chính cho Cái Tiệm Sữa",
  timezone: "Asia/Ho_Chi_Minh",
  currency: "VND",
  locale: "vi-VN",
  brandColors: {
    cream: "#f5faff",
    terracotta: "#0862c0",
    green: "#4c775a",
    ink: "#153454",
  },
};

const DEPRECATED_BUSINESS_NAMES = new Set(["bếp nhà nè", "ủa ngon!"]);
const DEPRECATED_LOGO_URLS = new Set([
  "/ua-ngon-logo.png",
  "/logo.png",
  "/snowmilk-logo-transparent.png",
  "/snowmilk-app-icon-transparent-192.png",
  "/snowmilk-app-icon-transparent-512.png",
]);

const DEPRECATED_BRAND_COLORS = {
  cream: new Set(["#fff8ed", "#fffdf8", "#eef7fa"]),
  terracotta: new Set([
    "#a84f32",
    "#b65a39",
    "#c96545",
    "#c9694b",
    "#287f96",
  ]),
  green: new Set(["#47745a", "#4f7355", "#4f7c52", "#25845d"]),
  ink: new Set(["#29251f", "#2d2926", "#392820", "#17323a"]),
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

function replaceDeprecatedBrandText(value: string | undefined, fallback: string) {
  const normalizedValue = value?.trim().toLocaleLowerCase("vi-VN");
  return normalizedValue && !DEPRECATED_BUSINESS_NAMES.has(normalizedValue)
    ? value!.trim()
    : fallback;
}

function replaceDeprecatedLogo(value: string | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue && !DEPRECATED_LOGO_URLS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_BUSINESS_PROFILE.logoUrl;
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
    displayName: replaceDeprecatedBrandText(
      profile?.displayName,
      DEFAULT_BUSINESS_PROFILE.displayName,
    ),
    wordmark: replaceDeprecatedBrandText(
      profile?.wordmark ?? profile?.displayName,
      DEFAULT_BUSINESS_PROFILE.wordmark,
    ),
    logoUrl: replaceDeprecatedLogo(profile?.logoUrl),
    tagline: profile?.tagline?.trim() || DEFAULT_BUSINESS_PROFILE.tagline,
    description:
      profile?.description
        ?.trim()
        .replace(/Bếp Nhà Nè|Ủa ngon!/gi, DEFAULT_BUSINESS_PROFILE.displayName) ||
      DEFAULT_BUSINESS_PROFILE.description,
    currency: "VND",
    locale: "vi-VN",
    brandColors: {
      cream: replaceDeprecatedBrandColor(
        profile?.brandColors?.cream,
        DEFAULT_BUSINESS_PROFILE.brandColors.cream,
        DEPRECATED_BRAND_COLORS.cream,
      ),
      terracotta: replaceDeprecatedBrandColor(
        profile?.brandColors?.terracotta,
        DEFAULT_BUSINESS_PROFILE.brandColors.terracotta,
        DEPRECATED_BRAND_COLORS.terracotta,
      ),
      green: replaceDeprecatedBrandColor(
        profile?.brandColors?.green,
        DEFAULT_BUSINESS_PROFILE.brandColors.green,
        DEPRECATED_BRAND_COLORS.green,
      ),
      ink: replaceDeprecatedBrandColor(
        profile?.brandColors?.ink,
        DEFAULT_BUSINESS_PROFILE.brandColors.ink,
        DEPRECATED_BRAND_COLORS.ink,
      ),
    },
  };
}
