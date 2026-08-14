import { LEGACY_BASELINE } from "./constants";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function integer(value: unknown, label: string) {
  const source =
    typeof value === "number"
      ? Number.isSafeInteger(value)
        ? String(value)
        : ""
      : typeof value === "string"
        ? value
        : value && typeof value === "object" && "toString" in value
          ? String(value)
          : "";
  if (!source.match(/^\d+$/)) throw new Error(`${label} không phải số nguyên.`);
  const parsed = BigInt(source);
  if (parsed > MAX_SAFE) throw new Error(`${label} vượt Number.MAX_SAFE_INTEGER.`);
  return Number(parsed);
}

function safeSum(values: readonly number[], label: string) {
  const result = values.reduce((total, value) => total + BigInt(value), BigInt(0));
  if (result > MAX_SAFE) throw new Error(`${label} vượt Number.MAX_SAFE_INTEGER.`);
  return Number(result);
}

type MaterializedSalesLine = {
  businessLineSnapshot?: { code?: unknown };
  quantity?: unknown;
  quantitySource?: unknown;
  grossRevenueVnd?: unknown;
  netRevenueVnd?: unknown;
};

type MaterializedSalesDay = {
  grossRevenueVnd?: unknown;
  netRevenueVnd?: unknown;
  lines?: unknown;
  tenders?: unknown;
};

export function summarizeAppliedSalesDays(
  documents: readonly MaterializedSalesDay[],
) {
  const lines = documents.flatMap((document) =>
    Array.isArray(document.lines)
      ? (document.lines as MaterializedSalesLine[])
      : [],
  );
  const tenders = documents.flatMap((document) =>
    Array.isArray(document.tenders)
      ? (document.tenders as Array<{ method?: unknown; amountVnd?: unknown }>)
      : [],
  );
  const lineRevenue = (code: string) =>
    safeSum(
      lines
        .filter((line) => line.businessLineSnapshot?.code === code)
        .map((line) => integer(line.netRevenueVnd, `${code}.netRevenueVnd`)),
      `${code} revenue`,
    );
  const lineQuantity = (code: string, source: string) =>
    safeSum(
      lines
        .filter(
          (line) =>
            line.businessLineSnapshot?.code === code &&
            line.quantitySource === source,
        )
        .map((line) => integer(line.quantity, `${code}.quantity`)),
      `${code} quantity`,
    );
  const tenderAmount = (method: string) =>
    safeSum(
      tenders
        .filter((tender) => tender.method === method)
        .map((tender) => integer(tender.amountVnd, `${method}.amountVnd`)),
      `${method} total`,
    );
  return {
    saleCount: documents.length,
    grossRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.grossRevenueVnd, "grossRevenueVnd"),
      ),
      "gross revenue",
    ),
    netRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.netRevenueVnd, "netRevenueVnd"),
      ),
      "net revenue",
    ),
    snowMilkRevenueVnd: lineRevenue("SNOW_MILK"),
    freshMilkRevenueVnd: lineRevenue("FRESH_MILK"),
    cashVnd: tenderAmount("cash"),
    bankTransferVnd: tenderAmount("bank_transfer"),
    freshMilkBottleCount: lineQuantity("FRESH_MILK", "legacy"),
    estimatedSnowMilkCups: lineQuantity("SNOW_MILK", "estimated"),
  };
}

type MaterializedRevenueEntry = {
  businessLineCodeSnapshot?: unknown;
  quantity?: unknown;
  quantitySource?: unknown;
  grossRevenueVnd?: unknown;
  netRevenueVnd?: unknown;
};

export function summarizeAppliedRevenueEntries(
  documents: readonly MaterializedRevenueEntry[],
) {
  const filtered = (code: string) =>
    documents.filter((document) => document.businessLineCodeSnapshot === code);
  return {
    entryCount: documents.length,
    grossRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.grossRevenueVnd, "entry.grossRevenueVnd"),
      ),
      "entry gross revenue",
    ),
    netRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.netRevenueVnd, "entry.netRevenueVnd"),
      ),
      "entry net revenue",
    ),
    snowMilkRevenueVnd: safeSum(
      filtered("SNOW_MILK").map((document) =>
        integer(document.netRevenueVnd, "entry.snowRevenue"),
      ),
      "entry snow revenue",
    ),
    freshMilkRevenueVnd: safeSum(
      filtered("FRESH_MILK").map((document) =>
        integer(document.netRevenueVnd, "entry.freshRevenue"),
      ),
      "entry fresh revenue",
    ),
    freshMilkBottleCount: safeSum(
      filtered("FRESH_MILK")
        .filter((document) => document.quantitySource === "legacy")
        .map((document) => integer(document.quantity, "entry.freshQuantity")),
      "entry fresh quantity",
    ),
    estimatedSnowMilkCups: safeSum(
      filtered("SNOW_MILK")
        .filter((document) => document.quantitySource === "estimated")
        .map((document) => integer(document.quantity, "entry.snowQuantity")),
      "entry snow quantity",
    ),
  };
}

type MaterializedRevenueFact = {
  grossRevenueVnd?: unknown;
  netRevenueVnd?: unknown;
  dimensions?: unknown;
};

export function summarizeAppliedDailyFacts(
  documents: readonly MaterializedRevenueFact[],
) {
  const dimensions = documents.flatMap((document) =>
    Array.isArray(document.dimensions)
      ? (document.dimensions as Array<{
          dimensionType?: unknown;
          dimensionCode?: unknown;
          netRevenueVnd?: unknown;
        }>)
      : [],
  );
  const revenue = (code: string) =>
    safeSum(
      dimensions
        .filter(
          (dimension) =>
            dimension.dimensionType === "business_line" &&
            dimension.dimensionCode === code,
        )
        .map((dimension) =>
          integer(dimension.netRevenueVnd, `fact.${code}.netRevenueVnd`),
        ),
      `fact ${code} revenue`,
    );
  return {
    factCount: documents.length,
    grossRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.grossRevenueVnd, "fact.grossRevenueVnd"),
      ),
      "fact gross revenue",
    ),
    netRevenueVnd: safeSum(
      documents.map((document) =>
        integer(document.netRevenueVnd, "fact.netRevenueVnd"),
      ),
      "fact net revenue",
    ),
    snowMilkRevenueVnd: revenue("SNOW_MILK"),
    freshMilkRevenueVnd: revenue("FRESH_MILK"),
  };
}

type AppliedLayerSnapshot = {
  salesDays: ReturnType<typeof summarizeAppliedSalesDays>;
  revenueEntries: ReturnType<typeof summarizeAppliedRevenueEntries>;
  dailyFacts: ReturnType<typeof summarizeAppliedDailyFacts>;
};

type AppliedMigrationSnapshot = {
  frozenBaseline: AppliedLayerSnapshot;
  overall: AppliedLayerSnapshot;
  retroactiveStockMovementCount: number;
};

export type AppliedMigrationExpectation = {
  saleCount: number;
  entryCount: number;
  factCount: number;
  grossRevenueVnd: number;
  netRevenueVnd: number;
  snowMilkRevenueVnd: number;
  freshMilkRevenueVnd: number;
  cashVnd: number;
  bankTransferVnd: number;
  freshMilkBottleCount: number;
  estimatedSnowMilkCups: number;
};

export function buildAppliedMigrationReconciliation(
  actual: AppliedMigrationSnapshot,
  expectedOverall: AppliedMigrationExpectation,
) {
  const metric = (name: string, expectedValue: number, actualValue: number) => ({
    metric: name,
    expected: String(expectedValue),
    actual: String(actualValue),
    matches: expectedValue === actualValue,
  });
  const layerMetrics = (
    prefix: string,
    layer: AppliedLayerSnapshot,
    expected: AppliedMigrationExpectation,
  ) => [
    metric(`${prefix}.salesDays.saleCount`, expected.saleCount, layer.salesDays.saleCount),
    ...(
      [
        "grossRevenueVnd",
        "netRevenueVnd",
        "snowMilkRevenueVnd",
        "freshMilkRevenueVnd",
        "cashVnd",
        "bankTransferVnd",
        "freshMilkBottleCount",
        "estimatedSnowMilkCups",
      ] as const
    ).map((key) =>
      metric(`${prefix}.salesDays.${key}`, expected[key], layer.salesDays[key]),
    ),
    metric(
      `${prefix}.salesDays.paymentParityVnd`,
      expected.netRevenueVnd,
      layer.salesDays.cashVnd + layer.salesDays.bankTransferVnd,
    ),
    metric(
      `${prefix}.revenueEntries.entryCount`,
      expected.entryCount,
      layer.revenueEntries.entryCount,
    ),
    ...(
      [
        "grossRevenueVnd",
        "netRevenueVnd",
        "snowMilkRevenueVnd",
        "freshMilkRevenueVnd",
        "freshMilkBottleCount",
        "estimatedSnowMilkCups",
      ] as const
    ).map((key) =>
      metric(
        `${prefix}.revenueEntries.${key}`,
        expected[key],
        layer.revenueEntries[key],
      ),
    ),
    metric(
      `${prefix}.dailyFacts.factCount`,
      expected.factCount,
      layer.dailyFacts.factCount,
    ),
    ...(
      [
        "grossRevenueVnd",
        "netRevenueVnd",
        "snowMilkRevenueVnd",
        "freshMilkRevenueVnd",
      ] as const
    ).map((key) =>
      metric(`${prefix}.dailyFacts.${key}`, expected[key], layer.dailyFacts[key]),
    ),
  ];
  const frozenExpectation: AppliedMigrationExpectation = {
    saleCount: LEGACY_BASELINE.saleCount,
    entryCount: 25,
    factCount: LEGACY_BASELINE.saleCount,
    ...LEGACY_BASELINE.totals,
  };
  return [
    ...layerMetrics("frozenBaseline", actual.frozenBaseline, frozenExpectation),
    ...layerMetrics("overall", actual.overall, expectedOverall),
    metric(
      "stockMovements.retroactiveLegacyCount",
      0,
      actual.retroactiveStockMovementCount,
    ),
  ];
}

export function assertReconciliationMatches(
  reconciliation: ReturnType<typeof buildAppliedMigrationReconciliation>,
) {
  const mismatches = reconciliation.filter(({ matches }) => !matches);
  if (mismatches.length > 0) {
    throw new Error(
      `Đối soát v2 thất bại: ${mismatches
        .map(({ metric, expected, actual }) => `${metric}=${actual}/${expected}`)
        .join(", ")}`,
    );
  }
}
