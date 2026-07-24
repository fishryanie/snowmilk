"use client";

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  LineChartOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  TrophyOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
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
import { type ReactNode, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { formatNumber, formatVnd } from "@/lib/formatters";
import { workbookDashboard } from "@/lib/workbook-snapshot";
import { useApiData } from "@/hooks/use-api-data";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

type DashboardData = typeof workbookDashboard;

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
  const { data, loading, usingFallback } = useApiData<DashboardData>(
    url,
    workbookDashboard,
  );
  const maxCups = useMemo(
    () => Math.max(...data.products.map((item) => item.cups), 1),
    [data.products],
  );
  const cashCoverage =
    data.kpis.cashOut > 0 ? data.kpis.cashIn / data.kpis.cashOut : 0;
  const coveragePercent =
    data.kpis.cashOut > 0
      ? (data.kpis.cashIn / data.kpis.cashOut) * 100
      : data.kpis.cashIn > 0
        ? 100
        : 0;
  const cashFlowDifference = Math.abs(data.kpis.netCashFlow);
  const divestmentSuggestion = data.divestmentSuggestion;
  const divestmentReady = divestmentSuggestion.status === "ready";
  const divestmentStatusLabel =
    divestmentSuggestion.status === "ready"
      ? "Có thể cân nhắc"
      : divestmentSuggestion.status === "capital-recovered"
        ? "Đã thu hồi đủ vốn"
        : divestmentSuggestion.status === "insufficient-data"
          ? "Chờ thêm dữ liệu"
          : "Chưa nên thoái vốn";
  const eligibilityDate =
    divestmentSuggestion.estimatedDaysUntilEligible !== null &&
    divestmentSuggestion.estimatedDaysUntilEligible > 0
      ? dayjs(range[1])
          .add(divestmentSuggestion.estimatedDaysUntilEligible, "day")
          .format("DD/MM/YYYY")
      : null;
  const divestmentChecks = [
    {
      label: "Dòng tiền lũy kế sau các lần rút đang dương",
      passed: divestmentSuggestion.checks.hasPositiveRecordedCash,
    },
    {
      label: "Dòng tiền vận hành trong kỳ đang dương",
      passed: divestmentSuggestion.checks.hasPositiveOperatingCashFlow,
    },
    {
      label: `Có ít nhất ${divestmentSuggestion.minimumSalesDays} ngày bán để làm mẫu`,
      passed: divestmentSuggestion.checks.hasEnoughSalesData,
    },
    {
      label: `Sau khi rút vẫn giữ quỹ vận hành ${divestmentSuggestion.reserveDays} ngày`,
      passed: divestmentSuggestion.checks.keepsOperatingReserve,
    },
  ];
  const kpis = [
    {
      label: "Doanh thu",
      value: data.kpis.revenue,
      icon: <DollarOutlined />,
      money: true,
      description:
        "Tổng doanh thu thuần của các giao dịch hoặc bản chốt ngày trong khoảng thời gian đang chọn.",
      formula: "Σ Doanh thu thuần trong kỳ",
      note: "Nếu một ngày đã có bản chốt tổng, hệ thống bỏ qua các dòng bán lẻ cùng ngày để tránh tính hai lần.",
    },
    {
      label: "Số ly đã bán",
      value: data.kpis.totalCups,
      icon: <ShoppingOutlined />,
      suffix: "ly",
      description:
        "Tổng số ly được ghi nhận đã bán trong khoảng thời gian đang chọn.",
      formula: "Σ Số ly của các giao dịch hoặc bản chốt ngày trong kỳ",
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
      label: "Lợi nhuận tạm tính",
      value: data.kpis.estimatedProfit,
      icon: <RiseOutlined />,
      money: true,
      profit: true,
      description:
        "Khoản lãi ước tính sau giá vốn biến đổi, phần chi phí cố định được phân bổ trong bản chốt và các chi phí khác đã ghi nhận.",
      formula:
        "Σ Lãi đóng góp hoặc lợi nhuận ước tính từng bản bán − Chi phí khác trong kỳ",
      note: "Các ngày chốt nhanh có thể chứa cost topping và cơ cấu size ước tính nên đây chưa phải lợi nhuận kế toán cuối cùng.",
    },
    {
      label: "Cost biến đổi bình quân/ly",
      value: data.kpis.averageCostPerCup,
      icon: <LineChartOutlined />,
      money: true,
      description:
        "Chi phí biến đổi bình quân cho một ly đã bán trong kỳ, gồm các cấu phần giá vốn gắn với sản lượng.",
      formula: "Tổng cost biến đổi trong kỳ ÷ Tổng số ly đã bán",
    },
    {
      label: "Tổng vốn đã bỏ lũy kế",
      value: data.kpis.investmentTotal,
      icon: <TrophyOutlined />,
      money: true,
      description:
        "Tổng tiền mua thiết bị và các lần nhập hàng dùng nguồn Vốn chủ được ghi nhận từ trước đến nay.",
      formula:
        "Tổng tiền mua thiết bị lũy kế + Tổng tiền nhập hàng bằng Vốn chủ lũy kế",
      note: "Các phiếu nhập bằng Tiền bán hàng, Tiền vay hoặc Nguồn khác vẫn là tiền ra nhưng không làm tăng chỉ số này.",
    },
    {
      label: "Đầu tư thiết bị",
      value: data.kpis.equipmentTotal,
      icon: <BankOutlined />,
      money: true,
      description:
        "Tổng số tiền mua thiết bị có ngày mua nằm trong khoảng thời gian đang chọn.",
      formula: "Σ Thành tiền thiết bị mua trong kỳ",
      note: "Khoản này được tính vào tiền ra và đồng thời làm tăng Tổng vốn đã bỏ lũy kế.",
    },
    {
      label: "Tổng âm còn lại",
      value: data.kpis.capitalRecoveryBalance,
      icon: <RiseOutlined />,
      money: true,
      profit: true,
      description:
        "So sánh lợi nhuận tạm tính trong kỳ với toàn bộ vốn đã bỏ lũy kế. Số âm nghĩa là lợi nhuận kỳ này chưa bù được mức vốn đang ghi nhận.",
      formula: "Lợi nhuận tạm tính trong kỳ − Tổng vốn đã bỏ lũy kế",
      note: "Phiếu nhập cũ hoặc import từ Excel được mặc định là Vốn chủ; có thể sửa lại nguồn tiền trên trang Nhập hàng nếu cần.",
    },
  ];

  if (loading) return <RouteSkeleton />;

  return (
    <div className="page-wrap">
      <PageHeader
        title="Tổng quan"
        description="Theo dõi doanh thu, giá vốn và tiến độ thu hồi vốn trên một màn hình."
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
          showIcon
          type="info"
          title="Đang hiển thị snapshot từ file Excel"
          description="MongoDB chưa kết nối hoặc chưa import dữ liệu. Các số dưới đây giữ nguyên giá trị đang hiển thị trong workbook để bạn đối chiếu."
          style={{ marginBottom: 16 }}
        />
      )}
      <div className="kpi-grid">
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
              suffix={item.suffix}
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
      </div>
      <section className="cash-flow-section" aria-labelledby="cash-flow-title">
        <div className="cash-flow-heading">
          <div>
            <Title level={3} id="cash-flow-title">
              Kiểm soát dòng tiền
            </Title>
            <Text type="secondary">
              Tiền thực thu và các khoản đã chi trong khoảng ngày đang chọn.
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
                  description="Toàn bộ khoản chi thực tế được ghi nhận trong kỳ cho nhập hàng, vận hành và mua thiết bị."
                  formula="Tổng tiền ra = Nhập hàng + Chi phí vận hành + Mua thiết bị"
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
        <div className="cash-flow-detail-grid">
          <Card
            className="surface-card"
            title="Cơ cấu tiền ra"
            extra={<Text strong>{formatVnd(data.kpis.cashOut)}</Text>}
          >
            <div className="summary-row">
              <Text type="secondary">Nhập nguyên liệu &amp; bao bì</Text>
              <Text strong>{formatVnd(data.kpis.purchaseTotal)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Chi phí vận hành</Text>
              <Text strong>{formatVnd(data.kpis.expenseTotal)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Đầu tư thiết bị</Text>
              <Text strong>{formatVnd(data.kpis.equipmentTotal)}</Text>
            </div>
          </Card>
          <Card
            className="surface-card"
            title="Khả năng bù chi"
            extra={
              <Text strong>
                {data.kpis.cashOut > 0
                  ? `${cashCoverage.toLocaleString("vi-VN", {
                      maximumFractionDigits: 2,
                    })} lần`
                  : "Chưa phát sinh chi"}
              </Text>
            }
          >
            <Progress
              percent={Math.min(100, Math.round(coveragePercent))}
              status={coveragePercent >= 100 ? "success" : "exception"}
              strokeColor={
                coveragePercent >= 100 ? "var(--success)" : "var(--amber)"
              }
              format={() => `${Math.round(coveragePercent)}%`}
            />
            <Text type="secondary" className="cash-flow-days">
              {data.kpis.positiveCashFlowDays}/{data.kpis.activeCashFlowDays} ngày
              có hoạt động đạt dòng tiền dương
            </Text>
            <Alert
              showIcon
              type={data.kpis.netCashFlow >= 0 ? "success" : "warning"}
              title={
                data.kpis.netCashFlow >= 0
                  ? `Tiền vào đang cao hơn tiền ra ${formatVnd(cashFlowDifference)}.`
                  : `Tiền ra đang cao hơn tiền vào ${formatVnd(cashFlowDifference)}.`
              }
              style={{ marginTop: 14 }}
            />
          </Card>
        </div>
      </section>
      <section
        className="divestment-advice-section"
        aria-labelledby="divestment-advice-title"
      >
        <div className="cash-flow-heading">
          <div>
            <Title level={3} id="divestment-advice-title">
              Gợi ý thoái vốn
            </Title>
            <Text type="secondary">
              Ước tính bảo thủ từ dòng tiền đã ghi nhận, quỹ dự phòng vận hành
              và số vốn còn cần thu hồi.
            </Text>
          </div>
          <Tag color={divestmentReady ? "success" : "warning"}>
            {divestmentStatusLabel}
          </Tag>
        </div>
        <div className="divestment-advice-grid">
          <Card className="surface-card divestment-advice-hero">
            <Statistic
              title={
                <MetricTitle
                  description="Mức tối đa hệ thống đề xuất có thể rút mà vẫn giữ quỹ vận hành và không vượt phần vốn còn cần thu hồi."
                  formula="min(Số dư ghi nhận − Quỹ dự phòng 30 ngày, Vốn còn cần thu hồi)"
                  icon={<WalletOutlined />}
                  label="Số tiền gợi ý rút lúc này"
                  note="Chỉ có giá trị lớn hơn 0 khi đủ dữ liệu bán, dòng tiền lũy kế và dòng tiền vận hành đều dương; kết quả được làm tròn xuống 1.000 ₫."
                />
              }
              value={divestmentSuggestion.suggestedAmount}
              formatter={(value) => formatVnd(Number(value))}
              styles={{
                content: {
                  color: divestmentReady
                    ? "var(--success)"
                    : "var(--muted)",
                },
              }}
            />
            <Alert
              showIcon
              type={divestmentReady ? "success" : "warning"}
              title={
                divestmentReady
                  ? `Có thể cân nhắc rút ${formatVnd(divestmentSuggestion.suggestedAmount)}.`
                  : divestmentSuggestion.status === "capital-recovered"
                    ? "Vốn ban đầu đã được thu hồi đủ."
                    : divestmentSuggestion.status === "insufficient-data"
                      ? `Mới có ${divestmentSuggestion.salesDays}/${divestmentSuggestion.minimumSalesDays} ngày bán cần thiết để đưa ra gợi ý.`
                      : divestmentSuggestion.recordedCashBalance <= 0
                        ? `Dòng tiền lũy kế sau các lần rút còn âm ${formatVnd(Math.abs(divestmentSuggestion.recordedCashBalance))}.`
                        : "Chưa đạt đủ các điều kiện an toàn để thoái vốn."
              }
              description={
                eligibilityDate
                  ? `Nếu mức thặng dư vận hành hiện tại được giữ ổn định, có thể kiểm tra lại vào khoảng ${eligibilityDate}.`
                  : "Hệ thống sẽ gợi ý lại khi dữ liệu bán đủ dài, dòng tiền vận hành dương và phần tiền còn lại vượt quỹ dự phòng."
              }
              style={{ marginTop: 18 }}
            />
          </Card>
          <Card
            className="surface-card"
            title="Cơ sở tính gợi ý"
            extra={
              <Button href="/divestments" type="primary">
                Mở trang thoái vốn
              </Button>
            }
          >
            <div className="summary-row">
              <Text type="secondary">Dòng tiền lũy kế sau các lần rút</Text>
              <Text
                strong
                type={
                  divestmentSuggestion.recordedCashBalance < 0
                    ? "danger"
                    : "success"
                }
              >
                {formatVnd(divestmentSuggestion.recordedCashBalance)}
              </Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">
                Quỹ dự phòng {divestmentSuggestion.reserveDays} ngày
              </Text>
              <Text strong>{formatVnd(divestmentSuggestion.reserveTarget)}</Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Vốn còn cần thu hồi</Text>
              <Text strong>
                {formatVnd(divestmentSuggestion.remainingCapital)}
              </Text>
            </div>
            <div className="summary-row">
              <Text type="secondary">Dòng tiền vận hành kỳ này</Text>
              <Text
                strong
                type={
                  divestmentSuggestion.periodOperatingNetCashFlow < 0
                    ? "danger"
                    : "success"
                }
              >
                {formatVnd(
                  divestmentSuggestion.periodOperatingNetCashFlow,
                )}
              </Text>
            </div>
          </Card>
        </div>
        <Card className="surface-card divestment-check-card">
          <div className="divestment-check-list">
            {divestmentChecks.map((check) => (
              <div
                className={`divestment-check ${check.passed ? "is-passed" : ""}`}
                key={check.label}
              >
                {check.passed ? (
                  <CheckCircleOutlined aria-hidden />
                ) : (
                  <ClockCircleOutlined aria-hidden />
                )}
                <Text>{check.label}</Text>
              </div>
            ))}
          </div>
          <div className="divestment-method-note">
            <SafetyCertificateOutlined aria-hidden />
            <Text type="secondary">
              Đây là quy tắc vận hành tham khảo, không tự tạo giao dịch. Hãy
              đối chiếu số dư ngân hàng, khoản phải trả và nghĩa vụ thuế trước
              khi rút tiền thực tế.
            </Text>
          </div>
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
            color="#287f96"
            fillColor="rgba(40, 127, 150, 0.16)"
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
      <div className="dashboard-grid">
        <Card className="surface-card" title="Cơ cấu số ly đã bán">
          <div className="mini-bars">
            {data.products.slice(0, 7).map((item) => (
              <div className="mini-bar-row" key={item.product}>
                <Text ellipsis>{item.product}</Text>
                <div className="mini-bar-track">
                  <div
                    className="mini-bar-fill"
                    style={{ width: `${Math.max(5, (item.cups / maxCups) * 100)}%` }}
                  />
                </div>
                <Text strong>{item.cups} ly</Text>
              </div>
            ))}
          </div>
        </Card>
        <Card className="surface-card" title="Hiệu quả kỳ này">
          <div className="summary-row">
            <Text type="secondary">Doanh thu thuần</Text>
            <Text strong>{formatVnd(data.kpis.revenue)}</Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Cost biến đổi</Text>
            <Text>{formatVnd(data.kpis.variableCost)}</Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Chi phí cố định phân bổ</Text>
            <Text>{formatVnd(data.kpis.allocatedFixedCost)}</Text>
          </div>
          <div className="summary-row">
            <Text type="secondary">Chi phí khác</Text>
            <Text>{formatVnd(data.kpis.expenseTotal)}</Text>
          </div>
          <div className="summary-row summary-total">
            <Title level={5}>Lợi nhuận tạm tính</Title>
            <Title level={4}>{formatVnd(data.kpis.estimatedProfit)}</Title>
          </div>
          <Alert
            type="info"
            showIcon
            title="Lợi nhuận có phần ước tính"
            description={
              data.kpis.estimatedSalesDays > 0
                ? `${data.kpis.estimatedSalesDays} ngày chốt nhanh đang dùng cost topping trung vị và phân bổ chi phí cố định theo mỗi ly.`
                : "Khi chốt bán hàng theo Size M/L, hệ thống dùng cost topping trung vị và hiển thị khoảng lợi nhuận để đối soát."
            }
            style={{ marginTop: 16 }}
          />
        </Card>
      </div>
    </div>
  );
}
