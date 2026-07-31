"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Pagination,
  Popconfirm,
  Radio,
  Row,
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
import { useMemo, useState } from "react";
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
  type?:
    | "text"
    | "number"
    | "money"
    | "date"
    | "select"
    | "radio"
    | "boolean"
    | "textarea"
    | "purchaseSummary";
  required?: boolean;
  options?: Array<
    string | { value: string; label: string; color?: string }
  >;
  defaultValue?: unknown;
  legacyValue?: unknown;
  mobilePriority?: number;
  formSpan?: 12 | 24;
  booleanControl?: "switch" | "checkbox";
  booleanLabel?: string;
  hiddenInTable?: boolean;
  hiddenInEditor?: boolean;
  editable?: boolean;
  missingWarningLabel?: string;
};

type ResourceRecord = Record<string, unknown> & { id?: string; _id?: string };

function isMissingValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

function hasResourceWarning(
  record: ResourceRecord,
  fields: ResourceField[],
) {
  return (
    Boolean(record.hasCostWarning) ||
    fields.some(
      (field) =>
        Boolean(field.missingWarningLabel) &&
        isMissingValue(record[field.key]),
    )
  );
}

function renderResourceValue(
  field: ResourceField,
  value: unknown,
  record: ResourceRecord,
) {
  if (field.missingWarningLabel && isMissingValue(value)) {
    return <Tag color="warning">{field.missingWarningLabel}</Tag>;
  }
  const resolvedValue = value ?? field.legacyValue;
  if (field.type === "purchaseSummary") {
    return (
      <Space orientation="vertical" size={0}>
        <Text strong>
          {formatNumber(Number(record.totalPurchasedPackages ?? 0))}
          {record.purchaseUnit ? ` ${String(record.purchaseUnit)}` : ""}
        </Text>
        <Text type="secondary">
          {formatVnd(Number(record.totalPurchasedAmount ?? 0))}
        </Text>
      </Space>
    );
  }
  if (field.type === "money") return formatVnd(Number(value ?? 0));
  if (field.type === "number") return formatNumber(Number(value ?? 0));
  if (field.type === "date") return formatDate(value as string);
  if (field.type === "boolean") {
    return value ? <Tag color="green">Có</Tag> : <Tag>Không</Tag>;
  }
  if (field.type === "select" || field.type === "radio") {
    const option = field.options?.find((candidate) =>
      typeof candidate === "string"
        ? candidate === resolvedValue
        : candidate.value === resolvedValue,
    );
    if (option) {
      if (typeof option === "string") return option;
      return option.color ? (
        <Tag color={option.color}>{option.label}</Tag>
      ) : (
        option.label
      );
    }
  }
  if (field.key === "name" && record.hasCostWarning) {
    return (
      <Space size={[6, 4]} wrap>
        <Text strong>{String(value ?? "")}</Text>
        <Tag color="warning">Kiểm tra cost</Tag>
      </Space>
    );
  }
  return resolvedValue == null || resolvedValue === ""
    ? "—"
    : String(resolvedValue);
}

function mobileFieldPriority(field: ResourceField) {
  if (field.mobilePriority !== undefined) return field.mobilePriority;
  if (field.type === "money") return 0;
  if (field.type === "purchaseSummary") return 1;
  if (field.type === "number") return 2;
  if (field.type === "boolean") return 3;
  if (field.type === "date") return 4;
  if (field.type === "select" || field.type === "radio") return 5;
  return 6;
}

export function ResourceManager({
  resource,
  fields,
  initialData,
  addLabel,
  deriveValues,
  fallbackLabel = "Snapshot Excel",
  onMutation,
  editorColumns = 1,
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
  editorColumns?: 1 | 2;
}) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const [form] = Form.useForm();
  const url = `/api/${resource}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const { data, loading, usingFallback, setData } = useApiData<ResourceRecord[]>(
    url,
    initialData,
  );
  const watchedValues = Form.useWatch([], form) as
    | Record<string, unknown>
    | undefined;
  const calculatedFields = fields.filter(
    (field) => field.editable === false && !field.hiddenInEditor,
  );
  const displayedValues = deriveValues
    ? deriveValues({ ...(editing ?? {}), ...(watchedValues ?? {}) })
    : { ...(editing ?? {}), ...(watchedValues ?? {}) };
  const tableFields = fields.filter((field) => !field.hiddenInTable);
  const displayedRecords = useMemo(
    () =>
      data.toSorted(
        (first, second) =>
          Number(hasResourceWarning(second, fields)) -
          Number(hasResourceWarning(first, fields)),
      ),
    [data, fields],
  );
  const primaryField =
    tableFields.find((field) => field.key === "name") ??
    tableFields.find((field) => field.key === "description") ??
    tableFields.find((field) => field.key === "code") ??
    tableFields[0];
  const codeField = tableFields.find((field) => field.key === "code");
  const categoryField = tableFields.find((field) => field.key === "category");
  const dateField = tableFields.find((field) => field.type === "date");
  const mobileMetricFields = tableFields
    .filter(
      (field) =>
        field.key !== primaryField?.key &&
        field.key !== codeField?.key &&
        field.key !== categoryField?.key &&
        field.key !== dateField?.key,
    )
    .sort(
      (first, second) =>
        mobileFieldPriority(first) - mobileFieldPriority(second),
    )
    .slice(0, 2);
  const mobilePageSize = 8;
  const safeMobilePage = Math.min(
    mobilePage,
    Math.max(1, Math.ceil(data.length / mobilePageSize)),
  );
  const mobileRecords = displayedRecords.slice(
    (safeMobilePage - 1) * mobilePageSize,
    safeMobilePage * mobilePageSize,
  );

  if (loading) {
    return (
      <Card className="surface-card">
        <Skeleton active title={{ width: 180 }} paragraph={{ rows: 7 }} />
      </Card>
    );
  }

  const columns: ColumnsType<ResourceRecord> = [
      ...tableFields
        .map((field) => ({
          title: field.label,
          dataIndex: field.key,
          key: field.key,
          render: (value: unknown, record: ResourceRecord) =>
            renderResourceValue(field, value, record),
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
      if (values[field.key] === undefined) {
        values[field.key] = record
          ? field.legacyValue
          : field.defaultValue;
      }
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
              (item.id ?? item._id) === id
                ? { ...item, ...(body.data as ResourceRecord) }
                : item,
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
          className="resource-desktop-table"
          size="small"
          rowKey={(record) => record.id ?? record._id ?? JSON.stringify(record)}
          columns={columns}
          dataSource={displayedRecords}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          rowClassName={(record) =>
            hasResourceWarning(record, fields) ? "record-warning-row" : ""
          }
        />
        <ul className="resource-mobile-list">
          {mobileRecords.map((record) => {
            const key =
              record.id ?? record._id ?? JSON.stringify(record);
            return (
              <li
                className={`resource-mobile-card ${
                  hasResourceWarning(record, fields)
                    ? "record-warning-card"
                    : ""
                }`}
                key={key}
              >
                <div className="resource-mobile-card-heading">
                  <div>
                    <div className="resource-mobile-card-title">
                      {primaryField
                        ? renderResourceValue(
                            primaryField,
                            record[primaryField.key],
                            record,
                          )
                        : "Bản ghi"}
                    </div>
                    <Space size={6} wrap>
                      {codeField && codeField.key !== primaryField?.key ? (
                        <Tag>{String(record[codeField.key] ?? "—")}</Tag>
                      ) : null}
                      {categoryField ? (
                        <Text type="secondary">
                          {String(record[categoryField.key] ?? "—")}
                        </Text>
                      ) : null}
                    </Space>
                  </div>
                  {dateField ? (
                    <Text type="secondary" className="resource-mobile-card-date">
                      {formatDate(record[dateField.key] as string)}
                    </Text>
                  ) : null}
                </div>
                <dl className="resource-mobile-metrics">
                  {mobileMetricFields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>
                        {renderResourceValue(
                          field,
                          record[field.key],
                          record,
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button
                  type="text"
                  className="resource-mobile-edit"
                  icon={<EditOutlined />}
                  onClick={() => openEditor(record)}
                >
                  Xem và chỉnh sửa
                  <RightOutlined />
                </Button>
              </li>
            );
          })}
          {data.length === 0 ? (
            <li className="resource-mobile-empty">
              <Text type="secondary">Chưa có dữ liệu</Text>
            </li>
          ) : null}
        </ul>
        {data.length > mobilePageSize ? (
          <Pagination
            className="resource-mobile-pagination"
            current={safeMobilePage}
            pageSize={mobilePageSize}
            total={data.length}
            showSizeChanger={false}
            size="small"
            align="center"
            onChange={setMobilePage}
          />
        ) : null}
      </Card>
      <Drawer
        className="resource-drawer"
        open={modalOpen}
        title={editing ? "Chỉnh sửa" : addLabel}
        placement="right"
        size="large"
        footer={
          <div className="resource-drawer-footer">
            <div>
              {editing ? (
                <Popconfirm
                  title="Xóa bản ghi này?"
                  description="Thao tác chỉ thực hiện sau khi bạn xác nhận."
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={async () => {
                    await removeRecord(editing);
                    setModalOpen(false);
                    form.resetFields();
                  }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Xóa
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
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
          </div>
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
          <Row gutter={16}>
            {fields
              .filter((field) => field.editable !== false)
              .map((field) => (
                <Col
                  key={field.key}
                  xs={24}
                  md={
                    field.formSpan ??
                    (editorColumns === 2 && field.type !== "textarea"
                      ? 12
                      : 24)
                  }
                >
                  <Form.Item
                    name={field.key}
                    label={field.label}
                    valuePropName={
                      field.type === "boolean" ? "checked" : "value"
                    }
                    rules={
                      field.required
                        ? [
                            {
                              required: true,
                              message: `Vui lòng nhập ${field.label.toLowerCase()}`,
                            },
                          ]
                        : undefined
                    }
                  >
                    {field.type === "number" || field.type === "money" ? (
                      <InputNumber
                        min={0}
                        style={{ width: "100%" }}
                        precision={field.type === "money" ? 0 : undefined}
                        step={field.type === "money" ? 1_000 : undefined}
                        formatter={
                          field.type === "money" ? formatVndInput : undefined
                        }
                        parser={
                          field.type === "money" ? parseVndInput : undefined
                        }
                        placeholder={
                          field.type === "money"
                            ? "Ví dụ: 2.200.000"
                            : undefined
                        }
                        inputMode={
                          field.type === "money" ? "numeric" : undefined
                        }
                      />
                    ) : field.type === "date" ? (
                      <DatePicker
                        format="DD/MM/YYYY"
                        style={{ width: "100%" }}
                      />
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
                    ) : field.type === "radio" ? (
                      <Radio.Group
                        block
                        buttonStyle="solid"
                        optionType="button"
                        options={field.options?.map((option) =>
                          typeof option === "string"
                            ? { value: option, label: option }
                            : { value: option.value, label: option.label },
                        )}
                      />
                    ) : field.type === "boolean" ? (
                      field.booleanControl === "checkbox" ? (
                        <Checkbox>
                          {field.booleanLabel ?? field.label}
                        </Checkbox>
                      ) : (
                        <Switch />
                      )
                    ) : field.type === "textarea" ? (
                      <Input.TextArea rows={3} />
                    ) : (
                      <Input />
                    )}
                  </Form.Item>
                </Col>
              ))}
          </Row>
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
