export const EXPENSE_PAYMENT_STATUSES = ["paid", "unpaid"] as const;

export type ExpensePaymentStatus =
  (typeof EXPENSE_PAYMENT_STATUSES)[number];

export const DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS: ExpensePaymentStatus =
  "paid";

export const DEFAULT_NEW_EXPENSE_PAYMENT_STATUS: ExpensePaymentStatus =
  "unpaid";

export const EXPENSE_PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Đã thanh toán", color: "green" },
  { value: "unpaid", label: "Chưa thanh toán", color: "orange" },
] satisfies Array<{
  value: ExpensePaymentStatus;
  label: string;
  color: string;
}>;
