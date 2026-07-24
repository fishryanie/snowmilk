"use client";

import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { formatNumber, formatVnd } from "@/lib/formatters";

const { Dragger } = Upload;
const { Text, Title } = Typography;

type Preview = {
  fileName: string;
  fileHash: string;
  summary: {
    sheets: Array<{
      sheetName: string;
      totalRows: number;
      successRows: number;
      failedRows: number;
      errors: unknown[];
    }>;
    totals: { totalRows: number; successRows: number; failedRows: number };
  };
  metrics: {
    investmentTotal: number;
    purchaseTotal: number;
    totalCups: number;
    grossRevenue: number;
    discountTotal: number;
    netRevenue: number;
    variableCost: number;
    contributionProfit: number;
  };
  issues: Array<{
    sheet: string;
    row: number;
    column?: string;
    message: string;
    severity: "error" | "warning";
  }>;
};

export default function ImportPage() {
  const { message, modal } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function send(endpoint: "preview" | "execute") {
    if (!file) {
      message.warning("Hãy chọn file .xlsx trước.");
      return null;
    }
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/import/excel/${endpoint}`, {
      method: "POST",
      body: formData,
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data?: Preview;
    };
    if (!response.ok || !body.success || !body.data) throw new Error(body.message);
    return body;
  }

  async function analyze() {
    setLoading(true);
    try {
      const result = await send("preview");
      if (result?.data) {
        setPreview(result.data);
        message.success("Đã phân tích file, chưa ghi dữ liệu vào MongoDB.");
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể đọc file");
    } finally {
      setLoading(false);
    }
  }

  function confirmImport() {
    if (!preview) return;
    modal.confirm({
      title: "Import dữ liệu vào MongoDB?",
      content:
        "Các bản ghi có cùng legacyId hoặc mã sẽ được cập nhật, không tạo trùng khi chạy lại.",
      okText: "Import",
      cancelText: "Hủy",
      onOk: async () => {
        setImporting(true);
        try {
          const result = await send("execute");
          if (result) message.success(result.message);
        } catch (error) {
          message.error(error instanceof Error ? error.message : "Import thất bại");
        } finally {
          setImporting(false);
        }
      },
    });
  }

  return (
    <div className="page-wrap">
      <PageHeader
        title="Nhập dữ liệu Excel"
        description="Xem trước, kiểm tra lỗi và import có truy vết. Chạy lại cùng file sẽ upsert theo mã/legacyId."
        actions={
          preview && (
            <Button
              type="primary"
              icon={<DatabaseOutlined />}
              loading={importing}
              disabled={preview.summary.totals.failedRows > 0}
              onClick={confirmImport}
            >
              Import MongoDB
            </Button>
          )
        }
      />
      <Card className="surface-card upload-panel">
        <Dragger
          accept=".xlsx"
          maxCount={1}
          fileList={fileList}
          beforeUpload={(selected) => {
            setFile(selected);
            setFileList([selected]);
            setPreview(null);
            return false;
          }}
          onRemove={() => {
            setFile(null);
            setFileList([]);
            setPreview(null);
          }}
        >
          <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <Title level={4}>Thả file Excel vào đây</Title>
          <Text type="secondary">Chỉ đọc file .xlsx, tối đa 10 MB. Dữ liệu chưa được ghi cho đến khi bạn xác nhận import.</Text>
        </Dragger>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button type="primary" ghost icon={<FileSearchOutlined />} loading={loading} onClick={analyze}>
            Phân tích & xem trước
          </Button>
        </div>
      </Card>
      {preview && (
        <>
          <Alert
            type={preview.summary.totals.failedRows ? "error" : "success"}
            showIcon
            icon={<CheckCircleOutlined />}
            message={`Đã nhận diện ${preview.summary.totals.totalRows} bản ghi nghiệp vụ`}
            description={`File: ${preview.fileName} · Hash: ${preview.fileHash.slice(0, 12)}…`}
            style={{ marginTop: 16 }}
          />
          <div className="kpi-grid" style={{ marginTop: 16 }}>
            <Card className="surface-card"><Statistic title="Tổng vốn đầu tư" value={preview.metrics.investmentTotal} formatter={(value) => formatVnd(Number(value))} /></Card>
            <Card className="surface-card"><Statistic title="Tiền nhập hàng" value={preview.metrics.purchaseTotal} formatter={(value) => formatVnd(Number(value))} /></Card>
            <Card className="surface-card"><Statistic title="Số ly Bán nhanh" value={preview.metrics.totalCups} suffix="ly" formatter={(value) => formatNumber(Number(value))} /></Card>
            <Card className="surface-card"><Statistic title="Doanh thu Bán nhanh" value={preview.metrics.netRevenue} formatter={(value) => formatVnd(Number(value))} /></Card>
          </div>
          <Card className="surface-card table-card" title="Kết quả theo sheet" style={{ marginTop: 16 }}>
            <Table
              size="small"
              pagination={false}
              rowKey="sheetName"
              dataSource={preview.summary.sheets}
              scroll={{ x: "max-content" }}
              columns={[
                { title: "Sheet", dataIndex: "sheetName" },
                { title: "Tổng dòng", dataIndex: "totalRows" },
                { title: "Hợp lệ", dataIndex: "successRows", render: (value) => <Tag color="green">{value}</Tag> },
                { title: "Lỗi", dataIndex: "failedRows", render: (value) => <Tag color={value ? "red" : "default"}>{value}</Tag> },
              ]}
            />
          </Card>
          {preview.issues.length > 0 && (
            <Card className="surface-card" title="Cảnh báo cần đối soát" style={{ marginTop: 16 }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {preview.issues.map((issue, index) => (
                  <Alert
                    key={`${issue.sheet}-${issue.row}-${index}`}
                    type={issue.severity === "error" ? "error" : "warning"}
                    showIcon
                    message={`${issue.sheet}!${issue.column ?? ""}${issue.row}`}
                    description={issue.message}
                  />
                ))}
              </Space>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
