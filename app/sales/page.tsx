"use client";

import {
  BankOutlined,
  CalendarOutlined,
  CheckCircleFilled,
  DollarOutlined,
  EditOutlined,
  RightOutlined,
  SaveOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import {
  calculateDailySaleEstimateFromRevenue,
  type DailySaleAssumption,
} from "@/lib/calculations/daily-sales";
import {
  formatDate,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import { useApiData } from "@/hooks/use-api-data";
import { workbookBatches } from "@/lib/workbook-snapshot";

const { Text, Title } = Typography;

type SaleHistory = {
  id?: string;
  _id?: string;
  saleDate: string;
  batchId?: string;
  batchCode?: string;
  batchName?: string;
  netRevenue: number;
  cashReceived?: number | null;
  bankTransferReceived?: number | null;
  totalVariableCost: number;
  allocatedFixedCost: number;
  estimatedProfit: number;
  estimatedProfitLow: number;
  estimatedProfitHigh: number;
  estimatedMargin: number;
  note?: string;
};

type MilkBatchOption = {
  id: string;
  code: string;
  name: string;
  actualLiters: number;
  cookedAt?: string;
  costPerLiter: number;
  costPerMl: number;
};

type SalesData = {
  history: SaleHistory[];
  assumptions: DailySaleAssumption[];
  batches: MilkBatchOption[];
};

const fallbackAssumptions: DailySaleAssumption[] = [
  {
    sizeCode: "M",
    sizeName: "Size M",
    milkMl: 400,
    referenceSellingPrice: 35_000,
    milkCostPerCup: 11_862.08333,
    packagingCostPerCup: 900,
    toppingCostPerCup: 2_572.159091,
    toppingCostLowPerCup: 1_581.818182,
    toppingCostHighPerCup: 3_562.5,
    overheadRate: 0.05,
    fixedCostPerCup: 91.36388889,
    sampleCount: 2,
  },
  {
    sizeCode: "L",
    sizeName: "Size L",
    milkMl: 550,
    referenceSellingPrice: 40_000,
    milkCostPerCup: 16_310.36458,
    packagingCostPerCup: 900,
    toppingCostPerCup: 2_572.159091,
    toppingCostLowPerCup: 1_581.818182,
    toppingCostHighPerCup: 3_562.5,
    overheadRate: 0.05,
    fixedCostPerCup: 91.36388889,
    sampleCount: 2,
  },
];

function recordId(record: SaleHistory) {
  return record.id ?? record._id ?? record.saleDate;
}

function batchRecordId(record: { id?: string; _id?: string }) {
  return record.id ?? record._id ?? "";
}

export default function SalesPage() {
  const { message, modal } = App.useApp();
  const {
    data,
    loading,
    usingFallback,
    setData,
  } = useApiData<SalesData>("/api/sales", {
    history: [],
    assumptions: fallbackAssumptions,
    batches: workbookBatches.map((batch) => ({
      ...batch,
      id: batchRecordId(batch),
    })),
  });
  const [saleDate, setSaleDate] = useState(() => dayjs());
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [netRevenue, setNetRevenue] = useState<number | null>(null);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [bankTransferReceived, setBankTransferReceived] = useState<
    number | null
  >(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const netRevenueValue = netRevenue ?? 0;
  const hasPaymentBreakdown =
    cashReceived !== null || bankTransferReceived !== null;
  const defaultBatchId = useMemo(() => {
    const latestSale = data.history[0];
    const previousBatch = latestSale
      ? data.batches.find(
          (batch) =>
            batchRecordId(batch) === String(latestSale.batchId ?? "") ||
            batch.code === latestSale.batchCode,
        )
      : null;
    return batchRecordId(
      previousBatch ??
        data.batches
          .toReversed()
          .find((batch) => batch.costPerMl > 0) ?? { id: "" },
    );
  }, [data.batches, data.history]);
  const activeBatchId = selectedBatchId || defaultBatchId;
  const selectedBatch = useMemo(
    () =>
      data.batches.find((batch) => batchRecordId(batch) === activeBatchId) ??
      null,
    [activeBatchId, data.batches],
  );
  const selectedAssumptions = useMemo(
    () =>
      selectedBatch
        ? data.assumptions.map((assumption) => ({
            ...assumption,
            milkCostPerCup: assumption.milkMl * selectedBatch.costPerMl,
          }))
        : data.assumptions,
    [data.assumptions, selectedBatch],
  );
  const estimate = useMemo(
    () =>
      calculateDailySaleEstimateFromRevenue(
        netRevenueValue,
        selectedAssumptions,
      ),
    [netRevenueValue, selectedAssumptions],
  );

  const canSubmit =
    Boolean(selectedBatch) &&
    (selectedBatch?.costPerMl ?? 0) > 0 &&
    hasPaymentBreakdown &&
    netRevenueValue > 0;

  function clearForm() {
    setSaleDate(dayjs());
    setNetRevenue(null);
    setCashReceived(null);
    setBankTransferReceived(null);
    setNote("");
  }

  async function submit(overwrite = false) {
    if (!selectedBatch) {
      message.warning("Hãy chọn mẻ sữa đã bán.");
      return;
    }
    if (selectedBatch.costPerMl <= 0) {
      message.warning(
        "Mẻ sữa này chưa có giá vốn hợp lệ. Hãy cập nhật lại mẻ sữa.",
      );
      return;
    }
    if (!hasPaymentBreakdown) {
      message.warning("Hãy nhập tiền mặt hoặc tiền chuyển khoản đã nhận.");
      return;
    }
    if (netRevenueValue <= 0) {
      message.warning("Tổng doanh thu cuối ngày phải lớn hơn 0.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleDate: saleDate.format("YYYY-MM-DD"),
          batchId: activeBatchId,
          netRevenue: netRevenueValue,
          cashReceived: cashReceived ?? 0,
          bankTransferReceived: bankTransferReceived ?? 0,
          note,
          overwrite,
        }),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: SaleHistory;
      };
      if (response.status === 409 && !overwrite) {
        modal.confirm({
          title: "Ngày này đã được chốt",
          content: body.message,
          okText: "Cập nhật",
          cancelText: "Hủy",
          onOk: () => submit(true),
        });
        return;
      }
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      const saved = body.data;
      setData((current) => ({
        ...current,
        history: [
          saved,
          ...current.history.filter(
            (record) => recordId(record) !== recordId(saved),
          ),
        ].sort(
          (a, b) =>
            new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime(),
        ),
      }));
      message.success(body.message);
      clearForm();
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không thể chốt bán hàng cuối ngày",
      );
    } finally {
      setSaving(false);
    }
  }

  function editRecord(record: SaleHistory) {
    setSaleDate(dayjs(record.saleDate));
    const matchingBatch = data.batches.find(
      (batch) =>
        batchRecordId(batch) === String(record.batchId ?? "") ||
        batch.code === record.batchCode,
    );
    setSelectedBatchId(matchingBatch ? batchRecordId(matchingBatch) : "");
    setNetRevenue(record.netRevenue);
    setCashReceived(record.cashReceived ?? null);
    setBankTransferReceived(record.bankTransferReceived ?? null);
    setNote(record.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <RouteSkeleton />;

  return (
    <div className="page-wrap sales-page">
      <PageHeader
        title="Chốt doanh thu"
        description="Chọn ngày và mẻ sữa, nhập hai khoản tiền đã nhận, rồi kiểm tra tổng trước khi lưu."
        actions={
          <Button
            className="sales-header-submit"
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!canSubmit}
            onClick={() => submit()}
          >
            Lưu chốt ngày
          </Button>
        }
      />
      {usingFallback ? (
        <Alert
          type="info"
          showIcon
          title="Đang dùng giả định từ workbook"
          description="Để lưu và lấy cost mới nhất, hãy bảo đảm MongoDB đang chạy và workbook đã được import."
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <div className="sales-grid">
        <Card className="surface-card sales-entry-card" title="Thông tin chốt ca">
          <section className="sales-form-section">
            <div className="sales-section-heading">
              <span className="workflow-step">1</span>
              <div>
                <Text strong>Chọn ngày và mẻ sữa</Text>
                <Text type="secondary">Dùng để tính đúng giá vốn của ca bán.</Text>
              </div>
            </div>
            <div className="sales-context-grid">
              <label className="sales-field daily-sales-date">
                <Text type="secondary">Ngày bán</Text>
                <DatePicker
                  aria-label="Ngày bán"
                  value={saleDate}
                  format="DD/MM/YYYY"
                  suffixIcon={<CalendarOutlined />}
                  onChange={(value) => value && setSaleDate(value)}
                  style={{ width: "100%" }}
                />
              </label>
              <label className="sales-field daily-sales-batch">
                <Text type="secondary">Mẻ sữa đã bán</Text>
                <Select
                  aria-label="Mẻ sữa đã bán"
                  showSearch
                  optionFilterProp="label"
                  value={activeBatchId || undefined}
                  placeholder="Chọn mẻ sữa"
                  onChange={setSelectedBatchId}
                  options={data.batches.map((batch) => ({
                    value: batchRecordId(batch),
                    label:
                      batch.costPerMl > 0
                        ? `${batch.code} · ${batch.name} · ${formatVnd(batch.costPerLiter)}/L`
                        : `${batch.code} · ${batch.name} · chưa có giá vốn`,
                    disabled: batch.costPerMl <= 0,
                  }))}
                  style={{ width: "100%" }}
                />
              </label>
            </div>
          </section>

          <section className="sales-form-section">
            <div className="sales-section-heading">
              <span className="workflow-step">2</span>
              <div>
                <Text strong>Nhập tiền thực nhận</Text>
                <Text type="secondary">
                  Có thể nhập một hoặc cả hai hình thức thanh toán.
                </Text>
              </div>
            </div>
            <div className="sales-payment-grid">
              <label className="sales-field daily-sales-cash">
                <span className="sales-payment-label">
                  <WalletOutlined /> Tiền mặt
                </span>
                <InputNumber
                  aria-label="Tiền mặt đã nhận"
                  min={0}
                  precision={0}
                  step={1_000}
                  value={cashReceived}
                  onChange={(value) => {
                    const nextValue = value === null ? null : Number(value);
                    setCashReceived(nextValue);
                    setNetRevenue(
                      nextValue === null && bankTransferReceived === null
                        ? null
                        : (nextValue ?? 0) + (bankTransferReceived ?? 0),
                    );
                  }}
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ width: "100%" }}
                />
              </label>
              <label className="sales-field daily-sales-transfer">
                <span className="sales-payment-label">
                  <BankOutlined /> Chuyển khoản
                </span>
                <InputNumber
                  aria-label="Tiền chuyển khoản đã nhận"
                  min={0}
                  precision={0}
                  step={1_000}
                  value={bankTransferReceived}
                  onChange={(value) => {
                    const nextValue = value === null ? null : Number(value);
                    setBankTransferReceived(nextValue);
                    setNetRevenue(
                      nextValue === null && cashReceived === null
                        ? null
                        : (cashReceived ?? 0) + (nextValue ?? 0),
                    );
                  }}
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  placeholder="0"
                  inputMode="numeric"
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div className="sales-total-banner">
              <div>
                <Text type="secondary">Tổng doanh thu</Text>
                <Text strong>{formatVnd(netRevenueValue)}</Text>
              </div>
              {hasPaymentBreakdown ? (
                <Tag color="green" icon={<CheckCircleFilled />}>
                  Đã tự động cộng
                </Tag>
              ) : (
                <Tag>Chưa nhập tiền</Tag>
              )}
              <InputNumber
                className="sales-total-accessible-input"
                aria-label="Tổng doanh thu cuối ngày"
                min={0}
                precision={0}
                step={1_000}
                value={netRevenue}
                readOnly
                formatter={formatVndInput}
                parser={parseVndInput}
              />
            </div>
          </section>

          <details className="sales-optional-note">
            <summary>Thêm ghi chú (không bắt buộc)</summary>
            <div className="daily-sales-note">
              <Input.TextArea
                aria-label="Ghi chú bán hàng"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: hoàn tiền, đơn biếu tặng..."
                rows={3}
              />
            </div>
          </details>

          <Alert
            type="info"
            showIcon
            title={
              !selectedBatch
                ? "Hãy chọn mẻ sữa đã bán"
                : "Giá vốn và lợi nhuận chỉ là ước tính"
            }
            description={
              !selectedBatch
                ? "Mẻ sữa là bắt buộc để hệ thống lưu đúng mẻ đã bán và dùng đúng giá vốn khi tính lãi/lỗ."
                : "Hệ thống dùng doanh thu, giá bán tham chiếu và định mức hiện có để ước tính giá vốn. Không lưu các con số này như số ly hay số lít thực tế."
            }
            style={{ marginTop: 20 }}
          />
        </Card>

        <Card className="surface-card summary-panel" title="Kiểm tra trước khi lưu">
          <div className="sales-profit-hero">
            <DollarOutlined />
            <div>
              <Text type="secondary">Lợi nhuận ước tính</Text>
              <Title
                level={3}
                type={estimate.estimatedProfit < 0 ? "danger" : "success"}
              >
                {formatVnd(estimate.estimatedProfit)}
              </Title>
              <Text type="secondary">
                Biên lợi nhuận {(estimate.estimatedMargin * 100).toFixed(1)}%
              </Text>
            </div>
          </div>
          <div className="summary-row">
            <Text type="secondary">Công thức giá vốn</Text>
            <Text>
              {selectedBatch
                ? `${selectedBatch.code} · ${formatVnd(selectedBatch.costPerLiter)}/L`
                : "Chưa có mẻ sữa"}
            </Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Doanh thu thực nhận</Text>
            <Text>{formatVnd(estimate.netRevenue)}</Text>
          </div>
          {hasPaymentBreakdown ? (
            <>
              <div className="summary-row">
                <Text type="secondary">Tiền mặt đã nhận</Text>
                <Text>{formatVnd(cashReceived ?? 0)}</Text>
              </div>
              <div className="summary-row">
                <Text type="secondary">Tiền chuyển khoản</Text>
                <Text>{formatVnd(bankTransferReceived ?? 0)}</Text>
              </div>
            </>
          ) : null}
          <details className="sales-cost-details">
            <summary>Xem chi tiết chi phí ước tính</summary>
            <div className="summary-row">
              <Text type="secondary">Cost sữa nền</Text>
              <Text>{formatVnd(estimate.totalMilkCost)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Cost bao bì</Text>
              <Text>{formatVnd(estimate.totalPackagingCost)}</Text>
            </div>
            <div className="summary-row">
              <Space size={6}>
                <Text type="secondary">Cost topping</Text>
                <Tag color="processing">ước tính</Tag>
              </Space>
              <Text>{formatVnd(estimate.estimatedToppingCost)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Overhead biến đổi</Text>
              <Text>{formatVnd(estimate.estimatedOverheadCost)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Cố định + khấu hao</Text>
              <Text>{formatVnd(estimate.allocatedFixedCost)}</Text>
            </div>
            <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
              <Descriptions.Item label="Khoảng lợi nhuận">
                {formatVnd(estimate.estimatedProfitLow)} –{" "}
                {formatVnd(estimate.estimatedProfitHigh)}
              </Descriptions.Item>
            </Descriptions>
          </details>
        </Card>
      </div>

      <Card
        className="surface-card table-card"
        title="Lịch sử chốt ngày"
        style={{ marginTop: 16 }}
      >
        <Table
          className="sales-history-desktop"
          size="small"
          rowKey={recordId}
          dataSource={data.history}
          pagination={{ defaultPageSize: 50, showSizeChanger: false }}
          scroll={{ x: "max-content" }}
          columns={[
            { title: "Ngày", dataIndex: "saleDate", render: formatDate },
            {
              title: "Mẻ sữa",
              render: (_, record) => {
                const batch = data.batches.find(
                  (candidate) =>
                    batchRecordId(candidate) ===
                      String(record.batchId ?? "") ||
                    candidate.code === record.batchCode,
                );
                return batch
                  ? `${batch.code} · ${batch.name}`
                  : record.batchCode || record.batchName || "—";
              },
            },
            {
              title: "Doanh thu",
              dataIndex: "netRevenue",
              align: "right",
              render: (value) => formatVnd(Number(value)),
            },
            {
              title: "Tiền mặt",
              dataIndex: "cashReceived",
              align: "right",
              render: (value) =>
                typeof value === "number" ? formatVnd(value) : "—",
            },
            {
              title: "Chuyển khoản",
              dataIndex: "bankTransferReceived",
              align: "right",
              render: (value) =>
                typeof value === "number" ? formatVnd(value) : "—",
            },
            {
              title: "Lãi/lỗ ước tính",
              dataIndex: "estimatedProfit",
              align: "right",
              render: (value) => (
                <Text type={Number(value) < 0 ? "danger" : "success"} strong>
                  {formatVnd(Number(value))}
                </Text>
              ),
            },
            {
              title: "",
              fixed: "right",
              render: (_, record) => (
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={`Sửa chốt ngày ${formatDate(record.saleDate)}`}
                  onClick={() => editRecord(record)}
                />
              ),
            },
          ]}
        />
        <ul className="sales-history-mobile">
          {data.history.map((record) => {
            const batch = data.batches.find(
              (candidate) =>
                batchRecordId(candidate) === String(record.batchId ?? "") ||
                candidate.code === record.batchCode,
            );
            return (
              <li key={recordId(record)}>
                <div className="sales-history-heading">
                  <div>
                    <Text strong>{formatDate(record.saleDate)}</Text>
                    <Text type="secondary">
                      {batch
                        ? `${batch.code} · ${batch.name}`
                        : record.batchCode || record.batchName || "Chưa rõ mẻ"}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary">Doanh thu</Text>
                    <Text strong>{formatVnd(record.netRevenue)}</Text>
                  </div>
                </div>
                <div className="sales-history-breakdown">
                  <span>
                    Tiền mặt <strong>{formatVnd(record.cashReceived ?? 0)}</strong>
                  </span>
                  <span>
                    Chuyển khoản{" "}
                    <strong>{formatVnd(record.bankTransferReceived ?? 0)}</strong>
                  </span>
                </div>
                <Button
                  type="text"
                  className="sales-history-edit"
                  onClick={() => editRecord(record)}
                >
                  <span>
                    Lãi ước tính{" "}
                    <strong
                      className={
                        record.estimatedProfit < 0 ? "is-negative" : ""
                      }
                    >
                      {formatVnd(record.estimatedProfit)}
                    </strong>
                  </span>
                  <RightOutlined />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="mobile-workflow-dock sales-mobile-save-dock">
        <div>
          <Text type="secondary">Doanh thu</Text>
          <Text strong>{formatVnd(netRevenueValue)}</Text>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<SaveOutlined />}
          loading={saving}
          disabled={!canSubmit}
          onClick={() => submit()}
        >
          Lưu bán hàng
        </Button>
      </div>
    </div>
  );
}
