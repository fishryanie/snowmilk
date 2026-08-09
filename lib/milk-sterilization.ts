export const DEFAULT_STERILIZATION_UNIT_PRICE = 5_000;

export type SterilizationChoice = "self" | "partial" | "full";

type MilkIngredientLike = {
  name?: unknown;
  costUnit?: unknown;
};

function normalizedText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function isFreshMilkIngredient(ingredient: MilkIngredientLike) {
  const name = normalizedText(ingredient.name);
  const unit = normalizedText(ingredient.costUnit);
  return /(^|\s)sua(\s|$)/u.test(name) && /^(l|lit|liter)$/u.test(unit);
}

function finiteNonNegative(value: unknown, label: string) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return number;
}

export function resolveOutsourcedSterilizationLiters(
  choice: SterilizationChoice,
  totalLitersInput: unknown,
  partialLitersInput?: unknown,
) {
  const totalLiters = finiteNonNegative(
    totalLitersInput,
    "Tổng số lít sữa",
  );
  if (choice === "self") return 0;
  if (choice === "full") return totalLiters;

  const partialLiters = finiteNonNegative(
    partialLitersInput,
    "Số lít thuê tiệt trùng",
  );
  if (partialLiters <= 0 || partialLiters >= totalLiters) {
    throw new Error(
      "Thuê một phần phải lớn hơn 0 và nhỏ hơn tổng lượng nhập.",
    );
  }
  return partialLiters;
}

export function calculateMilkPurchaseCost(input: {
  goodsAmount: unknown;
  totalLiters: unknown;
  outsourcedLiters?: unknown;
  sterilizationUnitPrice?: unknown;
}) {
  const goodsAmount = finiteNonNegative(input.goodsAmount, "Tiền mua sữa");
  const totalLiters = finiteNonNegative(input.totalLiters, "Tổng số lít sữa");
  const outsourcedLiters = finiteNonNegative(
    input.outsourcedLiters,
    "Số lít thuê tiệt trùng",
  );
  const sterilizationUnitPrice = finiteNonNegative(
    input.sterilizationUnitPrice ?? DEFAULT_STERILIZATION_UNIT_PRICE,
    "Đơn giá tiệt trùng",
  );

  if (outsourcedLiters > totalLiters) {
    throw new Error("Số lít thuê tiệt trùng không thể lớn hơn lượng sữa nhập.");
  }

  const selfProcessedLiters = totalLiters - outsourcedLiters;
  const sterilizationCost = outsourcedLiters * sterilizationUnitPrice;
  const inventoryCostAmount = goodsAmount + sterilizationCost;
  const landedUnitCost =
    totalLiters > 0 ? inventoryCostAmount / totalLiters : 0;

  return {
    outsourcedLiters,
    selfProcessedLiters,
    sterilizationUnitPrice,
    sterilizationCost,
    inventoryCostAmount,
    landedUnitCost,
  };
}
