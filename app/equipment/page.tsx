"use client";

import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCE_OPTIONS,
} from "@/lib/purchase-funding";
import { workbookEquipment } from "@/lib/workbook-snapshot";

const fields = [
  { key: "code", label: "Mã", editable: false },
  { key: "purchaseDate", label: "Ngày mua", type: "date" as const, required: true },
  { key: "name", label: "Tên tài sản", required: true },
  {
    key: "category",
    label: "Nhóm",
    type: "select" as const,
    options: ["Dụng cụ lớn", "Cơ sở vật chất", "Máy móc", "Khác"],
  },
  { key: "quantity", label: "Số lượng", type: "number" as const, required: true },
  { key: "unitPrice", label: "Đơn giá", type: "money" as const, required: true },
  { key: "totalAmount", label: "Tổng tiền", type: "money" as const, editable: false },
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
  { key: "residualValue", label: "Giá trị còn lại", type: "money" as const },
  { key: "usefulLifeMonths", label: "Thời gian dùng (tháng)", type: "number" as const },
  { key: "monthlyDepreciation", label: "Khấu hao/tháng", type: "money" as const, editable: false },
  { key: "isActive", label: "Kích hoạt", type: "boolean" as const },
  { key: "note", label: "Ghi chú", type: "textarea" as const, hiddenInTable: true },
];

export default function EquipmentPage() {
  return (
    <div className="page-wrap">
      <PageHeader
        title="Đầu tư & tài sản"
        description="Theo dõi nguồn tiền, vốn đầu tư, trạng thái sử dụng và khấu hao phân bổ mỗi tháng."
      />
      <ResourceManager
        resource="equipment"
        fields={fields}
        initialData={workbookEquipment}
        addLabel="Thêm tài sản"
        deriveValues={(values) => {
          const totalAmount =
            Number(values.quantity ?? 0) * Number(values.unitPrice ?? 0);
          const usefulLifeMonths = Number(values.usefulLifeMonths ?? 0);
          const monthlyDepreciation =
            values.isActive !== false && usefulLifeMonths > 0
              ? Math.max(0, totalAmount - Number(values.residualValue ?? 0)) /
                usefulLifeMonths
              : 0;
          return { ...values, totalAmount, monthlyDepreciation };
        }}
      />
    </div>
  );
}
