export const MILK_STERILIZATION_EXPENSE_CATEGORY = "Tiệt trùng sữa";

const milkLitersFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});
const milkUnitPriceFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 0,
});

export function milkSterilizationDescription(
  milkLiters: number,
  milkUnitPrice: number,
) {
  if (milkLiters <= 0 || milkUnitPrice <= 0) return "";
  return `${milkLitersFormatter.format(milkLiters)} lít × ${milkUnitPriceFormatter.format(milkUnitPrice)} ₫/lít`;
}

export const EXPENSE_CATEGORY_OPTIONS = [
  "Điện",
  "Nước",
  "Mặt bằng",
  "Vận chuyển",
  "Marketing",
  "Sửa chữa",
  MILK_STERILIZATION_EXPENSE_CATEGORY,
  "Khác",
] as const;
