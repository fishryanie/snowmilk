"use client";

import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
import {
  DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
  DEFAULT_NEW_EXPENSE_PAYMENT_STATUS,
  EXPENSE_PAYMENT_STATUS_OPTIONS,
} from "@/lib/expense-payment-status";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCE_OPTIONS,
} from "@/lib/purchase-funding";

const fields = [
  { key: "expenseDate", label: "Ngày", type: "date" as const, required: true },
  { key: "category", label: "Nhóm chi phí", type: "select" as const, options: ["Điện", "Nước", "Mặt bằng", "Vận chuyển", "Marketing", "Sửa chữa", "Khác"], required: true },
  { key: "description", label: "Nội dung", required: true },
  { key: "amount", label: "Số tiền", type: "money" as const, required: true },
  {
    key: "paymentStatus",
    label: "Trạng thái",
    type: "radio" as const,
    options: EXPENSE_PAYMENT_STATUS_OPTIONS,
    defaultValue: DEFAULT_NEW_EXPENSE_PAYMENT_STATUS,
    legacyValue: DEFAULT_LEGACY_EXPENSE_PAYMENT_STATUS,
    mobilePriority: 1,
    required: true,
  },
  {
    key: "fundingSource",
    label: "Nguồn tiền",
    type: "select" as const,
    options: PURCHASE_FUNDING_SOURCE_OPTIONS,
    defaultValue: "sales_revenue",
    legacyValue: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
    missingWarningLabel: "Chưa ghi nguồn tiền",
    required: true,
  },
  {
    key: "isRecurring",
    label: "Định kỳ",
    type: "boolean" as const,
    booleanControl: "checkbox" as const,
    booleanLabel: "Đây là chi phí định kỳ",
  },
  {
    key: "note",
    label: "Ghi chú",
    type: "textarea" as const,
    formSpan: 12 as const,
    hiddenInTable: true,
  },
];

export default function ExpensesPage() {
  return (
    <div className="page-wrap">
      <PageHeader
        title="Chi phí"
        description="Chi phí phát sinh ngoài tiền nhập nguyên liệu và tài sản đầu tư, kèm trạng thái và nguồn tiền thanh toán."
      />
      <ResourceManager
        resource="expenses"
        fields={fields}
        initialData={[]}
        addLabel="Thêm chi phí"
        editorColumns={2}
      />
    </div>
  );
}
