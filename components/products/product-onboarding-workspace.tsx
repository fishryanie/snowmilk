"use client";

import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { calculateIngredientCostWithUnits } from "@/lib/calculations/costing";
import {
  calculateInlinePackagingUnitCost,
  calculateOnboardingProductCost,
  calculateSterilizationCost,
  DEFAULT_STERILIZATION_COST_PER_LITER,
} from "@/lib/calculations/product-onboarding";
import { calculateWeightedProductProfitEstimate } from "@/lib/calculations/product-profit-estimate";
import {
  calculatePreparationUsageCost,
  normalizedPreparationCostSource,
  type PreparationBatchType,
} from "@/lib/calculations/preparation-batch";
import type { ToppingRankingReport } from "@/lib/calculations/topping-ranking";
import { compatibleUnitOptions } from "@/lib/calculations/units";
import {
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import {
  DEFAULT_PRODUCT_GROUP,
  normalizeProductGroupName,
} from "@/lib/product-groups";
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

type PreparationBatch = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  batchType?: PreparationBatchType;
  outputQuantity?: number;
  outputUnit?: string;
  outputBaseQuantity?: number;
  outputBaseUnit?: string;
  costPerBaseUnit?: number;
  actualLiters?: number;
  costPerMl?: number;
  ingredients?: Array<{
    ingredientId?: string;
    ingredientName?: string;
  }>;
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

type ProductIngredientSnapshot = {
  source: "batch" | "ingredient";
  batchId?: string;
  ingredientId?: string;
  batchCode?: string;
  ingredientCode?: string;
  itemName?: string;
  batchName?: string;
  quantity: number;
  unit: string;
  costUnit?: string;
  unitCost: number;
  amount: number;
};

type ProductRecord = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  groupName?: string;
  productMode?: "legacy" | "recipe" | "composed";
  recipeCode?: string;
  recipeName?: string;
  milkBatchId?: string;
  milkBatchCode?: string;
  milkBatchName?: string;
  toppingName?: string;
  ingredientItems?: ProductIngredientSnapshot[];
  toppingItems?: ProductIngredientSnapshot[];
  sizeName?: string;
  milkMl?: number;
  sellingPrice: number;
  milkCost?: number;
  toppingCost?: number;
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
  groups: string[];
  batches: PreparationBatch[];
  ingredients: IngredientOption[];
  toppingRanking: ToppingRankingReport;
  costSettings: {
    overheadRate: number;
    allocatedFixedCost: number;
  };
};

type ProductIngredientLineForm = {
  itemKey?: string;
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
  groupName: string;
  sellingPrice: number;
  ingredientItems: ProductIngredientLineForm[];
  packagingItems: PackagingLineForm[];
  isActive: boolean;
  note?: string;
};

type QuickPreparedIngredientForm = {
  name: string;
  outputQuantity: number;
  outputUnit: "ml" | "lít" | "g" | "kg";
  cookingHours: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
    note?: string;
  }>;
  note?: string;
};

type QuickRawIngredientForm = {
  name: string;
  purchaseUnit: string;
  packageQuantity: number;
  costUnit: string;
  packageCount: number;
  totalAmount: number;
  supplier?: string;
  note?: string;
};

type IngredientCreatorMode = "raw" | "processed";

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? String(record._id ?? "");
}

function purchaseUnitName(purchaseUnit?: string) {
  return String(purchaseUnit ?? "").trim().toLocaleLowerCase("vi") || "đơn vị mua";
}

function preferredInputUnit(costUnit?: string) {
  const normalized = String(costUnit ?? "").trim().toLocaleLowerCase("vi");
  if (["kg", "kilogram", "g", "gram"].includes(normalized)) return "g";
  if (["l", "lit", "liter", "litre", "lít", "ml"].includes(normalized)) {
    return "ml";
  }
  return costUnit || "g";
}

function sterilizationCost(product: ProductRecord) {
  return calculateSterilizationCost(Number(product.milkMl ?? 0));
}

function productIngredientSummary(product: ProductRecord) {
  if (product.ingredientItems?.length) {
    return product.ingredientItems
      .flatMap((item) => {
        const name = item.itemName || item.batchName;
        return name ? [name] : [];
      })
      .join(", ");
  }
  return [product.milkBatchName, product.toppingName].filter(Boolean).join(", ");
}

const fallbackData: ProductOnboardingData = {
  products: workbookProducts as ProductRecord[],
  groups: [DEFAULT_PRODUCT_GROUP],
  batches: [],
  ingredients: workbookIngredients as IngredientOption[],
  toppingRanking: {
    asOfDate: "",
    updatedAt: "",
    totalKg: 0,
    purchaseCount: 0,
    excludedPurchaseCount: 0,
    excludedUnits: [],
    ranking: [],
  },
  costSettings: { overheadRate: 0.05, allocatedFixedCost: 0 },
};

type ProductCatalogCardProps = {
  product: ProductRecord;
  includeSterilizationCost: boolean;
  onEdit: (product: ProductRecord) => void;
  onDuplicate: (product: ProductRecord) => void;
  onRemove: (product: ProductRecord) => void;
};

function ProductCatalogCard({
  product,
  includeSterilizationCost,
  onEdit,
  onDuplicate,
  onRemove,
}: ProductCatalogCardProps) {
  const fullCost =
    Number(product.fullCost ?? 0) +
    (includeSterilizationCost ? sterilizationCost(product) : 0);
  const grossProfit = Number(product.sellingPrice ?? 0) - fullCost;
  const productIsNormalized = product.productMode === "composed";

  return (
    <Card className="product-catalog-card" size="small">
      <div className="product-catalog-heading">
        <div className="product-catalog-copy">
          <Text strong>{product.name}</Text>
          <Text type="secondary">{product.code}</Text>
        </div>
        <Space size={[4, 4]} wrap>
          <Tag color={product.isActive ? "green" : "default"}>
            {product.isActive ? "Đang bán" : "Ngừng bán"}
          </Tag>
          <Tag color={productIsNormalized ? "blue" : "warning"}>
            {productIsNormalized ? "Đã chuẩn hóa" : "Dữ liệu cũ"}
          </Tag>
          {product.hasCostWarning ? (
            <Tag color="error">Cần kiểm tra cost</Tag>
          ) : null}
        </Space>
      </div>

      <div className="product-catalog-formula">
        <Text type="secondary">Nguyên liệu &amp; topping</Text>
        <Text>
          {productIngredientSummary(product) || "Chưa chọn nguyên liệu"}
        </Text>
      </div>

      <dl className="product-catalog-metrics">
        <div>
          <dt>Giá bán</dt>
          <dd>{formatVnd(product.sellingPrice)}</dd>
        </div>
        <div>
          <dt>Full cost</dt>
          <dd>{formatVnd(fullCost)}</dd>
        </div>
        <div>
          <dt>Lãi gộp</dt>
          <dd className={grossProfit < 0 ? "is-negative" : "is-positive"}>
            {formatVnd(grossProfit)}
          </dd>
        </div>
      </dl>

      <Space className="product-catalog-actions" size={6} wrap>
        <Button
          type="primary"
          ghost
          icon={<EditOutlined />}
          onClick={() => onEdit(product)}
        >
          {productIsNormalized ? "Sửa" : "Chuẩn hóa"}
        </Button>
        <Button icon={<CopyOutlined />} onClick={() => onDuplicate(product)}>
          Nhân bản
        </Button>
        <Popconfirm
          title="Xóa sản phẩm?"
          description={`Sản phẩm “${product.name}” sẽ bị xóa khỏi danh mục.`}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={() => onRemove(product)}
        >
          <Button
            danger
            icon={<DeleteOutlined />}
            aria-label={`Xóa ${product.name}`}
          />
        </Popconfirm>
      </Space>
    </Card>
  );
}

export function ProductOnboardingWorkspace() {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProductForm>();
  const [preparedIngredientForm] = Form.useForm<QuickPreparedIngredientForm>();
  const [rawIngredientForm] = Form.useForm<QuickRawIngredientForm>();
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>();
  const [includeSterilizationCost, setIncludeSterilizationCost] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRecord | null>(null);
  const [duplicatingFrom, setDuplicatingFrom] =
    useState<ProductRecord | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparedIngredientCreatorOpen, setPreparedIngredientCreatorOpen] =
    useState(false);
  const [ingredientCreatorMode, setIngredientCreatorMode] =
    useState<IngredientCreatorMode | null>(null);
  const [openIngredientSelectIndex, setOpenIngredientSelectIndex] = useState<
    number | null
  >(null);
  const [savingPreparedIngredient, setSavingPreparedIngredient] = useState(false);
  const preparedIngredientTargetIndexRef = useRef<number | null>(null);
  const { data, loading, usingFallback, setData } =
    useApiData<ProductOnboardingData>("/api/product-onboarding", fallbackData);
  const values = Form.useWatch([], form);
  const preparedIngredientCreatorValues = Form.useWatch(
    [],
    preparedIngredientForm,
  );

  const ingredientsById = useMemo(
    () =>
      new Map(
        data.ingredients.map((ingredient) => [recordId(ingredient), ingredient]),
      ),
    [data.ingredients],
  );
  const batchesById = useMemo(
    () => new Map(data.batches.map((batch) => [recordId(batch), batch])),
    [data.batches],
  );
  const rawIngredientOptions = useMemo(
    () =>
      data.ingredients.filter(
        (ingredient) =>
          ["Nguyên liệu", "Topping"].includes(ingredient.category ?? "") &&
          ingredient.isActive,
      ),
    [data.ingredients],
  );
  const preparationIngredients = useMemo(
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
  const groupOptions = useMemo(
    () => {
      const groupNames = new Set(
        data.groups.map((groupName) => normalizeProductGroupName(groupName)),
      );
      for (const product of data.products) {
        groupNames.add(normalizeProductGroupName(product.groupName));
      }
      return Array.from(groupNames)
        .toSorted((left, right) => left.localeCompare(right, "vi"))
        .map((groupName) => ({ label: groupName, value: groupName }));
    },
    [data.groups, data.products],
  );

  const preview = useMemo(() => {
    let milkCost = 0;
    let toppingCost = 0;
    let costError = "";
    try {
      for (const line of values?.ingredientItems ?? []) {
        const [source, id] = String(line.itemKey ?? "").split(":");
        if (!id || !line.unit) continue;
        const quantity = Number(line.quantity ?? 0);
        if (source === "batch") {
          const batch = batchesById.get(id);
          if (!batch) continue;
          const amount = calculatePreparationUsageCost(batch, quantity, line.unit);
          if (batch.batchType === "milk_base" || !batch.batchType) milkCost += amount;
          else toppingCost += amount;
          continue;
        }
        const ingredient = ingredientsById.get(id);
        if (!ingredient?.costUnit) continue;
        toppingCost += calculateIngredientCostWithUnits({
          quantity,
          quantityUnit: line.unit,
          unitCost: Number(ingredient.averageUnitCost ?? 0),
          costUnit: ingredient.costUnit,
        });
      }
    } catch (error) {
      costError = error instanceof Error ? error.message : "Không thể tính giá vốn";
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
      milkCost,
      toppingCost,
      packagingCost,
      costError,
      allocatedFixedCost: data.costSettings.allocatedFixedCost,
      ...calculateOnboardingProductCost({
        milkCost,
        toppingCost,
        packagingCost,
        ...data.costSettings,
      }),
    };
  }, [batchesById, data.costSettings, ingredientsById, values]);

  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleProducts = useMemo(
    () =>
      data.products.filter((product) => {
        if (
          groupFilter &&
          normalizeProductGroupName(product.groupName) !== groupFilter
        ) {
          return false;
        }
        return normalizedQuery
          ? [
              product.code,
              product.name,
              normalizeProductGroupName(product.groupName),
              product.milkBatchName,
              product.toppingName,
              product.sizeName,
              ...(product.ingredientItems ?? []).map(
                (item) => item.itemName || item.batchName,
              ),
            ].some((value) =>
              String(value ?? "")
                .toLocaleLowerCase("vi")
                .includes(normalizedQuery),
            )
          : true;
      }),
    [data.products, groupFilter, normalizedQuery],
  );
  const visibleProductGroups = useMemo(() => {
    const groups = new Map<string, ProductRecord[]>();
    for (const product of visibleProducts) {
      const groupName = normalizeProductGroupName(product.groupName);
      const groupProducts = groups.get(groupName) ?? [];
      groupProducts.push(product);
      groups.set(groupName, groupProducts);
    }
    return [...groups]
      .map(([name, products]) => ({
        name,
        products: products.toSorted((left, right) =>
          left.name.localeCompare(right.name, "vi"),
        ),
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name, "vi"));
  }, [visibleProducts]);
  const legacyCount = data.products.filter(
    (product) => product.productMode !== "composed",
  ).length;
  const profitEstimate = useMemo(
    () =>
      calculateWeightedProductProfitEstimate({
        products: data.products.map((product) => ({
          ...product,
          ingredientItems: (product.ingredientItems ?? []).flatMap((item) => {
            if (item.source !== "batch" || !item.batchId) return [item];
            const batch = batchesById.get(String(item.batchId));
            return [
              item,
              ...(batch?.ingredients ?? []).map((batchIngredient) => {
                const ingredient = ingredientsById.get(
                  String(batchIngredient.ingredientId ?? ""),
                );
                return {
                  ingredientCode: ingredient?.code,
                  itemName:
                    batchIngredient.ingredientName || ingredient?.name || "",
                };
              }),
            ];
          }),
          fullCost:
            Number(product.fullCost ?? 0) +
            (includeSterilizationCost ? sterilizationCost(product) : 0),
        })),
        toppingRanking: data.toppingRanking.ranking,
      }),
    [
      batchesById,
      data.products,
      data.toppingRanking.ranking,
      includeSterilizationCost,
      ingredientsById,
    ],
  );

  function openEditor(
    product?: ProductRecord,
    mode: "edit" | "duplicate" = "edit",
  ) {
    const isDuplicate = mode === "duplicate";
    setEditing(isDuplicate ? null : product ?? null);
    setDuplicatingFrom(isDuplicate ? product ?? null : null);
    const savedIngredientItems = product?.ingredientItems?.length
      ? product.ingredientItems.map((item) => ({
          itemKey:
            item.source === "ingredient"
              ? `ingredient:${String(item.ingredientId ?? "")}`
              : `batch:${String(item.batchId ?? "")}`,
          quantity: item.quantity,
          unit: item.unit,
        }))
      : [
          ...(product?.milkBatchId
            ? [
                {
                  itemKey: `batch:${String(product.milkBatchId)}`,
                  quantity: Number(product.milkMl ?? 0),
                  unit: "ml",
                },
              ]
            : []),
          ...(product?.toppingItems ?? []).flatMap((item) => {
            const id = item.source === "ingredient" ? item.ingredientId : item.batchId;
            return id
              ? [
                  {
                    itemKey: `${item.source || "batch"}:${String(id)}`,
                    quantity: item.quantity,
                    unit: item.unit || "g",
                  },
                ]
              : [];
          }),
        ];
    form.setFieldsValue(
      product
        ? {
            name: product.name,
            groupName: normalizeProductGroupName(product.groupName),
            sellingPrice: product.sellingPrice,
            ingredientItems: savedIngredientItems.length
              ? savedIngredientItems
              : [{ quantity: 1, unit: "g" }],
            packagingItems: product.packagingItems?.length
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
            groupName: DEFAULT_PRODUCT_GROUP,
            ingredientItems: [{ quantity: 1, unit: "g" }],
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
    setDuplicatingFrom(null);
    form.resetFields();
  }

  async function refreshData() {
    const response = await fetch("/api/product-onboarding", { cache: "no-store" });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(
        errorBody?.message || `Không thể tải dữ liệu (${response.status})`,
      );
    }
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data?: ProductOnboardingData;
    };
    if (!body.success || !body.data) throw new Error(body.message);
    setData(body.data);
    return body.data;
  }

  function openIngredientCreator(targetIndex: number) {
    rawIngredientForm.resetFields();
    rawIngredientForm.setFieldsValue({
      packageQuantity: 1,
      packageCount: 1,
    });
    preparedIngredientForm.resetFields();
    preparedIngredientForm.setFieldsValue({
      name: "",
      outputQuantity: 100,
      outputUnit: "g",
      cookingHours: 0,
      ingredients: [
        {
          quantity: 100,
          unit: "g",
        },
      ],
      note: "Tạo nhanh khi thêm sản phẩm",
    });
    setIngredientCreatorMode(null);
    preparedIngredientTargetIndexRef.current = targetIndex;
    setPreparedIngredientCreatorOpen(true);
  }

  function closeIngredientCreator() {
    setPreparedIngredientCreatorOpen(false);
    setIngredientCreatorMode(null);
    preparedIngredientTargetIndexRef.current = null;
    rawIngredientForm.resetFields();
    preparedIngredientForm.resetFields();
  }

  function selectCreatedIngredient(
    itemKey: string,
    quantity: number,
    unit: string,
  ) {
    const targetIndex = preparedIngredientTargetIndexRef.current;
    if (targetIndex === null) return;
    const currentItems = (form.getFieldValue("ingredientItems") ??
      []) as ProductIngredientLineForm[];
    const nextItems = [...currentItems];
    nextItems[targetIndex] = { itemKey, quantity, unit };
    form.setFieldValue("ingredientItems", nextItems);
  }

  async function saveRawIngredient(rawValues: QuickRawIngredientForm) {
    setSavingPreparedIngredient(true);
    try {
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "new",
          purchaseDate: new Date().toISOString(),
          itemName: rawValues.name,
          category: "Nguyên liệu",
          purchaseUnit: rawValues.purchaseUnit,
          packageQuantity: rawValues.packageQuantity,
          costUnit: rawValues.costUnit,
          packageCount: rawValues.packageCount,
          totalAmount: rawValues.totalAmount,
          supplier: rawValues.supplier ?? "",
          note: rawValues.note ?? "Tạo nhanh khi thêm sản phẩm",
          saveToCatalog: true,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          errorBody?.message || `Không thể tạo nguyên liệu (${response.status})`,
        );
      }
      const body = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: { ingredientId?: string };
      };
      const ingredientId = String(body.data?.ingredientId ?? "");
      if (!body.success || !ingredientId) {
        throw new Error(body.message || "Không thể tạo nguyên liệu");
      }
      const refreshed = await refreshData();
      const createdIngredient = refreshed.ingredients.find(
        (ingredient) => recordId(ingredient) === ingredientId,
      );
      selectCreatedIngredient(
        `ingredient:${ingredientId}`,
        1,
        preferredInputUnit(createdIngredient?.costUnit || rawValues.costUnit),
      );
      message.success(`Đã tạo và chọn nguyên liệu “${rawValues.name}”`);
      closeIngredientCreator();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể tạo nguyên liệu",
      );
    } finally {
      setSavingPreparedIngredient(false);
    }
  }

  async function savePreparedIngredient(
    preparedValues: QuickPreparedIngredientForm,
  ) {
    setSavingPreparedIngredient(true);
    try {
      const batchType: PreparationBatchType = ["ml", "lít"].includes(
        preparedValues.outputUnit,
      )
        ? "milk_base"
        : "topping";
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...preparedValues,
          batchType,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          errorBody?.message ||
            `Không thể tạo nguyên liệu đã nấu (${response.status})`,
        );
      }
      const body = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: PreparationBatch;
      };
      if (!body.success || !body.data) {
        throw new Error(body.message || "Không thể tạo nguyên liệu đã nấu");
      }

      const createdBatch = body.data;
      const createdBatchId = recordId(createdBatch);
      setData((current) => ({
        ...current,
        batches: [createdBatch, ...current.batches],
      }));

      const usageUnit = batchType === "milk_base" ? "ml" : "g";
      selectCreatedIngredient(
        `batch:${createdBatchId}`,
        batchType === "milk_base" ? 350 : 10,
        usageUnit,
      );

      message.success(`Đã tạo và chọn nguyên liệu “${createdBatch.name}”`);
      closeIngredientCreator();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không thể tạo nguyên liệu đã nấu",
      );
    } finally {
      setSavingPreparedIngredient(false);
    }
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
            groupName: normalizeProductGroupName(product.groupName),
            productMode: product.productMode,
            recipeCode: product.milkBatchCode ?? product.recipeCode,
            recipeName: product.milkBatchName ?? product.recipeName,
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
            groupName: formValues.groupName,
            sellingPrice: formValues.sellingPrice,
            ingredientItems: (formValues.ingredientItems ?? []).map((item) => {
              const [source, id] = String(item.itemKey ?? "").split(":");
              return {
                source,
                ...(source === "batch"
                  ? { batchId: id }
                  : { ingredientId: id }),
                quantity: item.quantity,
                unit: item.unit,
              };
            }),
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
        throw new Error(
          errorBody?.message || `Không thể lưu sản phẩm (${response.status})`,
        );
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
        throw new Error(
          errorBody?.message || `Không thể xóa sản phẩm (${response.status})`,
        );
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
        description="Khi thêm sản phẩm, chỉ cần chọn nguyên liệu & topping và bao bì. Nguyên liệu mới có thể được nấu ngay trong biểu mẫu."
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
          description="Dữ liệu cũ vẫn được giữ. Khi bấm Sửa, hãy chọn lại nguyên liệu & topping và bao bì để chuyển sang cấu trúc mới."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card className="surface-card product-profit-estimate-card">
        <div className="product-profit-estimate-heading">
          <div>
            <Text strong>Ước tính vốn và lãi trung bình</Text>
            <Text type="secondary">
              Topping nhập nhiều hơn được tính với trọng số cao hơn.
            </Text>
          </div>
          <Space size={8}>
            <Tag color="cyan">Theo lượng topping nhập</Tag>
            <Tooltip title="Mỗi topping được gán trọng số theo tổng kg đã nhập, kể cả khi nguyên liệu đi qua mẻ chuẩn bị. Nếu một topping có nhiều size, trọng số được chia đều cho các size rồi mới tính tổng cost / tổng giá bán.">
              <InfoCircleOutlined aria-label="Giải thích cách tính trung bình" />
            </Tooltip>
          </Space>
        </div>

        {profitEstimate ? (
          <>
            <div className="product-profit-estimate-grid">
              <div className="product-profit-estimate-metric is-cost">
                <Text type="secondary">Vốn trung bình</Text>
                <strong>{formatNumber(profitEstimate.costPercent)}%</strong>
                <Text type="secondary">
                  {formatVnd(profitEstimate.averageFullCost)} / {formatVnd(profitEstimate.averageSellingPrice)} doanh thu
                </Text>
              </div>
              <div className="product-profit-estimate-metric is-profit">
                <Text type="secondary">Lãi gộp ước tính</Text>
                <strong>{formatNumber(profitEstimate.grossMarginPercent)}%</strong>
                <Text type="secondary">
                  Khoảng {formatVnd(profitEstimate.averageGrossProfit)}/sản phẩm
                </Text>
              </div>
              <div className="product-profit-estimate-metric is-coverage">
                <Text type="secondary">Độ phủ dữ liệu nhập</Text>
                <strong>{formatNumber(profitEstimate.purchaseCoveragePercent)}%</strong>
                <Text type="secondary">
                  {formatNumber(profitEstimate.matchedPurchaseKg)} / {formatNumber(profitEstimate.totalPurchaseKg)} kg · {profitEstimate.matchedProductCount} sản phẩm
                </Text>
              </div>
            </div>
            <Text className="product-profit-estimate-note" type="secondary">
              Đây là lãi gộp ước tính từ full cost, chưa phải lãi ròng thực tế. Kết quả sẽ sát hơn khi lượng nhập topping phản ánh đúng tỷ lệ món bán ra.
              {includeSterilizationCost ? " Đã cộng phí tiệt trùng vào cost." : ""}
            </Text>
            {profitEstimate.unmatchedToppingNames.length > 0 ? (
              <Alert
                type="info"
                showIcon
                title={`${profitEstimate.unmatchedToppingNames.length} topping đã nhập chưa khớp sản phẩm`}
                description={profitEstimate.unmatchedToppingNames.join(", ")}
              />
            ) : null}
          </>
        ) : (
          <Alert
            type="info"
            showIcon
            title="Chưa đủ dữ liệu để ước tính theo trọng số"
            description="Cần có ít nhất một lần nhập topping theo kg/g và một sản phẩm dùng đúng topping đó."
          />
        )}
      </Card>

      <Card className="surface-card table-card">
        <div className="table-toolbar">
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm mã, tên, nhóm, nguyên liệu hoặc topping…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ width: 340 }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Lọc theo nhóm"
              value={groupFilter}
              options={groupOptions}
              onChange={setGroupFilter}
              style={{ minWidth: 190 }}
            />
          </Space>
          <Space size={16} wrap className="product-toolbar-actions">
            <Checkbox
              checked={includeSterilizationCost}
              onChange={(event) =>
                setIncludeSterilizationCost(event.target.checked)
              }
            >
              Phí tiệt trùng ({formatVnd(DEFAULT_STERILIZATION_COST_PER_LITER)}/lít)
            </Checkbox>
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              onClick={exportProductsPdf}
            >
              Xuất PDF
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openEditor()}
            >
              Thêm sản phẩm
            </Button>
          </Space>
        </div>
        {visibleProductGroups.length === 0 ? (
          <Empty
            className="product-catalog-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Không có sản phẩm phù hợp"
          />
        ) : (
          <div className="product-group-list">
            {visibleProductGroups.map((group, groupIndex) => {
              const headingId = `product-group-${groupIndex}`;
              return (
                <section
                  className="product-group-section"
                  aria-labelledby={headingId}
                  key={group.name}
                >
                  <div className="product-group-heading">
                    <div>
                      <Text id={headingId} strong>
                        {group.name}
                      </Text>
                      <Text type="secondary">
                        Sản phẩm trong cùng nhóm được chốt và thống kê chung.
                      </Text>
                    </div>
                    <Tag color="blue">{group.products.length} sản phẩm</Tag>
                  </div>
                  <div className="product-card-grid">
                    {group.products.map((product) => (
                      <ProductCatalogCard
                        key={recordId(product) || product.code}
                        product={product}
                        includeSterilizationCost={includeSterilizationCost}
                        onEdit={openEditor}
                        onDuplicate={(record) =>
                          openEditor(record, "duplicate")
                        }
                        onRemove={removeProduct}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Card>

      <Drawer
        className="product-onboarding-drawer"
        open={drawerOpen}
        title={
          editing
            ? "Chỉnh sửa sản phẩm"
            : duplicatingFrom
              ? "Nhân bản sản phẩm"
              : "Thêm sản phẩm"
        }
        placement="right"
        size="large"
        onClose={closeEditor}
        destroyOnHidden
        footer={
          <div className="product-onboarding-footer">
            <Text type="secondary">
              Full cost dự kiến: <strong>{formatVnd(preview.fullCost)}</strong>
            </Text>
            <Space>
              <Button onClick={closeEditor}>Hủy</Button>
              <Button type="primary" loading={saving} onClick={() => form.submit()}>
                {duplicatingFrom ? "Tạo bản sao" : "Lưu sản phẩm"}
              </Button>
            </Space>
          </div>
        }
      >
        {duplicatingFrom ? (
          <Alert
            type="info"
            showIcon
            title={`Đang nhân bản “${duplicatingFrom.name}”`}
            description="Toàn bộ nhóm, nguyên liệu, bao bì, giá bán và ghi chú đã được sao chép. Hãy chỉnh lại phần cần thay đổi rồi tạo bản sao."
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {editing && editing.productMode !== "composed" ? (
          <Alert
            type="warning"
            showIcon
            title="Sản phẩm này dùng cấu trúc cũ. Hãy chọn lại nguyên liệu, topping và bao bì để chuẩn hóa."
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form<ProductForm>
          form={form}
          layout="vertical"
          onFinish={saveProduct}
        >
          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>1</span>
              <div>
                <Text strong>Thông tin sản phẩm</Text>
                <Text type="secondary">Tên, nhóm thống kê, giá bán và trạng thái của sản phẩm.</Text>
              </div>
            </div>
            <div className="purchase-form-grid product-info-grid">
              <Form.Item
                name="name"
                label="Tên sản phẩm"
                rules={[{ required: true, message: "Nhập tên sản phẩm" }]}
              >
                <Input placeholder="Ví dụ: Tuyết Trân Châu - M" />
              </Form.Item>
              <Form.Item
                name="groupName"
                label="Nhóm sản phẩm"
                rules={[
                  { required: true, message: "Nhập nhóm sản phẩm" },
                  { max: 80, message: "Tên nhóm tối đa 80 ký tự" },
                ]}
                extra="Nhóm mới được lưu vào danh mục sau khi lưu sản phẩm và sẽ xuất hiện để chọn nhanh lần sau."
              >
                <AutoComplete
                  options={groupOptions}
                  placeholder="Ví dụ: Bánh mì, Đồ ăn vặt"
                  filterOption={(inputValue, option) =>
                    String(option?.value ?? "")
                      .toLocaleLowerCase("vi")
                      .includes(inputValue.toLocaleLowerCase("vi"))
                  }
                />
              </Form.Item>
              <Form.Item
                name="sellingPrice"
                label="Giá bán"
                rules={[{ required: true, message: "Nhập giá bán" }]}
              >
                <InputNumber
                  min={0}
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
                <Text strong>Nguyên liệu &amp; topping</Text>
                <Text type="secondary">
                  Nguyên liệu thô, topping khô và nguyên liệu chế biến nằm chung một danh sách.
                </Text>
              </div>
            </div>
            <Form.List
              name="ingredientItems"
              rules={[
                {
                  validator: async (_, items) => {
                    if (!items?.length) {
                      throw new Error("Sản phẩm cần ít nhất một nguyên liệu hoặc topping");
                    }
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                  {fields.map((field) => {
                    const line = values?.ingredientItems?.[field.name];
                    const [source, selectedId] = String(line?.itemKey ?? "").split(":");
                    const selectedBatch =
                      source === "batch" ? batchesById.get(selectedId) : undefined;
                    const selectedIngredient =
                      source === "ingredient"
                        ? ingredientsById.get(selectedId)
                        : undefined;
                    const sourceUnit = selectedBatch
                      ? normalizedPreparationCostSource(selectedBatch).outputBaseUnit
                      : selectedIngredient?.costUnit || "g";
                    return (
                    <div className="product-recipe-row" key={field.key}>
                      <Form.Item
                        name={[field.name, "itemKey"]}
                        rules={[{ required: true, message: "Chọn nguyên liệu" }]}
                      >
                        <Select
                          showSearch
                          open={openIngredientSelectIndex === field.name}
                          onOpenChange={(open) =>
                            setOpenIngredientSelectIndex(open ? field.name : null)
                          }
                          optionFilterProp="label"
                          placeholder="Chọn nguyên liệu hoặc topping"
                          options={[
                            {
                              label: "Nguyên liệu chế biến",
                              options: data.batches.map((batch) => {
                                const normalized =
                                  normalizedPreparationCostSource(batch);
                                return {
                                  value: `batch:${recordId(batch)}`,
                                  label: `${batch.name} · ${batch.code} · ${formatVnd(normalized.costPerBaseUnit)}/${normalized.outputBaseUnit}`,
                                };
                              }),
                            },
                            {
                              label: "Nguyên liệu thô & topping khô",
                              options: rawIngredientOptions.map((ingredient) => ({
                                value: `ingredient:${recordId(ingredient)}`,
                                label: `${ingredient.name} · ${ingredient.code} · ${formatVnd(Number(ingredient.averageUnitCost ?? 0))}/${ingredient.costUnit || "đơn vị"}`,
                              })),
                            },
                          ]}
                          popupRender={(menu) => (
                            <>
                              {menu}
                              <div
                                className="product-ingredient-select-footer"
                                onMouseDown={(event) => event.preventDefault()}
                              >
                                <Button
                                  type="text"
                                  block
                                  icon={<PlusOutlined />}
                                  onClick={() => {
                                    setOpenIngredientSelectIndex(null);
                                    openIngredientCreator(field.name);
                                  }}
                                >
                                  Thêm mới
                                </Button>
                              </div>
                            </>
                          )}
                          onChange={(selectedValue: string) => {
                            const [selectedSource, id] = selectedValue.split(":");
                            const unit =
                              selectedSource === "batch"
                                ? normalizedPreparationCostSource(
                                    batchesById.get(id) ?? {},
                                  ).outputBaseUnit
                                : ingredientsById.get(id)?.costUnit || "g";
                            form.setFieldValue(
                              ["ingredientItems", field.name, "unit"],
                              preferredInputUnit(unit),
                            );
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "quantity"]}
                        rules={[{ required: true, message: "Nhập lượng dùng" }]}
                      >
                        <InputNumber min={0.001} placeholder="Lượng/ly" style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item name={[field.name, "unit"]}>
                        <Select
                          placeholder="Đơn vị"
                          options={compatibleUnitOptions(sourceUnit)}
                        />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        disabled={fields.length === 1}
                        icon={<MinusCircleOutlined />}
                        aria-label="Xóa nguyên liệu"
                        onClick={() => remove(field.name)}
                      />
                    </div>
                  );})}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => add({ quantity: 1, unit: "g" })}
                  >
                    Thêm nguyên liệu hoặc topping
                  </Button>
                  <Form.ErrorList errors={errors} />
                </Space>
              )}
            </Form.List>
          </section>

          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>3</span>
              <div>
                <Text strong>Bao bì</Text>
                <Text type="secondary">Ly, nắp, tem, túi dùng cho một sản phẩm.</Text>
              </div>
            </div>
            <Form.List name="packagingItems">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                  {fields.map((field) => {
                    const line = values?.packagingItems?.[field.name];
                    const ingredient = ingredientsById.get(
                      String(line?.ingredientId ?? ""),
                    );
                    const needsOpeningPurchase =
                      line?.source === "existing" &&
                      Boolean(ingredient) &&
                      Number(ingredient?.averageUnitCost ?? 0) <= 0;
                    return (
                      <div className="product-packaging-row-group" key={field.key}>
                        <Form.Item name={[field.name, "source"]} hidden>
                          <Input />
                        </Form.Item>
                        {line?.source === "new" ? (
                          <Card
                            size="small"
                            title="Tạo và nhập kho bao bì mới"
                            extra={
                              <Space size={4}>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() =>
                                    form.setFieldValue(
                                      ["packagingItems", field.name],
                                      {
                                        source: "existing",
                                        quantity: Number(line?.quantity ?? 1),
                                        openingPackageCount: 1,
                                      },
                                    )
                                  }
                                >
                                  Chọn có sẵn
                                </Button>
                                {fields.length > 1 ? (
                                  <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    aria-label="Xóa bao bì"
                                    onClick={() => remove(field.name)}
                                  />
                                ) : null}
                              </Space>
                            }
                            className="product-packaging-card"
                          >
                            <div className="product-packaging-grid">
                              <Form.Item
                                name={[field.name, "name"]}
                                label="Tên bao bì"
                                rules={[{ required: true, message: "Nhập tên bao bì" }]}
                              >
                                <Input placeholder="Ví dụ: Ly nhựa 500 ml" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "purchaseUnit"]}
                                label="Mua theo"
                                rules={[{ required: true, message: "Nhập cách mua" }]}
                              >
                                <Input placeholder="Ví dụ: lốc, thùng" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "packageQuantity"]}
                                label="Số cái trong 1 lốc/thùng"
                                rules={[{ required: true, message: "Nhập số lượng" }]}
                              >
                                <InputNumber min={1} style={{ width: "100%" }} />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "costUnit"]}
                                label="Đơn vị dùng"
                                rules={[{ required: true, message: "Nhập đơn vị" }]}
                              >
                                <Input placeholder="Ví dụ: cái" />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "packagePrice"]}
                                label="Giá 1 lốc/thùng"
                                rules={[{ required: true, message: "Nhập giá mua" }]}
                              >
                                <InputNumber
                                  min={1}
                                  formatter={formatVndInput}
                                  parser={parseVndInput}
                                  style={{ width: "100%" }}
                                />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "packageCount"]}
                                label="Số lốc/thùng nhập kho"
                                rules={[{ required: true, message: "Nhập số lượng" }]}
                              >
                                <InputNumber min={1} style={{ width: "100%" }} />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "supplier"]}
                                label="Nhà cung cấp"
                              >
                                <Input />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "quantity"]}
                                label="Số lượng dùng cho 1 sản phẩm"
                                rules={[{ required: true, message: "Nhập lượng dùng" }]}
                              >
                                <InputNumber min={0.001} style={{ width: "100%" }} />
                              </Form.Item>
                            </div>
                          </Card>
                        ) : (
                          <>
                            <div className="product-recipe-row">
                              <Form.Item
                                name={[field.name, "ingredientId"]}
                                rules={[{ required: true, message: "Chọn bao bì" }]}
                              >
                                <Select
                                  showSearch
                                  optionFilterProp="label"
                                  placeholder="Chọn chai, ly, nắp, tem…"
                                  options={packagingOptions.map((item) => ({
                                    value: recordId(item),
                                    label: `${item.name} · ${item.code} · ${formatVnd(Number(item.averageUnitCost ?? 0))}/${item.costUnit || "đơn vị"}`,
                                  }))}
                                  popupRender={(menu) => (
                                    <>
                                      {menu}
                                      <div
                                        className="product-ingredient-select-footer"
                                        onMouseDown={(event) => event.preventDefault()}
                                      >
                                        <Button
                                          type="text"
                                          block
                                          icon={<PlusOutlined />}
                                          onClick={() =>
                                            form.setFieldValue(
                                              ["packagingItems", field.name],
                                              {
                                                source: "new",
                                                quantity: Number(line?.quantity ?? 1),
                                                packageQuantity: 1,
                                                costUnit: "cái",
                                                packageCount: 1,
                                              },
                                            )
                                          }
                                        >
                                          Tạo và nhập kho bao bì mới
                                        </Button>
                                      </div>
                                    </>
                                  )}
                                />
                              </Form.Item>
                              <Form.Item
                                name={[field.name, "quantity"]}
                                rules={[{ required: true, message: "Nhập lượng dùng" }]}
                              >
                                <InputNumber
                                  min={0.001}
                                  placeholder="Số lượng/SP"
                                  style={{ width: "100%" }}
                                />
                              </Form.Item>
                              <Form.Item>
                                <Input
                                  value={ingredient?.costUnit || "cái"}
                                  aria-label="Đơn vị bao bì"
                                  readOnly
                                />
                              </Form.Item>
                              <Button
                                type="text"
                                danger
                                disabled={fields.length === 1}
                                icon={<MinusCircleOutlined />}
                                aria-label="Xóa bao bì"
                                onClick={() => remove(field.name)}
                              />
                            </div>
                            {needsOpeningPurchase ? (
                              <Alert
                                type="warning"
                                showIcon
                                title={`${ingredient?.name} chưa có giá vốn. Nhập giá ${purchaseUnitName(ingredient?.purchaseUnit)} đầu tiên:`}
                                description={
                                  <div className="product-packaging-grid">
                                    <Form.Item
                                      name={[field.name, "openingPackagePrice"]}
                                      label={`Giá 1 ${purchaseUnitName(ingredient?.purchaseUnit)}`}
                                      rules={[{ required: true, message: "Nhập giá mua" }]}
                                    >
                                      <InputNumber
                                        min={1}
                                        formatter={formatVndInput}
                                        parser={parseVndInput}
                                        style={{ width: "100%" }}
                                      />
                                    </Form.Item>
                                    <Form.Item
                                      name={[field.name, "openingPackageCount"]}
                                      label={`Số ${purchaseUnitName(ingredient?.purchaseUnit)} nhập`}
                                      rules={[{ required: true, message: "Nhập số lượng" }]}
                                    >
                                      <InputNumber min={1} style={{ width: "100%" }} />
                                    </Form.Item>
                                    <Form.Item
                                      name={[field.name, "openingSupplier"]}
                                      label="Nhà cung cấp"
                                    >
                                      <Input />
                                    </Form.Item>
                                  </div>
                                }
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    block
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({
                        source: "existing",
                        quantity: 1,
                        openingPackageCount: 1,
                      })
                    }
                  >
                    Thêm bao bì
                  </Button>
                </Space>
              )}
            </Form.List>
          </section>

          <section className="product-onboarding-section">
            <div className="product-onboarding-section-title">
              <span>4</span>
              <div>
                <Text strong>Giá vốn dự kiến</Text>
                <Text type="secondary">Tổng hợp từ hai mục đã chọn ở trên.</Text>
              </div>
            </div>
            {preview.costError ? (
              <Alert
                type="error"
                showIcon
                title={preview.costError}
                style={{ marginBottom: 12 }}
              />
            ) : null}
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Nguyên liệu & topping">
                {formatVnd(preview.milkCost + preview.toppingCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Bao bì">
                {formatVnd(preview.packagingCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Chi phí biến đổi">
                {formatVnd(preview.overheadCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Phân bổ cố định">
                {formatVnd(preview.allocatedFixedCost)}
              </Descriptions.Item>
              <Descriptions.Item label="Full cost">
                <Text strong>{formatVnd(preview.fullCost)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Lãi gộp dự kiến">
                <Text
                  type={
                    Number(values?.sellingPrice ?? 0) - preview.fullCost < 0
                      ? "danger"
                      : "success"
                  }
                  strong
                >
                  {formatVnd(
                    Number(values?.sellingPrice ?? 0) - preview.fullCost,
                  )}
                </Text>
              </Descriptions.Item>
            </Descriptions>
            <Form.Item name="note" label="Ghi chú" style={{ marginTop: 16 }}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </section>
        </Form>
      </Drawer>

      <Modal
        open={preparedIngredientCreatorOpen}
        title="Thêm nguyên liệu"
        className="ingredient-creator-modal"
        width={880}
        zIndex={1200}
        okText={
          ingredientCreatorMode === "raw"
            ? "Nhập hàng và chọn"
            : "Lưu và chọn nguyên liệu"
        }
        cancelText="Hủy"
        confirmLoading={savingPreparedIngredient}
        okButtonProps={{ disabled: ingredientCreatorMode === null }}
        onCancel={closeIngredientCreator}
        onOk={() => {
          if (ingredientCreatorMode === "raw") rawIngredientForm.submit();
          if (ingredientCreatorMode === "processed") {
            preparedIngredientForm.submit();
          }
        }}
        forceRender
      >
        <div
          className="ingredient-creator-choices"
          role="radiogroup"
          aria-label="Chọn loại nguyên liệu cần thêm"
        >
          <Card
            hoverable
            role="radio"
            aria-checked={ingredientCreatorMode === "raw"}
            tabIndex={0}
            className={`ingredient-creator-choice ${
              ingredientCreatorMode === "raw" ? "is-selected" : ""
            }`}
            onClick={() => setIngredientCreatorMode("raw")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIngredientCreatorMode("raw");
              }
            }}
          >
            <Text strong>Nguyên liệu thô</Text>
            <Text type="secondary">
              Tạo hàng hóa mới và ghi nhận lần nhập kho đầu tiên.
            </Text>
          </Card>
          <Card
            hoverable
            role="radio"
            aria-checked={ingredientCreatorMode === "processed"}
            tabIndex={0}
            className={`ingredient-creator-choice ${
              ingredientCreatorMode === "processed" ? "is-selected" : ""
            }`}
            onClick={() => setIngredientCreatorMode("processed")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIngredientCreatorMode("processed");
              }
            }}
          >
            <Text strong>Nguyên liệu chế biến</Text>
            <Text type="secondary">
              Gom nguyên liệu thô thành một nguyên liệu sau chế biến.
            </Text>
          </Card>
        </div>

        {ingredientCreatorMode === null ? (
          <Alert
            type="info"
            showIcon
            title="Chọn một loại nguyên liệu để tiếp tục"
            description="Form tương ứng sẽ hiện ngay bên dưới. Dữ liệu sản phẩm đang nhập vẫn được giữ nguyên."
          />
        ) : null}

        <Form<QuickRawIngredientForm>
          form={rawIngredientForm}
          layout="vertical"
          onFinish={saveRawIngredient}
          className="ingredient-creator-form"
          style={{
            display: ingredientCreatorMode === "raw" ? "grid" : "none",
          }}
        >
          <Alert
            className="ingredient-creator-callout"
            type="info"
            showIcon
            title="Nguyên liệu thô sẽ được nhập kho ngay"
            description="Giá vốn được tính từ tổng tiền và quy cách của lần nhập đầu tiên."
          />
          <section className="ingredient-form-section">
            <div className="ingredient-form-section-heading">
              <div>
                <Text strong>Thông tin nhập kho</Text>
                <Text type="secondary">
                  Khai báo quy cách và giá của lần nhập đầu tiên.
                </Text>
              </div>
            </div>
            <div className="purchase-form-grid">
                <Form.Item
                  name="name"
                  label="Tên nguyên liệu"
                  rules={[{ required: true, message: "Nhập tên nguyên liệu" }]}
                >
                  <Input placeholder="Ví dụ: Dâu sấy, bột cacao" />
                </Form.Item>
                <Form.Item
                  name="purchaseUnit"
                  label="Mua theo"
                  rules={[{ required: true, message: "Nhập đơn vị mua" }]}
                >
                  <Input placeholder="Ví dụ: gói, túi, thùng" />
                </Form.Item>
                <Form.Item
                  name="packageQuantity"
                  label="Số lượng trong một gói/túi"
                  rules={[{ required: true, message: "Nhập quy cách" }]}
                >
                  <InputNumber min={0.001} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item
                  name="costUnit"
                  label="Đơn vị sử dụng"
                  rules={[{ required: true, message: "Nhập đơn vị sử dụng" }]}
                >
                  <Input placeholder="Ví dụ: g, ml, cái" />
                </Form.Item>
                <Form.Item
                  name="packageCount"
                  label="Số gói/túi nhập"
                  rules={[{ required: true, message: "Nhập số lượng" }]}
                >
                  <InputNumber min={0.001} style={{ width: "100%" }} />
                </Form.Item>
                <Form.Item
                  name="totalAmount"
                  label="Tổng tiền nhập"
                  rules={[{ required: true, message: "Nhập tổng tiền" }]}
                >
                  <InputNumber
                    min={0}
                    formatter={formatVndInput}
                    parser={parseVndInput}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                <Form.Item name="supplier" label="Nhà cung cấp">
                  <Input placeholder="Có thể để trống" />
                </Form.Item>
                <Form.Item name="note" label="Ghi chú">
                  <Input placeholder="Có thể để trống" />
                </Form.Item>
            </div>
          </section>
        </Form>

        <div
          className="ingredient-creator-panel"
          style={{
            display:
              ingredientCreatorMode === "processed" ? "grid" : "none",
          }}
        >
          <Alert
            className="ingredient-creator-callout"
            type="info"
            showIcon
            title="Tạo nguyên liệu sau chế biến"
            description="Chọn nguyên liệu thô cần gom, khai báo lượng dùng và sản lượng thu được. Lưu xong, nguyên liệu mới sẽ tự được chọn cho sản phẩm."
          />
          <Form<QuickPreparedIngredientForm>
            form={preparedIngredientForm}
            layout="vertical"
            onFinish={savePreparedIngredient}
            className="ingredient-creator-form"
          >
          <section className="ingredient-form-section">
            <div className="ingredient-form-section-heading">
              <div>
                <Text strong>Thông tin thành phẩm</Text>
                <Text type="secondary">
                  Đặt tên, sản lượng thu được và thời gian chế biến.
                </Text>
              </div>
            </div>
            <div className="purchase-form-grid">
              <Form.Item
                name="name"
                label="Tên nguyên liệu sau khi nấu"
                rules={[{ required: true, message: "Nhập tên nguyên liệu" }]}
              >
                <Input placeholder="Ví dụ: Nền sữa tuyết, trân châu đường đen" />
              </Form.Item>
              <Form.Item label="Sản lượng sau khi nấu" required>
                <Space.Compact block>
                  <Form.Item
                    name="outputQuantity"
                    noStyle
                    rules={[{ required: true, message: "Nhập sản lượng" }]}
                  >
                    <InputNumber min={0.001} style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item
                    name="outputUnit"
                    noStyle
                    rules={[{ required: true, message: "Chọn đơn vị" }]}
                  >
                    <Select
                      style={{ width: 100 }}
                      options={[
                        { value: "ml", label: "ml" },
                        { value: "lít", label: "lít" },
                        { value: "g", label: "g" },
                        { value: "kg", label: "kg" },
                      ]}
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
              <Form.Item
                name="cookingHours"
                label="Thời gian sơ chế/nấu (giờ)"
                rules={[{ required: true, message: "Nhập thời gian" }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="note" label="Ghi chú">
                <Input placeholder="Có thể để trống" />
              </Form.Item>
            </div>
          </section>

          <Form.List name="ingredients">
            {(fields, { add, remove }) => (
              <section className="ingredient-form-section">
                <div className="ingredient-form-section-heading">
                  <div>
                    <Text strong>Công thức nguyên liệu thô</Text>
                    <Text type="secondary">
                      Chọn từng nguyên liệu và lượng thực tế dùng để chế biến.
                    </Text>
                  </div>
                </div>
                <Space
                  className="ingredient-materials-list"
                  orientation="vertical"
                  size={12}
                  style={{ width: "100%" }}
                >
                  {fields.map((field) => (
                    <div className="inline-topping-ingredient-row" key={field.key}>
                    <Form.Item
                      name={[field.name, "ingredientId"]}
                      rules={[{ required: true, message: "Chọn nguyên liệu" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Ví dụ: Dâu sấy"
                        options={preparationIngredients.map((ingredient) => ({
                          value: recordId(ingredient),
                          label: `${ingredient.name} · ${ingredient.code} · ${ingredient.costUnit || "chưa có đơn vị cost"}`,
                        }))}
                        onChange={(ingredientId: string) => {
                          const ingredient = ingredientsById.get(ingredientId);
                          preparedIngredientForm.setFieldValue(
                            ["ingredients", field.name, "unit"],
                            preferredInputUnit(ingredient?.costUnit),
                          );
                          if (
                            field.name === 0 &&
                            !String(
                              preparedIngredientForm.getFieldValue("name") ?? "",
                            ).trim()
                          ) {
                            preparedIngredientForm.setFieldValue(
                              "name",
                              ingredient?.name ?? "",
                            );
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "quantity"]}
                      rules={[{ required: true, message: "Nhập lượng dùng" }]}
                    >
                      <InputNumber
                        min={0.0001}
                        placeholder="Lượng dùng"
                        style={{ width: "100%" }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, "unit"]}
                      rules={[{ required: true, message: "Chọn đơn vị" }]}
                    >
                      <Select
                        placeholder="Đơn vị"
                        options={compatibleUnitOptions(
                          ingredientsById.get(
                            preparedIngredientCreatorValues?.ingredients?.[field.name]
                              ?.ingredientId,
                          )?.costUnit || "g",
                        )}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      disabled={fields.length === 1}
                      icon={<MinusCircleOutlined />}
                      aria-label="Xóa nguyên liệu thô"
                      onClick={() => remove(field.name)}
                    />
                    </div>
                  ))}
                  <Button
                    block
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ quantity: 1, unit: "g" })}
                  >
                    Thêm nguyên liệu khác
                  </Button>
                </Space>
              </section>
            )}
          </Form.List>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
