"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useState } from "react";
import {
  formatDate,
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import { useApiData } from "@/hooks/use-api-data";

const { Text } = Typography;

export type ResourceField = {
  key: string;
  label: string;
  type?: "text" | "number" | "money" | "date" | "select" | "boolean" | "textarea";
  required?: boolean;
  options?: Array<string | { value: string; label: string }>;
  hiddenInTable?: boolean;
  editable?: boolean;
};

type ResourceRecord = Record<string, unknown> & { id?: string; _id?: string };

export function ResourceManager({
  resource,
  fields,
  initialData,
  addLabel,
  deriveValues,
  fallbackLabel = "Snapshot Excel",
  onMutation,
}: {
  resource: string;
  fields: ResourceField[];
  initialData: ResourceRecord[];
  addLabel: string;
  deriveValues?: (
    values: Record<string, unknown>,
  ) => Record<string, unknown>;
  fallbackLabel?: string;
  onMutation?: () => void;
}) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const url = `/api/${resource}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const { data, loading, usingFallback, setData } = useApiData<ResourceRecord[]>(
    url,
    initialData,
  );
  const watchedValues = Form.useWatch([], form) as
    | Record<string, unknown>
    | undefined;
  const calculatedFields = fields.filter((field) => field.editable === false);
  const displayedValues = deriveValues
    ? deriveValues({ ...(editing ?? {}), ...(watchedValues ?? {}) })
    : { ...(editing ?? {}), ...(watchedValues ?? {}) };

  if (loading) {
    return (
      <Card className="surface-card">
        <Skeleton active title={{ width: 180 }} paragraph={{ rows: 7 }} />
      </Card>
    );
  }

  const columns: ColumnsType<ResourceRecord> = [
      ...fields
        .filter((field) => !field.hiddenInTable)
        .map((field) => ({
          title: field.label,
          dataIndex: field.key,
          key: field.key,
          render: (value: unknown, record: ResourceRecord) => {
            if (field.type === "money") return formatVnd(Number(value ?? 0));
            if (field.type === "number") return formatNumber(Number(value ?? 0));
            if (field.type === "date") return formatDate(value as string);
            if (field.type === "boolean") {
              return value ? <Tag color="green">Có</Tag> : <Tag>Không</Tag>;
            }
            if (field.key === "name" && record.hasCostWarning) {
              return (
                <Space size={[6, 4]} wrap>
                  <Text strong>{String(value ?? "")}</Text>
                  <Tag color="warning">Kiểm tra cost</Tag>
                </Space>
              );
            }
            return value == null || value === "" ? "—" : String(value);
          },
        })),
      {
        title: "",
        key: "actions",
        fixed: "right",
        render: (_value, record) => (
          <Space size={4}>
            <Button
              type="text"
              icon={<EditOutlined />}
              aria-label="Sửa"
              onClick={() => openEditor(record)}
            />
            <Popconfirm
              title="Xóa bản ghi này?"
              description="Thao tác chỉ thực hiện sau khi bạn xác nhận."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => removeRecord(record)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="Xóa" />
            </Popconfirm>
          </Space>
        ),
      },
    ];

  function openEditor(record?: ResourceRecord) {
    setEditing(record ?? null);
    const values = record ? { ...record } : {};
    for (const field of fields) {
      if (field.type === "date" && values[field.key]) {
        values[field.key] = dayjs(values[field.key] as string);
      }
      if (field.type === "boolean" && values[field.key] === undefined) {
        values[field.key] = true;
      }
    }
    form.setFieldsValue(values);
    setModalOpen(true);
  }

  async function saveRecord(values: Record<string, unknown>) {
    setSaving(true);
    try {
      const payload = { ...values };
      for (const field of fields) {
        if (field.type === "date" && payload[field.key]) {
          payload[field.key] = (
            payload[field.key] as { toISOString: () => string }
          ).toISOString();
        }
      }
      if (resource === "purchases" && !payload.totalAmount) {
        payload.totalAmount =
          Number(payload.packageCount ?? 0) * Number(payload.actualPackagePrice ?? 0);
      }
      const id = editing?.id ?? editing?._id;
      const response = await fetch(id ? `/api/${resource}/${id}` : `/api/${resource}`, {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: ResourceRecord;
      };
      if (!response.ok || !body.success || !body.data) throw new Error(body.message);
      setData((current) =>
        id
          ? current.map((item) =>
              (item.id ?? item._id) === id ? body.data as ResourceRecord : item,
            )
          : [body.data as ResourceRecord, ...current],
      );
      message.success(body.message);
      setModalOpen(false);
      form.resetFields();
      onMutation?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể lưu dữ liệu");
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: ResourceRecord) {
    const id = record.id ?? record._id;
    if (!id) return;
    try {
      const response = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
      const body = (await response.json()) as { success: boolean; message: string };
      if (!response.ok || !body.success) throw new Error(body.message);
      setData((current) => current.filter((item) => (item.id ?? item._id) !== id));
      message.success(body.message);
      onMutation?.();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể xóa dữ liệu");
    }
  }

  return (
    <>
      <Card className="surface-card table-card">
        <div className="table-toolbar">
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm kiếm…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              style={{ width: 260 }}
            />
            {usingFallback && <Tag color="blue">{fallbackLabel}</Tag>}
          </Space>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              href={`/api/export/${resource}`}
              target="_blank"
            >
              Xuất Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              {addLabel}
            </Button>
          </Space>
        </div>
        <Table
          size="small"
          rowKey={(record) => record.id ?? record._id ?? JSON.stringify(record)}
          columns={columns}
          dataSource={data}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          rowClassName={(record) => (record.hasCostWarning ? "warning-row" : "")}
        />
      </Card>
      <Drawer
        open={modalOpen}
        title={editing ? "Chỉnh sửa" : addLabel}
        placement="right"
        size="large"
        extra={
          <Space>
            <Button
              onClick={() => {
                setModalOpen(false);
                form.resetFields();
              }}
            >
              Hủy
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => form.submit()}
            >
              Lưu
            </Button>
          </Space>
        }
        onClose={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={saveRecord}
          style={{ marginTop: 20 }}
        >
          {fields.filter((field) => field.editable !== false).map((field) => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={field.label}
              valuePropName={field.type === "boolean" ? "checked" : "value"}
              rules={
                field.required
                  ? [{ required: true, message: `Vui lòng nhập ${field.label.toLowerCase()}` }]
                  : undefined
              }
            >
              {field.type === "number" || field.type === "money" ? (
                <InputNumber
                  min={0}
                  style={{ width: "100%" }}
                  precision={field.type === "money" ? 0 : undefined}
                  step={field.type === "money" ? 1_000 : undefined}
                  formatter={field.type === "money" ? formatVndInput : undefined}
                  parser={field.type === "money" ? parseVndInput : undefined}
                  placeholder={field.type === "money" ? "Ví dụ: 2.200.000" : undefined}
                  inputMode={field.type === "money" ? "numeric" : undefined}
                />
              ) : field.type === "date" ? (
                <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
              ) : field.type === "select" ? (
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={field.options?.map((option) =>
                    typeof option === "string"
                      ? { value: option, label: option }
                      : option,
                  )}
                />
              ) : field.type === "boolean" ? (
                <Switch />
              ) : field.type === "textarea" ? (
                <Input.TextArea rows={3} />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}
        </Form>
        {calculatedFields.length > 0 && (
          <Card
            size="small"
            title="Thông tin tự động"
            className="calculated-card"
          >
            <Descriptions bordered size="small" column={1}>
              {calculatedFields.map((field) => {
                const value = displayedValues[field.key];
                const content =
                  field.type === "money"
                    ? formatVnd(Number(value ?? 0))
                    : field.type === "number"
                      ? formatNumber(Number(value ?? 0))
                      : field.type === "date"
                        ? formatDate(value as string)
                        : value == null || value === ""
                          ? "Tự động khi lưu"
                          : String(value);
                return (
                  <Descriptions.Item key={field.key} label={field.label}>
                    {content}
                  </Descriptions.Item>
                );
              })}
            </Descriptions>
          </Card>
        )}
      </Drawer>
    </>
  );
}
