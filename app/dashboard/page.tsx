"use client";

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CalendarOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  ShoppingCartOutlined,
  TrophyOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Card,
  DatePicker,
  Progress,
  Skeleton,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import dayjs from "dayjs";
import dynamic from "next/dynamic";
import { type ReactNode, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { formatNumber, formatVnd } from "@/lib/formatters";
import { workbookDashboard } from "@/lib/workbook-snapshot";
import { useApiData } from "@/hooks/use-api-data";

const { RangePicker } = DatePicker;
const { Text } = Typography;

type MetricTitleProps = {
  description: string;
  formula: string;
  icon: ReactNode;
  label: string;
  note?: string;
};

function MetricTitle({
  description,
  formula,
  icon,
  label,
  note,
}: MetricTitleProps) {
  return (
    <span className="kpi-statistic-title">
      {icon}
      <span>{label}</span>
      <Tooltip
        arrow={{ pointAtCenter: true }}
        placement="top"
        styles={{ root: { maxWidth: 380 } }}
        title={
          <div className="metric-tooltip-content">
            <p>{description}</p>
            <div className="metric-tooltip-formula">
              <span>Công thức</span>
              <code>{formula}</code>
            </div>
            {note ? <p className="metric-tooltip-note">{note}</p> : null}
          </div>
        }
        trigger={["hover", "focus", "click"]}
      >
        <button
          type="button"
          className="metric-help-button"
          aria-label={`Giải thích và công thức ${label}`}
        >
          <ExclamationCircleOutlined aria-hidden />
        </button>
      </Tooltip>
    </span>
  );
}

const DailyAreaChart = dynamic(
  () =>
    import("@/components/dashboard/daily-area-chart").then(
      (module) => module.DailyAreaChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton active paragraph={{ rows: 6 }} />,
  },
);

export default function DashboardPage() {
  const [range, setRange] = useState<[string, string]>([
    dayjs().startOf("month").format("YYYY-MM-DD"),
    dayjs().format("YYYY-MM-DD"),
  ]);
  const url = `/api/reports/dashboard?from=${range[0]}&to=${range[1]}`;
  const { data, loading, usingFallback } = useApiData(
    url,
    workbookDashboard,
  );
  const periodDays = Math.max(1, dayjs(range[1]).diff(dayjs(range[0]), "day") + 1);
  const averageDailyRevenue = data.kpis.revenue / periodDays;
  const hasCashIn = data.kpis.cashIn > 0;
  const hasCashMovement = hasCashIn || data.kpis.cashOut > 0;
  const remainingCash = Math.max(0, data.kpis.cashIn - data.kpis.cashOut);
  const cashDeficit = Math.max(0, data.kpis.cashOut - data.kpis.cashIn);
  const spentPercent = hasCashIn
    ? Math.round((data.kpis.cashOut / data.kpis.cashIn) * 1000) / 10
    : 0;
  const remainingPercent = hasCashIn
    ? Math.max(0, Math.round((100 - spentPercent) * 10) / 10)
    : 0;
  const spentPercentLabel = !hasCashIn && hasCashMovement
    ? "—"
    : `${spentPercent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  const remainingPercentLabel = !hasCashIn && hasCashMovement
    ? "—"
    : `${remainingPercent.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
  const cashShareLabel = !hasCashMovement
    ? "Chưa có giao dịch trong kỳ"
    : !hasCashIn
      ? "Chỉ có tiền ra, chưa có tiền vào"
      : cashDeficit > 0
        ? "Chi vượt tiền vào"
        : remainingCash === 0
          ? "Đã chi hết tiền vào"
          : remainingCash === data.kpis.cashOut
            ? "Đã chi = còn lại"
            : remainingCash > data.kpis.cashOut
              ? "Còn lại nhiều hơn"
              : "Đã chi nhiều hơn";
  const cashShareColor = !hasCashMovement || remainingCash === data.kpis.cashOut
    ? "default"
    : remainingCash > data.kpis.cashOut
      ? "success"
      : "error";
  const kpis = [
    {
      label: "Tổng doanh thu",
      value: data.kpis.revenue,
      icon: <DollarOutlined />,
      description:
        "Tổng tiền mặt và chuyển khoản đã chốt trong khoảng thời gian đang chọn.",
      formula: "Tiền mặt + Tiền chuyển khoản",
    },
    {
      label: "Doanh thu TB/ngày",
      value: averageDailyRevenue,
      icon: <CalendarOutlined />,
      description:
        "Doanh thu bình quân mỗi ngày lịch trong khoảng đang chọn, kể cả ngày không phát sinh doanh thu.",
      formula:
        "Tổng doanh thu trong kỳ ÷ Số ngày trong kỳ (tính cả ngày đầu và ngày cuối)",
      note: `Khoảng đang chọn gồm ${formatNumber(periodDays)} ngày.`,
    },
    {
      label: "Tiền còn trong tiệm",
      value: data.kpis.businessCashBalance,
      icon: <WalletOutlined />,
      color: data.kpis.businessCashBalance < 0 ? "var(--danger)" : "var(--success)",
      description:
        "Số tiền bán hàng còn lại sau khi trừ nhập hàng, chi phí, tài sản dùng Tiền bán hàng, quỹ lương và các quỹ đã tách của những tháng đã chốt.",
      formula:
        "Doanh thu lũy kế − (Nhập hàng + Chi phí + Tài sản dùng Tiền bán hàng + Quỹ lương đã chốt + Số dư các quỹ đã tách)",
      note: "Quỹ lương và các quỹ khác được ghi nhận một lần ở tháng chốt. Ngày nhân sự nhận lương sau đó không bị trừ thêm.",
    },
    {
      label: "Tổng tiền vào",
      value: data.kpis.cashIn,
      icon: <ArrowDownOutlined />,
      color: "var(--success)",
      description:
        "Tổng doanh thu thuần được ghi nhận trong khoảng ngày đang chọn và đang được xem là tiền vào.",
      formula: "Tổng tiền vào = Σ Doanh thu thuần trong kỳ",
      note: "Chỉ số hiện chưa đối chiếu số dư ngân hàng hoặc thời điểm tiền từ ứng dụng giao hàng thực sự về tài khoản.",
    },
    {
      label: "Tổng tiền ra",
      value: data.kpis.cashOut,
      icon: <ArrowUpOutlined />,
      color: "var(--danger)",
      description:
        "Các khoản ghi nhận trong kỳ cho nhập hàng, vận hành, mua thiết bị, quỹ lương và phần tăng của các quỹ đã tách. Các quỹ được đưa về tháng chốt, không theo ngày nhận lương.",
      formula:
        "Tổng tiền ra = Nhập hàng + Chi phí vận hành + Mua thiết bị + Quỹ lương đã chốt + Phần chuyển vào các quỹ khác trong kỳ",
    },
    {
      label: "Dòng tiền thuần",
      value: data.kpis.netCashFlow,
      icon: <BankOutlined />,
      color: data.kpis.netCashFlow < 0 ? "var(--danger)" : "var(--success)",
      description:
        "Phần tiền tăng hoặc giảm ròng trong khoảng ngày đang chọn. Số dương là tiền vào lớn hơn tiền ra.",
      formula: "Dòng tiền thuần = Tổng tiền vào − Tổng tiền ra",
      note: "Đây là biến động trong kỳ, không phải số dư tiền mặt hoặc số dư ngân hàng hiện có.",
    },
    {
      label: "Chi mua hàng kỳ này",
      value: data.kpis.purchaseTotal,
      icon: <ShoppingCartOutlined />,
      description:
        "Tổng số tiền đã ghi nhận cho các lần nhập nguyên liệu, topping và bao bì có ngày nhập nằm trong kỳ.",
      formula: "Σ Thành tiền của các phiếu nhập hàng trong kỳ",
    },
    {
      label: "Chi bình quân/ngày",
      value: data.kpis.averageDailyCashOut,
      icon: <CalendarOutlined />,
      description:
        "Mức tiền ra bình quân trên mỗi ngày lịch trong khoảng chọn, kể cả ngày không phát sinh giao dịch.",
      formula: "Tổng tiền ra ÷ Số ngày lịch từ ngày đầu đến ngày cuối",
      note: "Ví dụ chọn từ ngày 01 đến ngày 10 thì mẫu số là 10 ngày.",
    },
    {
      label: "Tổng vốn đã bỏ lũy kế",
      value: data.kpis.investmentTotal,
      icon: <TrophyOutlined />,
      description:
        "Tổng tiền mua thiết bị và các lần nhập hàng dùng nguồn Tiền cá nhân được ghi nhận từ trước đến nay.",
      formula:
        "Tiền cá nhân đang mở + Các khoản Tiền cá nhân đã được thu hồi",
      note: "Khoản đã claim vẫn được giữ trong nguyên giá vốn ban đầu nhưng không bị tính hai lần khi nguồn tiền của phiếu gốc thay đổi.",
    },
  ];

  if (loading) return <RouteSkeleton />;

  return (
    <div className="page-wrap dashboard-page">
      <PageHeader
        title="Tổng quan"
        description="Doanh thu, chi phí và dòng tiền."
        actions={
          <RangePicker
            value={[dayjs(range[0]), dayjs(range[1])]}
            format="DD/MM/YYYY"
            onChange={(dates) => {
              if (dates?.[0] && dates[1]) {
                setRange([
                  dates[0].format("YYYY-MM-DD"),
                  dates[1].format("YYYY-MM-DD"),
                ]);
              }
            }}
          />
        }
      />
      {usingFallback && (
        <Alert
          className="dashboard-fallback-alert"
          showIcon
          type="info"
          title="Đang hiển thị snapshot từ file Excel"
          description="MongoDB chưa kết nối hoặc chưa import dữ liệu. Các số dưới đây giữ nguyên giá trị đang hiển thị trong workbook để bạn đối chiếu."
        />
      )}
      <section className="dashboard-kpi-grid" aria-label="Thống kê tổng quan">
        {kpis.map((item) => (
          <div key={item.label} className="dashboard-metric">
            <Statistic
              title={
                <MetricTitle
                  description={item.description}
                  formula={item.formula}
                  icon={item.icon}
                  label={item.label}
                  note={item.note}
                />
              }
              value={item.value}
              formatter={(value) => formatVnd(Number(value))}
              styles={
                item.color
                  ? { content: { color: item.color } }
                  : undefined
              }
            />
          </div>
        ))}
      </section>
      <Card className="surface-card cash-flow-share-card">
        <div className="cash-flow-share-heading">
          <Text strong>Tỷ lệ đã chi và còn lại</Text>
          <Tag color={cashShareColor}>{cashShareLabel}</Tag>
        </div>
        <div className="cash-flow-share-labels">
          <Text className="cash-flow-share-remaining">
            <WalletOutlined aria-hidden /> Còn lại <strong>{remainingPercentLabel}</strong>
          </Text>
          <Text className="cash-flow-share-spent">
            <ArrowUpOutlined aria-hidden /> Đã chi <strong>{spentPercentLabel}</strong>
          </Text>
        </div>
        <Progress
          aria-label={hasCashIn
            ? `Trên tổng tiền vào 100%: còn lại ${remainingPercentLabel}, đã chi ${spentPercentLabel}`
            : hasCashMovement
              ? "Chưa có tiền vào để tính tỷ lệ đã chi và còn lại"
              : "Chưa có giao dịch trong kỳ"}
          percent={remainingPercent}
          strokeColor="var(--success)"
          railColor={hasCashMovement ? "var(--danger)" : "var(--line)"}
          showInfo={false}
          status="normal"
          size={{ height: 8 }}
          styles={{ rail: { overflow: "hidden" }, track: { borderRadius: 0 } }}
        />
        <Text type="secondary" className="cash-flow-share-total">
          Tổng tiền vào{hasCashIn ? " (100%)" : ""}: {formatVnd(data.kpis.cashIn)}
        </Text>
        {cashDeficit > 0 ? (
          <Text type="danger" className="cash-flow-share-total">
            Chi vượt tiền vào: {formatVnd(cashDeficit)}
          </Text>
        ) : null}
      </Card>
      <div className="dashboard-charts-grid">
        <Card
          className="surface-card"
          title="Doanh thu theo ngày"
          extra={<Text strong>{formatVnd(data.kpis.revenue)}</Text>}
        >
          <DailyAreaChart
            ariaLabel="Biểu đồ vùng thể hiện doanh thu theo từng ngày"
            color="#0862c0"
            fillColor="rgba(8, 98, 192, 0.16)"
            label="Doanh thu"
            points={data.daily
              .filter((item) => item.revenue > 0)
              .map((item) => ({
                date: item.date,
                value: item.revenue,
              }))}
          />
        </Card>
        <Card
          className="surface-card"
          title="Tiền nhập hàng theo ngày"
          extra={<Text strong>{formatVnd(data.kpis.purchaseTotal)}</Text>}
        >
          <DailyAreaChart
            ariaLabel="Biểu đồ vùng thể hiện tổng tiền nhập hàng theo từng ngày"
            color="#d9932e"
            fillColor="rgba(217, 147, 46, 0.18)"
            label="Tiền nhập hàng"
            points={data.daily
              .filter((item) => item.purchaseTotal > 0)
              .map((item) => ({
                date: item.date,
                value: item.purchaseTotal,
              }))}
          />
        </Card>
      </div>
    </div>
  );
}
