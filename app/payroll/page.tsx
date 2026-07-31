"use client";

import {
  BankOutlined,
  CalendarOutlined,
  HistoryOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import {
  PayrollPeriodHistory,
  type PayrollPeriodAllocation,
  type PayrollPeriodSummary,
} from "@/components/payroll/payroll-period-history";
import type { PayrollTimelineSeries } from "@/components/payroll/payroll-timeline-chart";
import { useApiData } from "@/hooks/use-api-data";
import {
  formatDate,
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";

const { Paragraph, Text, Title } = Typography;

const PayrollTimelineChart = dynamic(
  () =>
    import("@/components/payroll/payroll-timeline-chart").then(
      (module) => module.PayrollTimelineChart,
    ),
  {
    ssr: false,
    loading: () => <Skeleton active paragraph={{ rows: 6 }} />,
  },
);

type Employee = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  sharePercent: number;
  joinedAt: string;
  isActive: boolean;
};

type Withdrawal = {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  withdrawalDate: string;
  amount: number;
  entitlementSnapshot: number;
  sharePercentSnapshot: number;
  note: string;
};

type DashboardData = {
  kpis: {
    revenue: number;
    businessCashBalance: number;
  };
  daily: Array<{
    date: string;
    revenue: number;
    purchaseTotal: number;
    expenseTotal: number;
    netCashFlow: number;
  }>;
};

type EmployeeFormValues = {
  name: string;
  role: string;
  phone?: string;
  email?: string;
  sharePercent: number;
  joinedAt: Dayjs;
  isActive: boolean;
};

type WithdrawalFormValues = {
  withdrawalDate: Dayjs;
  amount: number;
  note?: string;
};

type PendingWithdrawal = {
  employee: Employee;
  period: PayrollPeriodSummary;
  allocation: PayrollPeriodAllocation;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data?: T;
};

const dashboardFallback: DashboardData = {
  kpis: {
    revenue: 0,
    businessCashBalance: 0,
  },
  daily: [],
};

const employeeColors = [
  "#287f96",
  "#8b6fc0",
  "#db8b43",
  "#3f936f",
  "#c65d72",
  "#5f7dbb",
];

async function mutate<T>(url: string, method: "POST" | "PUT", payload: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.success || !body.data) {
    throw new Error(body.message || "Không thể lưu dữ liệu");
  }
  return body;
}

export default function PayrollPage() {
  const { message } = App.useApp();
  const [month, setMonth] = useState(() => dayjs().startOf("month"));
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [pendingWithdrawal, setPendingWithdrawal] =
    useState<PendingWithdrawal | null>(null);
  const [saving, setSaving] = useState(false);
  const [employeeForm] = Form.useForm<EmployeeFormValues>();
  const [withdrawalForm] = Form.useForm<WithdrawalFormValues>();

  const period = month.format("YYYY-MM");
  const rangeEnd = month.isSame(dayjs(), "month")
    ? dayjs()
    : month.endOf("month");
  const dashboardUrl = `/api/reports/dashboard?from=${month.format("YYYY-MM-DD")}&to=${rangeEnd.format("YYYY-MM-DD")}`;
  const {
    data: dashboard,
    loading: dashboardLoading,
    usingFallback: dashboardUnavailable,
  } = useApiData<DashboardData>(dashboardUrl, dashboardFallback);
  const {
    data: employees,
    loading: employeesLoading,
    usingFallback: employeesUnavailable,
    setData: setEmployees,
  } = useApiData<Employee[]>("/api/payroll/employees", []);
  const {
    data: withdrawals,
    loading: withdrawalsLoading,
    usingFallback: withdrawalsUnavailable,
    setData: setWithdrawals,
  } = useApiData<Withdrawal[]>(
    "/api/payroll/withdrawals",
    [],
  );
  const {
    data: payrollPeriods,
    loading: periodsLoading,
    usingFallback: periodsUnavailable,
  } = useApiData<PayrollPeriodSummary[]>("/api/payroll/periods", []);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees],
  );
  const totalShare = activeEmployees.reduce(
    (total, employee) => total + employee.sharePercent,
    0,
  );
  const selectedPayrollPeriod = payrollPeriods.find(
    (item) => item.period === period,
  );
  const selectedWithdrawals = useMemo(
    () =>
      withdrawals.filter((withdrawal) => withdrawal.period === period),
    [period, withdrawals],
  );
  const withdrawnTotal = selectedWithdrawals.reduce(
    (total, withdrawal) => total + withdrawal.amount,
    0,
  );
  const operatingReserve = selectedPayrollPeriod?.workingCapitalReserve ?? 0;
  const grossPayrollPool = selectedPayrollPeriod?.distributablePool ?? 0;
  const availablePayrollPool = Math.max(
    0,
    (selectedPayrollPeriod?.allocatedTotal ?? 0) - withdrawnTotal,
  );
  const unallocatedPool = selectedPayrollPeriod?.unallocatedPool ?? 0;
  const selectedAllocations =
    selectedPayrollPeriod?.allocations ??
    activeEmployees.map((employee) => ({
      employeeId: employee.id,
      employeeName: employee.name,
      role: employee.role,
      sharePercent: employee.sharePercent,
      amount: 0,
    }));
  const selectedTotalShare = selectedAllocations.reduce(
    (total, allocation) => total + allocation.sharePercent,
    0,
  );
  const withdrawnByEmployee = useMemo(
    () =>
      new Map(
        selectedWithdrawals.map((withdrawal) => [
          withdrawal.employeeId,
          withdrawal,
        ]),
      ),
    [selectedWithdrawals],
  );

  const timelineSeries: PayrollTimelineSeries[] = (() => {
    if (!dashboard.daily.length || !selectedAllocations.length) return [];
    const totalRevenue = dashboard.daily.reduce(
      (total, day) => total + Math.max(0, day.revenue),
      0,
    );
    let cumulativeRevenue = 0;
    const ratios = dashboard.daily.map((day, index) => {
      cumulativeRevenue += Math.max(0, day.revenue);
      return {
        date: day.date,
        ratio:
          totalRevenue > 0
            ? cumulativeRevenue / totalRevenue
            : (index + 1) / dashboard.daily.length,
      };
    });

    return selectedAllocations.map((allocation, index) => {
      const entitlement = allocation.amount;
      const withdrawal = withdrawnByEmployee.get(allocation.employeeId);
      return {
        name: allocation.employeeName,
        color: employeeColors[index % employeeColors.length],
        points: ratios.map(({ date, ratio }) => ({
          date,
          value: Math.max(
            0,
            entitlement * ratio -
              (withdrawal &&
              !dayjs(date).isBefore(dayjs(withdrawal.withdrawalDate), "day")
                ? withdrawal.amount
                : 0),
          ),
        })),
      };
    });
  })();

  const openEmployeeForm = (employee?: Employee) => {
    const editing = employee ?? null;
    setEditingEmployee(editing);
    employeeForm.setFieldsValue(
      editing
        ? {
            ...editing,
            joinedAt: dayjs(editing.joinedAt),
          }
        : {
            name: "",
            role: "",
            phone: "",
            email: "",
            sharePercent: Math.max(0, Math.min(100 - totalShare, 10)),
            joinedAt: dayjs(),
            isActive: true,
          },
    );
    setEmployeeModalOpen(true);
  };

  const saveEmployee = async (values: EmployeeFormValues) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        joinedAt: values.joinedAt.toISOString(),
      };
      const body = editingEmployee
        ? await mutate<Employee>(
            `/api/payroll/employees/${editingEmployee.id}`,
            "PUT",
            payload,
          )
        : await mutate<Employee>("/api/payroll/employees", "POST", payload);
      const saved = body.data!;
      setEmployees((current) =>
        editingEmployee
          ? current.map((employee) =>
              employee.id === saved.id ? saved : employee,
            )
          : [...current, saved],
      );
      message.success(body.message);
      setEmployeeModalOpen(false);
      setEditingEmployee(null);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu nhân sự",
      );
    } finally {
      setSaving(false);
    }
  };

  const openWithdrawalForm = (
    employee: Employee,
    selectedPeriod: PayrollPeriodSummary,
    allocation: PayrollPeriodAllocation,
  ) => {
    setPendingWithdrawal({
      employee,
      period: selectedPeriod,
      allocation,
    });
    withdrawalForm.setFieldsValue({
      withdrawalDate: dayjs(),
      amount: allocation.amount,
      note: `Chi phần được lãnh tháng ${dayjs(`${selectedPeriod.period}-01`).format("MM/YYYY")}`,
    });
    setWithdrawalModalOpen(true);
  };

  const saveWithdrawal = async (values: WithdrawalFormValues) => {
    if (!pendingWithdrawal) return;
    setSaving(true);
    try {
      const body = await mutate<Withdrawal>(
        "/api/payroll/withdrawals",
        "POST",
        {
          employeeId: pendingWithdrawal.employee.id,
          period: pendingWithdrawal.period.period,
          withdrawalDate: values.withdrawalDate.toISOString(),
          amount: pendingWithdrawal.allocation.amount,
          entitlementSnapshot: pendingWithdrawal.allocation.amount,
          note: values.note,
        },
      );
      setWithdrawals((current) => [body.data!, ...current]);
      message.success(body.message);
      setWithdrawalModalOpen(false);
      setPendingWithdrawal(null);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể ghi nhận phiếu rút",
      );
    } finally {
      setSaving(false);
    }
  };

  const withdrawalColumns: ColumnsType<Withdrawal> = [
    {
      title: "Nhân sự",
      dataIndex: "employeeName",
      key: "employeeName",
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: "Tháng lương",
      dataIndex: "period",
      key: "period",
      render: (value: string) => dayjs(`${value}-01`).format("MM/YYYY"),
    },
    {
      title: "Ngày rút",
      dataIndex: "withdrawalDate",
      key: "withdrawalDate",
      render: formatDate,
    },
    {
      title: "Tỷ lệ",
      dataIndex: "sharePercentSnapshot",
      key: "sharePercentSnapshot",
      render: (value: number) => `${value}%`,
    },
    {
      title: "Số tiền",
      dataIndex: "amount",
      key: "amount",
      align: "right",
      render: (value: number) => (
        <Text strong className="payroll-withdrawal-value">
          −{formatVnd(value)}
        </Text>
      ),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      ellipsis: true,
      render: (value: string) => value || "—",
    },
  ];

  const loading =
    dashboardLoading ||
    employeesLoading ||
    withdrawalsLoading ||
    periodsLoading;
  const unavailable =
    dashboardUnavailable ||
    employeesUnavailable ||
    withdrawalsUnavailable ||
    periodsUnavailable;

  return (
    <main className="payroll-page">
      <PageHeader
        title="Chi lương nhân sự"
        description="Theo dõi tiền sạch trong tháng; số tiền chỉ được chốt và mở rút sau ngày cuối cùng của tháng."
        actions={
          <Space wrap className="payroll-heading-actions">
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              format="[Tháng] MM/YYYY"
              disabledDate={(date) => date.isAfter(dayjs(), "month")}
              onChange={(value) => {
                if (value) setMonth(value.startOf("month"));
              }}
              prefix={<CalendarOutlined />}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openEmployeeForm()}
            >
              Thêm nhân sự
            </Button>
          </Space>
        }
      />

      {unavailable ? (
        <Alert
          type="warning"
          showIcon
          title="Chưa thể đồng bộ đủ dữ liệu"
          description="Kiểm tra kết nối MongoDB rồi tải lại trang để xem số tiền chính xác."
        />
      ) : null}

      <section className="payroll-kpi-grid" aria-label="Tổng quan quỹ lương">
        <Card className="surface-card payroll-kpi-card payroll-kpi-balance">
          <Statistic
            title="Tiền trong doanh nghiệp"
            value={dashboard.kpis.businessCashBalance}
            formatter={(value) => formatVnd(Number(value))}
            prefix={<BankOutlined />}
          />
          <Text type="secondary">Số dư thực tế đang ghi nhận</Text>
        </Card>
        <Card className="surface-card payroll-kpi-card payroll-kpi-reserve">
          <Statistic
            title="Vốn xoay vòng cần giữ"
            value={operatingReserve}
            formatter={(value) => formatVnd(Number(value))}
            prefix={<SafetyCertificateOutlined />}
          />
          <Text type="secondary">Doanh thu tự bù chi phí theo ngày</Text>
        </Card>
        <Card className="surface-card payroll-kpi-card payroll-kpi-share">
          <Statistic
            title="Quỹ có thể chia"
            value={grossPayrollPool}
            formatter={(value) => formatVnd(Number(value))}
            prefix={<TeamOutlined />}
          />
          <Text type="secondary">
            Đã trừ toàn bộ chi phí, kể cả khoản chưa claim
          </Text>
        </Card>
        <Card className="surface-card payroll-kpi-card payroll-kpi-available">
          <Statistic
            title="Còn có thể rút"
            value={availablePayrollPool}
            formatter={(value) => formatVnd(Number(value))}
            prefix={<WalletOutlined />}
          />
          <Text type="secondary">
            {selectedPayrollPeriod?.isClosed
              ? `Đã rút ${formatVnd(withdrawnTotal)}`
              : "Tạm tính · mở rút sau cuối tháng"}
          </Text>
        </Card>
      </section>

      <section className="payroll-overview-grid">
        <Card
          className="surface-card payroll-allocation-card"
          title={
            <Space>
              <TeamOutlined />
              <span>Phân bổ quỹ lương</span>
            </Space>
          }
          extra={
            <Tag color={selectedTotalShare === 100 ? "success" : "gold"}>
              {selectedTotalShare}% đã phân bổ
            </Tag>
          }
        >
          <div className="payroll-allocation-summary">
            <div>
              <Text type="secondary">Tỷ lệ nhân sự</Text>
              <Title level={3}>{selectedTotalShare}%</Title>
            </div>
            <Progress
              percent={Math.min(100, selectedTotalShare)}
              showInfo={false}
              strokeColor={{ "0%": "#287f96", "100%": "#65b7c6" }}
            />
            <Paragraph type="secondary">
              {selectedTotalShare < 100
                ? `${formatVnd(unallocatedPool)} chưa được gán và vẫn nằm trong doanh nghiệp.`
                : "Toàn bộ quỹ có thể chia đã được gán cho nhân sự."}
            </Paragraph>
          </div>
          <div className="payroll-allocation-list">
            {selectedAllocations.length ? (
              selectedAllocations.map((allocation, index) => (
                <div
                  className="payroll-allocation-row"
                  key={allocation.employeeId}
                >
                  <span
                    className="payroll-color-dot"
                    style={{
                      backgroundColor:
                        employeeColors[index % employeeColors.length],
                    }}
                  />
                  <span>
                    <Text strong>{allocation.employeeName}</Text>
                    <Text type="secondary">{allocation.role}</Text>
                  </span>
                  <Text strong>{allocation.sharePercent}%</Text>
                  <Text>{formatVnd(allocation.amount)}</Text>
                </div>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Thêm nhân sự để bắt đầu phân bổ"
              />
            )}
          </div>
        </Card>

        <Card
          className="surface-card payroll-timeline-card"
          title={
            <Space>
              <HistoryOutlined />
              <span>Lũy kế đến hiện tại</span>
            </Space>
          }
          extra={<Text type="secondary">{month.format("MM/YYYY")}</Text>}
        >
          <Paragraph type="secondary" className="payroll-timeline-note">
            Đường tiền tăng theo doanh thu đã ghi nhận trong tháng và giảm tại
            ngày nhân sự tạo phiếu rút.
          </Paragraph>
          <PayrollTimelineChart series={timelineSeries} />
        </Card>
      </section>

      <section className="payroll-team-section">
        <div className="payroll-section-heading">
          <div>
            <Title level={3}>Phần được lãnh của nhân sự</Title>
            <Text type="secondary">
              Trong tháng chỉ là số tạm tính; sau ngày cuối tháng, số tiền sạch
              được chốt và nút rút mới mở.
            </Text>
          </div>
          <Tag>{activeEmployees.length} đang hoạt động</Tag>
        </div>

        <PayrollPeriodHistory
          employees={employees}
          periods={payrollPeriods}
          withdrawals={withdrawals}
          employeeColors={employeeColors}
          loading={loading}
          onEdit={(employee) => openEmployeeForm(employee as Employee)}
          onWithdraw={(employee, selectedPeriod, allocation) =>
            openWithdrawalForm(
              employee as Employee,
              selectedPeriod,
              allocation,
            )
          }
        />
      </section>

      <Card
        className="surface-card payroll-history-card"
        title={
          <Space>
            <HistoryOutlined />
            <span>Lịch sử rút lương</span>
          </Space>
        }
        extra={<Text type="secondary">{withdrawals.length} phiếu</Text>}
      >
        <Table
          rowKey="id"
          columns={withdrawalColumns}
          dataSource={withdrawals}
          loading={withdrawalsLoading}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: "Chưa có phiếu rút" }}
          scroll={{ x: 760 }}
        />
      </Card>

      <Modal
        centered
        className="payroll-dialog"
        open={employeeModalOpen}
        title={editingEmployee ? "Cập nhật nhân sự" : "Thêm nhân sự"}
        okText={editingEmployee ? "Lưu thay đổi" : "Thêm nhân sự"}
        cancelText="Hủy"
        confirmLoading={saving}
        onCancel={() => setEmployeeModalOpen(false)}
        onOk={() => employeeForm.submit()}
      >
        <Form
          form={employeeForm}
          layout="vertical"
          onFinish={saveEmployee}
          className="payroll-modal-form"
        >
          <Form.Item
            name="name"
            label="Họ và tên"
            rules={[{ required: true, message: "Hãy nhập họ tên" }]}
          >
            <Input placeholder="Ví dụ: Nguyễn Minh Anh" />
          </Form.Item>
          <Form.Item
            name="role"
            label="Vai trò"
            rules={[{ required: true, message: "Hãy nhập vai trò" }]}
          >
            <Input placeholder="Ví dụ: Quản lý cửa hàng" />
          </Form.Item>
          <div className="payroll-form-grid">
            <Form.Item name="phone" label="Số điện thoại">
              <Input placeholder="09xx xxx xxx" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: "email", message: "Email không hợp lệ" }]}
            >
              <Input placeholder="ten@email.com" />
            </Form.Item>
          </div>
          <div className="payroll-form-grid">
            <Form.Item
              name="sharePercent"
              label="% được lãnh"
              rules={[
                { required: true, message: "Hãy nhập tỷ lệ" },
                {
                  type: "number",
                  min: 0.01,
                  max: 100,
                  message: "Tỷ lệ phải từ 0,01 đến 100",
                },
              ]}
            >
              <InputNumber
                min={0.01}
                max={100}
                precision={2}
                suffix="%"
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item
              name="joinedAt"
              label="Ngày bắt đầu"
              rules={[{ required: true, message: "Hãy chọn ngày bắt đầu" }]}
            >
              <DatePicker
                format="DD/MM/YYYY"
                style={{ width: "100%" }}
                disabledDate={(date) => date.isAfter(dayjs(), "day")}
              />
            </Form.Item>
          </div>
          <Form.Item
            name="isActive"
            label="Trạng thái"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="Đang hoạt động"
              unCheckedChildren="Ngừng hoạt động"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        centered
        className="payroll-dialog"
        open={withdrawalModalOpen}
        title={`Rút lương · ${pendingWithdrawal?.employee.name ?? ""}`}
        okText="Xác nhận rút"
        cancelText="Hủy"
        confirmLoading={saving}
        okButtonProps={{ icon: <WalletOutlined /> }}
        onCancel={() => {
          setWithdrawalModalOpen(false);
          setPendingWithdrawal(null);
        }}
        onOk={() => withdrawalForm.submit()}
      >
        {pendingWithdrawal ? (
          <Alert
            className="payroll-withdrawal-alert"
            type="info"
            showIcon
            title={`Số tiền đã chốt tháng ${dayjs(`${pendingWithdrawal.period.period}-01`).format("MM/YYYY")}`}
            description={formatVnd(pendingWithdrawal.allocation.amount)}
          />
        ) : null}
        <Form
          form={withdrawalForm}
          layout="vertical"
          onFinish={saveWithdrawal}
          className="payroll-modal-form"
        >
          <Form.Item
            name="withdrawalDate"
            label="Ngày rút"
            rules={[{ required: true, message: "Hãy chọn ngày rút" }]}
          >
            <DatePicker
              format="DD/MM/YYYY"
              style={{ width: "100%" }}
              disabledDate={(date) => date.isAfter(dayjs(), "day")}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label="Số tiền rút đã chốt"
            rules={[{ required: true, message: "Chưa có số tiền đã chốt" }]}
          >
            <InputNumber
              disabled
              formatter={formatVndInput}
              parser={parseVndInput}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={3} placeholder="Nội dung chi lương" />
          </Form.Item>
        </Form>
        <Text type="secondary" className="payroll-withdrawal-footnote">
          Mỗi người chỉ rút một lần cho mỗi tháng. Sau khi xác nhận, dòng tháng
          này sẽ chuyển sang trạng thái Đã rút.
        </Text>
      </Modal>
    </main>
  );
}
