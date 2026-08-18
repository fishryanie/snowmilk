import { convertQuantity } from "./units";
import { vietnamDateKey, vietnamDayBoundary } from "../vietnam-date";

export type ToppingCatalogRecord = {
  code?: string | null;
  name?: string | null;
  category?: string | null;
};

export type ToppingPurchaseRecord = {
  itemCode?: string | null;
  itemName?: string | null;
  category?: string | null;
  costUnit?: string | null;
  convertedQuantity?: number | null;
  purchaseDate?: string | Date | null;
};

export type ToppingRankingRow = {
  rank: number;
  code: string;
  name: string;
  totalKg: number;
  sharePercent: number;
  purchaseCount: number;
  lastPurchaseDate: string | null;
};

export type ToppingRankingReport = {
  asOfDate: string;
  updatedAt: string;
  totalKg: number;
  purchaseCount: number;
  excludedPurchaseCount: number;
  excludedUnits: string[];
  ranking: ToppingRankingRow[];
};

type MutableRankingRow = {
  code: string;
  name: string;
  totalKg: number;
  purchaseCount: number;
  lastPurchaseAt: Date | null;
};

const TOPPING_CATEGORY = "topping";

function normalizedText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function isTopping(value: string | null | undefined) {
  return normalizedText(value).toLocaleLowerCase("vi") === TOPPING_CATEGORY;
}

function itemKey(code: string, name: string) {
  const normalizedCode = code.toLocaleUpperCase("vi");
  if (normalizedCode && normalizedCode !== "MUA-LE") {
    return `code:${normalizedCode}`;
  }
  return `name:${name.toLocaleLowerCase("vi")}`;
}

function finitePositive(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateToppingRanking(input: {
  ingredients: ToppingCatalogRecord[];
  purchases: ToppingPurchaseRecord[];
  asOfDate: string;
  updatedAt?: Date;
}): ToppingRankingReport {
  const rows = new Map<string, MutableRankingRow>();
  const cutoff = vietnamDayBoundary(input.asOfDate, true).valueOf();
  const excludedUnits = new Set<string>();
  let excludedPurchaseCount = 0;

  for (const ingredient of input.ingredients) {
    if (!isTopping(ingredient.category)) continue;
    const code = normalizedText(ingredient.code);
    const name = normalizedText(ingredient.name) || code || "Topping chưa đặt tên";
    rows.set(itemKey(code, name), {
      code,
      name,
      totalKg: 0,
      purchaseCount: 0,
      lastPurchaseAt: null,
    });
  }

  for (const purchase of input.purchases) {
    if (!isTopping(purchase.category)) continue;
    const purchaseDate = purchase.purchaseDate
      ? new Date(purchase.purchaseDate)
      : null;
    if (
      !purchaseDate ||
      Number.isNaN(purchaseDate.valueOf()) ||
      purchaseDate.valueOf() > cutoff
    ) {
      continue;
    }

    const code = normalizedText(purchase.itemCode);
    const name = normalizedText(purchase.itemName) || code || "Topping chưa đặt tên";
    const key = itemKey(code, name);
    const row = rows.get(key) ?? {
      code,
      name,
      totalKg: 0,
      purchaseCount: 0,
      lastPurchaseAt: null,
    };
    const unit = normalizedText(purchase.costUnit);

    try {
      row.totalKg += convertQuantity(
        finitePositive(purchase.convertedQuantity),
        unit,
        "kg",
      );
      row.purchaseCount += 1;
      if (!row.lastPurchaseAt || purchaseDate > row.lastPurchaseAt) {
        row.lastPurchaseAt = purchaseDate;
      }
      rows.set(key, row);
    } catch {
      excludedPurchaseCount += 1;
      excludedUnits.add(unit || "Chưa có đơn vị");
    }
  }

  const sortedRows = [...rows.values()].toSorted(
    (left, right) =>
      right.totalKg - left.totalKg || left.name.localeCompare(right.name, "vi"),
  );
  const totalKg = sortedRows.reduce((sum, row) => sum + row.totalKg, 0);
  let previousTotal: number | null = null;
  let previousRank = 0;

  const ranking = sortedRows.map((row, index): ToppingRankingRow => {
    const rank =
      previousTotal !== null && Math.abs(row.totalKg - previousTotal) < 1e-9
        ? previousRank
        : index + 1;
    previousTotal = row.totalKg;
    previousRank = rank;
    return {
      rank,
      code: row.code,
      name: row.name,
      totalKg: round(row.totalKg, 3),
      sharePercent: totalKg > 0 ? round((row.totalKg / totalKg) * 100, 1) : 0,
      purchaseCount: row.purchaseCount,
      lastPurchaseDate: row.lastPurchaseAt
        ? vietnamDateKey(row.lastPurchaseAt)
        : null,
    };
  });

  return {
    asOfDate: input.asOfDate,
    updatedAt: (input.updatedAt ?? new Date()).toISOString(),
    totalKg: round(totalKg, 3),
    purchaseCount: ranking.reduce((sum, row) => sum + row.purchaseCount, 0),
    excludedPurchaseCount,
    excludedUnits: [...excludedUnits].toSorted((left, right) =>
      left.localeCompare(right, "vi"),
    ),
    ranking,
  };
}
