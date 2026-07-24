"use client";

import { Alert } from "antd";
import { PageHeader } from "@/components/common/page-header";
import {
  ResourceManager,
  type ResourceField,
} from "@/components/common/resource-manager";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  workbookIngredients,
  workbookProducts,
  workbookSizes,
} from "@/lib/workbook-snapshot";

type LookupRecord = {
  id?: string;
  _id?: string;
  name: string;
  code: string;
  category?: string;
  isActive: boolean;
  milkMl?: number;
  sellingPrice?: number;
};

function recordId(record: LookupRecord) {
  return record.id ?? record._id ?? "";
}

export default function ProductsPage() {
  const {
    data: ingredients,
    loading: ingredientsLoading,
    usingFallback: ingredientsFallback,
  } = useApiData<LookupRecord[]>(
    "/api/ingredients?limit=500",
    workbookIngredients,
  );
  const {
    data: sizes,
    loading: sizesLoading,
    usingFallback: sizesFallback,
  } = useApiData<LookupRecord[]>("/api/sizes?limit=100", workbookSizes);

  if (ingredientsLoading || sizesLoading) return <RouteSkeleton />;

  const fields: ResourceField[] = [
    {
      key: "code",
      label: "Mã SP",
      editable: false,
    },
    {
      key: "toppingIngredientId",
      label: "Tên topping",
      type: "select",
      required: true,
      options: ingredients
        .filter(
          (ingredient) =>
            ingredient.category === "Topping" && ingredient.isActive,
        )
        .map((ingredient) => ({
          value: recordId(ingredient),
          label: `${ingredient.name} · ${ingredient.code}`,
        })),
      hiddenInTable: true,
    },
    {
      key: "toppingName",
      label: "Topping",
      editable: false,
    },
    {
      key: "sizeId",
      label: "Tên size",
      type: "select",
      required: true,
      options: sizes
        .filter((size) => size.isActive)
        .map((size) => ({
          value: recordId(size),
          label: size.name,
        })),
      hiddenInTable: true,
    },
    {
      key: "sizeName",
      label: "Size",
      editable: false,
    },
    {
      key: "name",
      label: "Tên sản phẩm",
      editable: false,
    },
    {
      key: "toppingGrams",
      label: "Topping (g)",
      type: "number",
      required: true,
    },
    {
      key: "sellingPrice",
      label: "Giá bán",
      type: "money",
      editable: false,
    },
    {
      key: "milkMl",
      label: "Sữa nền (ml)",
      type: "number",
      editable: false,
    },
    {
      key: "variableCost",
      label: "Cost biến đổi",
      type: "money",
      editable: false,
    },
    {
      key: "fullCost",
      label: "Full cost",
      type: "money",
      editable: false,
    },
    {
      key: "isActive",
      label: "Đang bán",
      type: "boolean",
    },
  ];

  return (
    <div className="page-wrap">
      <PageHeader
        title="Sản phẩm"
        description="Chỉ chọn topping, size, định lượng và trạng thái; tên, mã, giá bán và toàn bộ giá vốn được tính từ các bảng liên kết."
      />
      {(ingredientsFallback || sizesFallback) && (
        <Alert
          type="info"
          showIcon
          message="Danh mục liên kết đang lấy từ snapshot Excel"
          style={{ marginBottom: 16 }}
        />
      )}
      <ResourceManager
        resource="products"
        fields={fields}
        initialData={workbookProducts}
        addLabel="Thêm sản phẩm"
        deriveValues={(values) => {
          const topping = ingredients.find(
            (ingredient) =>
              recordId(ingredient) === values.toppingIngredientId,
          );
          const size = sizes.find(
            (item) => recordId(item) === values.sizeId,
          );
          return {
            ...values,
            toppingName: topping?.name,
            sizeName: size?.name,
            name:
              topping && size ? `${topping.name} - ${size.name}` : undefined,
            sellingPrice: size?.sellingPrice,
            milkMl: size?.milkMl,
          };
        }}
      />
    </div>
  );
}
