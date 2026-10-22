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
  Space,
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
const { Text, Title } = Typography;

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
            ? "Phần còn lại và đã chi bằng nhau"
            : remainingCash > data.kpis.cashOut
              ? "Phần còn lại chiếm tỷ trọng cao hơn"
              : "Phần đã chi chiếm tỷ trọng cao hơn";
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
      money: true,
      description:
        "Tổng tiền mặt và chuyển khoản đã chốt trong khoảng thời gian đang chọn.",
      formula: "Tiền mặt + Tiền chuyển khoản",
    },
    {
      label: "Tiền còn lại trong tiệm",
      value: data.kpis.businessCashBalance,
      icon: <WalletOutlined />,
      money: true,
      profit: true,
      description:
        "Số tiền bán hàng còn lại sau khi trừ nhập hàng, chi phí, tài sản dùng Tiền bán hàng, quỹ lương và các quỹ đã tách của những tháng đã chốt.",
      formula:
        "Doanh thu lũy kế − (Nhập hàng + Chi phí + Tài sản dùng Tiền bán hàng + Quỹ lương đã chốt + Số dư các quỹ đã tách)",
      note: "Quỹ lương và các quỹ khác được ghi nhận một lần ở tháng chốt. Ngày nhân sự nhận lương sau đó không bị trừ thêm.",
    },
    {
      label: "Chi phí mua hàng kỳ này",
      value: data.kpis.purchaseTotal,
      icon: <ShoppingCartOutlined />,
      money: true,
      description:
        "Tổng số tiền đã ghi nhận cho các lần nhập nguyên liệu, topping và bao bì có ngày nhập nằm trong kỳ.",
      formula: "Σ Thành tiền của các phiếu nhập hàng trong kỳ",
    },
    {
      label: "Tổng vốn đã bỏ lũy kế",
      value: data.kpis.investmentTotal,
      icon: <TrophyOutlined />,
      money: true,
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
        description="Theo dõi doanh thu, giá vốn và dòng tiền trên một màn hình."
        actions={
          <Space wrap>
            <Tag color="blue">Dữ liệu theo khoảng ngày</Tag>
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
          </Space>
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
      <div className="kpi-grid dashboard-kpi-grid">
        {kpis.map((item) => (
          <Card key={item.label} className="surface-card kpi-card">
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
              formatter={
                typeof item.value === "number"
                  ? (value) =>
                      item.money
                        ? formatVnd(Number(value))
                        : formatNumber(Number(value))
                  : undefined
              }
              styles={
                item.profit
                  ? {
                      content: {
                        color:
                          Number(item.value) < 0
                            ? "var(--danger)"
                            : "var(--success)",
                      },
                    }
                  : undefined
              }
            />
          </Card>
        ))}
        <Card className="surface-card kpi-card dashboard-average-revenue-card">
          <Statistic
            title={
              <MetricTitle
                description="Doanh thu bình quân mỗi ngày lịch trong khoảng đang chọn, kể cả ngày không phát sinh doanh thu."
                formula="Tổng doanh thu trong kỳ ÷ Số ngày trong kỳ (tính cả ngày đầu và ngày cuối)"
                icon={<CalendarOutlined />}
                label="Doanh thu trung bình/ngày"
                note={`Khoảng đang chọn gồm ${formatNumber(periodDays)} ngày.`}
              />
            }
            value={averageDailyRevenue}
            formatter={(value) => formatVnd(Number(value))}
          />
          <Text type="secondary" className="dashboard-average-revenue-note">
            Trong {formatNumber(periodDays)} ngày đang chọn
          </Text>
        </Card>
      </div>
      <section className="cash-flow-section" aria-labelledby="cash-flow-title">
        <div className="cash-flow-heading">
          <div>
            <Title level={3} id="cash-flow-title">
              Kiểm soát dòng tiền
            </Title>
            <Text type="secondary">
              Doanh thu và các khoản được ghi nhận theo kỳ đang chọn.
            </Text>
          </div>
          <Tag color={data.kpis.netCashFlow >= 0 ? "success" : "error"}>
            {data.kpis.netCashFlow >= 0
              ? "Dòng tiền dương"
              : "Dòng tiền âm"}
          </Tag>
        </div>
        <div className="cash-flow-kpi-grid">
          <Card className="surface-card cash-flow-kpi cash-flow-kpi-in">
            <Statistic
              title={
                <MetricTitle
                  description="Tổng doanh thu thuần được ghi nhận trong khoảng ngày đang chọn và đang được xem là tiền vào."
                  formula="Tổng tiền vào = Σ Doanh thu thuần trong kỳ"
                  icon={<ArrowDownOutlined />}
                  label="Tổng tiền vào"
                  note="Chỉ số hiện chưa đối chiếu số dư ngân hàng hoặc thời điểm tiền từ ứng dụng giao hàng thực sự về tài khoản."
                />
              }
              value={data.kpis.cashIn}
              formatter={(value) => formatVnd(Number(value))}
              styles={{ content: { color: "var(--success)" } }}
            />
          </Card>
          <Card className="surface-card cash-flow-kpi cash-flow-kpi-out">
            <Statistic
              title={
                <MetricTitle
                  description="Các khoản ghi nhận trong kỳ cho nhập hàng, vận hành, mua thiết bị, quỹ lương và phần tăng của các quỹ đã tách. Các quỹ được đưa về tháng chốt, không theo ngày nhận lương."
                  formula="Tổng tiền ra = Nhập hàng + Chi phí vận hành + Mua thiết bị + Quỹ lương đã chốt + Phần chuyển vào các quỹ khác trong kỳ"
                  icon={<ArrowUpOutlined />}
                  label="Tổng tiền ra"
                />
              }
              value={data.kpis.cashOut}
              formatter={(value) => formatVnd(Number(value))}
              styles={{ content: { color: "var(--danger)" } }}
            />
          </Card>
          <Card className="surface-card cash-flow-kpi">
            <Statistic
              title={
                <MetricTitle
                  description="Phần tiền tăng hoặc giảm ròng trong khoảng ngày đang chọn. Số dương là tiền vào lớn hơn tiền ra."
                  formula="Dòng tiền thuần = Tổng tiền vào − Tổng tiền ra"
                  icon={<BankOutlined />}
                  label="Dòng tiền thuần"
                  note="Đây là biến động trong kỳ, không phải số dư tiền mặt hoặc số dư ngân hàng hiện có."
                />
              }
              value={data.kpis.netCashFlow}
              formatter={(value) => formatVnd(Number(value))}
              styles={{
                content: {
                  color:
                    data.kpis.netCashFlow < 0
                      ? "var(--danger)"
                      : "var(--success)",
                },
              }}
            />
          </Card>
          <Card className="surface-card cash-flow-kpi">
            <Statistic
              title={
                <MetricTitle
                  description="Mức tiền ra bình quân trên mỗi ngày lịch trong khoảng chọn, kể cả ngày không phát sinh giao dịch."
                  formula="Tổng tiền ra ÷ Số ngày lịch từ ngày đầu đến ngày cuối"
                  icon={<CalendarOutlined />}
                  label="Mức chi bình quân/ngày lịch"
                  note="Ví dụ chọn từ ngày 01 đến ngày 10 thì mẫu số là 10 ngày."
                />
              }
              value={data.kpis.averageDailyCashOut}
              formatter={(value) => formatVnd(Number(value))}
            />
          </Card>
        </div>
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
            size={{ height: 14 }}
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
      </section>
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
