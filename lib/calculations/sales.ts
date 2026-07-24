export type SaleLineInput = {
  productId?: string;
  productCode: string;
  productName: string;
  sizeName?: string;
  quantity: number;
  unitPrice: number;
  unitVariableCost: number;
};

export function calculateSaleLine(input: SaleLineInput) {
  const revenue = input.quantity * input.unitPrice;
  const variableCost = input.quantity * input.unitVariableCost;
  return {
    ...input,
    revenue,
    variableCost,
    contributionProfit: revenue - variableCost,
  };
}

export function calculateSaleTotals(
  lines: SaleLineInput[],
  discountAmount = 0,
) {
  const calculated = lines.map(calculateSaleLine);
  const totalCups = calculated.reduce((sum, line) => sum + line.quantity, 0);
  const grossRevenue = calculated.reduce((sum, line) => sum + line.revenue, 0);
  const totalVariableCost = calculated.reduce(
    (sum, line) => sum + line.variableCost,
    0,
  );
  const netRevenue = grossRevenue - discountAmount;
  return {
    items: calculated,
    totalCups,
    grossRevenue,
    discountAmount,
    netRevenue,
    totalVariableCost,
    contributionProfit: netRevenue - totalVariableCost,
  };
}
