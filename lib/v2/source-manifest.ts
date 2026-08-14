import { canonicalJson, sha256Canonical } from "./canonical";
import {
  LEGACY_SOURCE_COUNT_BASELINE,
  V2_COLLECTIONS,
} from "./constants";

export const LEGACY_SOURCE_POLICIES = [
  {
    key: "products",
    collectionName: "products",
    disposition: "migrate",
    canonicalTargets: [
      V2_COLLECTIONS.catalogProducts,
      V2_COLLECTIONS.skus,
      V2_COLLECTIONS.skuPrices,
    ],
  },
  {
    key: "recipes",
    collectionName: "recipes",
    disposition: "migrate",
    canonicalTargets: [V2_COLLECTIONS.recipes, V2_COLLECTIONS.recipeVersions],
  },
  {
    key: "ingredients",
    collectionName: "ingredients",
    disposition: "migrate",
    canonicalTargets: [V2_COLLECTIONS.inventoryItems],
  },
  {
    key: "sales",
    collectionName: "sales",
    disposition: "migrate",
    canonicalTargets: [
      V2_COLLECTIONS.salesDays,
      V2_COLLECTIONS.revenueEntries,
      V2_COLLECTIONS.dailyRevenueFacts,
    ],
  },
  {
    key: "milkBatches",
    collectionName: "milkbatches",
    disposition: "preserve_read_only",
    canonicalTargets: [],
  },
  {
    key: "purchases",
    collectionName: "purchases",
    disposition: "preserve_read_only",
    canonicalTargets: [],
  },
  {
    key: "inventorySnapshots",
    collectionName: "inventorysnapshots",
    disposition: "preserve_for_physical_opening_reference",
    canonicalTargets: [],
  },
  {
    key: "expenses",
    collectionName: "expenses",
    disposition: "preserve_read_only",
    canonicalTargets: [],
  },
  {
    key: "equipment",
    collectionName: "equipment",
    disposition: "preserve_read_only",
    canonicalTargets: [],
  },
] as const;

export type LegacySourceKey = (typeof LEGACY_SOURCE_POLICIES)[number]["key"];
export type LegacySourceDocuments = Record<
  LegacySourceKey,
  readonly Record<string, unknown>[]
>;

function stableRecords(records: readonly Record<string, unknown>[]) {
  return [...records].sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
}

export function buildLegacySourceManifest(sources: LegacySourceDocuments) {
  return LEGACY_SOURCE_POLICIES.map((policy) => {
    const records = stableRecords(sources[policy.key]);
    return {
      ...policy,
      canonicalTargets: [...policy.canonicalTargets],
      count: records.length,
      checksum: sha256Canonical(records),
    };
  });
}

export function sourceCountsFromManifest(
  manifest: ReturnType<typeof buildLegacySourceManifest>,
) {
  return Object.fromEntries(manifest.map(({ key, count }) => [key, count])) as Record<
    LegacySourceKey,
    number
  >;
}

export function validateLegacySourceManifest(
  manifest: ReturnType<typeof buildLegacySourceManifest>,
) {
  const issues = manifest.flatMap(({ key, collectionName, count }) => {
    const expected = LEGACY_SOURCE_COUNT_BASELINE[key];
    return count >= expected
      ? []
      : [
          {
            severity: "error" as const,
            code: "SOURCE_COUNT_BELOW_BASELINE" as const,
            sourceKey: key,
            collectionName,
            expectedMinimum: expected,
            actual: count,
            message: `${collectionName}: cần ít nhất ${expected} record baseline, nhận ${count}.`,
          },
        ];
  });
  return { issues, canApply: issues.length === 0 };
}
