"use client";

import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
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
    key: "fundingSource",
    label: "Nguồn tiền",
    type: "select" as const,
    options: PURCHASE_FUNDING_SOURCE_OPTIONS,
    defaultValue: "sales_revenue",
    legacyValue: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
    required: true,
  },
  { key: "paymentMethod", label: "Thanh toán", type: "select" as const, options: ["Tiền mặt", "Chuyển khoản", "Khác"] },
  { key: "isRecurring", label: "Định kỳ", type: "boolean" as const },
  { key: "note", label: "Ghi chú", type: "textarea" as const, hiddenInTable: true },
];

export default function ExpensesPage() {
  return (
    <div className="page-wrap">
      <PageHeader
        title="Chi phí"
        description="Chi phí phát sinh ngoài tiền nhập nguyên liệu và tài sản đầu tư, kèm nguồn tiền thanh toán."
      />
      <ResourceManager resource="expenses" fields={fields} initialData={[]} addLabel="Thêm chi phí" />
    </div>
  );
}
