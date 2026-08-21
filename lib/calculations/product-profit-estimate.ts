import type { ToppingRankingRow } from "./topping-ranking";

export type ProfitEstimateProduct = {
  code?: string | null;
  name?: string | null;
  toppingName?: string | null;
  ingredientItems?: Array<{
    ingredientCode?: string | null;
    itemName?: string | null;
    batchName?: string | null;
  }> | null;
  sellingPrice?: number | null;
  fullCost?: number | null;
  isActive?: boolean | null;
};

export type WeightedProductProfitEstimate = {
  averageSellingPrice: number;
  averageFullCost: number;
  averageGrossProfit: number;
  costPercent: number;
  grossMarginPercent: number;
  matchedProductCount: number;
  matchedToppingCount: number;
  purchasedToppingCount: number;
  matchedPurchaseKg: number;
  totalPurchaseKg: number;
  purchaseCoveragePercent: number;
  unmatchedToppingNames: string[];
};

function finitePositive(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizedText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLocaleLowerCase("vi")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productAliases(product: ProfitEstimateProduct) {
  const names = new Set<string>();
  const codes = new Set<string>();
  const addName = (value: string | null | undefined) => {
    const normalized = normalizedText(value);
    if (normalized) names.add(normalized);
  };

  addName(product.name);
  String(product.toppingName ?? "")
    .split(",")
    .forEach(addName);
  for (const item of product.ingredientItems ?? []) {
    addName(item.itemName);
    addName(item.batchName);
    const code = normalizedText(item.ingredientCode);
    if (code) codes.add(code);
  }

  return { names, codes };
}

function matchesTopping(
  aliases: ReturnType<typeof productAliases>,
  topping: ToppingRankingRow,
) {
  const code = normalizedText(topping.code);
  if (code && aliases.codes.has(code)) return true;

  const name = normalizedText(topping.name);
  if (!name) return false;
  if (aliases.names.has(name)) return true;

  return [...aliases.names].some(
    (alias) =>
      name.length >= 4 &&
      (alias.startsWith(`${name} size `) ||
        alias.startsWith(`${name} - size `) ||
        alias.includes(` ${name} `)),
  );
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateWeightedProductProfitEstimate(input: {
  products: ProfitEstimateProduct[];
  toppingRanking: ToppingRankingRow[];
}): WeightedProductProfitEstimate | null {
  const products = input.products
    .map((product) => ({ product, aliases: productAliases(product) }))
    .filter(
      ({ product }) =>
        product.isActive !== false &&
        finitePositive(product.sellingPrice) > 0 &&
        finitePositive(product.fullCost) > 0,
    );
  const purchasedToppings = input.toppingRanking.filter(
    (topping) => finitePositive(topping.totalKg) > 0,
  );
  const productWeights = new Map<ProfitEstimateProduct, number>();
  const unmatchedToppingNames: string[] = [];
  let matchedPurchaseKg = 0;
  let matchedToppingCount = 0;

  for (const topping of purchasedToppings) {
    const matches = products.filter(({ aliases }) =>
      matchesTopping(aliases, topping),
    );
    const purchasedKg = finitePositive(topping.totalKg);
    if (matches.length === 0) {
      unmatchedToppingNames.push(topping.name);
      continue;
    }

    matchedToppingCount += 1;
    matchedPurchaseKg += purchasedKg;
    const allocatedWeight = purchasedKg / matches.length;
    for (const { product } of matches) {
      productWeights.set(
        product,
        (productWeights.get(product) ?? 0) + allocatedWeight,
      );
    }
  }

  const totalWeight = [...productWeights.values()].reduce(
    (sum, weight) => sum + weight,
    0,
  );
  if (totalWeight <= 0) return null;

  let weightedSellingPrice = 0;
  let weightedFullCost = 0;
  for (const [product, weight] of productWeights) {
    weightedSellingPrice += finitePositive(product.sellingPrice) * weight;
    weightedFullCost += finitePositive(product.fullCost) * weight;
  }

  const averageSellingPrice = weightedSellingPrice / totalWeight;
  const averageFullCost = weightedFullCost / totalWeight;
  const averageGrossProfit = averageSellingPrice - averageFullCost;
  const costPercent =
    averageSellingPrice > 0 ? (averageFullCost / averageSellingPrice) * 100 : 0;
  const totalPurchaseKg = purchasedToppings.reduce(
    (sum, topping) => sum + finitePositive(topping.totalKg),
    0,
  );

  return {
    averageSellingPrice: round(averageSellingPrice, 0),
    averageFullCost: round(averageFullCost, 0),
    averageGrossProfit: round(averageGrossProfit, 0),
    costPercent: round(costPercent),
    grossMarginPercent: round(100 - costPercent),
    matchedProductCount: productWeights.size,
    matchedToppingCount,
    purchasedToppingCount: purchasedToppings.length,
    matchedPurchaseKg: round(matchedPurchaseKg, 3),
    totalPurchaseKg: round(totalPurchaseKg, 3),
    purchaseCoveragePercent:
      totalPurchaseKg > 0 ? round((matchedPurchaseKg / totalPurchaseKg) * 100) : 0,
    unmatchedToppingNames,
  };
}
