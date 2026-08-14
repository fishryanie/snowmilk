import { MIGRATION_VERSION } from "./constants";
import { sha256Canonical } from "./canonical";
import { Decimal128 } from "mongodb";

type ActorSnapshot = {
  userId: string;
  displayName?: string;
  source: "migration";
  requestId?: string;
};

export type LegacyMaterializerReferences = {
  organizationId: unknown;
  locationId: unknown;
  businessLineIds: Readonly<Record<"SNOW_MILK" | "FRESH_MILK", unknown>>;
  actor: ActorSnapshot;
  occurredAt: Date;
};

type LogicalLegacyLine = {
  legacyLineKey: unknown;
  businessLineCode: unknown;
  quantity: unknown;
  quantityUnit: unknown;
  quantitySource: unknown;
  grossRevenueVnd: unknown;
  netRevenueVnd: unknown;
};

type LogicalLegacySalesDay = {
  legacySourceId: unknown;
  businessDate: unknown;
  grossRevenueVnd: unknown;
  discountVnd: unknown;
  refundVnd: unknown;
  netRevenueVnd: unknown;
  collectedVnd: unknown;
  payments: unknown;
  calculationVersion: unknown;
  legacyFinancialSnapshot: unknown;
  legacyBatchSnapshot: unknown;
  revenueSplitSource: unknown;
  note: unknown;
  lines: unknown;
};

function numberField(value: unknown, label: string) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${label} không phải số nguyên VND/số lượng hợp lệ.`);
  }
  return result;
}

function textField(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} bị thiếu.`);
  }
  return value.trim();
}

function legacySource(sourceId: string) {
  return {
    sourceCollection: "sales",
    sourceId,
    migrationVersion: MIGRATION_VERSION,
  };
}

export function materializeLegacySalesDay(
  rawSale: LogicalLegacySalesDay,
  references: LegacyMaterializerReferences,
) {
  const legacySourceId = textField(rawSale.legacySourceId, "legacySourceId");
  const businessDate = textField(rawSale.businessDate, "businessDate");
  if (!Array.isArray(rawSale.lines)) throw new Error("Legacy sale thiếu lines.");
  const payments = rawSale.payments as Record<string, unknown>;
  const tenders = [
    { method: "cash", amountVnd: numberField(payments.cashVnd ?? 0, "cashVnd") },
    {
      method: "bank_transfer",
      amountVnd: numberField(payments.bankTransferVnd ?? 0, "bankTransferVnd"),
    },
    { method: "other", amountVnd: numberField(payments.otherVnd ?? 0, "otherVnd") },
  ].filter(({ amountVnd }) => amountVnd > 0);

  const lines = (rawSale.lines as LogicalLegacyLine[]).map((rawLine) => {
    const businessLineCode = textField(
      rawLine.businessLineCode,
      "businessLineCode",
    );
    if (businessLineCode !== "SNOW_MILK" && businessLineCode !== "FRESH_MILK") {
      throw new Error(`Business line legacy không hợp lệ: ${businessLineCode}.`);
    }
    const businessLineId = references.businessLineIds[businessLineCode];
    if (!businessLineId) {
      throw new Error(`Chưa resolve ObjectId cho ${businessLineCode}.`);
    }
    const quantitySource = textField(rawLine.quantitySource, "quantitySource");
    if (quantitySource !== "estimated" && quantitySource !== "legacy") {
      throw new Error(`quantitySource legacy không hợp lệ: ${quantitySource}.`);
    }
    const snapshotName =
      businessLineCode === "FRESH_MILK" ? "Sữa tươi" : "Sữa Tuyết";
    return {
      lineKey: textField(rawLine.legacyLineKey, "legacyLineKey"),
      skuId: null,
      skuCodeSnapshot: `LEGACY-${businessLineCode}-SUMMARY`,
      skuNameSnapshot: `Tổng ${snapshotName} lịch sử`,
      businessLineSnapshot: {
        id: businessLineId,
        code: businessLineCode,
        name: snapshotName,
        pathCodes: ["MILK"],
      },
      categorySnapshot: null,
      quantity: Decimal128.fromString(
        String(numberField(rawLine.quantity, "quantity")),
      ),
      quantitySource,
      salesUnitSnapshot:
        rawLine.quantityUnit === "bottle" ? "bottle" : "cup",
      unitPriceVnd: null,
      grossRevenueVnd: numberField(rawLine.grossRevenueVnd, "grossRevenueVnd"),
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: numberField(rawLine.netRevenueVnd, "netRevenueVnd"),
      unitCostVnd: null,
      cogsVnd: null,
      profitVnd: null,
      dataQuality: "legacy",
      legacySource: legacySource(legacySourceId),
      legacyFinancialSnapshot: rawSale.legacyFinancialSnapshot,
      legacyBatchSnapshot: rawSale.legacyBatchSnapshot,
      legacySplitProvenance: rawSale.revenueSplitSource,
    };
  });

  return {
    organizationId: references.organizationId,
    locationId: references.locationId,
    businessDate,
    status: "closed",
    lines,
    tenders,
    grossRevenueVnd: numberField(rawSale.grossRevenueVnd, "grossRevenueVnd"),
    discountVnd: numberField(rawSale.discountVnd, "discountVnd"),
    refundVnd: numberField(rawSale.refundVnd, "refundVnd"),
    netRevenueVnd: numberField(rawSale.netRevenueVnd, "netRevenueVnd"),
    collectedVnd: numberField(rawSale.collectedVnd, "collectedVnd"),
    cogsVnd: null,
    profitVnd: null,
    dataQuality: "legacy",
    calculationVersion: textField(
      rawSale.calculationVersion,
      "calculationVersion",
    ),
    idempotencyKey: `migration:${MIGRATION_VERSION}:${legacySourceId}`,
    closedAt: references.occurredAt,
    closedBy: references.actor,
    legacySource: legacySource(legacySourceId),
    note: typeof rawSale.note === "string" ? rawSale.note : "",
    version: 1,
    actor: references.actor,
  };
}

export function materializeLegacyPostings(
  salesDay: ReturnType<typeof materializeLegacySalesDay>,
  salesDayId: unknown,
  references: LegacyMaterializerReferences,
) {
  const revenueEntries = salesDay.lines.map((line) => ({
    organizationId: references.organizationId,
    locationId: references.locationId,
    salesDayId,
    lineKey: line.lineKey,
    businessDate: salesDay.businessDate,
    entryType: "sale",
    skuId: null,
    skuCodeSnapshot: line.skuCodeSnapshot,
    skuNameSnapshot: line.skuNameSnapshot,
    quantity: line.quantity,
    quantitySource: line.quantitySource,
    salesUnitSnapshot: line.salesUnitSnapshot,
    businessLineId: line.businessLineSnapshot.id,
    businessLineCodeSnapshot: line.businessLineSnapshot.code,
    businessLineNameSnapshot: line.businessLineSnapshot.name,
    businessLinePathCodesSnapshot: line.businessLineSnapshot.pathCodes,
    categoryId: null,
    grossRevenueVnd: line.grossRevenueVnd,
    discountVnd: line.discountVnd,
    refundVnd: line.refundVnd,
    netRevenueVnd: line.netRevenueVnd,
    cogsVnd: null,
    profitVnd: null,
    dataQuality: "legacy",
    calculationVersion: salesDay.calculationVersion,
    legacySource: line.legacySource,
    idempotencyKey: `migration:${MIGRATION_VERSION}:${line.lineKey}`,
    occurredAt: references.occurredAt,
    version: 1,
    actor: references.actor,
  }));
  const dimensions = salesDay.lines.map((line) => ({
    dimensionType: "business_line",
    dimensionId: line.businessLineSnapshot.id,
    dimensionCode: line.businessLineSnapshot.code,
    dimensionName: line.businessLineSnapshot.name,
    quantity: line.quantity,
    grossRevenueVnd: line.grossRevenueVnd,
    discountVnd: line.discountVnd,
    refundVnd: line.refundVnd,
    netRevenueVnd: line.netRevenueVnd,
    collectedVnd: line.netRevenueVnd,
    cogsVnd: null,
    profitVnd: null,
  }));
  const dailyRevenueFact = {
    organizationId: references.organizationId,
    locationId: references.locationId,
    businessDate: salesDay.businessDate,
    salesDayId,
    salesDayVersion: salesDay.version,
    grossRevenueVnd: salesDay.grossRevenueVnd,
    discountVnd: salesDay.discountVnd,
    refundVnd: salesDay.refundVnd,
    netRevenueVnd: salesDay.netRevenueVnd,
    collectedVnd: salesDay.collectedVnd,
    cogsVnd: null,
    profitVnd: null,
    dimensions,
    dataQuality: "legacy",
    calculationVersion: salesDay.calculationVersion,
    rebuiltAt: references.occurredAt,
    sourceChecksum: sha256Canonical({ salesDayId, salesDay, dimensions }),
    version: 1,
  };
  return { revenueEntries, dailyRevenueFact };
}
