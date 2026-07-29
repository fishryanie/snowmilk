'use client';

import { CheckCircleFilled, InboxOutlined, InfoCircleOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Progress,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { RouteSkeleton } from '@/components/common/route-skeleton';
import { useApiData } from '@/hooks/use-api-data';
import { calculateInventory, type InventoryIngredientLine, type InventoryMilkBatchLine } from '@/lib/calculations/inventory';
import { formatDate, formatNumber, formatVnd } from '@/lib/formatters';
import { workbookBatches, workbookIngredients, workbookSizes } from '@/lib/workbook-snapshot';

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
  const averageMilkMlPerCup = workbookSizes.reduce((total, size) => total + size.milkMl, 0) / workbookSizes.length;
  const ingredients: InventoryIngredientLine[] = workbookIngredients.map(item => ({
    itemKey: item.id,
    itemCode: item.code,
    itemName: item.name,
    category: item.category,
    unit: item.costUnit,
    totalPurchasedQuantity: item.totalPurchasedQuantity,
    onHandQuantity: item.totalPurchasedQuantity,
    unitCost: item.averageUnitCost,
  }));
  const milkBatches: InventoryMilkBatchLine[] = workbookBatches.map(batch => ({
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
    note: '',
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
    case 'Nguyên liệu':
      return 'cyan';
    case 'Topping':
      return 'magenta';
    case 'Bao bì':
      return 'gold';
    default:
      return 'default';
  }
}

function categoryCardTone(category: string) {
  switch (category) {
    case 'Nguyên liệu':
      return 'is-ingredient';
    case 'Topping':
      return 'is-topping';
    case 'Bao bì':
      return 'is-packaging';
    default:
      return 'is-other';
  }
}

function formatQuantityInput(value: number | string | undefined, info: { userTyping: boolean; input: string }) {
  if (info.userTyping) return info.input;
  return String(value ?? '').replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function InventoryEditor({
  context,
  usingFallback,
  onSaved,
  topContent,
  noticeContent,
}: {
  context: InventoryContext;
  usingFallback: boolean;
  onSaved: (context: InventoryContext) => void;
  topContent: ReactNode;
  noticeContent: ReactNode;
}) {
  const { message } = App.useApp();
  const [category, setCategory] = useState('Nguyên liệu');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(context.note);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const [ingredientQuantities, setIngredientQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(context.ingredientLines.map(item => [item.itemKey, item.onHandQuantity])),
  );
  const [batchQuantities, setBatchQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(context.milkBatchLines.map(batch => [batch.batchKey, batch.remainingLiters])),
  );
  const preview = useMemo(
    () =>
      calculateInventory({
        ingredients: context.ingredientLines.map(item => ({
          ...item,
          onHandQuantity: ingredientQuantities[item.itemKey] ?? item.onHandQuantity,
        })),
        milkBatches: context.milkBatchLines.map(batch => ({
          ...batch,
          remainingLiters: batchQuantities[batch.batchKey] ?? batch.remainingLiters,
        })),
        averageMilkMlPerCup: context.averageMilkMlPerCup,
        previousEstimatedCups: context.previousSnapshot?.estimatedCups ?? 0,
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
  const visibleIngredients = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase('vi');
    return preview.ingredientLines.filter(item => {
      const matchesCategory = category === 'Tất cả' || item.category === category;
      const matchesSearch = !normalizedSearch || `${item.itemCode} ${item.itemName} ${item.category}`.toLocaleLowerCase('vi').includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });
  }, [category, preview.ingredientLines, searchQuery]);
  const totalCountableLines = context.ingredientLines.length + context.milkBatchLines.length;
  const cupReconciliation = Math.max(preview.inferredCupsFromPackaging, preview.inferredCupsFromMilk, 1) || 1;
  const cupDifference = Math.abs(preview.inferredCupsFromPackaging - preview.inferredCupsFromMilk);

  async function saveInventory() {
    if (usingFallback) {
      message.warning('Chưa kết nối MongoDB nên chưa thể lưu kiểm kho. Dữ liệu tính thử vẫn hiển thị bên dưới.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotDate: context.snapshotDate,
          items: context.ingredientLines.map(item => ({
            itemKey: item.itemKey,
            onHandQuantity: ingredientQuantities[item.itemKey] ?? item.onHandQuantity,
          })),
          milkBatches: context.milkBatchLines.map(batch => ({
            batchKey: batch.batchKey,
            remainingLiters: batchQuantities[batch.batchKey] ?? batch.remainingLiters,
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
      message.error(error instanceof Error ? error.message : 'Không thể lưu kiểm kho');
    } finally {
      setSaving(false);
    }
  }

  const historyColumns: ColumnsType<InventoryHistory> = [
    {
      title: 'Ngày chốt',
      dataIndex: 'snapshotDate',
      render: value => formatDate(value),
    },
    {
      title: 'Tổng tiền tồn',
      dataIndex: 'totalInventoryValue',
      align: 'right',
      render: value => <Text strong>{formatVnd(Number(value))}</Text>,
    },
    {
      title: 'Ly lũy kế',
      dataIndex: 'estimatedCups',
      align: 'right',
      render: value => `${formatNumber(Number(value))} ly`,
    },
    {
      title: 'Phát sinh từ lần chốt trước',
      dataIndex: 'estimatedCupsSincePrevious',
      align: 'right',
      render: value => (
        <Tag color={Number(value) >= 0 ? 'green' : 'red'}>
          {Number(value) > 0 ? '+' : ''}
          {formatNumber(Number(value))} ly
        </Tag>
      ),
    },
  ];

  return (
    <div className='inventory-content-stack'>
      {topContent}

      <section className='inventory-overview-section' aria-label='Tổng quan kho'>
        <div className='inventory-hero-grid'>
          <section className='surface-card inventory-total-card'>
            <div className='inventory-total-card-body'>
              <div className='inventory-total-copy'>
                <Text className='inventory-eyebrow'>Giá trị tồn sau khi nhập</Text>
                <Title level={2}>{formatVnd(preview.totalInventoryValue)}</Title>
                <Text>
                  Hàng hóa {formatVnd(preview.ingredientInventoryValue)} · Sữa thành phẩm {formatVnd(preview.finishedMilkInventoryValue)}
                </Text>
              </div>
              <div className='inventory-total-icon' aria-hidden='true'>
                <InboxOutlined />
              </div>
            </div>
          </section>
          <Card className='surface-card inventory-cups-card'>
            <Statistic
              title={context.previousSnapshot ? 'Ước tính ly bán từ lần chốt trước' : 'Ước tính ly đã bán lũy kế'}
              value={preview.estimatedCupsSincePrevious}
              suffix='ly'
              styles={{
                content: {
                  color: preview.estimatedCupsSincePrevious >= 0 ? 'var(--success)' : 'var(--danger)',
                },
              }}
            />
            <Text type='secondary'>
              Lũy kế {formatNumber(preview.estimatedCups)} ly · {preview.estimationBasis === 'packaging' ? 'tính theo tồn vỏ ly' : 'tính theo sữa thành phẩm'}
            </Text>
          </Card>
        </div>
      </section>

      <Card className='surface-card inventory-reconciliation'>
        <div className='inventory-section-heading'>
          <div>
            <Title level={4}>Kiểm tra chênh lệch (tham khảo)</Title>
            <Text type='secondary'>So sánh vỏ ly và lượng sữa để phát hiện ô nhập sai hoặc hao hụt.</Text>
          </div>
          <Tag color={!preview.milkReconciliationReliable ? 'default' : cupDifference <= 2 ? 'green' : 'orange'}>
            {preview.milkReconciliationReliable ? `Lệch ${formatNumber(cupDifference)} ly` : 'Chỉ dùng đối chiếu vỏ ly'}
          </Tag>
        </div>
        <div className='inventory-reconciliation-grid'>
          <div>
            <div className='inventory-progress-label'>
              <Text>Theo vỏ ly đã dùng</Text>
              <Text strong>{formatNumber(preview.inferredCupsFromPackaging)} ly</Text>
            </div>
            <Progress percent={(preview.inferredCupsFromPackaging / cupReconciliation) * 100} showInfo={false} strokeColor='#287f96' />
          </div>
          <div>
            <div className='inventory-progress-label'>
              <Text>{preview.milkReconciliationReliable ? `Theo ${formatNumber(preview.inferredMilkLitersUsed)} lít sữa đã xuất` : 'Theo sữa thành phẩm'}</Text>
              <Text strong>{preview.milkReconciliationReliable ? `≈ ${formatNumber(preview.inferredCupsFromMilk)} ly` : 'Không đủ cơ sở'}</Text>
            </div>
            <Progress
              percent={preview.milkReconciliationReliable ? (preview.inferredCupsFromMilk / cupReconciliation) * 100 : 0}
              showInfo={false}
              strokeColor='#d9932e'
            />
          </div>
        </div>
        {preview.milkReconciliationReliable ? (
          <Paragraph className='inventory-formula-note'>
            <InfoCircleOutlined /> Sữa được quy đổi theo trung bình {formatNumber(context.averageMilkMlPerCup)} ml/ly từ danh mục Size. Vỏ ly hỏng, hàng
            biếu/tặng hoặc hao hụt sẽ làm hai số khác nhau.
          </Paragraph>
        ) : (
          <Alert
            className='inventory-formula-note'
            type='warning'
            showIcon
            title='Không dùng tồn sữa để suy ra số ly'
            description='Bạn đang nhập tổng tồn của một công thức lớn hơn sản lượng một lần nấu. Giá trị tồn kho vẫn được tính bình thường, nhưng số ly chỉ được đối chiếu theo vỏ ly.'
          />
        )}
      </Card>

      {noticeContent}

      <section className='inventory-workflow-guide' aria-label='Các bước kiểm kho'>
        <div className='inventory-guide-step is-active'>
          <span>1</span>
          <div>
            <Text strong>Đếm sữa còn lại</Text>
            <Text type='secondary'>Theo tổng tồn từng công thức</Text>
          </div>
        </div>
        <div className='inventory-guide-step'>
          <span>2</span>
          <div>
            <Text strong>Đếm hàng hóa</Text>
            <Text type='secondary'>Nguyên liệu, topping và bao bì</Text>
          </div>
        </div>
        <div className='inventory-guide-step'>
          <span>3</span>
          <div>
            <Text strong>Kiểm tra và lưu</Text>
            <Text type='secondary' className='inventory-checked-count'>
              Đã kiểm {checkedKeys.size}/{totalCountableLines} mục
            </Text>
          </div>
        </div>
      </section>

      <section className='inventory-table-card inventory-ingredient-card'>
        <div className='inventory-section-heading inventory-table-heading'>
          <div>
            <Title level={4}>2. Đếm hàng hóa còn lại</Title>
            <Text type='secondary'>Chạm vào từng ô và nhập đúng số lượng đang nhìn thấy trong kho.</Text>
          </div>
          <div className='inventory-table-tools'>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={searchQuery}
              placeholder='Tìm tên hoặc mã hàng'
              aria-label='Tìm hàng hóa trong kho'
              onChange={event => setSearchQuery(event.target.value)}
            />
            <Segmented
              className='inventory-category-desktop'
              value={category}
              options={['Tất cả', 'Nguyên liệu', 'Topping', 'Bao bì', 'Khác']}
              onChange={value => setCategory(String(value))}
            />
            <Select
              className='inventory-category-mobile'
              value={category}
              aria-label='Nhóm hàng hóa'
              options={['Tất cả', 'Nguyên liệu', 'Topping', 'Bao bì', 'Khác'].map(value => ({ value, label: value }))}
              onChange={setCategory}
            />
          </div>
        </div>
        {!visibleIngredients.length ? <Empty className='inventory-filter-empty' description='Không tìm thấy hàng hóa phù hợp' /> : null}
        <ul className='inventory-card-grid'>
          {visibleIngredients.map(item => (
            <li className={`inventory-count-card ${categoryCardTone(item.category)} ${checkedKeys.has(item.itemKey) ? 'is-checked' : ''}`} key={item.itemKey}>
              <div className='inventory-count-card-heading'>
                <div className='inventory-count-title'>
                  <Text strong>{item.itemName}</Text>
                </div>
                <Space size={6} wrap style={{ justifyContent: 'flex-end', flex: '0 0 auto', textAlign: 'right' }}>
                  <Text type='secondary'>{item.itemCode}</Text>
                  <Tag color={categoryColor(item.category)} style={{ marginInlineEnd: 0 }}>{item.category}</Tag>
                </Space>
              </div>
              <div className='inventory-count-meta-compact'>
                <div className='meta-row'>
                  <span className='meta-label'>Tiền tồn:</span>
                  <span className='meta-value inventory-money' style={{ color: 'var(--amber)' }}>{formatVnd(item.inventoryValue)}</span>
                </div>
                <div className='meta-row secondary'>
                  <span>Nhập: <strong>{formatNumber(item.totalPurchasedQuantity)}</strong></span>
                  <span>•</span>
                  <span>Dùng: <strong>{formatNumber(item.inferredUsedQuantity)}</strong> {item.unit}</span>
                </div>
                <div className='meta-row secondary'>
                  <span>Giá vốn: {formatVnd(item.unitCost)}/{item.unit || 'đv'}</span>
                  <span>•</span>
                  <span>Tổng nhập: <span style={{ color: 'var(--success)' }}>{formatVnd(item.totalPurchasedQuantity * item.unitCost)}</span></span>
                </div>
              </div>
              <label className='inventory-count-input'>
                <span>Tồn thực tế</span>
                <InputNumber
                  min={0}
                  precision={3}
                  formatter={formatQuantityInput}
                  value={ingredientQuantities[item.itemKey]}
                  suffix={item.unit || 'đv'}
                  aria-label={`Tồn thực tế ${item.itemName}`}
                  onFocus={() =>
                    setCheckedKeys(current => {
                      if (current.has(item.itemKey)) return current;
                      const next = new Set(current);
                      next.add(item.itemKey);
                      return next;
                    })
                  }
                  onChange={value =>
                    setIngredientQuantities(current => ({
                      ...current,
                      [item.itemKey]: Number(value ?? 0),
                    }))
                  }
                />
              </label>
            </li>
          ))}
        </ul>
        <div className='inventory-grid-total'>
          <Text>Tổng tiền hàng hóa đang tồn</Text>
          <Text strong className='inventory-money'>
            {formatVnd(preview.ingredientInventoryValue)}
          </Text>
        </div>
      </section>

      <section className='inventory-table-card inventory-batch-card'>
        <div className='inventory-section-heading inventory-table-heading'>
          <div>
            <Title level={4}>1. Đếm tổng sữa thành phẩm còn lại</Title>
            <Text type='secondary'>Gom lượng còn lại của cùng một công thức và nhập một con số tổng.</Text>
          </div>
          <Tag color='cyan'>Không cần tách từng lần nấu</Tag>
        </div>
        {preview.milkBatchLines.length ? (
          <>
            <ul className='inventory-card-grid inventory-batch-grid'>
              {preview.milkBatchLines.map(batch => (
                <li className={`inventory-count-card ${checkedKeys.has(batch.batchKey) ? 'is-checked' : ''}`} key={batch.batchKey}>
                  <div className='inventory-count-card-heading'>
                    <div className='inventory-count-title'>
                      <Text strong>{batch.batchName}</Text>
                    </div>
                    <Space size={6} wrap style={{ justifyContent: 'flex-end', flex: '0 0 auto', textAlign: 'right' }}>
                      <Text type='secondary'>{batch.batchCode}</Text>
                      <Tag color='cyan' style={{ marginInlineEnd: 0 }}>Sữa thành phẩm</Tag>
                    </Space>
                  </div>
                  <div className='inventory-count-meta-compact'>
                    <div className='meta-row'>
                      <span className='meta-label'>Tiền tồn:</span>
                      <span className='meta-value inventory-money' style={{ color: 'var(--amber)' }}>{formatVnd(batch.inventoryValue)}</span>
                    </div>
                    <div className='meta-row secondary'>
                      <span>Giá vốn: {formatVnd(batch.costPerLiter)}/lít</span>
                      <span>•</span>
                      <span>{batch.remainingLiters <= batch.producedLiters ? `${formatNumber(batch.inferredUsedLiters)} lít đã dùng` : 'Chỉ tính tiền tồn'}</span>
                    </div>
                  </div>
                  <label className='inventory-count-input'>
                    <span>Tổng lít đang còn</span>
                    <InputNumber
                      min={0}
                      precision={3}
                      formatter={formatQuantityInput}
                      value={batchQuantities[batch.batchKey]}
                      suffix='lít'
                      aria-label={`Lít còn lại của mẻ ${batch.batchCode}`}
                      onFocus={() =>
                        setCheckedKeys(current => {
                          if (current.has(batch.batchKey)) return current;
                          const next = new Set(current);
                          next.add(batch.batchKey);
                          return next;
                        })
                      }
                      onChange={value =>
                        setBatchQuantities(current => ({
                          ...current,
                          [batch.batchKey]: Number(value ?? 0),
                        }))
                      }
                    />
                  </label>
                </li>
              ))}
            </ul>
            <div className='inventory-grid-total'>
              <Text>Tổng tiền sữa thành phẩm đang tồn</Text>
              <Text strong className='inventory-money'>
                {formatVnd(preview.finishedMilkInventoryValue)}
              </Text>
            </div>
          </>
        ) : (
          <Empty description='Chưa có mẻ sữa nào' />
        )}
      </section>

      <Card className='surface-card inventory-save-card'>
        <div>
          <Title level={4}>Ghi chú kiểm kho</Title>
          <Text type='secondary'>Ví dụ: hỏng 2 ly, biếu 1 ly, đổ bỏ 0,5 lít sữa.</Text>
        </div>
        <TextArea
          value={note}
          rows={3}
          maxLength={1_000}
          placeholder='Ghi lại hao hụt hoặc điều chỉnh đặc biệt trong ngày...'
          onChange={event => setNote(event.target.value)}
        />
        <div className='inventory-save-footer'>
          <Text type='secondary'>{context.saved ? `Đã lưu lần cuối ${formatDate(context.savedAt)}` : 'Ngày này chưa được chốt kiểm kho'}</Text>
          <Button type='primary' size='large' icon={<SaveOutlined />} loading={saving} onClick={saveInventory}>
            {context.saved ? 'Cập nhật kiểm kho' : 'Chốt kiểm kho'}
          </Button>
        </div>
      </Card>

      <Card className='surface-card inventory-history-card'>
        <div className='inventory-section-heading'>
          <div>
            <Title level={4}>Lịch sử kiểm kho</Title>
            <Text type='secondary'>Mỗi lần chốt là một mốc để tính số ly phát sinh.</Text>
          </div>
        </div>
        {context.history.length ? (
          <>
            <Table
              className='inventory-history-desktop'
              rowKey='snapshotDate'
              dataSource={context.history}
              columns={historyColumns}
              pagination={{ pageSize: 7, hideOnSinglePage: true }}
              scroll={{ x: 720 }}
            />
            <ul className='inventory-history-mobile'>
              {context.history.map(record => (
                <li key={record.snapshotDate}>
                  <div>
                    <Text strong>{formatDate(record.snapshotDate)}</Text>
                    <Text type='secondary'>Ngày chốt kho</Text>
                  </div>
                  <div>
                    <Text strong className='inventory-money'>
                      {formatVnd(record.totalInventoryValue)}
                    </Text>
                    <Tag color={record.estimatedCupsSincePrevious >= 0 ? 'green' : 'red'}>
                      {record.estimatedCupsSincePrevious > 0 ? '+' : ''}
                      {formatNumber(record.estimatedCupsSincePrevious)} ly
                    </Tag>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty description='Chưa có lần kiểm kho nào được lưu' />
        )}
      </Card>
      <div className='mobile-workflow-dock inventory-mobile-save-dock'>
        <div>
          <Text type='secondary'>{context.saved ? 'Đang cập nhật' : 'Chưa chốt'}</Text>
          <Text strong>{formatVnd(preview.totalInventoryValue)}</Text>
        </div>
        <Button type='primary' size='large' icon={<SaveOutlined />} loading={saving} onClick={saveInventory}>
          {context.saved ? 'Cập nhật' : 'Chốt kho'}
        </Button>
      </div>
    </div>
  );
}

export function InventoryWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [snapshotDate, setSnapshotDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const fallback = useMemo(() => fallbackContext(snapshotDate), [snapshotDate]);
  const { data, loading, usingFallback, setData } = useApiData<InventoryContext>(`/api/inventory?date=${snapshotDate}`, fallback);
  const awaitingSelectedDate = !usingFallback && data.snapshotDate !== snapshotDate;

  const workspaceHeading = embedded ? (
    <div className='inventory-embedded-heading'>
      <div>
        <Title level={3}>Kiểm kho cuối ngày</Title>
        <Text type='secondary'>Đếm hàng hóa và sữa còn lại, kiểm tra kết quả rồi chốt kho.</Text>
      </div>
      <Space className='inventory-date-control' wrap>
        <Text type='secondary'>Ngày kiểm kho</Text>
        <DatePicker
          value={dayjs(snapshotDate)}
          allowClear={false}
          format='DD/MM/YYYY'
          onChange={value => {
            if (value) setSnapshotDate(value.format('YYYY-MM-DD'));
          }}
        />
        {data.saved && data.snapshotDate === snapshotDate ? (
          <Tag color='green' icon={<CheckCircleFilled />}>
            Đã chốt
          </Tag>
        ) : (
          <Tag color='gold'>Chưa chốt</Tag>
        )}
      </Space>
    </div>
  ) : (
    <PageHeader
      title='Kiểm kho cuối ngày'
      description='Làm lần lượt 3 bước: đếm hàng hóa, đếm sữa còn lại, kiểm tra kết quả rồi chốt kho.'
      actions={
        <Space className='inventory-date-control' wrap>
          <Text type='secondary'>Ngày kiểm kho</Text>
          <DatePicker
            value={dayjs(snapshotDate)}
            allowClear={false}
            format='DD/MM/YYYY'
            onChange={value => {
              if (value) setSnapshotDate(value.format('YYYY-MM-DD'));
            }}
          />
          {data.saved && data.snapshotDate === snapshotDate ? (
            <Tag color='green' icon={<CheckCircleFilled />}>
              Đã chốt
            </Tag>
          ) : (
            <Tag color='gold'>Chưa chốt</Tag>
          )}
        </Space>
      }
    />
  );
  const connectionAlert = usingFallback ? (
    <Alert
      type='warning'
      showIcon
      closable
      className='inventory-connection-alert'
      message='Đang dùng dữ liệu mẫu vì chưa kết nối được MongoDB'
      description='Bạn vẫn có thể nhập để xem cách tính, nhưng cần kết nối cơ sở dữ liệu để lưu lịch sử mỗi ngày.'
    />
  ) : null;

  return (
    <div className={`${embedded ? 'inventory-embedded' : 'page-wrap'} inventory-page`}>
      {loading || awaitingSelectedDate ? (
        <>
          {workspaceHeading}
          {connectionAlert}
          <RouteSkeleton />
        </>
      ) : (
        <InventoryEditor
          key={`${data.snapshotDate}:${data.savedAt ?? 'new'}`}
          context={data}
          usingFallback={usingFallback}
          onSaved={setData}
          topContent={workspaceHeading}
          noticeContent={connectionAlert}
        />
      )}
    </div>
  );
}
