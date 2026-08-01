import {
  CheckCircleFilled,
  EditOutlined,
  LockOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  Empty,
  Skeleton,
  Statistic,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { PayrollHelpTitle } from "@/components/payroll/payroll-explanation";
import { formatDate, formatVnd } from "@/lib/formatters";

const { Text, Title } = Typography;

export type PayrollPeriodAllocation = {
  employeeId: string;
  employeeName: string;
  role: string;
  sharePercent: number;
  amount: number;
};

export type PayrollPeriodSummary = {
  period: string;
  isClosed: boolean;
  closedAt: string | null;
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  periodCostTotal: number;
  cumulativeRevenue: number;
  cumulativeCosts: number;
  businessCashBalance: number;
  outstandingOwnerCapital: number;
  workingCapitalReserve: number;
  distributablePool: number;
  allocatedTotal: number;
  unallocatedPool: number;
  allocations: PayrollPeriodAllocation[];
};

export type PayrollHistoryEmployee = {
  id: string;
  name: string;
  role: string;
  sharePercent: number;
  isActive: boolean;
};

export type PayrollHistoryWithdrawal = {
  id: string;
  employeeId: string;
  period: string;
  withdrawalDate: string;
  amount: number;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function periodLabel(period: string) {
  return dayjs(`${period}-01`).format("MM/YYYY");
}

export function PayrollPeriodHistory({
  employees,
  periods,
  withdrawals,
  employeeColors,
  loading,
  onEdit,
  onWithdraw,
  onExplain,
  onExplainPeriod,
}: {
  employees: PayrollHistoryEmployee[];
  periods: PayrollPeriodSummary[];
  withdrawals: PayrollHistoryWithdrawal[];
  employeeColors: string[];
  loading: boolean;
  onEdit: (employee: PayrollHistoryEmployee) => void;
  onWithdraw: (
    employee: PayrollHistoryEmployee,
    period: PayrollPeriodSummary,
    allocation: PayrollPeriodAllocation,
  ) => void;
  onExplain: () => void;
  onExplainPeriod: (period: PayrollPeriodSummary) => void;
}) {
  const withdrawalByPeriodEmployee = new Map(
    withdrawals.map((withdrawal) => [
      `${withdrawal.period}:${withdrawal.employeeId}`,
      withdrawal,
    ]),
  );
  const grandTotal = periods.reduce(
    (total, period) => total + period.allocatedTotal,
    0,
  );
  const withdrawnTotal = withdrawals.reduce(
    (total, withdrawal) => total + withdrawal.amount,
    0,
  );

  return (
    <>
      <Card className="surface-card payroll-period-summary-card">
        <div className="payroll-period-summary-heading">
          <div>
            <Text type="secondary">
              <PayrollHelpTitle
                title="Tổng tất cả các tháng"
                topic="period-total"
                onOpen={onExplain}
              />
            </Text>
            <Title level={3}>{formatVnd(grandTotal)}</Title>
          </div>
          <Statistic
            title="Đã rút"
            value={withdrawnTotal}
            formatter={(value) => formatVnd(Number(value))}
          />
        </div>
        <div className="payroll-period-total-list">
          {periods.map((period) => (
            <div className="payroll-period-total-row" key={period.period}>
              <span>
                <Text strong>
                  <PayrollHelpTitle
                    title={`Tháng ${periodLabel(period.period)}`}
                    topic="distributable-pool"
                    onOpen={() => onExplainPeriod(period)}
                  />
                </Text>
                <Text type="secondary">
                  Chừa {formatVnd(period.outstandingOwnerCapital)} vốn chủ chưa
                  claim
                </Text>
              </span>
              <strong>{formatVnd(period.allocatedTotal)}</strong>
              <Tag color={period.isClosed ? "green" : "blue"}>
                {period.isClosed ? "Đã chốt" : "Tạm tính"}
              </Tag>
            </div>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="payroll-employee-grid">
          {[0, 1, 2].map((item) => (
            <Card className="surface-card" key={item}>
              <Skeleton active avatar paragraph={{ rows: 5 }} />
            </Card>
          ))}
        </div>
      ) : employees.length ? (
        <div className="payroll-employee-grid">
          {employees.map((employee, index) => {
            const employeeColor =
              employeeColors[index % employeeColors.length];
            const employeePeriods = periods.flatMap((period) => {
              const allocation = period.allocations.find(
                (item) => item.employeeId === employee.id,
              );
              return allocation ? [{ period, allocation }] : [];
            });
            const employeeTotal = employeePeriods.reduce(
              (total, item) => total + item.allocation.amount,
              0,
            );

            return (
              <Card
                key={employee.id}
                className={`surface-card payroll-employee-card${employee.isActive ? "" : " is-inactive"}`}
              >
                <div className="payroll-employee-heading">
                  <Avatar
                    size={48}
                    style={{ backgroundColor: employeeColor }}
                  >
                    {initials(employee.name)}
                  </Avatar>
                  <div className="payroll-employee-identity">
                    <div className="payroll-employee-name-row">
                      <Title level={4}>{employee.name}</Title>
                      {employee.isActive ? null : <Tag>Ngừng hoạt động</Tag>}
                    </div>
                    <Text type="secondary" className="payroll-employee-role">
                      {employee.role}
                    </Text>
                  </div>
                  <Button
                    type="text"
                    className="payroll-employee-edit"
                    icon={<EditOutlined />}
                    aria-label={`Sửa ${employee.name}`}
                    onClick={() => onEdit(employee)}
                  />
                </div>

                <div className="payroll-employee-metrics">
                  <div>
                    <Text type="secondary">Tỷ lệ hiện tại</Text>
                    <strong className="payroll-share-value">
                      {employee.sharePercent}%
                    </strong>
                  </div>
                  <div>
                    <Text type="secondary">Tổng tất cả tháng</Text>
                    <strong>{formatVnd(employeeTotal)}</strong>
                  </div>
                </div>

                <div className="payroll-employee-months">
                  {employeePeriods.length ? (
                    employeePeriods.map(({ period, allocation }) => {
                      const withdrawal = withdrawalByPeriodEmployee.get(
                        `${period.period}:${employee.id}`,
                      );
                      const monthText = periodLabel(period.period);

                      return (
                        <div
                          className="payroll-employee-month-row"
                          key={period.period}
                        >
                          <div className="payroll-employee-month-heading">
                            <span>
                              <Text strong>
                                <PayrollHelpTitle
                                  title={`Tháng ${monthText}`}
                                  topic="distributable-pool"
                                  onOpen={() => onExplainPeriod(period)}
                                />
                              </Text>
                              <Text type="secondary">
                                {allocation.sharePercent}% ·{" "}
                                {period.isClosed
                                  ? "Số tiền đã chốt"
                                  : `Chốt sau ${dayjs(`${period.period}-01`).endOf("month").format("DD/MM/YYYY")}`}
                              </Text>
                            </span>
                            <strong>{formatVnd(allocation.amount)}</strong>
                          </div>

                          {withdrawal ? (
                            <Button
                              block
                              disabled
                              icon={<CheckCircleFilled />}
                              className="payroll-withdrawn-button"
                            >
                              Đã rút · {formatDate(withdrawal.withdrawalDate)}
                            </Button>
                          ) : (
                            <Button
                              block
                              type={period.isClosed ? "primary" : "default"}
                              disabled={
                                !period.isClosed || allocation.amount < 1
                              }
                              icon={
                                period.isClosed ? (
                                  <WalletOutlined />
                                ) : (
                                  <LockOutlined />
                                )
                              }
                              onClick={() =>
                                onWithdraw(employee, period, allocation)
                              }
                            >
                              {allocation.amount < 1
                                ? "Chưa có tiền để rút"
                                : `Rút tháng ${monthText}`}
                            </Button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="Chưa có tháng được phân bổ"
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="surface-card">
          <Empty description="Chưa có nhân sự trong danh sách" />
        </Card>
      )}
    </>
  );
}
