import { normalizeProductGroupName } from "@/lib/product-groups";

export type DailyCountedProduct = {
  id: string;
  code: string;
  name: string;
  groupName?: string;
  sellingPrice: number;
  fullCost: number;
  allocatedFixedCost: number;
};

export type DailyProductQuantity = {
  productId: string;
  quantity: number;
};

export function calculateDailyCountedProducts(
  products: readonly DailyCountedProduct[],
  quantities: readonly DailyProductQuantity[],
) {
  const quantityByProductId = new Map(
    quantities.map(({ productId, quantity }) => [
      productId,
      Math.max(0, Math.trunc(Number(quantity) || 0)),
    ]),
  );

  const items = products.flatMap((product) => {
    const quantity = quantityByProductId.get(product.id) ?? 0;
    if (quantity <= 0) return [];

    const unitPrice = Math.max(0, Number(product.sellingPrice) || 0);
    const unitFullCost = Math.max(0, Number(product.fullCost) || 0);
    const unitAllocatedFixedCost = Math.min(
      unitFullCost,
      Math.max(0, Number(product.allocatedFixedCost) || 0),
    );
    const unitVariableCost = unitFullCost - unitAllocatedFixedCost;
    const revenue = quantity * unitPrice;
    const variableCost = quantity * unitVariableCost;
    const allocatedFixedCost = quantity * unitAllocatedFixedCost;

    return [
      {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        groupName: normalizeProductGroupName(product.groupName),
        quantity,
        unitPrice,
        unitVariableCost,
        revenue,
        variableCost,
        allocatedFixedCost,
        contributionProfit: revenue - variableCost,
        profit: revenue - variableCost - allocatedFixedCost,
      },
    ];
  });

  return items.reduce(
    (summary, item) => ({
      items: [...summary.items, item],
      revenue: summary.revenue + item.revenue,
      variableCost: summary.variableCost + item.variableCost,
      allocatedFixedCost:
        summary.allocatedFixedCost + item.allocatedFixedCost,
      contributionProfit:
        summary.contributionProfit + item.contributionProfit,
      profit: summary.profit + item.profit,
    }),
    {
      items: [] as typeof items,
      revenue: 0,
      variableCost: 0,
      allocatedFixedCost: 0,
      contributionProfit: 0,
      profit: 0,
    },
  );
}
