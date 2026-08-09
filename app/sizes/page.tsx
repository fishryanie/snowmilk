"use client";

import { Alert } from "antd";
import { PageHeader } from "@/components/common/page-header";
import {
  ResourceManager,
  type ResourceField,
} from "@/components/common/resource-manager";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { formatVnd } from "@/lib/formatters";
import {
  workbookIngredients,
  workbookSizes,
} from "@/lib/workbook-snapshot";

type PackagingLookup = {
  code: string;
  name: string;
  category?: string;
  costUnit?: string;
  averageUnitCost?: number;
  isActive: boolean;
};

export default function SizesPage() {
  const {
    data: ingredients,
    loading,
    usingFallback,
  } = useApiData<PackagingLookup[]>(
    "/api/ingredients?limit=500",
    workbookIngredients,
  );

  if (loading) return <RouteSkeleton />;

  const fields: ResourceField[] = [
    { key: "code", label: "Mã size", required: true },
    { key: "name", label: "Tên size", required: true },
    {
      key: "milkMl",
      label: "Dung tích sữa/đơn vị (ml)",
      type: "number",
      required: true,
      hint: "Lượng sữa thành phẩm cho một ly hoặc một chai.",
    },
    {
      key: "cupSetName",
      label: "Bao bì chính",
      type: "select",
      required: true,
      options: ingredients.flatMap((ingredient) =>
        ingredient.category === "Bao bì" && ingredient.isActive
          ? [
              {
                value: ingredient.name,
                label: `${ingredient.name} · ${ingredient.code} · ${formatVnd(
                  Number(ingredient.averageUnitCost ?? 0),
                )}/${ingredient.costUnit || "đơn vị"}`,
              },
            ]
          : [],
      ),
      hint: "Chọn hàng hóa bao bì để hệ thống tự đưa giá vốn vào sản phẩm.",
    },
    {
      key: "sellingPrice",
      label: "Giá bán mặc định",
      type: "money",
      required: true,
    },
    {
      key: "isActive",
      label: "Kích hoạt",
      type: "boolean",
    },
  ];

  return (
    <div className="page-wrap">
      <PageHeader
        title="Size"
        description="Khai báo dung tích và bao bì cho từng quy cách bán, dùng chung cho cả ly và chai."
      />
      {usingFallback && (
        <Alert
          type="info"
          showIcon
          message="Danh mục bao bì đang lấy từ snapshot Excel"
          style={{ marginBottom: 16 }}
        />
      )}
      <ResourceManager
        resource="sizes"
        fields={fields}
        initialData={workbookSizes}
        addLabel="Thêm size"
        editorColumns={2}
      />
    </div>
  );
}
