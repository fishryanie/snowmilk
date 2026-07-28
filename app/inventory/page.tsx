"use client";

import {
  CheckCircleFilled,
  ExperimentOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Progress,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { RouteSkeleton } from "@/components/common/route-skeleton";
import { useApiData } from "@/hooks/use-api-data";
import {
  calculateInventory,
  type InventoryIngredientLine,
  type InventoryMilkBatchLine,
} from "@/lib/calculations/inventory";
import { formatDate, formatNumber, formatVnd } from "@/lib/formatters";
import {
  workbookBatches,
  workbookIngredients,
  workbookSizes,
} from "@/lib/workbook-snapshot";

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

type InventoryHistory = {
  snapshotDate: string;
  totalInventoryValue: number;
  estimatedCups: number;
  estimatedCupsSincePrevious: number;
  inferredCupsFromPackaging: number;
  inferredCupsFromMilk: number;
};

type InventoryContext = ReturnType<typeof calculateInventory> & {
  snapshotDate: string;
  saved: boolean;
  savedAt: string | null;
  note: string;
  previousSnapshot: {
    snapshotDate: string;
    estimatedCups: number;
  } | null;
  averageMilkMlPerCup: number;
  history: InventoryHistory[];
};

type SaveEnvelope = {
  success: boolean;
  message: string;
  data?: {
    context: InventoryContext;
  };
};

function fallbackContext(snapshotDate: string): InventoryContext {
  const averageMilkMlPerCup =
    workbookSizes.reduce((total, size) => total + size.milkMl, 0) /
    workbookSizes.length;
  const ingredients: InventoryIngredientLine[] = workbookIngredients.map(
    (item) => ({
      itemKey: item.id,
      itemCode: item.code,
      itemName: item.name,
      category: item.category,
      unit: item.costUnit,
      totalPurchasedQuantity: item.totalPurchasedQuantity,
      onHandQuantity: item.totalPurchasedQuantity,
      unitCost: item.averageUnitCost,
    }),
  );
  const milkBatches: InventoryMilkBatchLine[] = workbookBatches.map((batch) => ({
    batchKey: batch.id,
    batchCode: batch.code,
    batchName: batch.name,
    producedLiters: batch.actualLiters,
    remainingLiters: batch.actualLiters,
    costPerLiter: batch.costPerLiter,
  }));

  return {
    snapshotDate,
    saved: false,
    savedAt: null,
    note: "",
    previousSnapshot: null,
    averageMilkMlPerCup,
    history: [],
    ...calculateInventory({
      ingredients,
      milkBatches,
      averageMilkMlPerCup,
    }),
  };
}

function categoryColor(category: string) {
  switch (category) {
    case "Nguyên liệu":
      return "cyan";
    case "Topping":
      return "magenta";
    case "Bao bì":
      return "gold";
    default:
      return "default";
  }
}

function InventoryEditor({
  context,
  usingFallback,
  onSaved,
}: {
  context: InventoryContext;
  usingFallback: boolean;
  onSaved: (context: InventoryContext) => void;
}) {
  const { message } = App.useApp();
  const [category, setCategory] = useState("Nguyên liệu");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(context.note);
  const [ingredientQuantities, setIngredientQuantities] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      context.ingredientLines.map((item) => [
        item.itemKey,
        item.onHandQuantity,
      ]),
    ),
  );
  const [batchQuantities, setBatchQuantities] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      context.milkBatchLines.map((batch) => [
        batch.batchKey,
        batch.remainingLiters,
      ]),
    ),
  );
  const preview = useMemo(
    () =>
      calculateInventory({
        ingredients: context.ingredientLines.map((item) => ({
          ...item,
          onHandQuantity:
            ingredientQuantities[item.itemKey] ?? item.onHandQuantity,
        })),
        milkBatches: context.milkBatchLines.map((batch) => ({
          ...batch,
          remainingLiters:
            batchQuantities[batch.batchKey] ?? batch.remainingLiters,
        })),
        averageMilkMlPerCup: context.averageMilkMlPerCup,
        previousEstimatedCups:
          context.previousSnapshot?.estimatedCups ?? 0,
      }),
    [
      batchQuantities,
      context.averageMilkMlPerCup,
      context.ingredientLines,
      context.milkBatchLines,
      context.previousSnapshot?.estimatedCups,
      ingredientQuantities,
    ],
  );
  const visibleIngredients =
    category === "Tất cả"
      ? preview.ingredientLines
      : preview.ingredientLines.filter((item) => item.category === category);
  const cupReconciliation =
    Math.max(
      preview.inferredCupsFromPackaging,
      preview.inferredCupsFromMilk,
      1,
    ) || 1;
  const cupDifference = Math.abs(
    preview.inferredCupsFromPackaging - preview.inferredCupsFromMilk,
  );

  async function saveInventory() {
    if (usingFallback) {
      message.warning(
        "Chưa kết nối MongoDB nên chưa thể lưu kiểm kho. Dữ liệu tính thử vẫn hiển thị bên dưới.",
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotDate: context.snapshotDate,
          items: context.ingredientLines.map((item) => ({
            itemKey: item.itemKey,
            onHandQuantity:
              ingredientQuantities[item.itemKey] ?? item.onHandQuantity,
          })),
          milkBatches: context.milkBatchLines.map((batch) => ({
            batchKey: batch.batchKey,
            remainingLiters:
              batchQuantities[batch.batchKey] ?? batch.remainingLiters,
          })),
          note,
        }),
      });
      const body = (await response.json()) as SaveEnvelope;
      if (!response.ok || !body.success || !body.data) {
        throw new Error(body.message);
      }
      onSaved(body.data.context);
      message.success(body.message);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Không thể lưu kiểm kho",
      );
    } finally {
      setSaving(false);
    }
  }

  const ingredientColumns: ColumnsType<
    (typeof preview.ingredientLines)[number]
  > = [
    {
      title: "Hàng hóa",
      key: "item",
      width: 240,
      render: (_value, item) => (
        <div className="inventory-item-name">
          <Text strong>{item.itemName}</Text>
          <Space size={6} wrap>
            <Text type="secondary">{item.itemCode}</Text>
            <Tag color={categoryColor(item.category)}>{item.category}</Tag>
          </Space>
        </div>
      ),
    },
    {
      title: "Tổng đã nhập",
      dataIndex: "totalPurchasedQuantity",
      align: "right",
      width: 135,
      render: (value, item) => (
        <Text>
          {formatNumber(Number(value))} {item.unit}
        </Text>
      ),
    },
    {
      title: "Tồn thực tế",
      key: "onHandQuantity",
      width: 190,
      render: (_value, item) => (
        <InputNumber
          min={0}
          precision={3}
          value={ingredientQuantities[item.itemKey]}
          suffix={item.unit || "đv"}
          aria-label={`Tồn thực tế ${item.itemName}`}
          onChange={(value) =>
            setIngredientQuantities((current) => ({
              ...current,
              [item.itemKey]: Number(value ?? 0),
            }))
          }
        />
      ),
    },
    {
      title: "Đã dùng",
      dataIndex: "inferredUsedQuantity",
      align: "right",
      width: 125,
      render: (value, item) => (
        <Text type={Number(value) > 0 ? undefined : "secondary"}>
          {formatNumber(Number(value))} {item.unit}
        </Text>
      ),
    },
    {
      title: "Giá vốn / đơn vị",
      dataIndex: "unitCost",
      align: "right",
      width: 155,
      render: (value) => formatVnd(Number(value)),
    },
    {
      title: "Tiền tồn",
      dataIndex: "inventoryValue",
      align: "right",
      width: 160,
      render: (value) => (
        <Text strong className="inventory-money">
          {formatVnd(Number(value))}
        </Text>
      ),
    },
  ];

  const batchColumns: ColumnsType<(typeof preview.milkBatchLines)[number]> = [
    {
      title: "Mẻ thành phẩm",
      key: "batch",
      width: 250,
      render: (_value, batch) => (
        <div className="inventory-item-name">
          <Text strong>
            {batch.batchCode} · {batch.batchName}
          </Text>
          <Text type="secondary">
            Đã làm {formatNumber(batch.producedLiters)} lít
          </Text>
        </div>
      ),
    },
    {
      title: "Lít còn lại",
      key: "remainingLiters",
      width: 210,
      render: (_value, batch) => (
        <InputNumber
          min={0}
          precision={3}
          value={batchQuantities[batch.batchKey]}
          suffix="lít"
          aria-label={`Lít còn lại của mẻ ${batch.batchCode}`}
          onChange={(value) =>
            setBatchQuantities((current) => ({
              ...current,
              [batch.batchKey]: Number(value ?? 0),
            }))
          }
        />
      ),
    },
    {
      title: "Đã xuất khỏi kho",
      dataIndex: "inferredUsedLiters",
      align: "right",
      width: 170,
      render: (value) => `${formatNumber(Number(value))} lít`,
    },
    {
      title: "Giá vốn / lít",
      dataIndex: "costPerLiter",
      align: "right",
      width: 160,
      render: (value) => formatVnd(Number(value)),
    },
    {
      title: "Tiền sữa còn lại",
      dataIndex: "inventoryValue",
      align: "right",
      width: 180,
      render: (value) => (
        <Text strong className="inventory-money">
          {formatVnd(Number(value))}
        </Text>
      ),
    },
  ];

  const historyColumns: ColumnsType<InventoryHistory> = [
    {
      title: "Ngày chốt",
      dataIndex: "snapshotDate",
      render: (value) => formatDate(value),
    },
    {
      title: "Tổng tiền tồn",
      dataIndex: "totalInventoryValue",
      align: "right",
      render: (value) => <Text strong>{formatVnd(Number(value))}</Text>,
    },
    {
      title: "Ly lũy kế",
      dataIndex: "estimatedCups",
      align: "right",
      render: (value) => `${formatNumber(Number(value))} ly`,
    },
    {
      title: "Phát sinh từ lần chốt trước",
      dataIndex: "estimatedCupsSincePrevious",
      align: "right",
      render: (value) => (
        <Tag color={Number(value) >= 0 ? "green" : "red"}>
          {Number(value) > 0 ? "+" : ""}
          {formatNumber(Number(value))} ly
        </Tag>
      ),
    },
  ];

  return (
    <div className="inventory-content-stack">
      <section className="inventory-overview-section" aria-label="Tổng quan kho">
        <div className="inventory-hero-grid">
          <section className="surface-card inventory-total-card">
            <div className="inventory-total-card-body">
              <div className="inventory-total-copy">
                <Text className="inventory-eyebrow">
                  Giá trị tồn kho hiện tại
                </Text>
                <Title level={2}>{formatVnd(preview.totalInventoryValue)}</Title>
                <Text>
                  Hàng hóa {formatVnd(preview.ingredientInventoryValue)} · Sữa
                  thành phẩm {formatVnd(preview.finishedMilkInventoryValue)}
                </Text>
              </div>
              <div className="inventory-total-icon" aria-hidden="true">
                <InboxOutlined />
              </div>
            </div>
          </section>
          <Card className="surface-card inventory-cups-card">
            <Statistic
              title={
                context.previousSnapshot
                  ? "Ước tính ly bán từ lần chốt trước"
                  : "Ước tính ly đã bán lũy kế"
              }
              value={preview.estimatedCupsSincePrevious}
              suffix="ly"
              styles={{
                content: {
                  color:
                    preview.estimatedCupsSincePrevious >= 0
                      ? "var(--success)"
                      : "var(--danger)",
                },
              }}
            />
            <Text type="secondary">
              Lũy kế {formatNumber(preview.estimatedCups)} ly ·{" "}
              {preview.estimationBasis === "packaging"
                ? "tính theo tồn vỏ ly"
                : "tính theo sữa thành phẩm"}
            </Text>
          </Card>
        </div>

        <div className="inventory-kpi-grid">
          <Card className="surface-card inventory-mini-card">
            <ShoppingCartOutlined />
            <Statistic
              title="Hàng hóa còn lại"
              value={preview.ingredientInventoryValue}
              formatter={(value) => formatVnd(Number(value))}
            />
          </Card>
          <Card className="surface-card inventory-mini-card">
            <ExperimentOutlined />
            <Statistic
              title="Sữa thành phẩm còn lại"
              value={preview.finishedMilkInventoryValue}
              formatter={(value) => formatVnd(Number(value))}
            />
          </Card>
          <Card className="surface-card inventory-mini-card">
            <CheckCircleFilled />
            <Statistic
              title="Ly đã dùng lũy kế"
              value={preview.inferredCupsFromPackaging}
              suffix="ly"
            />
          </Card>
          <Card className="surface-card inventory-mini-card">
            <ExperimentOutlined />
            <Statistic
              title="Đối chiếu theo sữa"
              value={
                preview.milkReconciliationReliable
                  ? preview.inferredCupsFromMilk
                  : "Không áp dụng"
              }
              suffix={preview.milkReconciliationReliable ? "ly" : undefined}
            />
          </Card>
        </div>
      </section>

      <Card className="surface-card inventory-reconciliation">
        <div className="inventory-section-heading">
          <div>
            <Title level={4}>Đối chiếu số ly</Title>
            <Text type="secondary">
              Hai cách suy ra độc lập giúp phát hiện hao hụt hoặc nhập sai tồn.
            </Text>
          </div>
          <Tag
            color={
              !preview.milkReconciliationReliable
                ? "default"
                : cupDifference <= 2
                  ? "green"
                  : "orange"
            }
          >
            {preview.milkReconciliationReliable
              ? `Lệch ${formatNumber(cupDifference)} ly`
              : "Chỉ dùng đối chiếu vỏ ly"}
          </Tag>
        </div>
        <div className="inventory-reconciliation-grid">
          <div>
            <div className="inventory-progress-label">
              <Text>Theo vỏ ly đã dùng</Text>
              <Text strong>
                {formatNumber(preview.inferredCupsFromPackaging)} ly
              </Text>
            </div>
            <Progress
              percent={
                (preview.inferredCupsFromPackaging / cupReconciliation) * 100
              }
              showInfo={false}
              strokeColor="#287f96"
            />
          </div>
          <div>
            <div className="inventory-progress-label">
              <Text>
                {preview.milkReconciliationReliable
                  ? `Theo ${formatNumber(preview.inferredMilkLitersUsed)} lít sữa đã xuất`
                  : "Theo sữa thành phẩm"}
              </Text>
              <Text strong>
                {preview.milkReconciliationReliable
                  ? `≈ ${formatNumber(preview.inferredCupsFromMilk)} ly`
                  : "Không đủ cơ sở"}
              </Text>
            </div>
            <Progress
              percent={
                preview.milkReconciliationReliable
                  ? (preview.inferredCupsFromMilk / cupReconciliation) * 100
                  : 0
              }
              showInfo={false}
              strokeColor="#d9932e"
            />
          </div>
        </div>
        {preview.milkReconciliationReliable ? (
          <Paragraph className="inventory-formula-note">
            <InfoCircleOutlined /> Sữa được quy đổi theo trung bình{" "}
            {formatNumber(context.averageMilkMlPerCup)} ml/ly từ danh mục Size.
            Vỏ ly hỏng, hàng biếu/tặng hoặc hao hụt sẽ làm hai số khác nhau.
          </Paragraph>
        ) : (
          <Alert
            className="inventory-formula-note"
            type="warning"
            showIcon
            title="Không dùng tồn sữa để suy ra số ly"
            description="Bạn đang nhập tổng tồn của một công thức lớn hơn sản lượng một lần nấu. Giá trị tồn kho vẫn được tính bình thường, nhưng số ly chỉ được đối chiếu theo vỏ ly."
          />
        )}
      </Card>

      <Card className="surface-card inventory-table-card">
        <div className="inventory-section-heading inventory-table-heading">
          <div>
            <Title level={4}>1. Tồn hàng hóa</Title>
            <Text type="secondary">
              Nhập số lượng bạn đếm được theo đúng đơn vị cost.
            </Text>
          </div>
          <Segmented
            value={category}
            options={["Tất cả", "Nguyên liệu", "Topping", "Bao bì", "Khác"]}
            onChange={(value) => setCategory(String(value))}
          />
        </div>
        <Table
          rowKey="itemKey"
          dataSource={visibleIngredients}
          columns={ingredientColumns}
          pagination={false}
          scroll={{ x: 1_050 }}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={5}>
                <Text strong>Tổng tiền hàng hóa đang tồn</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                <Text strong className="inventory-money">
                  {formatVnd(preview.ingredientInventoryValue)}
                </Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      <Card className="surface-card inventory-table-card">
        <div className="inventory-section-heading">
          <div>
            <Title level={4}>2. Tồn sữa thành phẩm</Title>
            <Text type="secondary">
              Nhập tổng số lít thực tế đang còn của từng loại sữa đã nấu xong.
            </Text>
          </div>
          <Tag color="cyan">Nhập tổng tồn thực tế</Tag>
        </div>
        {preview.milkBatchLines.length ? (
          <Table
            rowKey="batchKey"
            dataSource={preview.milkBatchLines}
            columns={batchColumns}
            pagination={false}
            scroll={{ x: 900 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <Text strong>Tổng tiền sữa thành phẩm đang tồn</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <Text strong className="inventory-money">
                    {formatVnd(preview.finishedMilkInventoryValue)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        ) : (
          <Empty description="Chưa có mẻ sữa nào" />
        )}
      </Card>

      <Card className="surface-card inventory-save-card">
        <div>
          <Title level={4}>Ghi chú kiểm kho</Title>
          <Text type="secondary">
            Ví dụ: hỏng 2 ly, biếu 1 ly, đổ bỏ 0,5 lít sữa.
          </Text>
        </div>
        <TextArea
          value={note}
          rows={3}
          maxLength={1_000}
          placeholder="Ghi lại hao hụt hoặc điều chỉnh đặc biệt trong ngày..."
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="inventory-save-footer">
          <Text type="secondary">
            {context.saved
              ? `Đã lưu lần cuối ${formatDate(context.savedAt)}`
              : "Ngày này chưa được chốt kiểm kho"}
          </Text>
          <Button
            type="primary"
            size="large"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={saveInventory}
          >
            {context.saved ? "Cập nhật kiểm kho" : "Chốt kiểm kho"}
          </Button>
        </div>
      </Card>

      <Card className="surface-card inventory-history-card">
        <div className="inventory-section-heading">
          <div>
            <Title level={4}>Lịch sử kiểm kho</Title>
            <Text type="secondary">
              Mỗi lần chốt là một mốc để tính số ly phát sinh.
            </Text>
          </div>
        </div>
        {context.history.length ? (
          <Table
            rowKey="snapshotDate"
            dataSource={context.history}
            columns={historyColumns}
            pagination={{ pageSize: 7, hideOnSinglePage: true }}
            scroll={{ x: 720 }}
          />
        ) : (
          <Empty description="Chưa có lần kiểm kho nào được lưu" />
        )}
      </Card>
    </div>
  );
}

export default function InventoryPage() {
  const [snapshotDate, setSnapshotDate] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const fallback = useMemo(
    () => fallbackContext(snapshotDate),
    [snapshotDate],
  );
  const { data, loading, usingFallback, setData } =
    useApiData<InventoryContext>(
      `/api/inventory?date=${snapshotDate}`,
      fallback,
    );
  const awaitingSelectedDate =
    !usingFallback && data.snapshotDate !== snapshotDate;

  return (
    <div className="page-wrap inventory-page">
      <PageHeader
        title="Kiểm kho cuối ngày"
        description="Nhập lượng còn lại, hệ thống tự tính tiền tồn và suy ra số ly đã bán mà không cần đếm từng đơn."
        actions={
          <Space className="inventory-date-control" wrap>
            <Text type="secondary">Ngày kiểm kho</Text>
            <DatePicker
              value={dayjs(snapshotDate)}
              allowClear={false}
              format="DD/MM/YYYY"
              onChange={(value) => {
                if (value) setSnapshotDate(value.format("YYYY-MM-DD"));
              }}
            />
            {data.saved && data.snapshotDate === snapshotDate ? (
              <Tag color="green" icon={<CheckCircleFilled />}>
                Đã chốt
              </Tag>
            ) : (
              <Tag color="gold">Chưa chốt</Tag>
            )}
          </Space>
        }
      />
      {usingFallback ? (
        <Alert
          type="warning"
          showIcon
          closable
          className="inventory-connection-alert"
          message="Đang dùng dữ liệu mẫu vì chưa kết nối được MongoDB"
          description="Bạn vẫn có thể nhập để xem cách tính, nhưng cần kết nối cơ sở dữ liệu để lưu lịch sử mỗi ngày."
        />
      ) : null}
      {loading || awaitingSelectedDate ? (
        <RouteSkeleton />
      ) : (
        <InventoryEditor
          key={`${data.snapshotDate}:${data.savedAt ?? "new"}`}
          context={data}
          usingFallback={usingFallback}
          onSaved={setData}
        />
      )}
    </div>
  );
}
