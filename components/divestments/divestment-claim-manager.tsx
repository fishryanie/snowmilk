"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import type { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import type {
  BusinessCashBalance,
  ClaimableInvestment,
  DivestmentClaimSnapshot,
} from "@/lib/divestment-claims";
import { formatDate, formatNumber, formatVnd } from "@/lib/formatters";

const { Text } = Typography;

type DivestmentRecord = {
  id: string;
  withdrawalDate: string;
  amount: number;
  note: string;
  claims: DivestmentClaimSnapshot[];
};

export type DivestmentClaimContext = {
  summary: ReturnType<typeof calculateCapitalRecovery>;
  businessCash: BusinessCashBalance;
  withdrawalLimit: number;
  eligibleItems: ClaimableInvestment[];
  unavailableItemCount: number;
  divestments: DivestmentRecord[];
};

type ClaimForm = {
  withdrawalDate: Dayjs;
  note?: string;
};

type SuggestionSourceFilter =
  | "all"
  | ClaimableInvestment["sourceType"];

function sourceTypeLabel(sourceType: ClaimableInvestment["sourceType"]) {
  return sourceType === "equipment" ? "Tài sản" : "Nhập hàng";
}

function sourceTypeColor(sourceType: ClaimableInvestment["sourceType"]) {
  return sourceType === "equipment" ? "cyan" : "geekblue";
}

export function DivestmentClaimManager({
  context,
  usingFallback,
  onMutation,
}: {
  context: DivestmentClaimContext;
  usingFallback: boolean;
  onMutation: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ClaimForm>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionSourceFilter, setSuggestionSourceFilter] =
    useState<SuggestionSourceFilter>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const selectedKeySet = useMemo(
    () => new Set(selectedKeys),
    [selectedKeys],
  );
  const itemsByKey = useMemo(
    () => new Map(context.eligibleItems.map((item) => [item.key, item])),
    [context.eligibleItems],
  );
  const selectedItems = useMemo(
    () =>
      selectedKeys
        .map((key) => itemsByKey.get(key))
        .filter((item): item is ClaimableInvestment => Boolean(item)),
    [itemsByKey, selectedKeys],
  );
  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const remainingLimit = Math.max(
    0,
    context.withdrawalLimit - selectedTotal,
  );
  const normalizedSuggestionQuery = suggestionQuery
    .trim()
    .toLocaleLowerCase("vi");
  const eligibleItemCounts = useMemo(
    () =>
      context.eligibleItems.reduce(
        (counts, item) => {
          counts[item.sourceType] += 1;
          return counts;
        },
        { equipment: 0, purchase: 0 },
      ),
    [context.eligibleItems],
  );
  const visibleSuggestions = useMemo(
    () =>
      context.eligibleItems.filter((item) => {
        if (
          suggestionSourceFilter !== "all" &&
          item.sourceType !== suggestionSourceFilter
        ) {
          return false;
        }
        if (!normalizedSuggestionQuery) return true;
        return [
          item.name,
          item.code,
          item.category,
          sourceTypeLabel(item.sourceType),
        ].some((value) =>
          value
            .toLocaleLowerCase("vi")
            .includes(normalizedSuggestionQuery),
        );
      }),
    [
      context.eligibleItems,
      normalizedSuggestionQuery,
      suggestionSourceFilter,
    ],
  );
  const normalizedHistoryQuery = historyQuery
    .trim()
    .toLocaleLowerCase("vi");
  const visibleDivestments = useMemo(
    () =>
      normalizedHistoryQuery
        ? context.divestments.filter((record) =>
            [
              record.note,
              ...record.claims.flatMap((claim) => [
                claim.sourceName,
                claim.sourceCode,
              ]),
            ].some((value) =>
              value
                .toLocaleLowerCase("vi")
                .includes(normalizedHistoryQuery),
            ),
          )
        : context.divestments,
    [context.divestments, normalizedHistoryQuery],
  );

  const columns: ColumnsType<DivestmentRecord> = [
    {
      title: "Ngày rút",
      dataIndex: "withdrawalDate",
      key: "withdrawalDate",
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: "Khoản lịch sử đã chọn",
      key: "claims",
      render: (_value, record) =>
        record.claims.length > 0 ? (
          <div className="divestment-history-claims">
            {record.claims.map((claim) => (
              <div key={claim.sourceKey}>
                <Tag color={sourceTypeColor(claim.sourceType)}>
                  {sourceTypeLabel(claim.sourceType)}
                </Tag>
                <Text strong>{claim.sourceName}</Text>
                {claim.sourceCode && (
                  <Text type="secondary"> · {claim.sourceCode}</Text>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">Bản ghi cũ, chưa gắn khoản lịch sử</Text>
        ),
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      width: 160,
      align: "right",
      render: (value: number) => <Text strong>{formatVnd(value)}</Text>,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (value: string) => value || "—",
    },
    {
      title: "",
      key: "actions",
      width: 54,
      fixed: "right",
      render: (_value, record) => (
        <Popconfirm
          title="Xóa lần thu hồi này?"
          description={
            record.claims.length > 0
              ? "Nguồn tiền của các phiếu nhập và tài sản đã chọn sẽ được hoàn lại thành Tiền cá nhân."
              : "Tổng vốn đã thu hồi sẽ được tính lại."
          }
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={() => removeRecord(record.id)}
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label="Xóa lần thu hồi"
          />
        </Popconfirm>
      ),
    },
  ];

  function resetDrawer() {
    setDrawerOpen(false);
    setSelectedKeys([]);
    setSuggestionQuery("");
    setSuggestionSourceFilter("all");
    form.resetFields();
  }

  function openDrawer() {
    form.setFieldsValue({ withdrawalDate: dayjs(), note: "" });
    setSelectedKeys([]);
    setSuggestionQuery("");
    setSuggestionSourceFilter("all");
    setDrawerOpen(true);
  }

  function toggleItem(item: ClaimableInvestment, checked: boolean) {
    setSelectedKeys((current) => {
      if (!checked) return current.filter((key) => key !== item.key);
      const currentTotal = current.reduce(
        (sum, key) => sum + (itemsByKey.get(key)?.amount ?? 0),
        0,
      );
      if (currentTotal + item.amount >= context.withdrawalLimit) {
        message.warning(
          "Tổng đã chọn phải nhỏ hơn số tiền còn lại của tiệm.",
        );
        return current;
      }
      return [...current, item.key];
    });
  }

  async function saveClaim(values: ClaimForm) {
    if (selectedKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một khoản trong lịch sử.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/divestment-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawalDate: values.withdrawalDate.toISOString(),
          sourceKeys: selectedKeys,
          note: values.note ?? "",
        }),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !body.success) throw new Error(body.message);
      message.success(body.message);
      resetDrawer();
      onMutation();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không thể ghi nhận khoản thu hồi",
      );
    } finally {
      setSaving(false);
    }
  }

  async function exportSelectedPdf() {
    if (selectedItems.length === 0) {
      message.warning("Vui lòng chọn ít nhất một khoản để xuất PDF.");
      return;
    }

    setExportingPdf(true);
    try {
      const claimDate =
        form.getFieldValue("withdrawalDate")?.toISOString() ??
        new Date().toISOString();
      const response = await fetch("/api/export/divestment-claims/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimDate,
          records: selectedItems.map((item) => ({
            sourceType: item.sourceType,
            code: item.code,
            name: item.name,
            category: item.category,
            purchaseDate: item.purchaseDate,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: item.amount,
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
      link.download = "bao-cao-khoan-claim-da-chon.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      message.success(`Đã tải PDF ${selectedItems.length} khoản đã chọn`);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể tạo file PDF",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  async function removeRecord(id: string) {
    try {
      const response = await fetch(`/api/divestments/${id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
      };
      if (!response.ok || !body.success) throw new Error(body.message);
      message.success(body.message);
      onMutation();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể xóa dữ liệu",
      );
    }
  }

  const cannotCreate =
    usingFallback ||
    context.withdrawalLimit <= 0 ||
    context.eligibleItems.length === 0;

  return (
    <>
      <Card className="surface-card table-card divestment-claim-card">
        <div className="divestment-claim-overview">
          <div>
            <Text strong>Claim từ lịch sử đầu tư</Text>
            <Text type="secondary">
              Claim sẽ đổi nguồn tiền của phiếu nhập hoặc tài sản từ Tiền cá nhân
              sang Tiền bán hàng.
            </Text>
          </div>
          <div
            className="divestment-cash-breakdown"
            aria-label="Cách tính số tiền còn lại của tiệm"
          >
            <Statistic
              title="Doanh thu"
              value={context.businessCash.totalRevenue}
              formatter={(value) => formatVnd(Number(value))}
            />
            <span aria-hidden="true">−</span>
            <Statistic
              title="Chi bằng tiền tiệm"
              value={context.businessCash.totalCompanyFundedOutflow}
              formatter={(value) => formatVnd(Number(value))}
            />
            <span aria-hidden="true">=</span>
            <Statistic
              title="Tiền tiệm còn lại"
              value={context.businessCash.remainingBalance}
              formatter={(value) => formatVnd(Number(value))}
            />
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={cannotCreate}
            onClick={openDrawer}
          >
            Chọn khoản để claim
          </Button>
        </div>

        {context.unavailableItemCount > 0 && (
          <Alert
            showIcon
            type="warning"
            title={`${context.unavailableItemCount} khoản đầu tư chưa thể claim`}
            description="Giá trị từng phiếu nhập hoặc tài sản phải nhỏ hơn số tiền tiệm còn lại. Danh sách sẽ tự cập nhật khi có thêm doanh thu."
          />
        )}

        <div className="table-toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm khoản đã claim…"
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            style={{ width: 300 }}
          />
          <Button
            icon={<DownloadOutlined />}
            href="/api/export/divestments"
            target="_blank"
          >
            Xuất Excel
          </Button>
        </div>
        <Table
          className="divestment-history-desktop"
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={visibleDivestments}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
        />
        <ul className="divestment-history-mobile">
          {visibleDivestments.map((record) => (
            <li key={record.id}>
              <div className="divestment-history-mobile-heading">
                <div>
                  <Text type="secondary">
                    {formatDate(record.withdrawalDate)}
                  </Text>
                  <Text strong>{formatVnd(record.amount)}</Text>
                </div>
                <Popconfirm
                  title="Xóa lần thu hồi này?"
                  description={
                    record.claims.length > 0
                      ? "Nguồn tiền của các khoản đã chọn sẽ được hoàn lại thành Tiền cá nhân."
                      : "Tổng vốn đã thu hồi sẽ được tính lại."
                  }
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => removeRecord(record.id)}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    aria-label="Xóa lần thu hồi"
                  />
                </Popconfirm>
              </div>
              <div className="divestment-history-mobile-claims">
                {record.claims.length > 0 ? (
                  <>
                    {record.claims.slice(0, 2).map((claim) => (
                      <div key={claim.sourceKey}>
                        <Tag color={sourceTypeColor(claim.sourceType)}>
                          {sourceTypeLabel(claim.sourceType)}
                        </Tag>
                        <Text>{claim.sourceName}</Text>
                      </div>
                    ))}
                    {record.claims.length > 2 && (
                      <Text type="secondary">
                        +{record.claims.length - 2} khoản khác
                      </Text>
                    )}
                  </>
                ) : (
                  <Text type="secondary">
                    Bản ghi cũ, chưa gắn khoản lịch sử
                  </Text>
                )}
              </div>
              {record.note && (
                <Text type="secondary" ellipsis>
                  {record.note}
                </Text>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Drawer
        className="divestment-drawer"
        open={drawerOpen}
        title="Chọn khoản lịch sử để claim"
        placement="right"
        size="large"
        footer={
          <Space wrap>
            <Button onClick={resetDrawer}>Hủy</Button>
            <Button
              icon={<FilePdfOutlined />}
              loading={exportingPdf}
              disabled={selectedKeys.length === 0}
              onClick={exportSelectedPdf}
            >
              Xuất PDF mục đã chọn
            </Button>
            <Button
              type="primary"
              loading={saving}
              disabled={selectedKeys.length === 0}
              onClick={() => form.submit()}
            >
              Xác nhận claim
            </Button>
          </Space>
        }
        onClose={resetDrawer}
        destroyOnHidden
      >
        <div className="divestment-claim-summary">
          <Statistic
            title="Tiền tiệm còn lại"
            value={context.withdrawalLimit}
            formatter={(value) => formatVnd(Number(value))}
          />
          <Statistic
            title="Tổng đã chọn"
            value={selectedTotal}
            formatter={(value) => formatVnd(Number(value))}
            styles={{ content: { color: "var(--brand-strong)" } }}
          />
          <Statistic
            title="Còn có thể chọn"
            value={remainingLimit}
            formatter={(value) => formatVnd(Number(value))}
          />
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={saveClaim}
          className="divestment-claim-form"
        >
          <Form.Item
            name="withdrawalDate"
            label="Ngày rút"
            rules={[
              { required: true, message: "Vui lòng chọn ngày rút vốn" },
            ]}
          >
            <DatePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea
              rows={2}
              placeholder="Thông tin bổ sung nếu cần"
            />
          </Form.Item>
        </Form>

        <div className="divestment-suggestion-heading">
          <div>
            <Text strong>Các khoản có thể chọn</Text>
            <Text type="secondary">
              Hiện phiếu nhập và tài sản trong mục Đầu tư & tài sản dùng Tiền
              cá nhân, có giá trị nhỏ hơn số tiền còn lại.
            </Text>
          </div>
          <div className="divestment-suggestion-filters">
            <Segmented
              block
              aria-label="Lọc khoản theo loại"
              options={[
                {
                  label: `Tất cả (${context.eligibleItems.length})`,
                  value: "all",
                },
                {
                  label: `Nhập hàng (${eligibleItemCounts.purchase})`,
                  value: "purchase",
                },
                {
                  label: `Tài sản (${eligibleItemCounts.equipment})`,
                  value: "equipment",
                },
              ]}
              value={suggestionSourceFilter}
              onChange={(value) =>
                setSuggestionSourceFilter(
                  value as SuggestionSourceFilter,
                )
              }
            />
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm phiếu nhập hoặc tài sản…"
              value={suggestionQuery}
              onChange={(event) => setSuggestionQuery(event.target.value)}
            />
          </div>
        </div>

        {visibleSuggestions.length > 0 ? (
          <div className="divestment-suggestion-list">
            <div className="ant-list-items">
              {visibleSuggestions.map((item) => {
              const selected = selectedKeySet.has(item.key);
              const disabled =
                !selected && item.amount >= remainingLimit;
              return (
                <div className="ant-list-item" key={item.key}>
                  <Checkbox
                    checked={selected}
                    disabled={disabled}
                    aria-label={`Chọn ${item.name}, ${formatVnd(item.amount)}`}
                    onChange={(event) =>
                      toggleItem(item, event.target.checked)
                    }
                  >
                    <div className="divestment-suggestion-item">
                      <span className="divestment-suggestion-icon">
                        {item.sourceType === "equipment" ? (
                          <ToolOutlined />
                        ) : (
                          <ShoppingCartOutlined />
                        )}
                      </span>
                      <span className="divestment-suggestion-content">
                        <span>
                          <Text strong>{item.name}</Text>
                          <Tag color={sourceTypeColor(item.sourceType)}>
                            {sourceTypeLabel(item.sourceType)}
                          </Tag>
                        </span>
                        <Text type="secondary">
                          {[
                            item.code,
                            item.category,
                            formatDate(item.purchaseDate),
                            `${formatNumber(item.quantity)} ${item.unit} × ${formatVnd(item.unitPrice)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </span>
                      <Text strong className="divestment-suggestion-amount">
                        {formatVnd(item.amount)}
                      </Text>
                    </div>
                  </Checkbox>
                </div>
              );
              })}
            </div>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              normalizedSuggestionQuery
                ? "Không tìm thấy khoản phù hợp"
                : suggestionSourceFilter === "all"
                  ? "Chưa có khoản lịch sử nào nằm trong hạn mức hiện tại"
                  : `Chưa có ${suggestionSourceFilter === "equipment" ? "tài sản" : "phiếu nhập"} nào nằm trong hạn mức hiện tại`
            }
          />
        )}
      </Drawer>
    </>
  );
}
