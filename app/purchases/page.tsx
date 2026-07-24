"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  formatDate,
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import {
  DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
  PURCHASE_FUNDING_SOURCE_OPTIONS,
  purchaseFundingSourceLabel,
  type PurchaseFundingSource,
} from "@/lib/purchase-funding";
import {
  workbookIngredients,
  workbookPurchases,
} from "@/lib/workbook-snapshot";

const { Text } = Typography;

type Ingredient = {
  id?: string;
  _id?: string;
  code: string;
  name: string;
  category: string;
  packageQuantity: number;
  costUnit: string;
  referencePackagePrice: number;
  isActive: boolean;
};

type Purchase = {
  id?: string;
  _id?: string;
  ingredientId?: string;
  purchaseDate: string;
  itemCode: string;
  itemName: string;
  category: string;
  packageCount: number;
  packageQuantity: number;
  costUnit: string;
  referencePackagePrice?: number;
  actualPackagePrice: number;
  convertedQuantity: number;
  totalAmount: number;
  fundingSource?: PurchaseFundingSource;
  supplier?: string;
  note?: string;
};

type PurchaseForm = {
  purchaseDate: Dayjs;
  ingredientId: string;
  packageCount: number;
  totalAmount?: number;
  fundingSource: PurchaseFundingSource;
  supplier?: string;
  note?: string;
};

function recordId(record: { id?: string; _id?: string }) {
  return record.id ?? record._id ?? "";
}

function comparePurchasesByDate(a: Purchase, b: Purchase) {
  const dateDifference =
    dayjs(b.purchaseDate).valueOf() - dayjs(a.purchaseDate).valueOf();
  if (dateDifference !== 0) return dateDifference;
  return recordId(b).localeCompare(recordId(a), "vi");
}

function purchaseKey(record: Purchase) {
  return (
    recordId(record) ||
    `${record.purchaseDate}:${record.itemCode}:${record.packageCount}`
  );
}

function fundingSourceTagColor(source?: PurchaseFundingSource) {
  switch (source ?? DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE) {
    case "sales_revenue":
      return "green";
    case "owner_capital":
      return "blue";
    case "loan":
      return "orange";
    default:
      return "default";
  }
}

export default function PurchasesPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PurchaseForm>();
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    data: purchases,
    loading: purchasesLoading,
    usingFallback: purchasesFallback,
    setData: setPurchases,
  } = useApiData<Purchase[]>("/api/purchases?limit=500", workbookPurchases);
  const {
    data: ingredients,
    loading: ingredientsLoading,
    usingFallback: ingredientsFallback,
  } = useApiData<Ingredient[]>("/api/ingredients?limit=500", workbookIngredients);

  const selectedIngredientId = Form.useWatch("ingredientId", form);
  const packageCount = Form.useWatch("packageCount", form) ?? 0;
  const enteredTotalAmount = Form.useWatch("totalAmount", form);
  const ingredientById = useMemo(
    () =>
      new Map(
        ingredients.map((ingredient) => [recordId(ingredient), ingredient]),
      ),
    [ingredients],
  );
  const selectedIngredient = selectedIngredientId
    ? ingredientById.get(selectedIngredientId)
    : undefined;
  const convertedQuantity =
    packageCount * (selectedIngredient?.packageQuantity ?? 0);
  const effectivePrice =
    packageCount > 0 && enteredTotalAmount !== undefined
      ? enteredTotalAmount / packageCount
      : selectedIngredient?.referencePackagePrice ?? 0;
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const visiblePurchases = useMemo(() => {
    const filtered = normalizedQuery
      ? purchases.filter((purchase) =>
          [
            purchase.itemName,
            purchase.itemCode,
            purchase.category,
            purchaseFundingSourceLabel(purchase.fundingSource),
            purchase.supplier,
            purchase.note,
          ].some((value) =>
            String(value ?? "")
              .toLocaleLowerCase("vi")
              .includes(normalizedQuery),
          ),
        )
      : purchases;
    return filtered.toSorted(comparePurchasesByDate);
  }, [normalizedQuery, purchases]);

  const columns: ColumnsType<Purchase> = [
    {
      title: "Ngày nhập",
      dataIndex: "purchaseDate",
      render: formatDate,
    },
    {
      title: "Tên hàng",
      dataIndex: "itemName",
      render: (value, record) => (
        <Space size={6}>
          <Text strong>{String(value)}</Text>
          <Tag>{record.itemCode}</Tag>
        </Space>
      ),
    },
    { title: "Nhóm", dataIndex: "category" },
    {
      title: "Số gói",
      dataIndex: "packageCount",
      align: "right",
      render: (value) => formatNumber(Number(value)),
    },
    {
      title: "Quy cách/gói",
      key: "packageSpec",
      align: "right",
      render: (_value, record) =>
        `${formatNumber(record.packageQuantity)} ${record.costUnit}`,
    },
    {
      title: "Giá thực tế/gói",
      dataIndex: "actualPackagePrice",
      align: "right",
      render: (value) => formatVnd(Number(value)),
    },
    {
      title: "Tổng lượng",
      dataIndex: "convertedQuantity",
      align: "right",
      render: (value, record) =>
        `${formatNumber(Number(value))} ${record.costUnit}`,
    },
    {
      title: "Tổng tiền",
      dataIndex: "totalAmount",
      align: "right",
      render: (value) => <Text strong>{formatVnd(Number(value))}</Text>,
    },
    {
      title: "Nguồn tiền",
      dataIndex: "fundingSource",
      render: (value: PurchaseFundingSource | undefined) => (
        <Tag color={fundingSourceTagColor(value)}>
          {purchaseFundingSourceLabel(value)}
        </Tag>
      ),
    },
    { title: "Nhà cung cấp", dataIndex: "supplier" },
    {
      title: "",
      key: "actions",
      fixed: "right",
      render: (_value, record) => renderPurchaseActions(record),
    },
  ];

  function renderPurchaseActions(record: Purchase, mobile = false) {
    return (
      <Space size={mobile ? 8 : 2} className={mobile ? "purchase-card-actions" : undefined}>
        <Button
          type={mobile ? "default" : "text"}
          size={mobile ? "large" : "middle"}
          icon={<EditOutlined />}
          aria-label={`Sửa lần nhập ${record.itemName}`}
          onClick={() => openEditor(record)}
        >
          {mobile ? "Sửa" : null}
        </Button>
        <Popconfirm
          title="Xóa lần nhập này?"
          description="Giá vốn bình quân của hàng hóa sẽ được tính lại."
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={() => removeRecord(record)}
        >
          <Button
            type={mobile ? "default" : "text"}
            size={mobile ? "large" : "middle"}
            danger
            icon={<DeleteOutlined />}
            aria-label={`Xóa lần nhập ${record.itemName}`}
          >
            {mobile ? "Xóa" : null}
          </Button>
        </Popconfirm>
      </Space>
    );
  }

  function closeEditor() {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  }

  function openEditor(record?: Purchase) {
    const ingredient = record
      ? ingredients.find(
          (item) =>
            recordId(item) === String(record.ingredientId ?? "") ||
            item.code === record.itemCode,
        )
      : undefined;
    setEditing(record ?? null);
    form.setFieldsValue(
      record
        ? {
            purchaseDate: dayjs(record.purchaseDate),
            ingredientId: ingredient ? recordId(ingredient) : undefined,
            packageCount: record.packageCount,
            totalAmount: record.totalAmount,
            fundingSource:
              record.fundingSource ??
              DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
            supplier: record.supplier,
            note: record.note,
          }
        : {
            purchaseDate: dayjs(),
            packageCount: 1,
            fundingSource: "sales_revenue",
          },
    );
    setDrawerOpen(true);
  }

  async function saveRecord(values: PurchaseForm) {
    setSaving(true);
    try {
      const id = editing ? recordId(editing) : "";
      const response = await fetch(
        id ? `/api/purchases/${id}` : "/api/purchases",
        {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purchaseDate: values.purchaseDate.toISOString(),
            ingredientId: values.ingredientId,
            packageCount: values.packageCount,
            totalAmount: values.totalAmount,
            fundingSource: values.fundingSource,
            supplier: values.supplier ?? "",
            note: values.note ?? "",
          }),
        },
      );
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: Purchase;
      };
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      setPurchases((current) =>
        id
          ? current.map((item) =>
              recordId(item) === id ? (body.data as Purchase) : item,
            )
          : [body.data as Purchase, ...current],
      );
      message.success(body.message);
      closeEditor();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu lần nhập",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeRecord(record: Purchase) {
    const id = recordId(record);
    if (!id) return;
    try {
      const response = await fetch(`/api/purchases/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !body.success) throw new Error(body.message);
      setPurchases((current) =>
        current.filter((item) => recordId(item) !== id),
      );
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể xóa lần nhập",
      );
    }
  }

  if (purchasesLoading || ingredientsLoading) {
    return <RouteSkeleton />;
  }

  return (
    <div className="page-wrap">
      <PageHeader
        title="Nhập hàng"
        description="Ghi tổng tiền đã thanh toán và nguồn tiền sử dụng; đơn giá thực tế và giá vốn được tự tính."
      />
      {(purchasesFallback || ingredientsFallback) && (
        <Alert
          type="info"
          showIcon
          title="Danh mục đang lấy từ snapshot Excel"
          description="Có thể xem và thử giao diện; để lưu cần MongoDB và dữ liệu đã import."
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="surface-card table-card">
        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm tên hàng, mã, nguồn tiền…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ width: 320 }}
          />
          <Space>
            <Button
              icon={<DownloadOutlined />}
              href="/api/export/purchases"
              target="_blank"
            >
              Xuất Excel
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openEditor()}
            >
              Thêm lần nhập
            </Button>
          </Space>
        </div>
        <div className="purchase-desktop-table">
          <Table
            size="small"
            rowKey={purchaseKey}
            columns={columns}
            dataSource={visiblePurchases}
            pagination={{ defaultPageSize: 50, showSizeChanger: false }}
            scroll={{ x: "max-content" }}
          />
        </div>
        <List
          className="purchase-mobile-list"
          rowKey={purchaseKey}
          dataSource={visiblePurchases}
          locale={{ emptyText: <Empty description="Chưa có lần nhập hàng" /> }}
          pagination={{
            pageSize: 20,
            size: "small",
            showSizeChanger: false,
            position: "bottom",
            align: "center",
          }}
          renderItem={(record) => (
            <List.Item className="purchase-mobile-item">
              <article className="purchase-mobile-card">
                <div className="purchase-card-heading">
                  <div>
                    <Text strong className="purchase-card-name">
                      {record.itemName}
                    </Text>
                    <Space size={6} wrap>
                      <Tag>{record.itemCode}</Tag>
                      <Text type="secondary">{record.category}</Text>
                    </Space>
                  </div>
                  <Text type="secondary">{formatDate(record.purchaseDate)}</Text>
                </div>
                <dl className="purchase-card-details">
                  <div>
                    <dt>Số gói</dt>
                    <dd>{formatNumber(record.packageCount)}</dd>
                  </div>
                  <div>
                    <dt>Quy cách</dt>
                    <dd>
                      {formatNumber(record.packageQuantity)} {record.costUnit}/gói
                    </dd>
                  </div>
                  <div>
                    <dt>Tổng lượng</dt>
                    <dd>
                      {formatNumber(record.convertedQuantity)} {record.costUnit}
                    </dd>
                  </div>
                  <div className="purchase-card-total">
                    <dt>Tổng tiền</dt>
                    <dd>{formatVnd(record.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Nguồn tiền</dt>
                    <dd>
                      <Tag color={fundingSourceTagColor(record.fundingSource)}>
                        {purchaseFundingSourceLabel(record.fundingSource)}
                      </Tag>
                    </dd>
                  </div>
                </dl>
                {record.supplier && (
                  <div className="purchase-card-supplier">
                    <Text type="secondary">Nhà cung cấp</Text>
                    <Text>{record.supplier}</Text>
                  </div>
                )}
                {renderPurchaseActions(record, true)}
              </article>
            </List.Item>
          )}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        className="purchase-drawer"
        title={editing ? "Chỉnh sửa lần nhập" : "Thêm lần nhập"}
        placement="right"
        size="large"
        onClose={closeEditor}
        destroyOnHidden
        footer={
          <div className="purchase-drawer-footer">
            <Button size="large" onClick={closeEditor}>
              Hủy
            </Button>
            <Button
              type="primary"
              size="large"
              loading={saving}
              onClick={() => form.submit()}
            >
              {editing ? "Lưu thay đổi" : "Lưu lần nhập"}
            </Button>
          </div>
        }
      >
        <Form<PurchaseForm>
          form={form}
          layout="vertical"
          onFinish={saveRecord}
        >
          <div className="purchase-form-grid">
            <Form.Item
              name="purchaseDate"
              label="Ngày nhập"
              rules={[{ required: true, message: "Vui lòng chọn ngày nhập" }]}
            >
              <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              name="ingredientId"
              label="Tên hàng"
              rules={[{ required: true, message: "Vui lòng chọn hàng có sẵn" }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn từ danh mục Hàng hóa"
                options={ingredients
                  .filter((ingredient) => ingredient.isActive)
                  .map((ingredient) => ({
                    value: recordId(ingredient),
                    label: `${ingredient.name} · ${ingredient.code}`,
                  }))}
                onChange={(ingredientId) => {
                  const ingredient = ingredientById.get(ingredientId);
                  form.setFieldValue(
                    "totalAmount",
                    packageCount * (ingredient?.referencePackagePrice ?? 0),
                  );
                }}
              />
            </Form.Item>
            <Form.Item
              name="packageCount"
              label="Số gói mua"
              rules={[
                { required: true, message: "Vui lòng nhập số gói" },
                {
                  type: "number",
                  min: 0.000001,
                  message: "Số gói phải lớn hơn 0",
                },
              ]}
            >
              <InputNumber
                min={0}
                inputMode="decimal"
                style={{ width: "100%" }}
                onChange={(value) => {
                  const referencePackagePrice =
                    selectedIngredient?.referencePackagePrice ?? 0;
                  const referenceTotal = packageCount * referencePackagePrice;
                  if (
                    enteredTotalAmount === undefined ||
                    enteredTotalAmount === referenceTotal
                  ) {
                    form.setFieldValue(
                      "totalAmount",
                      Number(value ?? 0) * referencePackagePrice,
                    );
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="totalAmount"
              label="Tổng tiền thanh toán"
              tooltip="Nhập toàn bộ số tiền thực trả, bao gồm tiền hàng, phí ship và các chi phí mua hàng khác."
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập tổng tiền đã thanh toán",
                },
                {
                  type: "number",
                  min: 0,
                  message: "Tổng tiền không được âm",
                },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                inputMode="numeric"
                style={{ width: "100%" }}
                formatter={formatVndInput}
                parser={parseVndInput}
              />
            </Form.Item>
            <Form.Item
              name="fundingSource"
              label="Nguồn tiền"
              tooltip="Chỉ nguồn Vốn chủ mới làm tăng Tổng vốn đã bỏ và phần vốn cần thu hồi. Các nguồn khác vẫn được tính là tiền ra trong kỳ."
              rules={[
                {
                  required: true,
                  message: "Vui lòng chọn nguồn tiền",
                },
              ]}
            >
              <Select
                placeholder="Chọn nguồn dùng để thanh toán"
                options={PURCHASE_FUNDING_SOURCE_OPTIONS}
              />
            </Form.Item>
            <Form.Item name="supplier" label="Nhà cung cấp">
              <Input placeholder="Không bắt buộc" />
            </Form.Item>
            <Form.Item name="note" label="Ghi chú">
              <Input.TextArea rows={3} placeholder="Không bắt buộc" />
            </Form.Item>
          </div>
        </Form>

        <Card size="small" title="Thông tin tự động" className="calculated-card">
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="Mã nội bộ">
              {selectedIngredient?.code ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Nhóm">
              {selectedIngredient?.category ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Quy cách/gói">
              {selectedIngredient
                ? `${formatNumber(selectedIngredient.packageQuantity)} ${selectedIngredient.costUnit}`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Giá tham khảo/gói">
              {selectedIngredient
                ? formatVnd(selectedIngredient.referencePackagePrice)
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Giá thực tế/gói">
              {selectedIngredient && packageCount > 0
                ? formatVnd(effectivePrice)
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Tổng lượng quy đổi">
              {selectedIngredient
                ? `${formatNumber(convertedQuantity)} ${selectedIngredient.costUnit}`
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Tổng tiền">
              <Text strong>{formatVnd(enteredTotalAmount ?? 0)}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Drawer>
    </div>
  );
}
