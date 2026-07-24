"use client";

import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
import { workbookSizes } from "@/lib/workbook-snapshot";

const fields = [
  { key: "code", label: "Mã size", required: true },
  { key: "name", label: "Tên size", required: true },
  {
    key: "milkMl",
    label: "Sữa nền/ly (ml)",
    type: "number" as const,
    required: true,
  },
  { key: "cupSetName", label: "Tên bộ ly", required: true },
  {
    key: "sellingPrice",
    label: "Giá bán mặc định",
    type: "money" as const,
    required: true,
  },
  {
    key: "isActive",
    label: "Kích hoạt",
    type: "boolean" as const,
  },
];

export default function SizesPage() {
  return (
    <div className="page-wrap">
      <PageHeader
        title="Size"
        description="Danh mục dùng chung cho Sản phẩm; giá bán và lượng sữa của sản phẩm được lấy tự động từ đây."
      />
      <ResourceManager
        resource="sizes"
        fields={fields}
        initialData={workbookSizes}
        addLabel="Thêm size"
      />
    </div>
  );
}
