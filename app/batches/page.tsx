"use client";

import {
  DeleteOutlined,
  EditOutlined,
  MinusCircleOutlined,
  PlusOutlined,
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
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { formatNumber, formatVnd } from "@/lib/formatters";
import { resolveSettingValue, settingDefaults } from "@/lib/settings";
import {
  workbookBatches,
  workbookIngredients,
} from "@/lib/workbook-snapshot";

const { Text } = Typography;

type Ingredient = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  costUnit: string;
  averageUnitCost: number;
  isActive: boolean;
};

type BatchIngredient = {
  ingredientId?: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  amount: number;
  note?: string;
};

type Batch = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
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
  actualLiters: number;
  cookingHours: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    note?: string;
  }>;
  note?: string;
};

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? record._id ?? "";
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
    const ingredientCost = (values?.ingredients ?? []).reduce(
      (total, item) =>
        total +
        Number(item.quantity ?? 0) *
          Number(
            ingredientsById.get(item.ingredientId)?.averageUnitCost ?? 0,
          ),
      0,
    );
    const electricityCost =
      Number(values?.cookingHours ?? 0) *
        resolveSettingValue(
          settingsByKey,
          "cong_suat_bep_mac_dinh_kw",
        ) *
        resolveSettingValue(settingsByKey, "gia_dien_d_kwh") +
      resolveSettingValue(settingsByKey, "dien_khac_moi_me_d");
    const totalCost =
      ingredientCost +
      electricityCost +
      resolveSettingValue(settingsByKey, "nuoc_ve_sinh_moi_me_d");
    const liters = Number(values?.actualLiters ?? 0);
    return {
      ingredientCost,
      electricityCost,
      totalCost,
      costPerLiter: liters > 0 ? totalCost / liters : 0,
      costPerMl: liters > 0 ? totalCost / (liters * 1_000) : 0,
    };
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
    { title: "Tên mẻ / công thức", dataIndex: "name" },
    {
      title: "Thành phẩm",
      dataIndex: "actualLiters",
      align: "right",
      render: (value) => `${formatNumber(Number(value))} L`,
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
      title: "Cost/ml",
      dataIndex: "costPerMl",
      align: "right",
      render: (value) => formatVnd(Number(value)),
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
            title="Xóa mẻ sữa này?"
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
            actualLiters: record.actualLiters,
            cookingHours: record.cookingHours ?? 0,
            ingredients: (record.ingredients ?? []).flatMap((item) => {
              const ingredient = ingredients.find(
                (candidate) =>
                  recordId(candidate) === String(item.ingredientId ?? "") ||
                  candidate.name === item.ingredientName,
              );
              return ingredient
                ? [{
                    ingredientId: recordId(ingredient),
                    quantity: item.quantity,
                    note: item.note,
                  }]
                : [];
            }),
            note: record.note,
          }
        : {
            actualLiters: 1,
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
      const response = await fetch(
        id ? `/api/batches/${id}` : "/api/batches",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: Batch;
      };
      if (!response.ok || !body.success || !body.data) {
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
        error instanceof Error ? error.message : "Không thể lưu mẻ sữa",
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
      setBatches((current) =>
        current.filter((item) => recordId(item) !== id),
      );
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể xóa mẻ sữa",
      );
    }
  }

  if (batchesLoading || ingredientsLoading || settingsLoading) {
    return <RouteSkeleton />;
  }

  return (
    <div className="page-wrap">
      <PageHeader
        title="Mẻ sữa"
        description="Chỉ nhập công thức và sản lượng; đơn vị, giá vốn nguyên liệu, điện nước và cost/ml được tính tự động."
      />
      {(batchesFallback || ingredientsFallback) && (
        <Alert
          type="info"
          showIcon
          message="Danh mục đang lấy từ snapshot Excel"
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
            Thêm mẻ sữa
          </Button>
        </div>
        <Table
          size="small"
          rowKey={(record) => recordId(record) || record.code}
          columns={columns}
          dataSource={visibleBatches}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        title={editing ? "Chỉnh sửa mẻ sữa" : "Thêm mẻ sữa"}
        placement="right"
        size="large"
        onClose={closeEditor}
        destroyOnHidden
        extra={
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
        }
      >
        <Form<BatchForm>
          form={form}
          layout="vertical"
          onFinish={saveRecord}
        >
          <div>
            <div className="purchase-form-grid">
              <Form.Item
                name="name"
                label="Tên mẻ / công thức"
                rules={[{ required: true, message: "Vui lòng nhập tên mẻ" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="actualLiters"
                label="Thành phẩm thực tế (L)"
                rules={[{ required: true, message: "Vui lòng nhập thành phẩm" }]}
              >
                <InputNumber min={0.001} style={{ width: "100%" }} />
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
            <Form.List name="ingredients">
              {(fields, { add, remove }) => (
                <Space
                  direction="vertical"
                  size={10}
                  style={{ width: "100%" }}
                >
                  <Text strong>Chi tiết nguyên liệu</Text>
                  {fields.map((field) => (
                    <div className="batch-ingredient-row" key={field.key}>
                      <Form.Item
                        name={[field.name, "ingredientId"]}
                        rules={[{ required: true, message: "Chọn nguyên liệu" }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Nguyên liệu"
                          options={ingredients
                            .filter((ingredient) => ingredient.isActive)
                            .map((ingredient) => ({
                              value: recordId(ingredient),
                              label: `${ingredient.name} · ${ingredient.code} · ${ingredient.costUnit}`,
                            }))}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, "quantity"]}
                        rules={[{ required: true, message: "Nhập số lượng" }]}
                      >
                        <InputNumber
                          addonAfter={
                            ingredientsById.get(
                              values?.ingredients?.[field.name]?.ingredientId,
                            )?.costUnit || "đơn vị"
                          }
                          min={0.0001}
                          placeholder="Số lượng"
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                      <Form.Item name={[field.name, "note"]}>
                        <Input placeholder="Ghi chú" />
                      </Form.Item>
                      <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        aria-label="Xóa nguyên liệu"
                        onClick={() => remove(field.name)}
                      />
                    </div>
                  ))}
                  <Button
                    block
                    icon={<PlusOutlined />}
                    onClick={() => add({ quantity: 1 })}
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
          className="calculated-card"
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
            <Descriptions.Item label="Cost/lít">
              {formatVnd(preview.costPerLiter)}
            </Descriptions.Item>
            <Descriptions.Item label="Cost/ml">
              {formatVnd(preview.costPerMl)}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Drawer>
    </div>
  );
}
