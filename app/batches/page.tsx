"use client";

import {
  DeleteOutlined,
  EditOutlined,
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
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  calculatePreparationBatchCost,
  normalizedPreparationCostSource,
  type PreparationBatchType,
} from "@/lib/calculations/preparation-batch";
import { compatibleUnitOptions } from "@/lib/calculations/units";
import { formatNumber, formatVnd } from "@/lib/formatters";
import { resolveSettingValue, settingDefaults } from "@/lib/settings";
import { workbookBatches, workbookIngredients } from "@/lib/workbook-snapshot";

const { Text } = Typography;

type Ingredient = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  category?: string;
  costUnit: string;
  averageUnitCost: number;
  isActive: boolean;
};

type BatchIngredient = {
  ingredientId?: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  costUnit?: string;
  unitCost: number;
  amount: number;
  note?: string;
};

type Batch = {
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
  actualLiters: number;
  cookingHours?: number;
  ingredientCost?: number;
  electricityCost?: number;
  totalCost: number;
  costPerLiter: number;
  costPerMl: number;
  ingredients?: BatchIngredient[];
  note?: string;
};

type Setting = {
  key: string;
  value: number;
};

type BatchForm = {
  name: string;
  batchType: PreparationBatchType;
  outputQuantity: number;
  outputUnit: string;
  cookingHours: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
    note?: string;
  }>;
  note?: string;
};

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? record._id ?? "";
}

function preferredInputUnit(costUnit?: string) {
  const normalized = String(costUnit ?? "").trim().toLocaleLowerCase("vi");
  if (["kg", "kilogram", "g", "gram"].includes(normalized)) return "g";
  if (["l", "lit", "liter", "litre", "lít", "ml"].includes(normalized)) {
    return "ml";
  }
  return costUnit || "đơn vị";
}

function batchTypeLabel(batchType?: PreparationBatchType) {
  return batchType === "topping" ? "Topping" : "Sữa nền";
}

function batchOutput(batch: Batch) {
  if (Number(batch.outputQuantity ?? 0) > 0 && batch.outputUnit) {
    return `${formatNumber(Number(batch.outputQuantity))} ${batch.outputUnit}`;
  }
  return `${formatNumber(Number(batch.actualLiters ?? 0))} L`;
}

const fallbackSettings: Setting[] = [
  {
    key: "cong_suat_bep_mac_dinh_kw",
    value: settingDefaults.cong_suat_bep_mac_dinh_kw,
  },
  {
    key: "gia_dien_d_kwh",
    value: settingDefaults.gia_dien_d_kwh,
  },
  {
    key: "dien_khac_moi_me_d",
    value: settingDefaults.dien_khac_moi_me_d,
  },
  {
    key: "nuoc_ve_sinh_moi_me_d",
    value: settingDefaults.nuoc_ve_sinh_moi_me_d,
  },
];

export default function BatchesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<BatchForm>();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    data: batches,
    loading: batchesLoading,
    usingFallback: batchesFallback,
    setData: setBatches,
  } = useApiData<Batch[]>("/api/batches?limit=500", workbookBatches);
  const {
    data: ingredients,
    loading: ingredientsLoading,
    usingFallback: ingredientsFallback,
  } = useApiData<Ingredient[]>(
    "/api/ingredients?limit=500",
    workbookIngredients,
  );
  const { data: settings, loading: settingsLoading } = useApiData<Setting[]>(
    "/api/settings",
    fallbackSettings,
  );
  const values = Form.useWatch([], form);
  const ingredientsById = useMemo(
    () =>
      new Map(
        ingredients.map((ingredient) => [recordId(ingredient), ingredient]),
      ),
    [ingredients],
  );
  const settingsByKey = useMemo(
    () => new Map(settings.map((setting) => [setting.key, setting.value])),
    [settings],
  );
  const preview = useMemo(() => {
    const electricityCost =
      Number(values?.cookingHours ?? 0) *
        resolveSettingValue(settingsByKey, "cong_suat_bep_mac_dinh_kw") *
        resolveSettingValue(settingsByKey, "gia_dien_d_kwh") +
      resolveSettingValue(settingsByKey, "dien_khac_moi_me_d");
    try {
      return {
        ...calculatePreparationBatchCost({
          batchType: values?.batchType ?? "milk_base",
          outputQuantity: Number(values?.outputQuantity ?? 0),
          outputUnit: String(values?.outputUnit ?? ""),
          ingredients: (values?.ingredients ?? []).flatMap((item) => {
            const ingredient = ingredientsById.get(item.ingredientId);
            const costUnit = String(ingredient?.costUnit ?? "").trim();
            const unit = String(item.unit ?? "").trim();
            return ingredient && costUnit && unit
              ? [
                  {
                    quantity: Number(item.quantity ?? 0),
                    unit,
                    unitCost: Number(ingredient.averageUnitCost ?? 0),
                    costUnit,
                  },
                ]
              : [];
          }),
          electricityCost,
          waterCleaningCost: resolveSettingValue(
            settingsByKey,
            "nuoc_ve_sinh_moi_me_d",
          ),
        }),
        electricityCost,
        costError: "",
      };
    } catch (error) {
      return {
        ingredientCost: 0,
        electricityCost,
        totalCost: 0,
        costPerLiter: 0,
        costPerMl: 0,
        costPerBaseUnit: 0,
        outputBaseUnit: values?.batchType === "topping" ? "g" : "ml",
        costError:
          error instanceof Error ? error.message : "Không thể tính giá vốn",
      };
    }
  }, [ingredientsById, settingsByKey, values]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visibleBatches = useMemo(
    () =>
      normalizedQuery
        ? batches.filter((batch) =>
            [batch.code, batch.name, batch.note].some((value) =>
              String(value ?? "")
                .toLocaleLowerCase("vi")
                .includes(normalizedQuery),
            ),
          )
        : batches,
    [batches, normalizedQuery],
  );

  const columns: ColumnsType<Batch> = [
    { title: "Mã mẻ", dataIndex: "code" },
    { title: "Tên mẻ", dataIndex: "name" },
    {
      title: "Loại",
      dataIndex: "batchType",
      render: (value) => (
        <Tag color={value === "topping" ? "magenta" : "cyan"}>
          {batchTypeLabel(value)}
        </Tag>
      ),
    },
    {
      title: "Thành phẩm",
      key: "output",
      align: "right",
      render: (_, record) => batchOutput(record),
    },
    {
      title: "Cost nguyên liệu",
      dataIndex: "ingredientCost",
      align: "right",
      render: (value) => formatVnd(Number(value ?? 0)),
    },
    {
      title: "Cost điện",
      dataIndex: "electricityCost",
      align: "right",
      render: (value) => formatVnd(Number(value ?? 0)),
    },
    {
      title: "Tổng cost",
      dataIndex: "totalCost",
      align: "right",
      render: (value) => <Text strong>{formatVnd(Number(value))}</Text>,
    },
    {
      title: "Cost/đơn vị",
      key: "unitCost",
      align: "right",
      render: (_, record) => {
        const normalized = normalizedPreparationCostSource(record);
        return `${formatVnd(normalized.costPerBaseUnit)}/${normalized.outputBaseUnit}`;
      },
    },
    {
      title: "",
      key: "actions",
      fixed: "right",
      render: (_value, record) => (
        <Space size={2}>
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`Sửa ${record.name}`}
            onClick={() => openEditor(record)}
          />
          <Popconfirm
            title="Xóa mẻ chuẩn bị này?"
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => removeRecord(record)}
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

  function closeEditor() {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  }

  function openEditor(record?: Batch) {
    setEditing(record ?? null);
    form.setFieldsValue(
      record
        ? {
            name: record.name,
            batchType: record.batchType ?? "milk_base",
            outputQuantity:
              Number(record.outputQuantity ?? 0) || Number(record.actualLiters ?? 0),
            outputUnit:
              record.outputUnit || (record.batchType === "topping" ? "g" : "lít"),
            cookingHours: record.cookingHours ?? 0,
            ingredients: (record.ingredients ?? []).flatMap((item) => {
              const ingredient = ingredients.find(
                (candidate) =>
                  recordId(candidate) === String(item.ingredientId ?? "") ||
                  candidate.name === item.ingredientName,
              );
              return ingredient
                ? [
                    {
                      ingredientId: recordId(ingredient),
                      quantity: item.quantity,
                      unit: item.unit || preferredInputUnit(ingredient.costUnit),
                      note: item.note,
                    },
                  ]
                : [];
            }),
            note: record.note,
          }
        : {
            batchType: "milk_base",
            outputQuantity: 6,
            outputUnit: "lít",
            cookingHours: 1,
            ingredients: [{ quantity: 1 }],
          },
    );
    setDrawerOpen(true);
  }

  async function saveRecord(values: BatchForm) {
    setSaving(true);
    try {
      const id = editing ? recordId(editing) : "";
      const response = await fetch(id ? `/api/batches/${id}` : "/api/batches", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          errorBody?.message || `Không thể lưu mẻ (${response.status})`,
        );
      }
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: Batch;
      };
      if (!body.success || !body.data) {
        throw new Error(body.message);
      }
      setBatches((current) =>
        id
          ? current.map((item) =>
              recordId(item) === id ? (body.data as Batch) : item,
            )
          : [body.data as Batch, ...current],
      );
      message.success(body.message);
      closeEditor();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu mẻ chuẩn bị",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: Batch) {
    const id = recordId(record);
    if (!id) return;
    try {
      const response = await fetch(`/api/batches/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !body.success) throw new Error(body.message);
      setBatches((current) => current.filter((item) => recordId(item) !== id));
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể xóa mẻ chuẩn bị",
      );
    }
  }

  if (batchesLoading || ingredientsLoading || settingsLoading) {
    return <RouteSkeleton />;
  }

  return (
    <div className="page-wrap">
      <PageHeader
        title="Mẻ chuẩn bị"
        description="Nấu sẵn nền sữa hoặc topping rồi dùng chung cho nhiều sản phẩm. Giá vốn được quy đổi tự động từ đơn vị mua sang g hoặc ml."
      />
      {(batchesFallback || ingredientsFallback) && (
        <Alert
          type="info"
          showIcon
          title="Danh mục đang lấy từ snapshot Excel"
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="surface-card table-card">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã hoặc tên mẻ…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 300 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openEditor()}
          >
            Thêm mẻ chuẩn bị
          </Button>
        </div>
        <Table
          className="batch-desktop-table"
          size="small"
          rowKey={(record) => recordId(record) || record.code}
          columns={columns}
          dataSource={visibleBatches}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
        />
        <ul className="batch-mobile-list">
          {visibleBatches.map((batch) => (
            <li className="batch-mobile-card" key={recordId(batch) || batch.code}>
              <div className="batch-mobile-heading">
                <div>
                  <Text strong>{batch.name}</Text>
                  <Text type="secondary">{batch.code}</Text>
                </div>
                <Tag color={batch.batchType === "topping" ? "magenta" : "cyan"}>
                  {batchTypeLabel(batch.batchType)}
                </Tag>
              </div>
              <dl className="batch-mobile-metrics">
                <div>
                  <dt>Tổng cost</dt>
                  <dd>{formatVnd(batch.totalCost)}</dd>
                </div>
                <div>
                  <dt>Thành phẩm</dt>
                  <dd>{batchOutput(batch)}</dd>
                </div>
                <div>
                  <dt>Cost/đơn vị</dt>
                  <dd>
                    {(() => {
                      const normalized = normalizedPreparationCostSource(batch);
                      return `${formatVnd(normalized.costPerBaseUnit)}/${normalized.outputBaseUnit}`;
                    })()}
                  </dd>
                </div>
              </dl>
              <Button
                type="text"
                className="batch-mobile-edit"
                icon={<EditOutlined />}
                onClick={() => openEditor(batch)}
              >
                Xem công thức
                <RightOutlined />
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Drawer
        className="batch-drawer"
        open={drawerOpen}
        title={editing ? "Chỉnh sửa mẻ chuẩn bị" : "Thêm mẻ chuẩn bị"}
        placement="right"
        size="large"
        onClose={closeEditor}
        destroyOnHidden
        footer={
          <div className="batch-drawer-footer">
            <div>
              {editing ? (
                <Popconfirm
                  title="Xóa mẻ chuẩn bị này?"
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    await removeRecord(editing);
                    closeEditor();
                  }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
            <Space>
              <Button onClick={closeEditor}>Hủy</Button>
              <Button
                type="primary"
                loading={saving}
                onClick={() => form.submit()}
              >
                Lưu
              </Button>
            </Space>
          </div>
        }
      >
        <Form<BatchForm> form={form} layout="vertical" onFinish={saveRecord}>
          <div>
            <div className="purchase-form-grid">
              <Form.Item
                name="name"
                label="Tên mẻ chuẩn bị"
                rules={[{ required: true, message: "Vui lòng nhập tên mẻ" }]}
              >
                <Input placeholder="Ví dụ: Sữa Tuyết 6L, Trân châu đường đen" />
              </Form.Item>
              <Form.Item
                name="batchType"
                label="Loại thành phẩm"
                rules={[
                  { required: true, message: "Vui lòng chọn loại thành phẩm" },
                ]}
              >
                <Select
                  options={[
                    { value: "milk_base", label: "Nền sữa" },
                    { value: "topping", label: "Topping đã nấu" },
                  ]}
                  onChange={(batchType: PreparationBatchType) => {
                    form.setFieldsValue(
                      batchType === "topping"
                        ? { outputQuantity: 75, outputUnit: "g" }
                        : { outputQuantity: 6, outputUnit: "lít" },
                    );
                  }}
                />
              </Form.Item>
              <Form.Item label="Sản lượng thu được" required>
                <Space.Compact block>
                  <Form.Item
                    name="outputQuantity"
                    noStyle
                    rules={[
                      { required: true, message: "Vui lòng nhập sản lượng" },
                    ]}
                  >
                    <InputNumber
                      min={0.001}
                      placeholder="Số lượng sau khi nấu"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="outputUnit"
                    noStyle
                    rules={[
                      { required: true, message: "Vui lòng chọn đơn vị" },
                    ]}
                  >
                    <Select
                      style={{ width: 110 }}
                      options={
                        values?.batchType === "topping"
                          ? [
                              { value: "g", label: "g" },
                              { value: "kg", label: "kg" },
                            ]
                          : [
                              { value: "ml", label: "ml" },
                              { value: "lít", label: "lít" },
                            ]
                      }
                    />
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
              <Form.Item
                name="cookingHours"
                label="Thời gian nấu (giờ)"
                rules={[{ required: true, message: "Vui lòng nhập thời gian" }]}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="note" label="Ghi chú">
                <Input />
              </Form.Item>
            </div>
            <Alert
              type="info"
              showIcon
              title={
                values?.batchType === "topping"
                  ? "Ví dụ: dùng 60 g trân châu và 15 g đường, sau khi nấu/cân được 75 g topping. Sản phẩm M và L đều có thể dùng 10 g từ mẻ này."
                  : "Ví dụ: sau khi nấu thu được 6 lít Sữa Tuyết. Mỗi sản phẩm chỉ khai báo số ml nền sữa thực dùng."
              }
              style={{ marginBottom: 16 }}
            />
            <Form.List name="ingredients">
              {(fields, { add, remove }) => (
                <Space orientation="vertical" size={10} style={{ width: "100%" }}>
                  <Text strong>Chi tiết nguyên liệu</Text>
                  {fields.map((field) => (
                    <div className="batch-ingredient-row" key={field.key}>
                      <Form.Item
                        name={[field.name, "ingredientId"]}
                        rules={[
                          { required: true, message: "Chọn nguyên liệu" },
                        ]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Nguyên liệu"
                          options={ingredients.flatMap((ingredient) =>
                            ingredient.isActive && ingredient.category !== "Bao bì"
                              ? [
                                  {
                                    value: recordId(ingredient),
                                    label: `${ingredient.name} · ${ingredient.code} · ${ingredient.costUnit}`,
                                  },
                                ]
                              : [],
                          )}
                          onChange={(ingredientId: string) => {
                            const ingredient = ingredientsById.get(ingredientId);
                            form.setFieldValue(
                              ["ingredients", field.name, "unit"],
                              preferredInputUnit(ingredient?.costUnit),
                            );
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "quantity"]}
                        rules={[{ required: true, message: "Nhập số lượng" }]}
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
                              values?.ingredients?.[field.name]?.ingredientId,
                            )?.costUnit || "đơn vị",
                          )}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, "note"]}>
                        <Input placeholder="Ghi chú" />
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
                  ))}
                  <Button
                    block
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ quantity: 1, unit: "g" })}
                  >
                    Thêm nguyên liệu
                  </Button>
                </Space>
              )}
            </Form.List>
          </div>
        </Form>
        <Card
          size="small"
          title="Thông tin tự động"
          className="calculated-card mt-3!"
        >
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Cost nguyên liệu">
              {formatVnd(preview.ingredientCost)}
            </Descriptions.Item>
            <Descriptions.Item label="Cost điện">
              {formatVnd(preview.electricityCost)}
            </Descriptions.Item>
            <Descriptions.Item label="Tổng cost mẻ">
              {formatVnd(preview.totalCost)}
            </Descriptions.Item>
            <Descriptions.Item label={`Cost/${preview.outputBaseUnit}`}>
              {formatVnd(preview.costPerBaseUnit)}
            </Descriptions.Item>
          </Descriptions>
          {preview.costError ? (
            <Alert
              type="warning"
              showIcon
              title={preview.costError}
              style={{ marginTop: 12 }}
            />
          ) : null}
        </Card>
      </Drawer>
    </div>
  );
}
