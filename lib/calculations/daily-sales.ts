export type SizeDefinition = {
  code: string;
  name: string;
  milkMl: number;
  sellingPrice: number;
};

export type ProductCostSample = {
  sizeName?: string;
  milkCost: number;
  toppingCost: number;
  packagingCost: number;
  hasCostWarning?: boolean;
};

export type DailySaleAssumption = {
  sizeCode: string;
  sizeName: string;
  milkMl: number;
  referenceSellingPrice: number;
  milkCostPerCup: number;
  packagingCostPerCup: number;
  toppingCostPerCup: number;
  toppingCostLowPerCup: number;
  toppingCostHighPerCup: number;
  overheadRate: number;
  fixedCostPerCup: number;
  sampleCount: number;
};

export type DailySizeEstimate = DailySaleAssumption & {
  quantity: number;
  milkCost: number;
  packagingCost: number;
  toppingCost: number;
  overheadCost: number;
  variableCostPerCup: number;
  variableCost: number;
  fixedCost: number;
};

export type DailySaleEstimate = {
  sizeSummaries: DailySizeEstimate[];
  totalCups: number;
  milkLitersSold: number;
  estimatedMilkLiters: number;
  milkDifferenceLiters: number;
  estimatedReferenceRevenue: number;
  revenueDifference: number;
  grossRevenue: number;
  discountAmount: number;
  netRevenue: number;
  averageRevenuePerCup: number;
  totalMilkCost: number;
  totalPackagingCost: number;
  estimatedToppingCost: number;
  estimatedOverheadCost: number;
  totalVariableCost: number;
  contributionProfit: number;
  allocatedFixedCost: number;
  estimatedProfit: number;
  estimatedProfitLow: number;
  estimatedProfitHigh: number;
  estimatedMargin: number;
};

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function buildDailySaleAssumptions(
  sizes: SizeDefinition[],
  products: ProductCostSample[],
  overheadRate: number,
  fixedCostPerCup: number,
) {
  return sizes.map<DailySaleAssumption>((size) => {
    const samples = products.filter(
      (product) =>
        product.sizeName === size.name &&
        !product.hasCostWarning &&
        nonNegative(product.milkCost) &&
        nonNegative(product.toppingCost) &&
        nonNegative(product.packagingCost),
    );
    const toppingCosts = samples.map((product) => product.toppingCost);

    return {
      sizeCode: size.code,
      sizeName: size.name,
      milkMl: size.milkMl,
      referenceSellingPrice: size.sellingPrice,
      milkCostPerCup: median(samples.map((product) => product.milkCost)),
      packagingCostPerCup: median(
        samples.map((product) => product.packagingCost),
      ),
      toppingCostPerCup: median(toppingCosts),
      toppingCostLowPerCup:
        toppingCosts.length > 0 ? Math.min(...toppingCosts) : 0,
      toppingCostHighPerCup:
        toppingCosts.length > 0 ? Math.max(...toppingCosts) : 0,
      overheadRate: Math.max(0, overheadRate),
      fixedCostPerCup: Math.max(0, fixedCostPerCup),
      sampleCount: samples.length,
    };
  });
}

function variableCostPerCup(
  assumption: DailySaleAssumption,
  toppingCostPerCup: number,
  milkCostPerCup = assumption.milkCostPerCup,
) {
  const directCost =
    milkCostPerCup +
    assumption.packagingCostPerCup +
    toppingCostPerCup;
  return directCost * (1 + assumption.overheadRate);
}

export function estimateSizeQuantitiesFromRevenue(
  netRevenue: number,
  assumptions: DailySaleAssumption[],
) {
  const quantities = Object.fromEntries(
    assumptions.map((assumption) => [assumption.sizeCode, 0]),
  );
  const usableAssumptions = assumptions.filter(
    (assumption) => positive(assumption.referenceSellingPrice),
  );
  const revenue = Math.max(0, netRevenue);
  if (revenue === 0 || usableAssumptions.length === 0) {
    return quantities;
  }

  if (usableAssumptions.length === 1) {
    const [assumption] = usableAssumptions;
    quantities[assumption.sizeCode] = Math.max(
      1,
      Math.round(revenue / assumption.referenceSellingPrice),
    );
    return quantities;
  }

  const [first, second] = usableAssumptions;
  const maximumCups =
    Math.ceil(
      revenue /
        Math.min(
          first.referenceSellingPrice,
          second.referenceSellingPrice,
        ),
    ) + 1;
  let best:
    | {
        firstQuantity: number;
        secondQuantity: number;
        revenueError: number;
        shareError: number;
      }
    | undefined;

  for (let firstQuantity = 0; firstQuantity <= maximumCups; firstQuantity += 1) {
    const remainingRevenue =
      revenue - firstQuantity * first.referenceSellingPrice;
    const rawSecondQuantity =
      remainingRevenue / second.referenceSellingPrice;
    const secondCandidates = new Set([
      Math.max(0, Math.floor(rawSecondQuantity)),
      Math.max(0, Math.ceil(rawSecondQuantity)),
    ]);

    for (const secondQuantity of secondCandidates) {
      if (firstQuantity + secondQuantity === 0) continue;
      const estimatedRevenue =
        firstQuantity * first.referenceSellingPrice +
        secondQuantity * second.referenceSellingPrice;
      const revenueError = Math.abs(estimatedRevenue - revenue);
      const shareError = Math.abs(firstQuantity - secondQuantity);

      if (
        !best ||
        revenueError < best.revenueError ||
        (revenueError === best.revenueError &&
          shareError < best.shareError)
      ) {
        best = {
          firstQuantity,
          secondQuantity,
          revenueError,
          shareError,
        };
      }
    }
  }

  if (best) {
    quantities[first.sizeCode] = best.firstQuantity;
    quantities[second.sizeCode] = best.secondQuantity;
  }
  return quantities;
}

export function calculateDailySaleEstimate(
  quantities: Record<string, number>,
  netRevenue: number,
  assumptions: DailySaleAssumption[],
  milkLitersSold?: number,
): DailySaleEstimate {
  const normalizedQuantities = assumptions.map((assumption) => ({
    assumption,
    quantity: Math.max(
      0,
      Math.trunc(quantities[assumption.sizeCode] ?? 0),
    ),
  }));
  const rawMilkCost = normalizedQuantities.reduce(
    (sum, item) => sum + item.quantity * item.assumption.milkCostPerCup,
    0,
  );
  const estimatedMilkMl = normalizedQuantities.reduce(
    (sum, item) => sum + item.quantity * item.assumption.milkMl,
    0,
  );
  const normalizedMilkLiters = Math.max(
    0,
    milkLitersSold ?? estimatedMilkMl / 1_000,
  );
  const milkCostPerMlSamples = assumptions.flatMap((assumption) =>
    positive(assumption.milkMl) &&
    positive(assumption.milkCostPerCup) &&
    assumption.sampleCount > 0
      ? [assumption.milkCostPerCup / assumption.milkMl]
      : [],
  );
  const targetMilkCost =
    milkLitersSold === undefined
      ? rawMilkCost
      : normalizedMilkLiters * 1_000 * median(milkCostPerMlSamples);
  const milkCostScale =
    rawMilkCost > 0 ? targetMilkCost / rawMilkCost : 1;
  const sizeSummaries = normalizedQuantities.map<DailySizeEstimate>(
    ({ assumption, quantity }) => {
      const milkCost =
        quantity * assumption.milkCostPerCup * milkCostScale;
      const packagingCost = quantity * assumption.packagingCostPerCup;
      const toppingCost = quantity * assumption.toppingCostPerCup;
      const directCost = milkCost + packagingCost + toppingCost;
      const overheadCost = directCost * assumption.overheadRate;
      const variableCost = directCost + overheadCost;

      return {
        ...assumption,
        quantity,
        milkCost,
        packagingCost,
        toppingCost,
        overheadCost,
        variableCostPerCup:
          quantity > 0
            ? variableCost / quantity
            : variableCostPerCup(
                assumption,
                assumption.toppingCostPerCup,
              ),
        variableCost,
        fixedCost: quantity * assumption.fixedCostPerCup,
      };
    },
  );
  const totalCups = sizeSummaries.reduce(
    (sum, summary) => sum + summary.quantity,
    0,
  );
  const totalMilkCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.milkCost,
    0,
  );
  const totalPackagingCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.packagingCost,
    0,
  );
  const estimatedToppingCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.toppingCost,
    0,
  );
  const estimatedOverheadCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.overheadCost,
    0,
  );
  const totalVariableCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.variableCost,
    0,
  );
  const allocatedFixedCost = sizeSummaries.reduce(
    (sum, summary) => sum + summary.fixedCost,
    0,
  );
  const conservativeCost = sizeSummaries.reduce(
    (sum, summary) =>
      sum +
      (summary.milkCost +
        summary.quantity *
          (summary.packagingCostPerCup + summary.toppingCostHighPerCup)) *
        (1 + summary.overheadRate),
    0,
  );
  const bestCaseCost = sizeSummaries.reduce(
    (sum, summary) =>
      sum +
      (summary.milkCost +
        summary.quantity *
          (summary.packagingCostPerCup + summary.toppingCostLowPerCup)) *
        (1 + summary.overheadRate),
    0,
  );
  const revenue = Math.max(0, netRevenue);
  const estimatedReferenceRevenue = sizeSummaries.reduce(
    (sum, summary) =>
      sum + summary.quantity * summary.referenceSellingPrice,
    0,
  );
  const contributionProfit = revenue - totalVariableCost;
  const estimatedProfit = contributionProfit - allocatedFixedCost;

  return {
    sizeSummaries,
    totalCups,
    milkLitersSold: normalizedMilkLiters,
    estimatedMilkLiters: estimatedMilkMl / 1_000,
    milkDifferenceLiters: estimatedMilkMl / 1_000 - normalizedMilkLiters,
    estimatedReferenceRevenue,
    revenueDifference: estimatedReferenceRevenue - revenue,
    grossRevenue: revenue,
    discountAmount: 0,
    netRevenue: revenue,
    averageRevenuePerCup: totalCups > 0 ? revenue / totalCups : 0,
    totalMilkCost,
    totalPackagingCost,
    estimatedToppingCost,
    estimatedOverheadCost,
    totalVariableCost,
    contributionProfit,
    allocatedFixedCost,
    estimatedProfit,
    estimatedProfitLow: revenue - conservativeCost - allocatedFixedCost,
    estimatedProfitHigh: revenue - bestCaseCost - allocatedFixedCost,
    estimatedMargin: revenue > 0 ? estimatedProfit / revenue : 0,
  };
}

export function calculateDailySaleEstimateFromRevenue(
  netRevenue: number,
  assumptions: DailySaleAssumption[],
) {
  const quantities = estimateSizeQuantitiesFromRevenue(
    netRevenue,
    assumptions,
  );
  return calculateDailySaleEstimate(quantities, netRevenue, assumptions);
}
