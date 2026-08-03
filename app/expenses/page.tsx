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
import {
  EXPENSE_CATEGORY_OPTIONS,
  MILK_STERILIZATION_EXPENSE_CATEGORY,
  milkSterilizationDescription,
} from "@/lib/expense-categories";

function calculateSterilizationValues(
  changedValues: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  const milkLiters = Number(values.milkLiters ?? 0);
  const milkUnitPrice = Number(values.milkUnitPrice ?? 0);
  const description = milkSterilizationDescription(
    milkLiters,
    milkUnitPrice,
  );
  if (values.category !== MILK_STERILIZATION_EXPENSE_CATEGORY) {
    return Object.hasOwn(changedValues, "category") &&
      values.description === description
      ? { description: "" }
      : {};
  }
  return {
    amount: milkLiters * milkUnitPrice,
    description,
  };
}

const fields = [
  { key: "expenseDate", label: "Ngày", type: "date" as const, required: true },
  { key: "category", label: "Nhóm chi phí", type: "select" as const, options: [...EXPENSE_CATEGORY_OPTIONS], required: true },
  {
    key: "description",
    label: "Nội dung",
    disabledWhen: {
      field: "category",
      equals: MILK_STERILIZATION_EXPENSE_CATEGORY,
    },
    hint: "Tự động gán khi chọn Tiệt trùng sữa",
    required: true,
  },
  {
    key: "milkLiters",
    label: "Số lít sữa",
    type: "number" as const,
    min: 0.01,
    precision: 2,
    step: 0.5,
    suffix: "lít",
    visibleWhen: {
      field: "category",
      equals: MILK_STERILIZATION_EXPENSE_CATEGORY,
    },
    hiddenInTable: true,
    required: true,
  },
  {
    key: "milkUnitPrice",
    label: "Giá mỗi lít sữa",
    type: "money" as const,
    min: 1,
    visibleWhen: {
      field: "category",
      equals: MILK_STERILIZATION_EXPENSE_CATEGORY,
    },
    hiddenInTable: true,
    required: true,
  },
  {
    key: "amount",
    label: "Tổng tiền",
    type: "money" as const,
    disabledWhen: {
      field: "category",
      equals: MILK_STERILIZATION_EXPENSE_CATEGORY,
    },
    hint: "Tự động tính khi chọn Tiệt trùng sữa",
    required: true,
  },
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
        selectionAmountField="amount"
        selectionTitle="Danh sách chi phí"
        selectionPdfExportUrl="/api/export/expenses/pdf"
        selectionPdfFileName="hoa-don-chi-phi.pdf"
        selectionPdfLabel="Tạo hóa đơn PDF"
        onEditorValuesChange={(changedValues, allValues) =>
          calculateSterilizationValues(changedValues, allValues)
        }
      />
    </div>
  );
}
