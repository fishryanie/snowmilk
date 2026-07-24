export const DIVESTMENT_CLAIM_SOURCE_TYPES = [
  "equipment",
  "purchase",
] as const;

export type DivestmentClaimSourceType =
  (typeof DIVESTMENT_CLAIM_SOURCE_TYPES)[number];

export type ClaimableInvestment = {
  key: string;
  sourceType: DivestmentClaimSourceType;
  sourceId: string;
  code: string;
  name: string;
  category: string;
  purchaseDate: string;
  amount: number;
};

export type DivestmentClaimSnapshot = {
  sourceKey: string;
  sourceType: DivestmentClaimSourceType;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  sourceCategory: string;
  sourceDate: string;
  amount: number;
};

export type BusinessCashBalance = {
  totalRevenue: number;
  salesFundedPurchaseTotal: number;
  remainingBalance: number;
};

function safeNonNegativeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function calculateBusinessCashBalance(
  totalRevenue: number,
  salesFundedPurchaseTotal: number,
): BusinessCashBalance {
  const revenue = safeNonNegativeAmount(totalRevenue);
  const purchaseTotal = safeNonNegativeAmount(salesFundedPurchaseTotal);

  return {
    totalRevenue: revenue,
    salesFundedPurchaseTotal: purchaseTotal,
    remainingBalance: revenue - purchaseTotal,
  };
}

export function divestmentClaimKey(
  sourceType: DivestmentClaimSourceType,
  sourceId: string,
) {
  return `${sourceType}:${sourceId}`;
}

export function resolveClaimSelection(
  items: ClaimableInvestment[],
  selectedKeys: string[],
  withdrawalLimit: number,
) {
  const uniqueKeys = new Set(selectedKeys);
  if (uniqueKeys.size === 0) {
    throw new Error("Vui lòng chọn ít nhất một khoản trong lịch sử.");
  }
  if (uniqueKeys.size !== selectedKeys.length) {
    throw new Error("Danh sách khoản thu hồi bị trùng.");
  }

  const itemsByKey = new Map(items.map((item) => [item.key, item]));
  const selectedItems = selectedKeys.map((key) => {
    const item = itemsByKey.get(key);
    if (!item) {
      throw new Error(
        "Có khoản không còn tồn tại, không dùng vốn chủ hoặc đã được thu hồi.",
      );
    }
    return item;
  });
  const total = selectedItems.reduce(
    (sum, item) => sum + safeNonNegativeAmount(item.amount),
    0,
  );
  const safeLimit = safeNonNegativeAmount(withdrawalLimit);

  if (total <= 0) {
    throw new Error("Các khoản đã chọn không có giá trị để thu hồi.");
  }
  if (total >= safeLimit) {
    throw new Error(
      "Tổng các khoản đã chọn phải nhỏ hơn số tiền còn lại của doanh nghiệp.",
    );
  }

  return { selectedItems, total };
}
