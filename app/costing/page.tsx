"use client";

import {
  Alert,
  Card,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  normalizedPreparationCostSource,
  type PreparationBatchType,
} from "@/lib/calculations/preparation-batch";
import { formatVnd } from "@/lib/formatters";
import {
  workbookBatches,
  workbookProducts,
} from "@/lib/workbook-snapshot";

const { Text, Title } = Typography;

type Product = (typeof workbookProducts)[number] & {
  milkBatchId?: string;
  milkBatchCode?: string;
  milkBatchName?: string;
  milkCost?: number;
  toppingCost?: number;
  packagingCost?: number;
  overheadCost?: number;
  allocatedFixedCost?: number;
  hasCostWarning?: boolean;
};

type Batch = (typeof workbookBatches)[number] & {
  _id?: string;
  batchType?: PreparationBatchType;
  outputQuantity?: number;
  outputUnit?: string;
  outputBaseQuantity?: number;
  outputBaseUnit?: string;
  costPerBaseUnit?: number;
};

function batchOutput(batch: Batch) {
  return batch.outputQuantity && batch.outputUnit
    ? `${batch.outputQuantity} ${batch.outputUnit}`
    : `${batch.actualLiters} L`;
}

export default function CostingPage() {
  const [productCode, setProductCode] = useState(workbookProducts[0].code);
  const {
    data: products,
    loading: productsLoading,
    usingFallback: productsFallback,
  } = useApiData<Product[]>("/api/products?limit=500", workbookProducts);
  const {
    data: batches,
    loading: batchesLoading,
    usingFallback: batchesFallback,
  } = useApiData<Batch[]>("/api/batches?limit=500", workbookBatches);
  const product =
    products.find((item) => item.code === productCode) ?? products[0];
  const appliedBatch = product
    ? batches.find(
        (batch) =>
          batch.code === product.milkBatchCode ||
          batch.name === product.milkBatchName,
      ) ?? batches.find((batch) => batch.batchType !== "topping")
    : batches.find((batch) => batch.batchType !== "topping");
  const breakdown = useMemo(
    () => ({
      milk: Number(product?.milkCost ?? 0),
      topping: Number(product?.toppingCost ?? 0),
      packaging: Number(product?.packagingCost ?? 0),
      overhead: Number(product?.overheadCost ?? 0),
    }),
    [product],
  );
  const costRatio =
    product?.sellingPrice && product.fullCost
      ? (product.fullCost / product.sellingPrice) * 100
      : 0;

  if (productsLoading || batchesLoading) return <RouteSkeleton />;

  return (
    <div className="page-wrap">
      <PageHeader
        title="Giá vốn sản phẩm"
        description="Theo dõi riêng cost nền sữa, topping đã nấu, bao bì, overhead và phần cố định được phân bổ."
        actions={
          <Select
            value={product?.code}
            onChange={setProductCode}
            style={{ width: 260 }}
            options={products.map((item) => ({
              value: item.code,
              label: item.name,
            }))}
          />
        }
      />
      {(productsFallback || batchesFallback) && (
        <Alert
          type="info"
          showIcon
          title="Không kết nối được API; đang hiển thị dữ liệu dự phòng của mẻ 6L hiện tại."
          style={{ marginBottom: 16 }}
        />
      )}
      {!product ? (
        <Alert
          type="warning"
          showIcon
          title="Chưa có sản phẩm để tính giá vốn."
        />
      ) : (
        <>
          {product.hasCostWarning && (
            <Alert
              type="warning"
              showIcon
              title="Giá vốn sản phẩm đang bất thường"
              description="Hãy kiểm tra quy cách/gói và đơn vị cost của topping trước khi dùng cho quyết định kinh doanh."
              style={{ marginBottom: 16 }}
            />
          )}
          <div className="cost-grid">
            <Card className="surface-card">
              <Space orientation="vertical" size={20} style={{ width: "100%" }}>
                <div>
                  <Text type="secondary">Sản phẩm</Text>
                  <Title level={3}>{product.name}</Title>
                  <Tag>{product.code}</Tag>
                  <Tag color="blue">{product.sizeName}</Tag>
                  {appliedBatch && (
                    <Tag color="green">
                      Mẻ áp dụng: {appliedBatch.code} – {appliedBatch.name}
                    </Tag>
                  )}
                </div>
                <Statistic
                  title="Giá bán"
                  value={product.sellingPrice}
                  formatter={(value) => formatVnd(Number(value))}
                />
                <Statistic
                  title="Full cost"
                  value={product.fullCost}
                  styles={{
                    content: {
                      color: costRatio > 100 ? "#c2413b" : "#287f96",
                    },
                  }}
                  formatter={(value) => formatVnd(Number(value))}
                />
                <div>
                  <div className="summary-row">
                    <Text>Tỷ lệ cost / doanh thu</Text>
                    <Text strong>{costRatio.toFixed(1)}%</Text>
                  </div>
                  <Progress
                    percent={Math.min(100, costRatio)}
                    status={costRatio > 100 ? "exception" : "active"}
                    showInfo={false}
                  />
                </div>
              </Space>
            </Card>
            <Card className="surface-card" title="Cấu phần giá vốn">
              <div className="cost-meter" style={{ marginBottom: 24 }}>
                {Object.entries(breakdown).map(([key, value]) => (
                  <div
                    key={key}
                    className={`cost-segment-${key}`}
                    style={{
                      width: `${
                        product.variableCost
                          ? (value / product.variableCost) * 100
                          : 0
                      }%`,
                    }}
                  />
                ))}
              </div>
              <Table
                className="cost-breakdown-desktop"
                size="small"
                pagination={false}
                rowKey="label"
                scroll={{ x: "max-content" }}
                dataSource={[
                  { label: "Sữa nền", amount: breakdown.milk },
                  { label: "Topping", amount: breakdown.topping },
                  { label: "Bao bì", amount: breakdown.packaging },
                  { label: "Overhead biến đổi", amount: breakdown.overhead },
                  {
                    label: "Phân bổ cố định",
                    amount: Number(product.allocatedFixedCost ?? 0),
                  },
                ]}
                columns={[
                  { title: "Cấu phần", dataIndex: "label" },
                  {
                    title: "Chi phí/ly",
                    dataIndex: "amount",
                    align: "right",
                    render: (value) => formatVnd(Number(value)),
                  },
                ]}
              />
              <div className="cost-breakdown-mobile">
                {[
                  { label: "Sữa nền", amount: breakdown.milk },
                  { label: "Topping", amount: breakdown.topping },
                  { label: "Bao bì", amount: breakdown.packaging },
                  { label: "Overhead biến đổi", amount: breakdown.overhead },
                  {
                    label: "Phân bổ cố định",
                    amount: Number(product.allocatedFixedCost ?? 0),
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <Text type="secondary">{item.label}</Text>
                    <Text strong>{formatVnd(item.amount)}</Text>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
      <Card
        className="surface-card"
        title="Mẻ chuẩn bị đang có"
        style={{ marginTop: 16 }}
      >
        <Table
          className="cost-batches-desktop"
          size="small"
          pagination={false}
          rowKey="code"
          dataSource={batches}
          scroll={{ x: "max-content" }}
          columns={[
            { title: "Mã mẻ", dataIndex: "code" },
            { title: "Tên mẻ", dataIndex: "name" },
            {
              title: "Loại",
              dataIndex: "batchType",
              render: (value) =>
                value === "topping" ? "Topping" : "Nền sữa",
            },
            {
              title: "Thành phẩm",
              key: "output",
              render: (_, batch) => batchOutput(batch),
            },
            {
              title: "Tổng cost",
              dataIndex: "totalCost",
              render: (value) => formatVnd(Number(value)),
            },
            {
              title: "Cost/đơn vị",
              key: "unitCost",
              render: (_, batch) => {
                const normalized = normalizedPreparationCostSource(batch);
                return `${formatVnd(normalized.costPerBaseUnit)}/${normalized.outputBaseUnit}`;
              },
            },
          ]}
        />
        <ul className="cost-batches-mobile">
          {batches.map((batch) => (
            <li key={batch.code}>
              <div>
                <Text strong>{batch.name}</Text>
                <Text type="secondary">
                  {batch.code} · {batch.batchType === "topping" ? "Topping" : "Nền sữa"} · {batchOutput(batch)}
                </Text>
              </div>
              <div>
                <Text strong>
                  {(() => {
                    const normalized = normalizedPreparationCostSource(batch);
                    return `${formatVnd(normalized.costPerBaseUnit)}/${normalized.outputBaseUnit}`;
                  })()}
                </Text>
                <Text type="secondary">
                  Tổng {formatVnd(Number(batch.totalCost))}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
