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
import {
  DivestmentClaimManager,
  type DivestmentClaimContext,
} from "@/components/divestments/divestment-claim-manager";
import { useApiData } from "@/hooks/use-api-data";
import { calculateCapitalRecovery } from "@/lib/calculations/capital-recovery";
import {
  calculateBusinessCashBalance,
  divestmentClaimKey,
  type ClaimableInvestment,
} from "@/lib/divestment-claims";
import { formatVnd } from "@/lib/formatters";
import {
  workbookDashboard,
  workbookPurchases,
} from "@/lib/workbook-snapshot";

const { Text } = Typography;

const fallbackSummary = calculateCapitalRecovery(
  workbookDashboard.kpis.investmentTotal,
  0,
);
const fallbackHistoryItems: ClaimableInvestment[] = workbookPurchases
  .filter((item) => item.fundingSource === "owner_capital")
  .map((item) => ({
    key: divestmentClaimKey("purchase", item.id),
    sourceType: "purchase" as const,
    sourceId: item.id,
    code: item.itemCode,
    name: item.itemName,
    category: item.category,
    purchaseDate: item.purchaseDate,
    amount: item.totalAmount,
  }));
const fallbackBusinessCash = calculateBusinessCashBalance(
  workbookDashboard.kpis.revenue,
  0,
);
const fallbackWithdrawalLimit = Math.max(
  0,
  fallbackBusinessCash.remainingBalance,
);
const fallbackEligibleItems = fallbackHistoryItems.filter(
  (item) => item.amount < fallbackWithdrawalLimit,
);
const fallbackContext: DivestmentClaimContext = {
  summary: fallbackSummary,
  businessCash: fallbackBusinessCash,
  withdrawalLimit: fallbackWithdrawalLimit,
  eligibleItems: fallbackEligibleItems,
  unavailableItemCount:
    fallbackHistoryItems.length - fallbackEligibleItems.length,
  divestments: [],
};

export default function DivestmentsPage() {
  const [dataVersion, setDataVersion] = useState(0);
  const {
    data: context,
    loading,
    usingFallback,
  } = useApiData<DivestmentClaimContext>(
    `/api/divestment-claims?v=${dataVersion}`,
    fallbackContext,
  );
  const summary = context.summary;
  const progressPercent = Math.min(100, Math.max(0, summary.recoveryRate));
  const claimReady =
    !usingFallback &&
    context.withdrawalLimit > 0 &&
    context.eligibleItems.length > 0;

  return (
    <div className="page-wrap divestments-page">
      <PageHeader
        title="Thoái vốn"
        description="Dùng tiền bán hàng còn lại để hoàn vốn cho phiếu nhập và tài sản trước đây đã trả bằng vốn chủ."
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
              styles={{ content: { color: "var(--brand-strong)" } }}
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
              styles={{
                content: {
                  color: summary.isRecovered
                    ? "var(--success)"
                    : "var(--danger)",
                },
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
              styles={{
                content: {
                  color: summary.isRecovered
                    ? "var(--success)"
                    : "var(--brand-strong)",
                },
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
        title={
          usingFallback
            ? "Chưa tải được dữ liệu thoái vốn từ MongoDB"
            : summary.isRecovered
              ? "Bạn đã thu hồi đủ vốn đầu tư ban đầu"
              : claimReady
                ? `Doanh nghiệp còn ${formatVnd(context.businessCash.remainingBalance)}; chỉ chọn tổng tiền nhỏ hơn số này`
                : context.withdrawalLimit > 0
                  ? `Doanh nghiệp còn ${formatVnd(context.businessCash.remainingBalance)} nhưng chưa có phiếu nhập hoặc tài sản Vốn chủ nào nhỏ hơn số tiền này`
                  : "Hiện doanh nghiệp chưa còn tiền bán hàng để claim"
        }
        description={
          usingFallback
            ? "Chỉ có thể claim khi kết nối lại dữ liệu thật."
            : `${formatVnd(context.businessCash.totalRevenue)} doanh thu − ${formatVnd(context.businessCash.totalCompanyFundedOutflow)} tổng tiền nhập hàng, chi phí và tài sản dùng Tiền bán hàng = ${formatVnd(context.businessCash.remainingBalance)} còn lại. Claim xong, nguồn tiền của phiếu nhập hoặc tài sản đã chọn sẽ đổi sang Tiền bán hàng.`
        }
      />

      <DivestmentClaimManager
        context={context}
        usingFallback={usingFallback}
        onMutation={() => setDataVersion((current) => current + 1)}
      />
    </div>
  );
}
