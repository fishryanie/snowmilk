"use client";

import { EditOutlined, SaveOutlined } from "@ant-design/icons";
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
  buildEstimatedSizeMix,
  calculateDailySaleEstimate,
  calculateDailySaleEstimateFromMilk,
  calculateDailySaleEstimateFromTotalCups,
  type DailySaleAssumption,
} from "@/lib/calculations/daily-sales";
import {
  formatDate,
  formatNumber,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import { useApiData } from "@/hooks/use-api-data";
import { workbookBatches } from "@/lib/workbook-snapshot";

const { Text, Title } = Typography;

type SizeSummary = {
  sizeCode: string;
  sizeName: string;
  milkMl?: number;
  quantity: number;
  variableCostPerCup: number;
};

type SaleHistory = {
  id?: string;
  _id?: string;
  saleDate: string;
  batchId?: string;
  batchCode?: string;
  batchName?: string;
  sizeSummaries: SizeSummary[];
  totalCups: number;
  milkLitersSold?: number;
  estimatedMilkLiters?: number;
  milkDifferenceLiters?: number;
  estimatedReferenceRevenue?: number;
  revenueDifference?: number;
  netRevenue: number;
  cashReceived?: number | null;
  bankTransferReceived?: number | null;
  averageRevenuePerCup: number;
  totalVariableCost: number;
  allocatedFixedCost: number;
  estimatedProfit: number;
  estimatedProfitLow: number;
  estimatedProfitHigh: number;
  estimatedMargin: number;
  cupCountSource?: "estimated" | "actual-total" | "actual";
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

function sizeQuantity(
  record: Pick<SaleHistory, "sizeSummaries">,
  sizeCode: string,
) {
  return (
    record.sizeSummaries.find((summary) => summary.sizeCode === sizeCode)
      ?.quantity ?? 0
  );
}

function recordMilkLiters(record: SaleHistory) {
  return (
    record.milkLitersSold ??
    record.sizeSummaries.reduce(
      (total, summary) =>
        total + summary.quantity * Number(summary.milkMl ?? 0),
      0,
    ) /
      1_000
  );
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
  const [saleDate, setSaleDate] = useState(dayjs());
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [milkLitersSold, setMilkLitersSold] = useState<number | null>(null);
  const [netRevenue, setNetRevenue] = useState<number | null>(null);
  const [cashReceived, setCashReceived] = useState<number | null>(null);
  const [bankTransferReceived, setBankTransferReceived] = useState<
    number | null
  >(null);
  const [actualTotalCups, setActualTotalCups] = useState<number | null>(
    null,
  );
  const [actualSizeM, setActualSizeM] = useState<number | null>(null);
  const [actualSizeL, setActualSizeL] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const hasAnyActualCupCount =
    actualSizeM !== null || actualSizeL !== null;
  const hasCompleteActualCupCount =
    actualSizeM !== null && actualSizeL !== null;
  const hasActualTotalCups = actualTotalCups !== null;
  const milkLitersSoldValue = milkLitersSold ?? 0;
  const netRevenueValue = netRevenue ?? 0;
  const hasPaymentBreakdown =
    cashReceived !== null || bankTransferReceived !== null;
  const selectedBatch = useMemo(
    () =>
      data.batches.find((batch) => batchRecordId(batch) === selectedBatchId) ??
      null,
    [data.batches, selectedBatchId],
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
  const sizeMReferencePrice =
    selectedAssumptions.find((item) => item.sizeCode === "M")
      ?.referenceSellingPrice ?? 0;
  const sizeLReferencePrice =
    selectedAssumptions.find((item) => item.sizeCode === "L")
      ?.referenceSellingPrice ?? 0;
  const estimatedSizeMix = useMemo(
    () =>
      buildEstimatedSizeMix(
        data.history,
        selectedAssumptions.map((assumption) => assumption.sizeCode),
      ),
    [data.history, selectedAssumptions],
  );
  const estimate = useMemo(
    () =>
      hasCompleteActualCupCount
        ? calculateDailySaleEstimate(
            { M: actualSizeM, L: actualSizeL },
            netRevenueValue,
            selectedAssumptions,
            milkLitersSoldValue,
          )
        : hasActualTotalCups
          ? calculateDailySaleEstimateFromTotalCups(
              actualTotalCups,
              milkLitersSoldValue,
              netRevenueValue,
              selectedAssumptions,
              estimatedSizeMix.shares,
            )
          : calculateDailySaleEstimateFromMilk(
              milkLitersSoldValue,
              netRevenueValue,
              selectedAssumptions,
              estimatedSizeMix.shares,
            ),
    [
      actualSizeL,
      actualSizeM,
      actualTotalCups,
      hasCompleteActualCupCount,
      hasActualTotalCups,
      milkLitersSoldValue,
      netRevenueValue,
      estimatedSizeMix.shares,
      selectedAssumptions,
    ],
  );

  function clearForm() {
    setSaleDate(dayjs());
    setSelectedBatchId("");
    setMilkLitersSold(null);
    setNetRevenue(null);
    setCashReceived(null);
    setBankTransferReceived(null);
    setActualTotalCups(null);
    setActualSizeM(null);
    setActualSizeL(null);
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
    if (milkLitersSoldValue <= 0) {
      message.warning("Hãy nhập tổng số lít sữa đã bán.");
      return;
    }
    if (hasAnyActualCupCount && !hasCompleteActualCupCount) {
      message.warning(
        "Hãy nhập đủ số ly thực tế của cả Size M và Size L, kể cả khi một size là 0 ly.",
      );
      return;
    }
    if (hasCompleteActualCupCount && actualSizeM + actualSizeL <= 0) {
      message.warning("Tổng số ly thực tế phải lớn hơn 0.");
      return;
    }
    if (
      hasCompleteActualCupCount &&
      hasActualTotalCups &&
      actualSizeM + actualSizeL !== actualTotalCups
    ) {
      message.warning(
        "Tổng số ly thực tế phải bằng số ly Size M cộng Size L.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleDate: saleDate.format("YYYY-MM-DD"),
          batchId: selectedBatchId,
          milkLitersSold: milkLitersSoldValue,
          netRevenue: netRevenueValue,
          cashReceived: hasPaymentBreakdown ? (cashReceived ?? 0) : null,
          bankTransferReceived: hasPaymentBreakdown
            ? (bankTransferReceived ?? 0)
            : null,
          actualSizeQuantities: hasCompleteActualCupCount
            ? { M: actualSizeM, L: actualSizeL }
            : undefined,
          actualTotalCups: hasActualTotalCups
            ? actualTotalCups
            : undefined,
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
    setMilkLitersSold(recordMilkLiters(record));
    setNetRevenue(record.netRevenue);
    setCashReceived(record.cashReceived ?? null);
    setBankTransferReceived(record.bankTransferReceived ?? null);
    setActualTotalCups(
      record.cupCountSource === "actual" ||
        record.cupCountSource === "actual-total"
        ? record.totalCups
        : null,
    );
    if (record.cupCountSource === "actual") {
      setActualSizeM(sizeQuantity(record, "M"));
      setActualSizeL(sizeQuantity(record, "L"));
    } else {
      setActualSizeM(null);
      setActualSizeL(null);
    }
    setNote(record.note ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <RouteSkeleton />;

  return (
    <div className="page-wrap">
      <PageHeader
        title="Chốt bán hàng cuối ngày"
        description="Nhập tổng lít sữa đã bán, tiền đã nhận và tổng số ly thực tế. Nếu nhớ số ly từng size, bạn có thể nhập thêm để có cơ cấu M/L chính xác."
        actions={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!selectedBatch || selectedBatch.costPerMl <= 0}
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
        <Card className="surface-card" title="Số liệu bạn kiểm soát được">
          <div className="daily-sales-input-grid">
            <div>
              <Text type="secondary">Ngày bán</Text>
              <DatePicker
                value={saleDate}
                format="DD/MM/YYYY"
                onChange={(value) => value && setSaleDate(value)}
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Mẻ sữa đã bán</Text>
              <Select
                showSearch
                optionFilterProp="label"
                value={selectedBatchId || undefined}
                placeholder="Chọn mẻ sữa để tính giá vốn"
                onChange={setSelectedBatchId}
                options={data.batches.map((batch) => ({
                  value: batchRecordId(batch),
                  label:
                    batch.costPerMl > 0
                      ? `${batch.code} · ${batch.name} · ${formatVnd(batch.costPerLiter)}/L`
                      : `${batch.code} · ${batch.name} · chưa có giá vốn`,
                  disabled: batch.costPerMl <= 0,
                }))}
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Tổng sữa đã bán (L)</Text>
              <InputNumber
                min={0}
                step={0.1}
                precision={2}
                value={milkLitersSold}
                onChange={(value) =>
                  setMilkLitersSold(value === null ? null : Number(value))
                }
                suffix="L"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Tổng doanh thu cuối ngày</Text>
              <InputNumber
                min={0}
                precision={0}
                step={1_000}
                value={netRevenue}
                readOnly
                formatter={formatVndInput}
                parser={parseVndInput}
                placeholder="Tự động cộng từ hai hình thức nhận tiền"
                inputMode="numeric"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Tiền mặt đã nhận</Text>
              <InputNumber
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
                placeholder="Ví dụ: 1.500.000"
                inputMode="numeric"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Tiền chuyển khoản</Text>
              <InputNumber
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
                placeholder="Ví dụ: 1.000.000"
                inputMode="numeric"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Tổng số ly thực tế (M + L)</Text>
              <InputNumber
                min={1}
                precision={0}
                value={actualTotalCups}
                onChange={(value) =>
                  setActualTotalCups(
                    value === null ? null : Number(value),
                  )
                }
                placeholder="Ví dụ: 74"
                suffix="ly"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Size M thực tế (nếu nhớ)</Text>
              <InputNumber
                min={0}
                precision={0}
                value={actualSizeM}
                onChange={(value) =>
                  setActualSizeM(value === null ? null : Number(value))
                }
                placeholder="Để trống nếu không nhớ"
                suffix="ly"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div>
              <Text type="secondary">Size L thực tế (nếu nhớ)</Text>
              <InputNumber
                min={0}
                precision={0}
                value={actualSizeL}
                onChange={(value) =>
                  setActualSizeL(value === null ? null : Number(value))
                }
                placeholder="Để trống nếu không nhớ"
                suffix="ly"
                style={{ width: "100%", marginTop: 6 }}
              />
            </div>
            <div className="daily-sales-note">
              <Text type="secondary">Ghi chú</Text>
              <Input.TextArea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Không bắt buộc"
                rows={3}
                style={{ marginTop: 6 }}
              />
            </div>
          </div>

          <Alert
            type={
              hasAnyActualCupCount && !hasCompleteActualCupCount
                ? "warning"
                : "info"
            }
            showIcon
            title={
              !selectedBatch
                ? "Hãy chọn mẻ sữa đã bán"
                : hasAnyActualCupCount && !hasCompleteActualCupCount
                  ? "Hãy nhập đủ số ly của cả hai size"
                  : hasCompleteActualCupCount
                    ? "Đang dùng số ly thực tế"
                    : hasActualTotalCups
                      ? "Đang dùng tổng số ly thực tế"
                    : "Số ly và cơ cấu size là số ước tính"
            }
            description={
              !selectedBatch
                ? "Mẻ sữa là bắt buộc để hệ thống lưu đúng mẻ đã bán và dùng đúng giá vốn khi tính lãi/lỗ."
                : hasAnyActualCupCount && !hasCompleteActualCupCount
                  ? "Nếu một size không bán được ly nào, hãy nhập 0. Nếu không nhớ số ly, hãy để trống cả hai ô để hệ thống tiếp tục ước tính."
                  : hasCompleteActualCupCount
                    ? `Hệ thống đang dùng ${formatNumber(estimate.totalCups)} ly thực tế để tính cost bao bì, topping và chi phí cố định. Cost sữa vẫn lấy theo ${formatNumber(milkLitersSoldValue)} L đã bán từ mẻ ${selectedBatch.code} - ${selectedBatch.name}. Chênh lệch giữa định mức ly và lượng sữa đã nhập là ${formatNumber(Math.abs(estimate.milkDifferenceLiters))} L.`
                    : hasActualTotalCups
                      ? `Tổng ${formatNumber(actualTotalCups)} ly được giữ nguyên theo số thực tế bạn nhập. Hệ thống phân bổ thành ${formatNumber(sizeQuantity(estimate, "M"))} ly Size M và ${formatNumber(sizeQuantity(estimate, "L"))} ly Size L chỉ theo tổng doanh thu với giá tham chiếu M ${formatVnd(sizeMReferencePrice)} và L ${formatVnd(sizeLReferencePrice)}; số lít sữa không tham gia chia size. Chênh lệch quy đổi: ${formatNumber(Math.abs(estimate.milkDifferenceLiters))} L sữa và ${formatVnd(Math.abs(estimate.revenueDifference))} doanh thu.`
                    : estimatedSizeMix.source === "actual-history"
                      ? `Bạn chưa nhập số ly hôm nay nên hệ thống tạm dùng tỷ lệ từ ${formatNumber(estimatedSizeMix.actualSampleCups)} ly đã nhập thực tế trước đây: Size M ${formatNumber((estimatedSizeMix.shares.M ?? 0) * 100)}% và Size L ${formatNumber((estimatedSizeMix.shares.L ?? 0) * 100)}%. Chênh lệch quy đổi: ${formatNumber(Math.abs(estimate.milkDifferenceLiters))} L sữa và ${formatVnd(Math.abs(estimate.revenueDifference))} doanh thu.`
                      : `Chưa có ngày nào nhập số ly thực tế nên hệ thống không thể biết size nào được mua nhiều hơn và đang tạm chia đều Size M/L. Muốn có tỷ lệ chính xác, hãy nhập số ly thực tế của cả hai size. Chênh lệch quy đổi hiện tại: ${formatNumber(Math.abs(estimate.milkDifferenceLiters))} L sữa và ${formatVnd(Math.abs(estimate.revenueDifference))} doanh thu.`
            }
            style={{ marginTop: 20 }}
          />

          <Table
            size="small"
            style={{ marginTop: 20 }}
            rowKey="sizeCode"
            pagination={false}
            dataSource={estimate.sizeSummaries}
            scroll={{ x: "max-content" }}
            columns={[
              { title: "Size", dataIndex: "sizeName" },
              {
                title: hasCompleteActualCupCount
                  ? "Số ly thực tế"
                  : "Số ly ước tính",
                dataIndex: "quantity",
                align: "right",
                render: (value) => `${formatNumber(Number(value))} ly`,
              },
              {
                title: "Cost nền + bao bì/ly",
                align: "right",
                render: (_, record) =>
                  formatVnd(
                    (record.quantity > 0
                      ? record.milkCost / record.quantity
                      : record.milkCostPerCup) +
                      record.packagingCostPerCup,
                  ),
              },
              {
                title: "Topping ước tính/ly",
                dataIndex: "toppingCostPerCup",
                align: "right",
                render: (value) => formatVnd(Number(value)),
              },
              {
                title: "Cost biến đổi/ly",
                dataIndex: "variableCostPerCup",
                align: "right",
                render: (value) => formatVnd(Number(value)),
              },
            ]}
          />
        </Card>

        <Card className="surface-card summary-panel" title="Lãi/lỗ ước tính">
          <div className="summary-row">
            <Text type="secondary">Công thức giá vốn</Text>
            <Text>
              {selectedBatch
                ? `${selectedBatch.code} · ${formatVnd(selectedBatch.costPerLiter)}/L`
                : "Chưa có mẻ sữa"}
            </Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Sữa đã bán</Text>
            <Text strong>{formatNumber(estimate.milkLitersSold)} L</Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">
              Tổng số ly{" "}
              {hasCompleteActualCupCount || hasActualTotalCups
                ? "thực tế"
                : "ước tính"}
            </Text>
            <Text strong>{formatNumber(estimate.totalCups)} ly</Text>
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
          <div className="summary-row">
            <Text type="secondary">
              Doanh thu bình quân/ly{" "}
              {hasCompleteActualCupCount || hasActualTotalCups
                ? "thực tế"
                : "ước tính"}
            </Text>
            <Text>{formatVnd(estimate.averageRevenuePerCup)}</Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Cost sữa nền theo số lít</Text>
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
            <Text type="secondary">Phân bổ cố định + khấu hao</Text>
            <Text>{formatVnd(estimate.allocatedFixedCost)}</Text>
          </div>
          <div className="summary-row summary-total">
            <Title level={5}>Lợi nhuận ước tính</Title>
            <Title
              level={4}
              type={estimate.estimatedProfit < 0 ? "danger" : "success"}
            >
              {formatVnd(estimate.estimatedProfit)}
            </Title>
          </div>
          <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
            <Descriptions.Item label="Khoảng có thể">
              {formatVnd(estimate.estimatedProfitLow)} –{" "}
              {formatVnd(estimate.estimatedProfitHigh)}
            </Descriptions.Item>
            <Descriptions.Item label="Biên lợi nhuận ước tính">
              {(estimate.estimatedMargin * 100).toFixed(1)}%
            </Descriptions.Item>
          </Descriptions>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Khoảng trên thay đổi theo topping rẻ nhất và đắt nhất trong các sản
            phẩm có cost hợp lệ.
          </Text>
        </Card>
      </div>

      <Card
        className="surface-card table-card"
        title="Lịch sử chốt ngày"
        style={{ marginTop: 16 }}
      >
        <Table
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
              title: "Sữa bán",
              align: "right",
              render: (_, record) =>
                `${formatNumber(recordMilkLiters(record))} L`,
            },
            {
              title: "Size M",
              align: "right",
              render: (_, record) => `${sizeQuantity(record, "M")} ly`,
            },
            {
              title: "Size L",
              align: "right",
              render: (_, record) => `${sizeQuantity(record, "L")} ly`,
            },
            {
              title: "Tổng ly",
              dataIndex: "totalCups",
              align: "right",
              render: (value, record) => (
                <Space size={6}>
                  <span>{formatNumber(Number(value))} ly</span>
                  <Tag
                    color={
                      record.cupCountSource === "actual"
                        ? "success"
                        : record.cupCountSource === "actual-total"
                          ? "processing"
                        : "default"
                    }
                    style={{ marginInlineEnd: 0 }}
                  >
                    {record.cupCountSource === "actual"
                      ? "M/L thực tế"
                      : record.cupCountSource === "actual-total"
                        ? "tổng thực tế"
                        : "ước tính"}
                  </Tag>
                </Space>
              ),
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
      </Card>
    </div>
  );
}
