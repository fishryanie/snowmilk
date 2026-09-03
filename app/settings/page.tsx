"use client";

import {
  ArrowRightOutlined,
  CalendarOutlined,
  DeleteOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
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
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  formatVnd,
  formatVndInput,
  parseVndInput,
} from "@/lib/formatters";
import {
  advancePayrollReserveFunds,
  DEFAULT_PAYROLL_RESERVE_FUNDS,
  PAYROLL_RISK_RESERVE_FUND_ID,
  PAYROLL_WORKING_CAPITAL_FUND_ID,
  totalPayrollReserveFunds,
  type PayrollReserveFund,
} from "@/lib/payroll";
import { editableSettingDefinitions } from "@/lib/settings";
import styles from "./settings.module.css";

const { Text } = Typography;

type Setting = {
  key: string;
  label: string;
  value: number;
  unit: string;
  editable: boolean;
};

type PayrollReserveSettings = {
  period: string;
  funds: PayrollReserveFund[];
  previousBalances: PayrollReserveFund[];
  balances: PayrollReserveFund[];
  previousTotal: number;
  periodChange: number;
  total: number;
  customized: boolean;
  inheritedFrom: string | null;
  locked: boolean;
};

type PayrollReserveForm = {
  funds: PayrollReserveFund[];
};

const fallbackSettings: Setting[] = [
  ...editableSettingDefinitions.map((setting) => ({
    key: setting.key,
    label: setting.label,
    value: setting.defaultValue,
    unit: setting.unit,
    editable: true,
  })),
  { key: "khau_hao_thang_tu_tai_san_d", label: "Khấu hao/tháng từ tài sản", value: 91_363.89, unit: "đ", editable: false },
  { key: "phan_bo_co_dinh_khau_hao_ly_d", label: "Phân bổ cố định + khấu hao/ly", value: 91.36, unit: "đ/ly", editable: false },
];

const defaultFundBalances = advancePayrollReserveFunds(
  [],
  DEFAULT_PAYROLL_RESERVE_FUNDS,
);

function reserveModeLabel(mode: PayrollReserveFund["mode"]) {
  return mode === "monthly" ? "Tích lũy mỗi tháng" : "Giữ mức cố định";
}

function PayrollReserveFundRow({
  field,
  index,
  fund,
  fundCount,
  previousBalance,
  endBalance,
  onRemove,
}: {
  field: { key: number; name: number };
  index: number;
  fund?: PayrollReserveFund;
  fundCount: number;
  previousBalance: number;
  endBalance: number;
  onRemove: () => void;
}) {
  const fundId = fund?.id ?? "";
  const isMonthly = fund?.mode === "monthly";
  const protectsAccumulatedBalance = isMonthly && previousBalance > 0;

  return (
    <div className={styles.fundRow}>
      <div className={styles.fundIndex}>
        {fundId === PAYROLL_RISK_RESERVE_FUND_ID ? (
          <SafetyCertificateOutlined />
        ) : fundId === PAYROLL_WORKING_CAPITAL_FUND_ID ? (
          <WalletOutlined />
        ) : (
          index + 1
        )}
      </div>
      <Form.Item name={[field.name, "id"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item
        name={[field.name, "name"]}
        label="Tên quỹ"
        className={styles.fundName}
        rules={[
          { required: true, message: "Hãy nhập tên quỹ" },
          { max: 100, message: "Tên quỹ tối đa 100 ký tự" },
        ]}
      >
        <Input placeholder="Ví dụ: Quỹ sửa chữa thiết bị" />
      </Form.Item>
      <Form.Item
        name={[field.name, "mode"]}
        label="Cách vận hành"
        className={styles.fundMode}
        rules={[{ required: true }]}
      >
        <Select
          options={[
            { value: "monthly", label: "Tích lũy mỗi tháng" },
            { value: "fixed", label: "Giữ mức cố định" },
          ]}
        />
      </Form.Item>
      <Form.Item
        name={[field.name, "amount"]}
        label={isMonthly ? "Trích thêm tháng này" : "Mức quỹ cần giữ"}
        className={styles.fundAmount}
        rules={[
          { required: true, message: "Hãy nhập số tiền" },
          {
            type: "number",
            min: 0,
            message: "Số tiền không được âm",
          },
        ]}
      >
        <InputNumber
          min={0}
          precision={0}
          formatter={formatVndInput}
          parser={parseVndInput}
          addonAfter="đ"
          style={{ width: "100%" }}
        />
      </Form.Item>
      <div className={styles.fundBalance}>
        <span>{isMonthly ? "Số dư sau khi cộng" : "Số dư quỹ"}</span>
        <strong>{formatVnd(endBalance)}</strong>
        <small>
          {isMonthly
            ? `${formatVnd(previousBalance)} + ${formatVnd(Number(fund?.amount ?? 0))}`
            : reserveModeLabel("fixed")}
        </small>
      </div>
      <Tooltip
        title={
          protectsAccumulatedBalance
            ? "Đặt khoản trích về 0 để dừng cộng; quỹ đã có số dư không thể xóa."
            : "Xóa quỹ"
        }
      >
        <span className={styles.deleteFund}>
          <Button
            danger
            type="text"
            aria-label={`Xóa ${fund?.name || "quỹ"}`}
            icon={<DeleteOutlined />}
            disabled={fundCount === 1 || protectsAccumulatedBalance}
            onClick={onRemove}
          />
        </span>
      </Tooltip>
    </div>
  );
}

function PayrollReserveSettingsCard({
  period,
  onPeriodChange,
}: {
  period: string;
  onPeriodChange: (month: Dayjs) => void;
}) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PayrollReserveForm>();
  const fallback: PayrollReserveSettings = {
    period,
    funds: DEFAULT_PAYROLL_RESERVE_FUNDS.map((fund) => ({ ...fund })),
    previousBalances: [],
    balances: defaultFundBalances,
    previousTotal: 0,
    periodChange: totalPayrollReserveFunds(defaultFundBalances),
    total: totalPayrollReserveFunds(defaultFundBalances),
    customized: false,
    inheritedFrom: null,
    locked: false,
  };
  const {
    data,
    loading,
    usingFallback,
    setData,
  } = useApiData<PayrollReserveSettings>(
    `/api/settings/payroll-funds?period=${period}`,
    fallback,
  );
  const watchedFunds = Form.useWatch("funds", form) ?? data.funds;
  const previewBalances = useMemo(
    () => advancePayrollReserveFunds(data.previousBalances, watchedFunds),
    [data.previousBalances, watchedFunds],
  );
  const previousById = useMemo(
    () => new Map(data.previousBalances.map((fund) => [fund.id, fund.amount])),
    [data.previousBalances],
  );
  const balanceById = useMemo(
    () => new Map(previewBalances.map((fund) => [fund.id, fund.amount])),
    [previewBalances],
  );
  const previousTotal = totalPayrollReserveFunds(data.previousBalances);
  const total = totalPayrollReserveFunds(previewBalances);
  const periodChange = total - previousTotal;

  useEffect(() => {
    form.setFieldsValue({
      funds: data.funds.map((fund) => ({ ...fund })),
    });
  }, [data.funds, form]);

  async function save(values: PayrollReserveForm) {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/payroll-funds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, funds: values.funds }),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: PayrollReserveSettings;
      };
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      setData(body.data);
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu cấu hình quỹ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      className={`surface-card ${styles.reserveCard}`}
      loading={loading}
      title={
        <div className={styles.reserveTitle}>
          <span className={styles.reserveTitleIcon}>
            <SafetyCertificateOutlined />
          </span>
          <span>
            <strong>Quỹ dự phòng &amp; vốn giữ lại</strong>
            <small>Thiết lập khoản trích và theo dõi số dư theo tháng</small>
          </span>
        </div>
      }
      extra={
        <Space wrap className={styles.reserveActions}>
          <DatePicker
            picker="month"
            allowClear={false}
            value={dayjs(`${period}-01`)}
            format="[Tháng] MM/YYYY"
            disabledDate={(date) => date.isAfter(dayjs(), "month")}
            prefix={<CalendarOutlined />}
            onChange={(value) => {
              if (value) onPeriodChange(value.startOf("month"));
            }}
          />
          <Button
            type="primary"
            icon={data.locked ? <LockOutlined /> : <SaveOutlined />}
            loading={saving}
            disabled={data.locked}
            onClick={() => form.submit()}
          >
            {data.locked ? "Đã khóa" : "Lưu tháng này"}
          </Button>
        </Space>
      }
    >
      {usingFallback ? (
        <Alert
          type="warning"
          showIcon
          message="Chưa tải được cấu hình đã lưu; đang hiển thị mức mặc định."
          className={styles.reserveAlert}
        />
      ) : null}
      {data.locked ? (
        <Alert
          type="warning"
          showIcon
          message="Tháng này đã có phiếu rút lương"
          description="Cấu hình và số dư đã được khóa để bảo toàn lịch sử chi lương."
          className={styles.reserveAlert}
        />
      ) : null}

      <div className={styles.reserveOverview}>
        <div className={styles.reserveOverviewCopy}>
          <Tag color={data.customized ? "cyan" : "default"}>
            {data.customized
              ? "Đã lưu riêng tháng này"
              : data.inheritedFrom
                ? `Kế thừa từ ${dayjs(`${data.inheritedFrom}-01`).format("MM/YYYY")}`
                : "Cấu hình mặc định"}
          </Tag>
          <Text>
            Quỹ loại <strong>tích lũy</strong> được cộng đúng một lần trong mỗi
            tháng. Lưu lại cùng tháng chỉ cập nhật khoản trích, không cộng trùng.
          </Text>
        </div>
        <div className={styles.reserveFlow} aria-label="Dòng tiền vào quỹ">
          <div>
            <span>Số dư đầu tháng</span>
            <strong>{formatVnd(previousTotal)}</strong>
          </div>
          <ArrowRightOutlined />
          <div className={styles.reserveFlowChange}>
            <span>Trích trong tháng</span>
            <strong>{formatVnd(periodChange)}</strong>
          </div>
          <ArrowRightOutlined />
          <div className={styles.reserveFlowTotal}>
            <span>Số dư cuối tháng</span>
            <strong>{formatVnd(total)}</strong>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={save} disabled={data.locked}>
        <Form.List name="funds">
          {(fields, { add, remove }) => (
            <div className={styles.fundList}>
              {fields.map((field, index) => {
                const watchedFund = watchedFunds[field.name];
                const fundId = watchedFund?.id ?? "";
                return (
                  <PayrollReserveFundRow
                    key={field.key}
                    field={field}
                    index={index}
                    fund={watchedFund}
                    fundCount={fields.length}
                    previousBalance={previousById.get(fundId) ?? 0}
                    endBalance={balanceById.get(fundId) ?? 0}
                    onRemove={() => remove(field.name)}
                  />
                );
              })}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                className={styles.addFund}
                onClick={() =>
                  add({
                    id: `custom-${crypto.randomUUID()}`,
                    name: "",
                    mode: "monthly",
                    amount: 0,
                  })
                }
              >
                Thêm một quỹ mới
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </Card>
  );
}

export default function SettingsPage() {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [payrollFundMonth, setPayrollFundMonth] = useState<Dayjs>(() =>
    dayjs().startOf("month"),
  );
  const [form] = Form.useForm<Record<string, number>>();
  const {
    data: settings,
    loading,
    usingFallback,
    setData: setSettings,
  } = useApiData<Setting[]>("/api/settings", fallbackSettings);
  const editableSettings = settings.filter((setting) => setting.editable);
  const calculated = settings.filter((setting) => !setting.editable);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (const setting of settings) {
      if (setting.editable) values[setting.key] = setting.value;
    }
    form.setFieldsValue(values);
  }, [form, settings]);

  async function save(values: Record<string, number>) {
    setSaving(true);
    try {
      const payload = editableSettings.map((setting) => ({
        key: setting.key,
        value: values[setting.key],
      }));
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        success: boolean;
        message: string;
        data?: Setting[];
      };
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      setSettings(body.data);
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu cấu hình",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <RouteSkeleton />;

  return (
    <div className={`page-wrap ${styles.settingsPage}`}>
      <PageHeader
        title="Cài đặt hệ thống"
        description="Quản lý quỹ dự phòng theo tháng và các thông số vận hành của tiệm."
      />
      {usingFallback && (
        <Alert
          type="info"
          showIcon
          message="Đang hiển thị giá trị từ workbook"
          className={styles.pageAlert}
        />
      )}
      <PayrollReserveSettingsCard
        key={payrollFundMonth.format("YYYY-MM")}
        period={payrollFundMonth.format("YYYY-MM")}
        onPeriodChange={setPayrollFundMonth}
      />

      <div className={styles.settingsLowerGrid}>
        <Card
          className={`surface-card ${styles.operatingCard}`}
          title={
            <span className={styles.sectionTitle}>
              <WalletOutlined />
              Thông số vận hành
            </span>
          }
          extra={
            <Button
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => form.submit()}
            >
              Lưu thông số
            </Button>
          }
        >
          <Form form={form} layout="vertical" onFinish={save}>
            <div className={styles.operatingGrid}>
              {editableSettings.map((setting) => (
                <Form.Item
                  key={setting.key}
                  name={setting.key}
                  label={
                    <Space size={4}>
                      <span>{setting.label}</span>
                      <Text type="secondary">({setting.unit})</Text>
                    </Space>
                  }
                  rules={[{ required: true, message: "Không được để trống" }]}
                >
                  <InputNumber
                    min={0}
                    step={setting.key.includes("overhead") ? 0.01 : 1}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
              ))}
            </div>
          </Form>
        </Card>
        <Card
          className={`surface-card ${styles.calculatedCard}`}
          title="Tự động từ tài sản"
        >
          <Descriptions column={1} size="small" colon={false}>
            {calculated.map((setting) => (
              <Descriptions.Item key={setting.key} label={setting.label}>
                <Text strong>{formatVnd(setting.value)}</Text>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      </div>
    </div>
  );
}
