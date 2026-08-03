"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
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
import { useMemo, useState, type Key } from "react";
import {
  formatDate,
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import { useApiData } from "@/hooks/use-api-data";
import { milkSterilizationDescription } from "@/lib/expense-categories";

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
  visibleWhen?: { field: string; equals: unknown };
  disabledWhen?: { field: string; equals: unknown };
  hint?: string;
  min?: number;
  precision?: number;
  step?: number;
  suffix?: string;
};

type ResourceRecord = Record<string, unknown> & { id?: string; _id?: string };

function resourceRecordKey(record: ResourceRecord): Key {
  return record.id ?? record._id ?? JSON.stringify(record);
}

function isMissingValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

function matchesFieldCondition(
  condition: ResourceField["visibleWhen"] | ResourceField["disabledWhen"],
  values: Record<string, unknown>,
) {
  return !condition || values[condition.field] === condition.equals;
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
  if (field.key === "description") {
    const milkLiters = Number(record.milkLiters ?? 0);
    const milkUnitPrice = Number(record.milkUnitPrice ?? 0);
    const milkDetail = milkSterilizationDescription(
      milkLiters,
      milkUnitPrice,
    );
    if (milkDetail && resolvedValue !== milkDetail) {
      return (
        <span className="resource-description">
          <Text>{String(resolvedValue ?? "—")}</Text>
          <Text type="secondary" className="resource-description-detail">
            {milkDetail}
          </Text>
        </span>
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
  selectionAmountField,
  selectionTitle = "Danh sách",
  selectionPdfExportUrl,
  selectionPdfFileName = "du-lieu-da-chon.pdf",
  selectionPdfLabel = "Xuất PDF",
  onEditorValuesChange,
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
  selectionAmountField?: string;
  selectionTitle?: string;
  selectionPdfExportUrl?: string;
  selectionPdfFileName?: string;
  selectionPdfLabel?: string;
  onEditorValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => Record<string, unknown> | undefined;
}) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ResourceRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
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
  const editorFields = fields.filter(
    (field) =>
      field.editable !== false &&
      matchesFieldCondition(field.visibleWhen, displayedValues),
  );
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
  const displayedRecordKeys = useMemo(
    () => displayedRecords.map(resourceRecordKey),
    [displayedRecords],
  );
  const selectedRowKeySet = useMemo(
    () => new Set(selectedRowKeys),
    [selectedRowKeys],
  );
  const selectedSummary = useMemo(() => {
    if (!selectionAmountField) return { count: 0, totalAmount: 0 };

    let count = 0;
    let totalAmount = 0;
    for (const record of data) {
      if (!selectedRowKeySet.has(resourceRecordKey(record))) continue;
      count += 1;
      totalAmount += Number(record[selectionAmountField] ?? 0);
    }
    return { count, totalAmount };
  }, [data, selectedRowKeySet, selectionAmountField]);
  const selectedDisplayedRecordCount = useMemo(() => {
    let count = 0;
    for (const key of displayedRecordKeys) {
      if (selectedRowKeySet.has(key)) count += 1;
    }
    return count;
  }, [displayedRecordKeys, selectedRowKeySet]);
  const allDisplayedRecordsSelected =
    displayedRecordKeys.length > 0 &&
    selectedDisplayedRecordCount === displayedRecordKeys.length;

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

  function toggleRecordSelection(key: Key, checked: boolean) {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return Array.from(next);
    });
  }

  function toggleAllDisplayedRecords(checked: boolean) {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      for (const key of displayedRecordKeys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return Array.from(next);
    });
  }

  async function exportSelectedPdf() {
    if (!selectionPdfExportUrl || selectedSummary.count === 0) return;
    const ids = data.flatMap((record) => {
      const key = resourceRecordKey(record);
      if (!selectedRowKeySet.has(key)) return [];
      const id = record.id ?? record._id;
      return id ? [String(id)] : [];
    });
    if (ids.length === 0) {
      message.warning("Các dòng đã chọn chưa có mã để xuất PDF");
      return;
    }

    setExportingPdf(true);
    try {
      const response = await fetch(selectionPdfExportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
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
      link.download = selectionPdfFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      message.success("Đã tạo hóa đơn PDF");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể tạo file PDF",
      );
    } finally {
      setExportingPdf(false);
    }
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
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errorBody?.message ?? "Không thể lưu dữ liệu");
      }
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: ResourceRecord;
      };
      if (!body.success || !body.data) throw new Error(body.message);
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
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errorBody?.message ?? "Không thể xóa dữ liệu");
      }
      const body = (await response.json()) as { success: boolean; message: string };
      if (!body.success) throw new Error(body.message);
      setData((current) => current.filter((item) => (item.id ?? item._id) !== id));
      setSelectedRowKeys((current) => current.filter((key) => key !== id));
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
        {selectionAmountField ? (
          <div className="resource-selection-bar">
            <div className="resource-selection-heading">
              <span className="resource-selection-icon" aria-hidden="true">
                <FilePdfOutlined />
              </span>
              <div className="resource-selection-title">
                <Text strong>{selectionTitle}</Text>
                <Text type="secondary">
                  Chọn các khoản cần đưa vào hóa đơn
                </Text>
              </div>
              <Checkbox
                className="resource-mobile-select-all"
                checked={allDisplayedRecordsSelected}
                indeterminate={
                  selectedDisplayedRecordCount > 0 &&
                  !allDisplayedRecordsSelected
                }
                disabled={displayedRecordKeys.length === 0}
                onChange={(event) =>
                  toggleAllDisplayedRecords(event.target.checked)
                }
              >
                Chọn tất cả
              </Checkbox>
            </div>
            <div className="resource-selection-controls">
              <div className="resource-selection-summary" aria-live="polite">
                <span>
                  <Text type="secondary">Đã chọn</Text>
                  <Text strong>{formatNumber(selectedSummary.count)} khoản</Text>
                </span>
                <span>
                  <Text type="secondary">Tổng hóa đơn</Text>
                  <Text strong>{formatVnd(selectedSummary.totalAmount)}</Text>
                </span>
              </div>
              {selectionPdfExportUrl ? (
                <Button
                  type="primary"
                  size="large"
                  icon={<FilePdfOutlined />}
                  disabled={selectedSummary.count === 0}
                  loading={exportingPdf}
                  onClick={exportSelectedPdf}
                >
                  {selectionPdfLabel}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <Table
          className="resource-desktop-table"
          size="small"
          rowKey={resourceRecordKey}
          columns={columns}
          dataSource={displayedRecords}
          rowSelection={
            selectionAmountField
              ? {
                  selectedRowKeys,
                  onChange: setSelectedRowKeys,
                  columnWidth: 44,
                  preserveSelectedRowKeys: true,
                  getCheckboxProps: (record) => ({
                    "aria-label": `Chọn ${String(
                      primaryField
                        ? (record[primaryField.key] ?? "bản ghi")
                        : "bản ghi",
                    )}`,
                  }),
                }
              : undefined
          }
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          rowClassName={(record) =>
            hasResourceWarning(record, fields) ? "record-warning-row" : ""
          }
        />
        <ul className="resource-mobile-list">
          {mobileRecords.map((record) => {
            const key = resourceRecordKey(record);
            return (
              <li
                className={`resource-mobile-card ${
                  hasResourceWarning(record, fields)
                    ? "record-warning-card"
                    : ""
                }`}
                key={key}
              >
                <div className="resource-mobile-card-topline">
                  {selectionAmountField ? (
                    <Checkbox
                      className="resource-mobile-card-checkbox"
                      checked={selectedRowKeySet.has(key)}
                      aria-label={`Chọn ${String(
                        primaryField
                          ? (record[primaryField.key] ?? "bản ghi")
                          : "bản ghi",
                      )}`}
                      onChange={(event) =>
                        toggleRecordSelection(key, event.target.checked)
                      }
                    />
                  ) : null}
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
          onValuesChange={(changedValues, allValues) => {
            const updates = onEditorValuesChange?.(
              changedValues,
              allValues,
            );
            if (updates && Object.keys(updates).length > 0) {
              form.setFieldsValue(updates);
            }
          }}
          style={{ marginTop: 20 }}
        >
          <Row gutter={16}>
            {editorFields.map((field) => (
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
                    extra={field.hint}
                  >
                    {field.type === "number" || field.type === "money" ? (
                      <InputNumber
                        min={field.min ?? 0}
                        style={{ width: "100%" }}
                        precision={
                          field.precision ??
                          (field.type === "money" ? 0 : undefined)
                        }
                        step={
                          field.step ??
                          (field.type === "money" ? 1_000 : undefined)
                        }
                        addonAfter={field.suffix}
                        disabled={matchesFieldCondition(
                          field.disabledWhen,
                          displayedValues,
                        ) && Boolean(field.disabledWhen)}
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
                      <Input
                        disabled={
                          matchesFieldCondition(
                            field.disabledWhen,
                            displayedValues,
                          ) && Boolean(field.disabledWhen)
                        }
                      />
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
