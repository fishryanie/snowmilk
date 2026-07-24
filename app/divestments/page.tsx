"use client";

import {
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PercentageOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Card,
  Progress,
  Skeleton,
  Statistic,
  Typography,
} from "antd";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ResourceManager } from "@/components/common/resource-manager";
import { useApiData } from "@/hooks/use-api-data";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import { formatVnd } from "@/lib/formatters";
import { workbookDashboard } from "@/lib/workbook-snapshot";

const { Text } = Typography;

const fields = [
  {
    key: "withdrawalDate",
    label: "Ngày rút",
    type: "date" as const,
    required: true,
  },
  {
    key: "amount",
    label: "Số tiền",
    type: "money" as const,
    required: true,
  },
  {
    key: "note",
    label: "Ghi chú",
    type: "textarea" as const,
  },
];

type CapitalRecoverySummary = ReturnType<typeof calculateCapitalRecovery>;

const fallbackSummary = calculateCapitalRecovery(
  workbookDashboard.kpis.investmentTotal,
  0,
);

export default function DivestmentsPage() {
  const [summaryVersion, setSummaryVersion] = useState(0);
  const {
    data: summary,
    loading,
    usingFallback,
  } = useApiData<CapitalRecoverySummary>(
    `/api/reports/capital-recovery?v=${summaryVersion}`,
    fallbackSummary,
  );
  const progressPercent = Math.min(100, Math.max(0, summary.recoveryRate));

  return (
    <div className="page-wrap">
      <PageHeader
        title="Thoái vốn"
        description="Ghi lại từng khoản tiền thực tế đã rút khỏi hệ thống và theo dõi tiến độ thu hồi vốn ban đầu."
      />

      {loading ? (
        <div className="kpi-grid capital-recovery-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Card className="surface-card kpi-card" key={index}>
              <Skeleton active paragraph={{ rows: 1 }} />
            </Card>
          ))}
        </div>
      ) : (
        <div className="kpi-grid capital-recovery-grid">
          <Card className="surface-card kpi-card">
            <Statistic
              title={
                <span className="kpi-statistic-title">
                  <BankOutlined />
                  Vốn ban đầu cần thu hồi
                </span>
              }
              value={summary.investmentTotal}
              formatter={(value) => formatVnd(Number(value))}
            />
            <Text type="secondary">Chỉ dùng để đối chiếu, không chỉnh sửa tại đây.</Text>
          </Card>
          <Card className="surface-card kpi-card">
            <Statistic
              title={
                <span className="kpi-statistic-title">
                  <WalletOutlined />
                  Tổng tiền đã rút
                </span>
              }
              value={summary.withdrawnTotal}
              formatter={(value) => formatVnd(Number(value))}
              valueStyle={{ color: "var(--brand-strong)" }}
            />
            <Text type="secondary">Cộng từ toàn bộ bản ghi bên dưới.</Text>
          </Card>
          <Card className="surface-card kpi-card">
            <Statistic
              title={
                <span className="kpi-statistic-title">
                  {summary.isRecovered ? (
                    <CheckCircleOutlined />
                  ) : (
                    <ClockCircleOutlined />
                  )}
                  Còn cần thu hồi
                </span>
              }
              value={summary.remainingCapital}
              formatter={(value) => formatVnd(Number(value))}
              valueStyle={{
                color: summary.isRecovered
                  ? "var(--success)"
                  : "var(--danger)",
              }}
            />
            <Text type="secondary">
              {summary.excessWithdrawal > 0
                ? `Đã rút vượt vốn ${formatVnd(summary.excessWithdrawal)}.`
                : "Số còn thiếu để thu hồi đủ vốn ban đầu."}
            </Text>
          </Card>
          <Card className="surface-card kpi-card capital-progress-card">
            <Statistic
              title={
                <span className="kpi-statistic-title">
                  <PercentageOutlined />
                  Tiến độ thu hồi vốn
                </span>
              }
              value={summary.recoveryRate}
              precision={1}
              suffix="%"
              valueStyle={{
                color: summary.isRecovered
                  ? "var(--success)"
                  : "var(--brand-strong)",
              }}
            />
            <Progress
              percent={progressPercent}
              showInfo={false}
              status={summary.isRecovered ? "success" : "active"}
              aria-label={`Đã thu hồi ${summary.recoveryRate.toFixed(1)} phần trăm vốn ban đầu`}
            />
          </Card>
        </div>
      )}

      <Alert
        className="capital-recovery-alert"
        showIcon
        type={usingFallback ? "warning" : summary.isRecovered ? "success" : "info"}
        message={
          usingFallback
            ? "Chưa tải được dữ liệu thoái vốn từ MongoDB"
            : summary.isRecovered
              ? "Bạn đã thu hồi đủ vốn đầu tư ban đầu"
              : `Bạn còn cần rút ${formatVnd(summary.remainingCapital)} để thu hồi đủ vốn ban đầu`
        }
        description="Các khoản rút chỉ được lưu trong bảng thoái vốn riêng; hệ thống không trừ hoặc thay đổi dữ liệu vốn đầu tư ban đầu."
      />

      <ResourceManager
        resource="divestments"
        fields={fields}
        initialData={[]}
        addLabel="Ghi nhận lần rút vốn"
        fallbackLabel="Chưa kết nối dữ liệu"
        onMutation={() => setSummaryVersion((current) => current + 1)}
      />
    </div>
  );
}
