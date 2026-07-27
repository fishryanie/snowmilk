"use client";

import {
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
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
  List,
  Popconfirm,
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
import { formatDate, formatVnd } from "@/lib/formatters";

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
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [suggestionQuery, setSuggestionQuery] = useState("");
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
  const visibleSuggestions = useMemo(
    () =>
      normalizedSuggestionQuery
        ? context.eligibleItems.filter((item) =>
            [
              item.name,
              item.code,
              item.category,
              sourceTypeLabel(item.sourceType),
            ].some((value) =>
              value
                .toLocaleLowerCase("vi")
                .includes(normalizedSuggestionQuery),
            ),
          )
        : context.eligibleItems,
    [context.eligibleItems, normalizedSuggestionQuery],
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
              ? "Nguồn tiền của các phiếu nhập sẽ được hoàn lại thành Vốn chủ."
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
    form.resetFields();
  }

  function openDrawer() {
    form.setFieldsValue({ withdrawalDate: dayjs(), note: "" });
    setSelectedKeys([]);
    setSuggestionQuery("");
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
          "Tổng đã chọn phải nhỏ hơn số tiền còn lại của doanh nghiệp.",
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
            <Text strong>Claim từ lịch sử mua</Text>
            <Text type="secondary">
              Claim sẽ đổi nguồn tiền của phiếu nhập từ Vốn chủ sang Tiền bán
              hàng.
            </Text>
          </div>
          <div
            className="divestment-cash-breakdown"
            aria-label="Cách tính số tiền còn lại của doanh nghiệp"
          >
            <Statistic
              title="Doanh thu"
              value={context.businessCash.totalRevenue}
              formatter={(value) => formatVnd(Number(value))}
            />
            <span aria-hidden="true">−</span>
            <Statistic
              title="Chi bằng tiền công ty"
              value={context.businessCash.totalCompanyFundedOutflow}
              formatter={(value) => formatVnd(Number(value))}
            />
            <span aria-hidden="true">=</span>
            <Statistic
              title="Tiền doanh nghiệp còn lại"
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
            title={`${context.unavailableItemCount} phiếu nhập chưa thể claim`}
            description="Giá trị phiếu nhập phải nhỏ hơn số tiền doanh nghiệp còn lại. Danh sách sẽ tự cập nhật khi có thêm doanh thu."
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
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={visibleDivestments}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      <Drawer
        open={drawerOpen}
        title="Chọn khoản lịch sử để claim"
        placement="right"
        size="large"
        extra={
          <Space>
            <Button onClick={resetDrawer}>Hủy</Button>
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
            title="Tiền doanh nghiệp còn lại"
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
              Chỉ hiện phiếu nhập bằng Vốn chủ có giá trị nhỏ hơn số tiền còn
              lại.
            </Text>
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm phiếu nhập…"
            value={suggestionQuery}
            onChange={(event) => setSuggestionQuery(event.target.value)}
          />
        </div>

        {visibleSuggestions.length > 0 ? (
          <List
            className="divestment-suggestion-list"
            dataSource={visibleSuggestions}
            renderItem={(item) => {
              const selected = selectedKeySet.has(item.key);
              const disabled =
                !selected && item.amount >= remainingLimit;
              return (
                <List.Item>
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
                        <ShoppingCartOutlined />
                      </span>
                      <span className="divestment-suggestion-content">
                        <span>
                          <Text strong>{item.name}</Text>
                          <Tag color={sourceTypeColor(item.sourceType)}>
                            {sourceTypeLabel(item.sourceType)}
                          </Tag>
                        </span>
                        <Text type="secondary">
                          {[item.code, item.category, formatDate(item.purchaseDate)]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </span>
                      <Text strong className="divestment-suggestion-amount">
                        {formatVnd(item.amount)}
                      </Text>
                    </div>
                  </Checkbox>
                </List.Item>
              );
            }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              normalizedSuggestionQuery
                ? "Không tìm thấy khoản phù hợp"
                : "Chưa có khoản lịch sử nào nằm trong hạn mức hiện tại"
            }
          />
        )}
      </Drawer>
    </>
  );
}
