"use client";

import { Tabs } from "antd";
import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { workbookIngredients } from "@/lib/workbook-snapshot";

const fields = [
  { key: "code", label: "Mã", required: true },
  { key: "name", label: "Tên hàng", required: true },
  { key: "category", label: "Nhóm", type: "select" as const, options: ["Nguyên liệu", "Topping", "Bao bì", "Khác"], required: true },
  { key: "purchaseUnit", label: "Đơn vị mua" },
  { key: "packageQuantity", label: "Quy cách/gói", type: "number" as const },
  { key: "costUnit", label: "Đơn vị cost" },
  { key: "referencePackagePrice", label: "Giá tham khảo", type: "money" as const },
  { key: "averageUnitCost", label: "Giá vốn BQ/đơn vị", type: "money" as const, editable: false },
  {
    key: "purchaseSummary",
    label: "Đã nhập / Tổng tiền",
    type: "purchaseSummary" as const,
    editable: false,
    hiddenInEditor: true,
  },
  { key: "isActive", label: "Kích hoạt", type: "boolean" as const },
  { key: "note", label: "Ghi chú", type: "textarea" as const, hiddenInTable: true },
];

export default function IngredientsPage() {
  return (
    <div className="page-wrap goods-page">
      <PageHeader
        title="Hàng hóa & kiểm kho"
        description="Đếm tồn cuối ngày và quản lý danh mục nguyên liệu, topping, bao bì tại cùng một nơi."
      />
      <Tabs
        className="goods-tabs"
        defaultActiveKey="inventory"
        items={[
          {
            key: "inventory",
            label: "Kiểm kho",
            children: <InventoryWorkspace embedded />,
          },
          {
            key: "catalog",
            label: "Danh mục hàng hóa",
            children: (
              <ResourceManager
                resource="ingredients"
                fields={fields}
                initialData={workbookIngredients}
                addLabel="Thêm hàng hóa"
              />
            ),
          },
        ]}
      />
    </div>
  );
}
