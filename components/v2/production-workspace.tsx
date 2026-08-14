'use client';

import {
  CheckOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  InputNumber,
  Progress,
  Select,
  Skeleton,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { RecipeConfigurationCard } from '@/components/v2/recipe-configuration-card';
import { formatDate, formatNumber, formatVnd } from '@/lib/formatters';
import {
  errorText,
  localDateTimeInput,
  pendingIdempotencyKey,
  type PendingIdempotencyRequest,
  requestV2,
} from '@/components/v2/api-client';

const { Paragraph, Text, Title } = Typography;

type RecipeComponent = {
  inventoryItemId: string;
  name: string;
  baseUnit: string;
  expectedQuantity: number;
};

type FinishedSpecItem = {
  name: string;
  quantity: number;
  unit: string;
};

type RecipeVersion = {
  id: string;
  productName: string;
  skuCode: string;
  version: number;
  finishedSpec?: FinishedSpecItem[] | Record<string, unknown>;
  components: RecipeComponent[];
};

type ProductionBatch = {
  id?: string;
  _id?: string;
  version: number;
  status: 'draft' | 'in_progress' | 'completed' | string;
  productName?: string;
  skuCode?: string;
  startedAt?: string;
  completedAt?: string;
  goodOutputQuantity?: number;
  wasteOutputQuantity?: number;
  soldQuantity?: number;
  remainingQuantity?: number;
  actualCostPerUnitVnd?: number | null;
  expiresAt?: string | null;
};

type ProductionResponse = {
  recipeVersions: RecipeVersion[];
  batches: ProductionBatch[];
};

type InventoryBalance = {
  inventoryItemId: string;
  inventoryLotId?: string | null;
  lotCode?: string | null;
  code: string;
  name: string;
  kind: string;
  baseUnit: string;
  quantity: number;
  availableQuantity: number;
  expiresAt?: string | null;
};

type InventoryResponse = { balances: InventoryBalance[] };
type BatchMutationResponse =
  | ProductionBatch
  | { batch: ProductionBatch }
  | { productionBatch: ProductionBatch };

function normalizeBatch(result: BatchMutationResponse) {
  if ('productionBatch' in result) return result.productionBatch;
  if ('batch' in result) return result.batch;
  return result;
}

function batchId(batch: ProductionBatch) {
  return batch.id ?? batch._id ?? '';
}

function toHcmIso(value: string) {
  if (!value) return undefined;
  return new Date(`${value}:00+07:00`).toISOString();
}

function productionStatus(status: string) {
  if (status === 'completed') return <Tag color='success'>Hoàn tất</Tag>;
  if (status === 'in_progress') return <Tag color='processing'>Đang làm</Tag>;
  return <Tag>{status || 'Bản nháp'}</Tag>;
}

export function ProductionWorkspace() {
  const { message } = App.useApp();
  const { can, loading: accessLoading, error: accessError } = useCurrentAccess();
  const [recipes, setRecipes] = useState<RecipeVersion[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [expectedOutputQuantity, setExpectedOutputQuantity] = useState(1);
  const [goodOutputQuantity, setGoodOutputQuantity] = useState(1);
  const [wasteOutputQuantity, setWasteOutputQuantity] = useState(0);
  const [startedAt, setStartedAt] = useState(localDateTimeInput);
  const [completedAt, setCompletedAt] = useState(localDateTimeInput);
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [componentQuantities, setComponentQuantities] = useState<Record<string, number>>({});
  const [pendingBatch, setPendingBatch] = useState<ProductionBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const createRequest = useRef<PendingIdempotencyRequest>(null);
  const completeRequest = useRef<PendingIdempotencyRequest>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      requestV2<ProductionResponse>('/api/v2/production-batches', {
        signal: controller.signal,
      }),
      requestV2<InventoryResponse>('/api/v2/inventory/balances', {
        signal: controller.signal,
      }),
    ]).then(([productionResult, inventoryResult]) => {
      if (controller.signal.aborted) return;
      const errors: string[] = [];
      if (productionResult.status === 'fulfilled') {
        setRecipes(productionResult.value.recipeVersions ?? []);
        setBatches(productionResult.value.batches ?? []);
      } else {
        errors.push(errorText(productionResult.reason, 'Không tải được công thức sản xuất.'));
      }
      if (inventoryResult.status === 'fulfilled') {
        setBalances(inventoryResult.value.balances ?? []);
      } else {
        errors.push(errorText(inventoryResult.reason, 'Không tải được tồn nguyên liệu.'));
      }
      setLoadError(errors.length > 0 ? errors.join(' ') : null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [refreshKey]);

  const defaultRecipe =
    recipes.find((recipe) => recipe.skuCode === 'HBF-BOX-001') ?? recipes[0] ?? null;
  const activeRecipeId = selectedRecipeId || defaultRecipe?.id || '';
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === activeRecipeId) ?? null,
    [activeRecipeId, recipes],
  );
  const usableBalancesByItem = useMemo(() => {
    const result = new Map<string, InventoryBalance[]>();
    const completedMoment = new Date(`${completedAt}:00+07:00`).getTime();
    for (const balance of balances) {
      if (
        balance.expiresAt &&
        new Date(balance.expiresAt).getTime() <= completedMoment
      ) {
        continue;
      }
      const current = result.get(balance.inventoryItemId) ?? [];
      current.push(balance);
      result.set(balance.inventoryItemId, current);
    }
    for (const rows of result.values()) {
      rows.sort((left, right) => {
        const leftExpiry = left.expiresAt
          ? new Date(left.expiresAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightExpiry = right.expiresAt
          ? new Date(right.expiresAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftExpiry - rightExpiry;
      });
    }
    return result;
  }, [balances, completedAt]);
  const availableByItem = useMemo(() => {
    const result = new Map<string, { availableQuantity: number; baseUnit: string }>();
    for (const [inventoryItemId, rows] of usableBalancesByItem) {
      result.set(inventoryItemId, {
        availableQuantity: rows.reduce(
          (total, row) => total + Number(row.availableQuantity ?? 0),
          0,
        ),
        baseUnit: rows[0]?.baseUnit ?? '',
      });
    }
    return result;
  }, [usableBalancesByItem]);

  const canWrite = can('production:write');

  function fillExpectedComponents() {
    if (!selectedRecipe) return;
    setComponentQuantities(
      Object.fromEntries(
        selectedRecipe.components.map((component) => [
          component.inventoryItemId,
          component.expectedQuantity * expectedOutputQuantity,
        ]),
      ),
    );
  }

  function resetForm() {
    setExpectedOutputQuantity(1);
    setGoodOutputQuantity(1);
    setWasteOutputQuantity(0);
    setStartedAt(localDateTimeInput());
    setCompletedAt(localDateTimeInput());
    setExpiresAt('');
    setNote('');
    setComponentQuantities({});
    setPendingBatch(null);
    createRequest.current = null;
    completeRequest.current = null;
  }

  async function handleCompleteBatch() {
    if (!canWrite) {
      setSubmitError('Tài khoản hiện tại không có quyền ghi mẻ sản xuất.');
      return;
    }
    if (!selectedRecipe) {
      setSubmitError('Hãy chọn công thức trước khi ghi mẻ.');
      return;
    }

    const consumedComponents: Array<{
      inventoryItemId: string;
      inventoryLotId?: string;
      quantity: number;
    }> = [];
    for (const component of selectedRecipe.components) {
      const requested = Number(componentQuantities[component.inventoryItemId] ?? 0);
      const rows = usableBalancesByItem.get(component.inventoryItemId) ?? [];
      const lotTracked = rows.some((row) => Boolean(row.inventoryLotId));
      let remaining = requested;
      for (const row of rows) {
        if (remaining <= 0) break;
        if (lotTracked && !row.inventoryLotId) continue;
        if (!lotTracked && row.inventoryLotId) continue;
        const used = Math.min(remaining, Number(row.availableQuantity ?? 0));
        if (used <= 0) continue;
        consumedComponents.push({
          inventoryItemId: component.inventoryItemId,
          ...(row.inventoryLotId ? { inventoryLotId: row.inventoryLotId } : {}),
          quantity: used,
        });
        remaining -= used;
      }
      if (remaining > 0.000_000_1) {
        setSubmitError(
          `Không đủ tồn khả dụng của ${component.name}. Hãy nhập hàng hoặc kiểm kho trước khi tạo mẻ.`,
        );
        return;
      }
    }

    setSaving(true);
    setSubmitError(null);
    try {
      let activeBatch = pendingBatch;
      if (!activeBatch) {
        const createPayload = {
          businessDate: startedAt.slice(0, 10),
          recipeVersionId: selectedRecipe.id,
          startedAt: toHcmIso(startedAt),
          plannedOutputQuantity: expectedOutputQuantity,
          ...(expiresAt ? { expiresAt: toHcmIso(expiresAt) } : {}),
          note: note.trim(),
        };
        const created = await requestV2<BatchMutationResponse>(
          '/api/v2/production-batches',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idempotencyKey: pendingIdempotencyKey(
                createRequest,
                'production-create',
                createPayload,
              ),
              ...createPayload,
            }),
          },
        );
        activeBatch = normalizeBatch(created);
        setPendingBatch(activeBatch);
      }

      const id = batchId(activeBatch);
      if (!id) throw new Error('Máy chủ chưa trả về mã mẻ sản xuất.');
      const completePayload = {
        version: activeBatch.version,
        completedAt: toHcmIso(completedAt),
        components: consumedComponents,
        goodOutputQuantity,
        wasteOutputQuantity,
        ...(expiresAt ? { expiresAt: toHcmIso(expiresAt) } : {}),
        note: note.trim(),
      };
      const completed = await requestV2<BatchMutationResponse>(
        `/api/v2/production-batches/${id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: pendingIdempotencyKey(
              completeRequest,
              'production-complete',
              completePayload,
            ),
            ...completePayload,
          }),
        },
      );
      const result = normalizeBatch(completed);
      message.success(
        `Đã ghi nhận ${formatNumber(result.goodOutputQuantity ?? goodOutputQuantity)} hộp đạt.`,
      );
      resetForm();
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      const text = errorText(
        error,
        'Không thể hoàn tất mẻ. Dữ liệu bạn nhập vẫn được giữ để thử lại.',
      );
      setSubmitError(text);
      message.error(text);
    } finally {
      setSaving(false);
    }
  }

  const missingComponents = selectedRecipe?.components.filter(
    (component) => Number(componentQuantities[component.inventoryItemId] ?? 0) <= 0,
  );
  const outputTotal = goodOutputQuantity + wasteOutputQuantity;
  const outputMatches = outputTotal === expectedOutputQuantity;
  const insufficientComponents = selectedRecipe?.components.filter((component) => {
    const actual = Number(componentQuantities[component.inventoryItemId] ?? 0);
    return actual > Number(availableByItem.get(component.inventoryItemId)?.availableQuantity ?? 0);
  });

  return (
    <div className='page-wrap v2-workspace production-v2'>
      <PageHeader
        title='Chuẩn bị món & làm mẻ'
        description='Ghi lượng nguyên liệu dùng thật, số hộp đạt và hao hụt để theo dõi tồn kho, yield và giá vốn chính xác.'
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setLoading(true);
              setRefreshKey((value) => value + 1);
            }}
          >
            Làm mới
          </Button>
        }
      />

      {loadError ? (
        <Alert
          type='warning'
          showIcon
          title='Một phần dữ liệu chưa tải được'
          description={`${loadError} Form hiện tại vẫn được giữ nguyên.`}
        />
      ) : null}
      {accessError ? (
        <Alert
          type='error'
          showIcon
          title='Không xác minh được quyền sản xuất'
          description={accessError}
        />
      ) : null}
      {!accessLoading && !canWrite ? (
        <Alert
          type='info'
          showIcon
          title='Chế độ chỉ xem'
          description='Bạn có thể xem công thức, tồn nguyên liệu và mẻ gần đây nhưng không thể ghi mẻ mới.'
        />
      ) : null}
      {submitError ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          title={pendingBatch ? 'Mẻ đã tạo nhưng chưa hoàn tất' : 'Chưa thể ghi mẻ'}
          description={
            pendingBatch
              ? `${submitError} Nhấn “Hoàn tất mẻ” để thử lại, hệ thống sẽ không tạo thêm mẻ mới.`
              : submitError
          }
        />
      ) : null}

      <RecipeConfigurationCard
        onReleased={() => {
          setLoading(true);
          setRefreshKey((value) => value + 1);
        }}
      />

      {loading ? (
        <div className='v2-two-column'>
          <Card className='surface-card'><Skeleton active paragraph={{ rows: 10 }} /></Card>
          <Card className='surface-card'><Skeleton active paragraph={{ rows: 6 }} /></Card>
        </div>
      ) : recipes.length === 0 ? (
        <Card className='surface-card v2-empty-state'>
          <ExperimentOutlined aria-hidden='true' />
          <Title level={4}>Chưa có công thức đã phát hành</Title>
          <Paragraph>
            Chủ quán cần hoàn thiện định mức và phát hành công thức ở thẻ phía trên
            trước khi làm mẻ.
          </Paragraph>
        </Card>
      ) : (
        <>
        <div className='v2-two-column'>
          <main className='v2-stack'>
            <Card className='surface-card' title='1. Chọn món và kế hoạch'>
              <div className='v2-form-grid'>
                <label className='v2-field v2-field-wide'>
                  <span>Món cần chuẩn bị</span>
                  <Select
                    value={activeRecipeId}
                    disabled={!canWrite || Boolean(pendingBatch)}
                    onChange={(value) => {
                      setSelectedRecipeId(value);
                      setComponentQuantities({});
                    }}
                    options={recipes.map((recipe) => ({
                      value: recipe.id,
                      label: `${recipe.productName} · ${recipe.skuCode} · CT v${recipe.version}`,
                    }))}
                    aria-label='Chọn công thức món cần chuẩn bị'
                  />
                </label>
                <label className='v2-field'>
                  <span>Số hộp dự kiến</span>
                  <InputNumber
                    min={1}
                    precision={0}
                    inputMode='numeric'
                    value={expectedOutputQuantity}
                    disabled={!canWrite || Boolean(pendingBatch)}
                    onChange={(value) => setExpectedOutputQuantity(Number(value ?? 1))}
                  />
                </label>
                <label className='v2-field'>
                  <span>Bắt đầu lúc</span>
                  <Input
                    type='datetime-local'
                    value={startedAt}
                    disabled={!canWrite || Boolean(pendingBatch)}
                    onChange={(event) => setStartedAt(event.target.value)}
                  />
                </label>
                <label className='v2-field'>
                  <span>Hạn dùng (do bạn xác nhận)</span>
                  <Input
                    type='datetime-local'
                    value={expiresAt}
                    disabled={!canWrite}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </label>
              </div>

              {selectedRecipe && Array.isArray(selectedRecipe.finishedSpec) ? (
                <div className='v2-finished-spec' aria-label='Quy cách một hộp'>
                  <Text strong>Quy cách một hộp khách nhận</Text>
                  <div>
                    {selectedRecipe.finishedSpec.map((item) => (
                      <span key={`${item.name}-${item.unit}`}>
                        {formatNumber(item.quantity)} {item.unit} {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>

            <Card
              className='surface-card'
              title='2. Nguyên liệu thực dùng'
              extra={
                <Button size='small' disabled={!canWrite} onClick={fillExpectedComponents}>
                  Điền theo định mức
                </Button>
              }
            >
              <div className='v2-component-list'>
                {selectedRecipe?.components.map((component) => {
                  const balance = availableByItem.get(component.inventoryItemId);
                  const actual = Number(componentQuantities[component.inventoryItemId] ?? 0);
                  const expected = component.expectedQuantity * expectedOutputQuantity;
                  const exceedsStock =
                    balance?.availableQuantity !== undefined && actual > balance.availableQuantity;
                  return (
                    <div
                      className={`v2-component-row${exceedsStock ? ' is-blocked' : ''}`}
                      key={component.inventoryItemId}
                    >
                      <div>
                        <Text strong>{component.name}</Text>
                        <Text type='secondary'>
                          Định mức {formatNumber(expected)} {component.baseUnit}
                          {balance
                            ? ` · Có thể dùng ${formatNumber(balance.availableQuantity)} ${balance.baseUnit}`
                            : ' · Chưa có số dư kho'}
                        </Text>
                      </div>
                      <label className='v2-quantity-control'>
                        <span>Thực dùng</span>
                        <InputNumber
                          min={0}
                          inputMode='decimal'
                          value={componentQuantities[component.inventoryItemId]}
                          disabled={!canWrite}
                          addonAfter={component.baseUnit}
                          onChange={(value) =>
                            setComponentQuantities((current) => ({
                              ...current,
                              [component.inventoryItemId]: Number(value ?? 0),
                            }))
                          }
                          aria-label={`Lượng ${component.name} thực dùng`}
                        />
                      </label>
                      {exceedsStock ? (
                        <Text type='danger'>Lượng dùng đang vượt tồn khả dụng.</Text>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className='surface-card' title='3. Thành phẩm thực tế'>
              <div className='v2-form-grid'>
                <label className='v2-field'>
                  <span>Số hộp đạt</span>
                  <InputNumber
                    min={0}
                    precision={0}
                    inputMode='numeric'
                    value={goodOutputQuantity}
                    disabled={!canWrite}
                    onChange={(value) => setGoodOutputQuantity(Number(value ?? 0))}
                  />
                </label>
                <label className='v2-field'>
                  <span>Số hộp hỏng</span>
                  <InputNumber
                    min={0}
                    precision={0}
                    inputMode='numeric'
                    value={wasteOutputQuantity}
                    disabled={!canWrite}
                    onChange={(value) => setWasteOutputQuantity(Number(value ?? 0))}
                  />
                </label>
                <label className='v2-field'>
                  <span>Hoàn tất lúc</span>
                  <Input
                    type='datetime-local'
                    value={completedAt}
                    disabled={!canWrite}
                    onChange={(event) => setCompletedAt(event.target.value)}
                  />
                </label>
                <label className='v2-field v2-field-wide'>
                  <span>Ghi chú</span>
                  <Input.TextArea
                    rows={3}
                    value={note}
                    disabled={!canWrite || Boolean(pendingBatch)}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder='Ví dụ: khoai hôm nay hao hụt nhiều…'
                  />
                </label>
              </div>
              {!outputMatches ? (
                <Alert
                  type='warning'
                  showIcon
                  title='Sản lượng thực tế khác kế hoạch'
                  description={`Đạt + hỏng là ${outputTotal} hộp, kế hoạch là ${expectedOutputQuantity} hộp. Bạn vẫn có thể lưu số thực tế này.`}
                />
              ) : null}
            </Card>
          </main>

          <aside className='v2-summary-column'>
            <Card className='surface-card v2-sticky-summary'>
              <Text type='secondary'>Mẻ sắp ghi nhận</Text>
              <Title level={3}>{selectedRecipe?.productName ?? 'Chọn món'}</Title>
              <div className='v2-batch-yield'>
                <Progress
                  type='circle'
                  size={104}
                  percent={
                    expectedOutputQuantity > 0
                      ? Math.min(100, Math.round((goodOutputQuantity / expectedOutputQuantity) * 100))
                      : 0
                  }
                  format={() => `${goodOutputQuantity}/${expectedOutputQuantity}`}
                />
                <div>
                  <Text strong>{goodOutputQuantity} hộp đạt</Text>
                  <Text type='secondary'>{wasteOutputQuantity} hộp hỏng</Text>
                </div>
              </div>
              {missingComponents && missingComponents.length > 0 ? (
                <Alert
                  type='warning'
                  showIcon
                  icon={<WarningOutlined />}
                  title={`Còn ${missingComponents.length} nguyên liệu chưa nhập`}
                />
              ) : null}
              {canWrite ? (
                <Button
                  type='primary'
                  icon={<CheckOutlined />}
                  loading={saving}
                  disabled={
                    !selectedRecipe ||
                    Boolean(missingComponents?.length) ||
                    Boolean(insufficientComponents?.length)
                  }
                  onClick={handleCompleteBatch}
                  block
                >
                  {pendingBatch ? 'Thử hoàn tất lại' : 'Hoàn tất mẻ'}
                </Button>
              ) : null}
            </Card>

            <Card className='surface-card v2-recent-batches' title='Mẻ gần đây'>
              {batches.length === 0 ? (
                <Text type='secondary'>Chưa có mẻ sản xuất.</Text>
              ) : (
                <ul>
                  {batches.slice(0, 6).map((batch, index) => {
                    const produced = Number(batch.goodOutputQuantity ?? 0);
                    const sold = Number(batch.soldQuantity ?? 0);
                    const remaining = Number(batch.remainingQuantity ?? Math.max(0, produced - sold));
                    return (
                      <li key={batchId(batch) || `${batch.startedAt}-${index}`}>
                        <div className='v2-recent-batch-heading'>
                          <div>
                            <Text strong>{batch.productName ?? batch.skuCode ?? 'Mẻ sản xuất'}</Text>
                            <Text type='secondary'>{formatDate(batch.completedAt ?? batch.startedAt)}</Text>
                          </div>
                          {productionStatus(batch.status)}
                        </div>
                        <dl className='v2-batch-metrics'>
                          <div><dt>Đã làm</dt><dd>{produced}</dd></div>
                          <div><dt>Đã bán</dt><dd>{sold}</dd></div>
                          <div><dt>Còn</dt><dd>{remaining}</dd></div>
                          <div><dt>Hỏng</dt><dd>{Number(batch.wasteOutputQuantity ?? 0)}</dd></div>
                        </dl>
                        {batch.actualCostPerUnitVnd != null ? (
                          <Text type='secondary'>Giá vốn thật {formatVnd(batch.actualCostPerUnitVnd)} / hộp</Text>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>
        </div>
        {canWrite ? (
        <div className='v2-mobile-action-dock' aria-label='Hoàn tất mẻ sản xuất'>
          <div>
            <Text type='secondary'>Hộp đạt / dự kiến</Text>
            <Text strong>{goodOutputQuantity} / {expectedOutputQuantity}</Text>
          </div>
          <Button
            type='primary'
            icon={<CheckOutlined />}
            loading={saving}
            disabled={
              !selectedRecipe ||
              Boolean(missingComponents?.length) ||
              Boolean(insufficientComponents?.length)
            }
            onClick={handleCompleteBatch}
          >
            Hoàn tất mẻ
          </Button>
        </div>
        ) : null}
        </>
      )}
    </div>
  );
}
