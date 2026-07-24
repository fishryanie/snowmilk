"use client";

import { SaveOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  InputNumber,
  Space,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import { formatVnd } from "@/lib/formatters";
import { editableSettingDefinitions } from "@/lib/settings";

const { Text } = Typography;

type Setting = {
  key: string;
  label: string;
  value: number;
  unit: string;
  editable: boolean;
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

export default function SettingsPage() {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
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
    form.setFieldsValue(
      Object.fromEntries(
        settings
          .filter((setting) => setting.editable)
          .map((setting) => [setting.key, setting.value]),
      ),
    );
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
    <div className="page-wrap">
      <PageHeader
        title="Cài đặt chi phí"
        description="Chỉ các thông số gốc được nhập; khấu hao và phân bổ/ly lấy tự động từ bảng Tài sản."
        actions={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={() => form.submit()}
          >
            Lưu cài đặt
          </Button>
        }
      />
      {usingFallback && (
        <Alert
          type="info"
          showIcon
          message="Đang hiển thị giá trị từ workbook"
          style={{ marginBottom: 16 }}
        />
      )}
      <Card className="surface-card" title="Ô nhập">
        <Form form={form} layout="vertical" onFinish={save}>
          <div className="kpi-grid">
            {editableSettings.map((setting) => (
              <Form.Item
                key={setting.key}
                name={setting.key}
                label={
                  <Space>
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
        className="surface-card calculated-card"
        title="Tự động từ Tài sản"
      >
        <Descriptions bordered column={1} size="small">
          {calculated.map((setting) => (
            <Descriptions.Item key={setting.key} label={setting.label}>
              {formatVnd(setting.value)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>
    </div>
  );
}
