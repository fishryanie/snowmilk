"use client";

import {
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import {
  calculateInlinePackagingUnitCost,
  calculateOnboardingProductCost,
  calculateRecipeCost,
  calculateSterilizationCost,
  DEFAULT_STERILIZATION_COST_PER_LITER,
} from "@/lib/calculations/product-onboarding";
import { compatibleUnitOptions } from "@/lib/calculations/units";
import {
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import { useApiData } from "@/hooks/use-api-data";
import {
  workbookIngredients,
  workbookProducts,
} from "@/lib/workbook-snapshot";

const { Text } = Typography;

type IngredientOption = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  category?: string;
  purchaseUnit?: string;
  packageQuantity?: number;
  costUnit?: string;
  averageUnitCost?: number;
  isActive?: boolean;
};

type RecipeIngredient = {
  ingredientId?: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  costUnit: string;
  unitCost: number;
  amount: number;
};

type RecipeOption = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  yieldMl: number;
  ingredientCost: number;
  costPerMl: number;
  ingredients?: RecipeIngredient[];
};

type PackagingSnapshot = {
  ingredientId?: string;
  ingredientCode?: string;
  ingredientName: string;
  quantity: number;
  costUnit?: string;
  unitCost: number;
  amount: number;
};

type ProductRecord = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  productMode?: "legacy" | "recipe";
  recipeId?: string;
  recipeCode?: string;
  recipeName?: string;
  sizeName?: string;
  milkMl?: number;
  sellingPrice: number;
  recipeCost?: number;
  packagingCost?: number;
  variableCost?: number;
  fullCost?: number;
  packagingItems?: PackagingSnapshot[];
  hasCostWarning?: boolean;
  isActive: boolean;
  note?: string;
};

type ProductOnboardingData = {
  products: ProductRecord[];
  recipes: RecipeOption[];
  ingredients: IngredientOption[];
  costSettings: {
    overheadRate: number;
    allocatedFixedCost: number;
  };
};

type RecipeLineForm = {
  ingredientId?: string;
  quantity?: number;
  unit?: string;
};

type PackagingLineForm = {
  source: "existing" | "new";
  ingredientId?: string;
  name?: string;
  purchaseUnit?: string;
  packageQuantity?: number;
  costUnit?: string;
  packagePrice?: number;
  packageCount?: number;
  supplier?: string;
  openingPackagePrice?: number;
  openingPackageCount?: number;
  openingSupplier?: string;
  quantity?: number;
};

type ProductForm = {
  name: string;
  sellingPrice: number;
  servingMl: number;
  recipeMode: "existing" | "new";
  recipeId?: string;
  recipeName?: string;
  recipeYieldMl?: number;
  recipeIngredients?: RecipeLineForm[];
  packagingItems: PackagingLineForm[];
  isActive: boolean;
  note?: string;
};

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? String(record._id ?? "");
}

function preferredRecipeUnit(costUnit?: string) {
  const normalized = String(costUnit ?? "").trim().toLocaleLowerCase("vi");
  if (["kg", "kilogram", "g", "gram"].includes(normalized)) return "g";
  if (["l", "lit", "liter", "litre", "lít", "ml"].includes(normalized)) {
    return "ml";
  }
  return costUnit || "đơn vị";
}

function sterilizationCost(product: ProductRecord) {
  return calculateSterilizationCost(Number(product.milkMl ?? 0));
}

const fallbackData: ProductOnboardingData = {
  products: workbookProducts as ProductRecord[],
  recipes: [],
  ingredients: workbookIngredients as IngredientOption[],
  costSettings: { overheadRate: 0.05, allocatedFixedCost: 0 },
};

export function ProductOnboardingWorkspace() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProductForm>();
  const [query, setQuery] = useState("");
  const [includeSterilizationCost, setIncludeSterilizationCost] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    data,
    loading,
    usingFallback,
    setData,
  } = useApiData<ProductOnboardingData>("/api/product-onboarding", fallbackData);
  const values = Form.useWatch([], form);
  const ingredientsById = useMemo(
    () =>
      new Map(
        data.ingredients.map((ingredient) => [recordId(ingredient), ingredient]),
      ),
    [data.ingredients],
  );
  const recipesById = useMemo(
    () => new Map(data.recipes.map((recipe) => [recordId(recipe), recipe])),
    [data.recipes],
  );
  const recipeIngredients = useMemo(
    () =>
      data.ingredients.filter(
        (ingredient) => ingredient.category !== "Bao bì" && ingredient.isActive,
      ),
    [data.ingredients],
  );
  const packagingOptions = useMemo(
    () =>
      data.ingredients.filter(
        (ingredient) => ingredient.category === "Bao bì" && ingredient.isActive,
      ),
    [data.ingredients],
  );
  const preview = useMemo(() => {
    let recipeCostPerMl = 0;
    let recipeIngredientCost = 0;
    let costError = "";
    if (values?.recipeMode === "existing") {
      const recipe = recipesById.get(String(values.recipeId ?? ""));
      recipeCostPerMl = Number(recipe?.costPerMl ?? 0);
      recipeIngredientCost = Number(recipe?.ingredientCost ?? 0);
    } else {
      try {
        const recipeCost = calculateRecipeCost(
          Number(values?.recipeYieldMl ?? 0),
          (values?.recipeIngredients ?? []).flatMap((line) => {
            const ingredient = ingredientsById.get(
              String(line.ingredientId ?? ""),
            );
            const costUnit = String(ingredient?.costUnit ?? "").trim();
            return ingredient && costUnit && line.unit
              ? [
                  {
                    quantity: Number(line.quantity ?? 0),
                    unit: line.unit,
                    unitCost: Number(ingredient.averageUnitCost ?? 0),
                    costUnit,
                  },
                ]
              : [];
          }),
        );
        recipeCostPerMl = recipeCost.costPerMl;
        recipeIngredientCost = recipeCost.ingredientCost;
      } catch (error) {
        costError = error instanceof Error ? error.message : "Không thể tính cost";
      }
    }
    const packagingCost = (values?.packagingItems ?? []).reduce(
      (total, line) => {
        const quantity = Number(line.quantity ?? 0);
        if (line.source === "new") {
          return (
            total +
            quantity *
              calculateInlinePackagingUnitCost({
                packageQuantity: Number(line.packageQuantity ?? 0),
                packagePrice: Number(line.packagePrice ?? 0),
              })
          );
        }
        const ingredient = ingredientsById.get(String(line.ingredientId ?? ""));
        const savedUnitCost = Number(ingredient?.averageUnitCost ?? 0);
        const unitCost =
          savedUnitCost > 0
            ? savedUnitCost
            : calculateInlinePackagingUnitCost({
                packageQuantity: Number(ingredient?.packageQuantity ?? 0),
                packagePrice: Number(line.openingPackagePrice ?? 0),
              });
        return total + quantity * unitCost;
      },
      0,
    );
    return {
      recipeIngredientCost,
      packagingCost,
      costError,
      ...calculateOnboardingProductCost({
        recipeCostPerMl,
        servingMl: Number(values?.servingMl ?? 0),
        packagingCost,
        ...data.costSettings,
      }),
    };
  }, [data.costSettings, ingredientsById, recipesById, values]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(
    () =>
      normalizedQuery
        ? data.products.filter((product) =>
            [product.code, product.name, product.recipeName, product.sizeName].some(
              (value) =>
                String(value ?? "")
                  .toLocaleLowerCase("vi")
                  .includes(normalizedQuery),
            ),
          )
        : data.products,
    [data.products, normalizedQuery],
  );
  const legacyCount = data.products.filter(
    (product) => product.productMode !== "recipe",
  ).length;

  const columns: ColumnsType<ProductRecord> = [
    { title: "Mã SP", dataIndex: "code" },
    {
      title: "Sản phẩm",
      dataIndex: "name",
      render: (value, record) => (
        <Space size={6} wrap>
          <Text strong>{String(value)}</Text>
          {record.productMode === "recipe" ? (
            <Tag color="green">Luồng mới</Tag>
          ) : (
            <Tag color="warning">Dữ liệu cũ</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Công thức",
      dataIndex: "recipeName",
      render: (value, record) => value || record.recipeCode || "Mẻ sữa mới nhất",
    },
    {
      title: "Dung tích",
      dataIndex: "milkMl",
      align: "right",
      render: (value) => `${formatNumber(Number(value ?? 0))} ml`,
    },
    {
      title: "Giá bán",
      dataIndex: "sellingPrice",
      align: "right",
      render: (value) => formatVnd(Number(value)),
    },
    ...(includeSterilizationCost
      ? [
          {
            title: "Phí tiệt trùng",
            key: "sterilizationCost",
            align: "right" as const,
            render: (_: unknown, record: ProductRecord) =>
              formatVnd(sterilizationCost(record)),
          },
        ]
      : []),
    {
      title: "Full cost",
      dataIndex: "fullCost",
      align: "right",
      render: (value, record) => (
        <Text
          type={
            record.hasCostWarning ||
            Number(value ?? 0) +
              (includeSterilizationCost ? sterilizationCost(record) : 0) >=
              Number(record.sellingPrice ?? 0)
              ? "danger"
              : undefined
          }
          strong
        >
          {formatVnd(
            Number(value ?? 0) +
              (includeSterilizationCost ? sterilizationCost(record) : 0),
          )}
        </Text>
      ),
    },
    {
      title: "Lãi gộp/SP",
      key: "profit",
      align: "right",
      render: (_, record) =>
        formatVnd(
          Number(record.sellingPrice ?? 0) -
            Number(record.fullCost ?? 0) -
            (includeSterilizationCost ? sterilizationCost(record) : 0),
        ),
    },
    {
      title: "",
      fixed: "right",
      render: (_, record) => (
        <Space size={2}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`Sửa ${record.name}`}
            onClick={() => openEditor(record)}
          />
          <Popconfirm
            title="Xóa sản phẩm này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeProduct(record)}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              aria-label={`Xóa ${record.name}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  function openEditor(product?: ProductRecord) {
    setEditing(product ?? null);
    const recipeId = product?.recipeId ? String(product.recipeId) : "";
    const hasRecipe = Boolean(recipeId && recipesById.has(recipeId));
    form.setFieldsValue(
      product
        ? {
            name: product.name,
            sellingPrice: product.sellingPrice,
            servingMl: Number(product.milkMl ?? 430),
            recipeMode: hasRecipe ? "existing" : "new",
            recipeId: hasRecipe ? recipeId : undefined,
            recipeName: hasRecipe ? undefined : product.name,
            recipeYieldMl: hasRecipe ? undefined : Number(product.milkMl ?? 430),
            recipeIngredients: hasRecipe ? undefined : [{ quantity: 1 }],
            packagingItems:
              product.packagingItems?.length
                ? product.packagingItems.map((item) => ({
                    source: "existing" as const,
                    ingredientId: String(item.ingredientId ?? ""),
                    quantity: item.quantity,
                    openingPackageCount: 1,
                  }))
                : [
                    {
                      source: "existing",
                      quantity: 1,
                      openingPackageCount: 1,
                    },
                  ],
            isActive: product.isActive,
            note: product.note,
          }
        : {
            servingMl: 430,
            recipeMode: "new",
            recipeYieldMl: 430,
            recipeIngredients: [{ quantity: 400 }, { quantity: 60 }],
            packagingItems: [
              { source: "existing", quantity: 1, openingPackageCount: 1 },
            ],
            isActive: true,
          },
    );
    setDrawerOpen(true);
  }

  function closeEditor() {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  }

  async function refreshData() {
    const response = await fetch("/api/product-onboarding", { cache: "no-store" });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(errorBody?.message || `Không thể tải dữ liệu (${response.status})`);
    }
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data?: ProductOnboardingData;
    };
    if (!body.success || !body.data) throw new Error(body.message);
    setData(body.data);
  }

  async function exportProductsPdf() {
    if (visibleProducts.length === 0) {
      message.warning("Không có sản phẩm để xuất PDF");
      return;
    }

    setExportingPdf(true);
    try {
      const response = await fetch("/api/export/products/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeSterilizationCost,
          products: visibleProducts.map((product) => ({
            code: product.code,
            name: product.name,
            productMode: product.productMode,
            recipeCode: product.recipeCode,
            recipeName: product.recipeName,
            milkMl: Number(product.milkMl ?? 0),
            sellingPrice: Number(product.sellingPrice ?? 0),
            fullCost: Number(product.fullCost ?? 0),
          })),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Không thể tạo file PDF");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "danh-sach-san-pham.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      message.success(`Đã tải PDF ${formatNumber(visibleProducts.length)} sản phẩm`);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể tạo file PDF",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  async function saveProduct(formValues: ProductForm) {
    setSaving(true);
    try {
      const recipe =
        formValues.recipeMode === "existing"
          ? { mode: "existing" as const, recipeId: formValues.recipeId }
          : {
              mode: "new" as const,
              name: formValues.recipeName,
              yieldMl: formValues.recipeYieldMl,
              ingredients: (formValues.recipeIngredients ?? []).map((item) => ({
                ingredientId: item.ingredientId,
                quantity: item.quantity,
                unit: item.unit,
              })),
            };
      const packagingItems = formValues.packagingItems.map((item) =>
        item.source === "new"
          ? {
              source: "new" as const,
              name: item.name,
              purchaseUnit: item.purchaseUnit,
              packageQuantity: item.packageQuantity,
              costUnit: item.costUnit,
              packagePrice: item.packagePrice,
              packageCount: item.packageCount ?? 1,
              supplier: item.supplier ?? "",
              quantity: item.quantity,
            }
          : (() => {
              const ingredient = ingredientsById.get(
                String(item.ingredientId ?? ""),
              );
              const needsOpeningPurchase =
                Number(ingredient?.averageUnitCost ?? 0) <= 0;
              return {
                source: "existing" as const,
                ingredientId: item.ingredientId,
                quantity: item.quantity,
                openingPurchase: needsOpeningPurchase
                  ? {
                      packagePrice: item.openingPackagePrice,
                      packageCount: item.openingPackageCount ?? 1,
                      supplier: item.openingSupplier ?? "",
                    }
                  : undefined,
              };
            })(),
      );
      const id = editing ? recordId(editing) : "";
      const response = await fetch(
        id ? `/api/product-onboarding/${id}` : "/api/product-onboarding",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formValues.name,
            sellingPrice: formValues.sellingPrice,
            servingMl: formValues.servingMl,
            recipe,
            packagingItems,
            isActive: formValues.isActive,
            note: formValues.note ?? "",
          }),
        },
      );
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(errorBody?.message || `Không thể lưu sản phẩm (${response.status})`);
      }
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!body.success) throw new Error(body.message);
      await refreshData();
      message.success(body.message);
      closeEditor();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu sản phẩm",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(product: ProductRecord) {
    const id = recordId(product);
    if (!id) return;
    try {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(errorBody?.message || `Không thể xóa sản phẩm (${response.status})`);
      }
      const body = (await response.json()) as { success: boolean; message: string };
      if (!body.success) throw new Error(body.message);
      setData((current) => ({
        ...current,
        products: current.products.filter((item) => recordId(item) !== id),
      }));
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể xóa sản phẩm",
      );
    }
  }

  if (loading) return <RouteSkeleton />;

  return (
    <div className="page-wrap product-onboarding-page">
      <PageHeader
        title="Sản phẩm"
        description="Tạo sản phẩm, công thức, bao bì và giá vốn trong cùng một luồng. Không bắt buộc topping hoặc tạo Size trước."
      />
      {usingFallback ? (
        <Alert
          type="info"
          showIcon
          title="Đang dùng dữ liệu dự phòng"
          description="Hãy bảo đảm MongoDB đang chạy trước khi thêm sản phẩm mới."
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {legacyCount > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={`${legacyCount} sản phẩm đang dùng cấu trúc cũ`}
          description="Dữ liệu vẫn được giữ nguyên. Bấm Sửa để chuyển từng sản phẩm sang công thức và bao bì mới."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card className="surface-card table-card">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã, tên hoặc công thức…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 320 }}
          />
          <Space size={16} wrap className="product-toolbar-actions">
            <Checkbox
              checked={includeSterilizationCost}
              onChange={(event) => setIncludeSterilizationCost(event.target.checked)}
            >
              Phí tiệt trùng ({formatVnd(DEFAULT_STERILIZATION_COST_PER_LITER)}/lít)
            </Checkbox>
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              disabled={visibleProducts.length === 0}
              onClick={exportProductsPdf}
            >
              Xuất PDF
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              Thêm sản phẩm mới
            </Button>
          </Space>
        </div>
        <Table
          className="product-desktop-table"
          size="small"
          rowKey={(record) => recordId(record) || record.code}
          columns={columns}
          dataSource={visibleProducts}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
        />
        <ul className="product-mobile-list">
          {visibleProducts.map((product) => (
            <li className="product-mobile-card" key={recordId(product) || product.code}>
              <div className="product-mobile-heading">
                <div>
                  <Text strong>{product.name}</Text>
                  <Text type="secondary">{product.code}</Text>
                </div>
                <Tag color={product.productMode === "recipe" ? "green" : "warning"}>
                  {product.productMode === "recipe" ? "Luồng mới" : "Dữ liệu cũ"}
                </Tag>
              </div>
              <dl className="product-mobile-metrics">
                <div>
                  <dt>Dung tích</dt>
                  <dd>{formatNumber(product.milkMl)} ml</dd>
                </div>
                <div>
                  <dt>Giá bán</dt>
                  <dd>{formatVnd(product.sellingPrice)}</dd>
                </div>
                <div>
                  <dt>Full cost</dt>
                  <dd>
                    {formatVnd(
                      Number(product.fullCost ?? 0) +
                        (includeSterilizationCost ? sterilizationCost(product) : 0),
                    )}
                  </dd>
                </div>
                {includeSterilizationCost ? (
                  <div>
                    <dt>Phí tiệt trùng</dt>
                    <dd>{formatVnd(sterilizationCost(product))}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Lãi gộp/SP</dt>
                  <dd>
                    {formatVnd(
                      product.sellingPrice -
                        Number(product.fullCost ?? 0) -
                        (includeSterilizationCost ? sterilizationCost(product) : 0),
                    )}
                  </dd>
                </div>
              </dl>
              <Button
                type="text"
                className="product-mobile-edit"
                icon={<EditOutlined />}
                onClick={() => openEditor(product)}
              >
                {product.productMode === "recipe" ? "Sửa sản phẩm" : "Chuyển sang luồng mới"}
                <RightOutlined />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Drawer
        className="product-onboarding-drawer"
        open={drawerOpen}
        title={editing ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
        placement="right"
        size="large"
        destroyOnHidden
        onClose={closeEditor}
        footer={
          <div className="product-onboarding-footer">
            <Text type="secondary">
              Full cost dự kiến: <strong>{formatVnd(preview.fullCost)}</strong>
            </Text>
            <Space>
              <Button onClick={closeEditor}>Hủy</Button>
              <Button type="primary" loading={saving} onClick={() => form.submit()}>
                Lưu sản phẩm
              </Button>
            </Space>
          </div>
        }
      >
        {editing && editing.productMode !== "recipe" ? (
          <Alert
            type="info"
            showIcon
            title="Chuyển sản phẩm cũ sang cấu trúc mới"
            description="Hãy chọn hoặc khai báo công thức và bao bì. Mã sản phẩm và lịch sử bán hàng vẫn được giữ nguyên."
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form<ProductForm>
          form={form}
          layout="vertical"
          onFinish={saveProduct}
          onValuesChange={(changed, allValues) => {
            if (
              "name" in changed &&
              allValues.recipeMode === "new" &&
              !allValues.recipeName
            ) {
              form.setFieldValue("recipeName", changed.name);
            }
          }}
        >
          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>1</span>
              <div>
                <Text strong>Thông tin bán</Text>
                <Text type="secondary">Mã sản phẩm được tạo tự động khi lưu.</Text>
              </div>
            </div>
            <div className="product-onboarding-grid">
              <Form.Item
                name="name"
                label="Tên sản phẩm"
                rules={[{ required: true, message: "Nhập tên sản phẩm" }]}
              >
                <Input placeholder="Ví dụ: Sữa tươi có đường 430ml" />
              </Form.Item>
              <Form.Item
                name="servingMl"
                label="Dung tích thành phẩm (ml)"
                rules={[{ required: true, message: "Nhập dung tích" }]}
              >
                <InputNumber min={0.001} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item
                name="sellingPrice"
                label="Giá bán"
                rules={[{ required: true, message: "Nhập giá bán" }]}
              >
                <InputNumber
                  min={0}
                  precision={0}
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Form.Item name="isActive" label="Đang bán" valuePropName="checked">
                <Switch />
              </Form.Item>
            </div>
          </section>

          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>2</span>
              <div>
                <Text strong>Công thức</Text>
                <Text type="secondary">
                  Thành phẩm là sản lượng thực tế, không cộng cơ học ml sữa và gram đường.
                </Text>
              </div>
            </div>
            <Form.Item name="recipeMode" label="Cách nhập công thức">
              <Radio.Group optionType="button" buttonStyle="solid">
                <Radio.Button value="new">Tạo tại đây</Radio.Button>
                <Radio.Button value="existing" disabled={data.recipes.length === 0}>
                  Chọn có sẵn
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
            {values?.recipeMode === "existing" ? (
              <Form.Item
                name="recipeId"
                label="Công thức"
                rules={[{ required: true, message: "Chọn công thức" }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn công thức"
                  options={data.recipes.map((recipe) => ({
                    value: recordId(recipe),
                    label: `${recipe.name} · ${recipe.code} · ${formatVnd(recipe.costPerMl)}/ml`,
                  }))}
                />
              </Form.Item>
            ) : (
              <>
                <div className="product-onboarding-grid">
                  <Form.Item
                    name="recipeName"
                    label="Tên công thức"
                    rules={[{ required: true, message: "Nhập tên công thức" }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name="recipeYieldMl"
                    label="Thành phẩm công thức (ml)"
                    rules={[{ required: true, message: "Nhập sản lượng thực tế" }]}
                  >
                    <InputNumber min={0.001} style={{ width: "100%" }} />
                  </Form.Item>
                </div>
                <Form.List name="recipeIngredients">
                  {(fields, { add, remove }) => (
                    <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                      {fields.map((field) => {
                        const ingredientId = values?.recipeIngredients?.[field.name]?.ingredientId;
                        const ingredient = ingredientsById.get(String(ingredientId ?? ""));
                        const unitOptions = compatibleUnitOptions(
                          String(ingredient?.costUnit ?? "đơn vị"),
                        );
                        return (
                          <div className="product-recipe-row" key={field.key}>
                            <Form.Item
                              name={[field.name, "ingredientId"]}
                              rules={[{ required: true, message: "Chọn nguyên liệu" }]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="Nguyên liệu"
                                onChange={(id) => {
                                  const selected = ingredientsById.get(id);
                                  form.setFieldValue(
                                    ["recipeIngredients", field.name, "unit"],
                                    preferredRecipeUnit(selected?.costUnit),
                                  );
                                }}
                                options={recipeIngredients.map((item) => ({
                                  value: recordId(item),
                                  label: `${item.name} · ${item.code} · ${formatVnd(item.averageUnitCost)}/${item.costUnit || "đơn vị"}`,
                                }))}
                              />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "quantity"]}
                              rules={[{ required: true, message: "Nhập lượng" }]}
                            >
                              <InputNumber min={0.0001} placeholder="Số lượng" style={{ width: "100%" }} />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "unit"]}
                              rules={[{ required: true, message: "Chọn đơn vị" }]}
                            >
                              <Select placeholder="Đơn vị" options={unitOptions} />
                            </Form.Item>
                            <Button
                              type="text"
                              danger
                              icon={<MinusCircleOutlined />}
                              aria-label="Xóa nguyên liệu"
                              onClick={() => remove(field.name)}
                            />
                          </div>
                        );
                      })}
                      <Button block icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                        Thêm nguyên liệu
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </>
            )}
          </section>

          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>3</span>
              <div>
                <Text strong>Bao bì</Text>
                <Text type="secondary">
                  Chọn hàng có sẵn hoặc nhập luôn lốc đầu tiên, hệ thống tự tính giá một đơn vị.
                </Text>
              </div>
            </div>
            <Form.List name="packagingItems">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                  {fields.map((field) => {
                    const line = values?.packagingItems?.[field.name];
                    const selectedPackaging = ingredientsById.get(
                      String(line?.ingredientId ?? ""),
                    );
                    const needsOpeningPurchase =
                      line?.source === "existing" &&
                      Boolean(selectedPackaging) &&
                      Number(selectedPackaging?.averageUnitCost ?? 0) <= 0;
                    const inlineUnitCost = calculateInlinePackagingUnitCost({
                      packageQuantity: Number(line?.packageQuantity ?? 0),
                      packagePrice: Number(line?.packagePrice ?? 0),
                    });
                    const openingUnitCost = calculateInlinePackagingUnitCost({
                      packageQuantity: Number(
                        selectedPackaging?.packageQuantity ?? 0,
                      ),
                      packagePrice: Number(line?.openingPackagePrice ?? 0),
                    });
                    return (
                      <Card
                        size="small"
                        className="product-packaging-card"
                        key={field.key}
                        title={`Bao bì ${field.name + 1}`}
                        extra={
                          fields.length > 1 ? (
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label="Xóa bao bì"
                              onClick={() => remove(field.name)}
                            />
                          ) : null
                        }
                      >
                        <Form.Item name={[field.name, "source"]} label="Nguồn dữ liệu">
                          <Radio.Group optionType="button" buttonStyle="solid">
                            <Radio.Button value="existing">Chọn có sẵn</Radio.Button>
                            <Radio.Button value="new">Tạo và nhập kho</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                        {line?.source === "new" ? (
                          <div className="product-packaging-grid">
                            <Form.Item
                              name={[field.name, "name"]}
                              label="Tên bao bì"
                              rules={[{ required: true, message: "Nhập tên bao bì" }]}
                            >
                              <Input placeholder="Ví dụ: Chai sữa 430ml" />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "purchaseUnit"]}
                              label="Đơn vị mua"
                              rules={[{ required: true, message: "Nhập đơn vị mua" }]}
                            >
                              <Input placeholder="Lốc" />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "packageQuantity"]}
                              label="Số đơn vị trong lốc"
                              rules={[{ required: true, message: "Nhập quy cách" }]}
                            >
                              <InputNumber min={0.0001} style={{ width: "100%" }} />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "costUnit"]}
                              label="Đơn vị cost"
                              rules={[{ required: true, message: "Nhập đơn vị cost" }]}
                            >
                              <Input placeholder="chai" />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "packagePrice"]}
                              label="Giá một lốc"
                              rules={[{ required: true, message: "Nhập giá lốc" }]}
                            >
                              <InputNumber
                                min={0}
                                formatter={formatVndInput}
                                parser={parseVndInput}
                                style={{ width: "100%" }}
                              />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, "packageCount"]}
                              label="Số lốc nhập đầu tiên"
                              rules={[{ required: true, message: "Nhập số lốc" }]}
                            >
                              <InputNumber min={0.0001} style={{ width: "100%" }} />
                            </Form.Item>
                            <Form.Item name={[field.name, "supplier"]} label="Nhà cung cấp">
                              <Input />
                            </Form.Item>
                            <Form.Item label="Giá vốn tự động">
                              <Input value={`${formatVnd(inlineUnitCost)}/${line.costUnit || "đơn vị"}`} readOnly />
                            </Form.Item>
                          </div>
                        ) : (
                          <>
                            <Form.Item
                              name={[field.name, "ingredientId"]}
                              label="Bao bì có sẵn"
                              rules={[{ required: true, message: "Chọn bao bì" }]}
                            >
                              <Select
                                showSearch
                                optionFilterProp="label"
                                placeholder="Chọn chai, nắp, tem…"
                                options={packagingOptions.map((item) => ({
                                  value: recordId(item),
                                  label: `${item.name} · ${item.code} · ${formatVnd(item.averageUnitCost)}/${item.costUnit || "đơn vị"}`,
                                }))}
                              />
                            </Form.Item>
                            {needsOpeningPurchase ? (
                              <>
                                <Alert
                                  type="warning"
                                  showIcon
                                  message="Bao bì này chưa có giá vốn"
                                  description={`Nhập lô đầu tiên theo quy cách ${formatNumber(selectedPackaging?.packageQuantity ?? 0)} ${selectedPackaging?.costUnit || "đơn vị"}/${selectedPackaging?.purchaseUnit || "lốc"}; không cần sang trang Hàng hóa.`}
                                  style={{ marginBottom: 16 }}
                                />
                                <div className="product-packaging-grid">
                                  <Form.Item
                                    name={[field.name, "openingPackagePrice"]}
                                    label={`Giá một ${selectedPackaging?.purchaseUnit || "lốc"}`}
                                    rules={[{ required: true, message: "Nhập giá lốc đầu tiên" }]}
                                  >
                                    <InputNumber
                                      min={0.0001}
                                      formatter={formatVndInput}
                                      parser={parseVndInput}
                                      style={{ width: "100%" }}
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    name={[field.name, "openingPackageCount"]}
                                    label={`Số ${selectedPackaging?.purchaseUnit || "lốc"} nhập đầu tiên`}
                                    rules={[{ required: true, message: "Nhập số lốc" }]}
                                  >
                                    <InputNumber min={0.0001} style={{ width: "100%" }} />
                                  </Form.Item>
                                  <Form.Item
                                    name={[field.name, "openingSupplier"]}
                                    label="Nhà cung cấp"
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Form.Item label="Giá vốn tự động">
                                    <Input
                                      value={`${formatVnd(openingUnitCost)}/${selectedPackaging?.costUnit || "đơn vị"}`}
                                      readOnly
                                    />
                                  </Form.Item>
                                </div>
                              </>
                            ) : null}
                          </>
                        )}
                        <Form.Item
                          name={[field.name, "quantity"]}
                          label="Số lượng dùng cho một sản phẩm"
                          rules={[{ required: true, message: "Nhập số lượng" }]}
                        >
                          <InputNumber min={0.0001} style={{ width: "100%" }} />
                        </Form.Item>
                      </Card>
                    );
                  })}
                  <Button
                    block
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({
                        source: "existing",
                        quantity: 1,
                        packageCount: 1,
                        openingPackageCount: 1,
                      })
                    }
                  >
                    Thêm chai, nắp, tem hoặc túi
                  </Button>
                </Space>
              )}
            </Form.List>
          </section>

          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>4</span>
              <div>
                <Text strong>Kiểm tra giá vốn</Text>
                <Text type="secondary">Cost được xem trước và tính lại ở server khi lưu.</Text>
              </div>
            </div>
            {preview.costError ? (
              <Alert type="error" showIcon message={preview.costError} style={{ marginBottom: 12 }} />
            ) : null}
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Cost nguyên liệu/công thức gốc">
                {formatVnd(preview.recipeIngredientCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Cost công thức/sản phẩm">
                {formatVnd(preview.recipeCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Cost bao bì">
                {formatVnd(preview.packagingCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Overhead biến đổi">
                {formatVnd(preview.overheadCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Phân bổ cố định">
                {formatVnd(data.costSettings.allocatedFixedCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Full cost">
                <Text strong>{formatVnd(preview.fullCost)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Lãi gộp dự kiến/SP">
                <Text
                  strong
                  type={
                    Number(values?.sellingPrice ?? 0) - preview.fullCost < 0
                      ? "danger"
                      : "success"
                  }
                >
                  {formatVnd(Number(values?.sellingPrice ?? 0) - preview.fullCost)}
                </Text>
              </Descriptions.Item>
            </Descriptions>
            <Form.Item name="note" label="Ghi chú" style={{ marginTop: 16 }}>
              <Input.TextArea rows={3} />
            </Form.Item>
          </section>
        </Form>
      </Drawer>
    </div>
  );
}
