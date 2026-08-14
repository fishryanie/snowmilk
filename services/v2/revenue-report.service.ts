import "server-only";

import { connectMongo } from "@/lib/mongodb";
import type { RevenueReportFilters } from "@/lib/validators/v2/reports";
import { BusinessLine } from "@/models/v2/BusinessLine";
import { RevenueEntry } from "@/models/v2/RevenueEntry";
import { SalesDay } from "@/models/v2/SalesDay";
import { id, type V2Context } from "@/services/v2/context";
import { activeRevenueSales } from "@/services/v2/revenue-report-invariants";
import { decimalString, documentId } from "@/services/v2/serialize";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;
type Aggregate = {
  quantity: number;
  grossRevenueVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  cogsVnd: number | null;
  profitVnd: number | null;
};

function empty(): Aggregate {
  return {
    quantity: 0,
    grossRevenueVnd: 0,
    discountVnd: 0,
    refundVnd: 0,
    netRevenueVnd: 0,
    cogsVnd: 0,
    profitVnd: 0,
  };
}

function add(aggregate: Aggregate, entry: Plain, quantity = 0) {
  aggregate.quantity += quantity;
  aggregate.grossRevenueVnd += Number(entry.grossRevenueVnd ?? 0);
  aggregate.discountVnd += Number(entry.discountVnd ?? 0);
  aggregate.refundVnd += Number(entry.refundVnd ?? 0);
  aggregate.netRevenueVnd += Number(entry.netRevenueVnd ?? 0);
  if (entry.cogsVnd == null || entry.profitVnd == null) {
    aggregate.cogsVnd = null;
    aggregate.profitVnd = null;
  } else if (aggregate.cogsVnd != null && aggregate.profitVnd != null) {
    aggregate.cogsVnd += Number(entry.cogsVnd);
    aggregate.profitVnd += Number(entry.profitVnd);
  }
}

function qualityLabels(entries: Plain[]) {
  const countQuality = (quality: string) =>
    entries.filter((entry) => entry.dataQuality === quality).length;
  const countQuantitySource = (source: string) =>
    entries.filter((entry) => entry.quantitySource === source).length;
  const labels: Array<{ code: string; label: string; severity: "info" | "warning"; count: number }> = [];
  const estimated = countQuantitySource("estimated");
  const legacy = countQuantitySource("legacy");
  const missingCost = countQuality("missing_cost");
  const actual = countQuantitySource("actual");
  if (estimated) {
    labels.push({
      code: "estimated_quantity",
      label: "Số lượng ước tính",
      severity: "warning",
      count: estimated,
    });
  }
  if (legacy) {
    labels.push({
      code: "legacy_data",
      label: "Dữ liệu lịch sử",
      severity: "info",
      count: legacy,
    });
  }
  if (missingCost) {
    labels.push({
      code: "missing_cost",
      label: "Chưa đủ dữ liệu giá vốn",
      severity: "warning",
      count: missingCost,
    });
  }
  if (actual) {
    labels.push({
      code: "actual_quantity",
      label: "Số lượng thực tế",
      severity: "info",
      count: actual,
    });
  }
  return labels;
}

export async function revenueReport(
  context: V2Context,
  filters: RevenueReportFilters,
) {
  await connectMongo();
  const scope: Record<string, unknown> = {
    organizationId: context.organizationId,
    locationId: filters.locationId
      ? id(filters.locationId, "locationId")
      : context.locationId,
    businessDate: { $gte: filters.from, $lte: filters.to },
    entryType: { $in: ["sale", "reversal"] },
    ...(filters.businessLineId
      ? { businessLineId: id(filters.businessLineId, "businessLineId") }
      : {}),
    ...(filters.skuId ? { skuId: id(filters.skuId, "skuId") } : {}),
  };
  const ledgerEntries = (await RevenueEntry.find(scope)
    .sort({ businessDate: 1, occurredAt: 1 })
    .lean()) as Array<
    Plain & {
      _id: unknown;
      entryType: "sale" | "reversal";
      reversalOfId?: unknown;
    }
  >;
  const entries = activeRevenueSales(ledgerEntries);
  const salesDayIds = [...new Set(entries.map((entry) => String(entry.salesDayId)))];
  const days = (await SalesDay.find({
    organizationId: context.organizationId,
    _id: { $in: salesDayIds.map((value) => id(value)) },
  })
    .select("_id businessDate tenders status")
    .lean()) as Plain[];
  const dayByDate = new Map(days.map((day) => [String(day.businessDate), day]));

  const totals = empty();
  const byLine = new Map<string, Aggregate & Plain>();
  const byProduct = new Map<string, Aggregate & Plain>();
  const byDate = new Map<string, Aggregate & Plain>();
  for (const entry of entries) {
    const signedQuantity = Number(decimalString(entry.quantity));
    add(totals, entry, signedQuantity);

    const lineCode = String(entry.businessLineCodeSnapshot);
    const line = byLine.get(lineCode) ?? {
      ...empty(),
      id: documentId(entry.businessLineId),
      code: lineCode,
      name: entry.businessLineNameSnapshot,
      pathCodes: entry.businessLinePathCodesSnapshot ?? [],
    };
    add(line, entry, signedQuantity);
    byLine.set(lineCode, line);

    const productCode = String(entry.skuId ?? entry.skuCodeSnapshot);
    const product = byProduct.get(productCode) ?? {
      ...empty(),
      skuId: documentId(entry.skuId),
      code: entry.skuCodeSnapshot,
      name: entry.skuNameSnapshot,
      businessLineCode: lineCode,
      businessLineName: entry.businessLineNameSnapshot,
    };
    add(product, entry, signedQuantity);
    byProduct.set(productCode, product);

    const date = byDate.get(entry.businessDate) ?? {
      ...empty(),
      businessDate: entry.businessDate,
      quantitySources: [] as string[],
      hasExplicitSplit: false,
    };
    if (lineCode === "FRESH_MILK") date.hasExplicitSplit = true;
    add(date, entry, signedQuantity);
    const quantitySource = String(entry.quantitySource ?? "");
    if (quantitySource && !date.quantitySources.includes(quantitySource)) {
      date.quantitySources.push(quantitySource);
    }
    byDate.set(entry.businessDate, date);
  }

  // A closed day enforces collected = net. Using the append-only revenue net
  // also handles reopen reversals correctly; summing the SalesDay tender
  // snapshot would incorrectly keep a reopened day's old collection alive.
  const collectedVnd = totals.netRevenueVnd;
  const hasDetailFilter = Boolean(filters.businessLineId || filters.skuId);
  const paymentBreakdown = hasDetailFilter
    ? null
    : days.reduce(
        (summary, day) => {
          const activeRevenue = byDate.get(String(day.businessDate))?.netRevenueVnd ?? 0;
          if (activeRevenue === 0) return summary;
          for (const tender of day.tenders ?? []) {
            const amount = Number(tender.amountVnd ?? 0);
            if (tender.method === "cash") summary.cashVnd += amount;
            else if (tender.method === "bank_transfer") {
              summary.bankTransferVnd += amount;
            } else summary.otherVnd += amount;
          }
          return summary;
        },
        { cashVnd: 0, bankTransferVnd: 0, otherVnd: 0 },
      );
  const businessLineModels = (await BusinessLine.find({
    organizationId: context.organizationId,
    isActive: true,
  })
    .sort({ depth: 1, sortOrder: 1 })
    .lean()) as Plain[];
  const leafByCode = new Map([...byLine].map(([code, value]) => [code, value]));
  const businessLines = businessLineModels
    .filter((line) => line.depth === 0)
    .map((parent) => {
      const direct = leafByCode.get(parent.code) ?? { ...empty() };
      const children = businessLineModels
        .filter((line) => String(line.parentId ?? "") === String(parent._id))
        .map((child) => leafByCode.get(child.code) ?? {
          ...empty(),
          id: String(child._id),
          code: child.code,
          name: child.name,
        });
      const parentTotals = { ...direct } as Aggregate & Plain;
      for (const child of children) {
        if (!leafByCode.has(child.code)) continue;
        parentTotals.quantity += child.quantity;
        parentTotals.grossRevenueVnd += child.grossRevenueVnd;
        parentTotals.discountVnd += child.discountVnd;
        parentTotals.refundVnd += child.refundVnd;
        parentTotals.netRevenueVnd += child.netRevenueVnd;
        if (child.cogsVnd == null || parentTotals.cogsVnd == null) {
          parentTotals.cogsVnd = null;
          parentTotals.profitVnd = null;
        } else {
          parentTotals.cogsVnd += child.cogsVnd;
          parentTotals.profitVnd =
            (parentTotals.profitVnd ?? 0) + (child.profitVnd ?? 0);
        }
      }
      return {
        ...parentTotals,
        id: String(parent._id),
        code: parent.code,
        name: parent.name,
        children,
      };
    });

  const daily = [...byDate.values()].map((row) => {
    const quantitySources = row.quantitySources as string[];
    const badges = [
      ...(quantitySources.includes("estimated") ? ["Số lượng ước tính"] : []),
      ...(row.hasExplicitSplit ? ["Dữ liệu đã phân tách"] : []),
      ...(quantitySources.includes("actual") ? ["Số lượng thực tế"] : []),
    ];
    const result = { ...row };
    delete result.quantitySources;
    delete result.hasExplicitSplit;
    return {
      ...result,
      collectedVnd: row.netRevenueVnd,
      badges,
      status: dayByDate.get(String(row.businessDate))?.status ?? null,
    };
  });

  return {
    filters,
    totals: {
      ...totals,
      collectedVnd,
      paymentBreakdown,
      costCompleteness: totals.cogsVnd == null ? "missing" : "complete",
    },
    businessLines,
    daily,
    products: [...byProduct.values()].sort(
      (left, right) => right.netRevenueVnd - left.netRevenueVnd,
    ),
    dataQuality: qualityLabels(entries),
  };
}
