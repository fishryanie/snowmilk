'use client';

import {
  CheckOutlined,
  InboxOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  InputNumber,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCurrentAccess } from '@/components/v2/access-context';
import {
  errorText,
  localDateTimeInput,
  pendingIdempotencyKey,
  type PendingIdempotencyRequest,
  requestV2,
} from '@/components/v2/api-client';
import { PageHeader } from '@/components/common/page-header';
import { formatDate, formatNumber, formatVnd } from '@/lib/formatters';

const { Paragraph, Text, Title } = Typography;

type InventoryBalance = {
  id?: string;
  inventoryItemId: string;
  inventoryLotId?: string | null;
  lotCode?: string | null;
  code: string;
  name: string;
  kind: string;
  baseUnit: string;
  quantity: number | string;
  onHandQuantity?: number | string;
  availableQuantity: number | string;
  inventoryValueVnd?: number | null;
  costDataQuality?: string | null;
  expiresAt?: string | null;
  lotTracked?: boolean;
  expiryTracked?: boolean;
};

type InventoryResponse = {
  balances: InventoryBalance[];
  openingRequired: boolean;
};
type StockCountResponse = {
  id: string;
  businessDate: string;
  countCode: string;
  status: string;
  lineCount: number;
};

function rowKey(balance: InventoryBalance) {
  return `${balance.inventoryItemId}:${balance.inventoryLotId ?? 'no-lot'}`;
}

function kindCopy(kind: string) {
  if (kind === 'raw_material') return 'Nguyên liệu';
  if (kind === 'packaging') return 'Bao bì';
  if (kind === 'finished_good') return 'Thành phẩm';
  if (kind === 'semi_finished') return 'Bán thành phẩm';
  return kind || 'Hàng hóa';
}

function toHcmIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

export function InventoryWorkspace() {
  const { message } = App.useApp();
  const { can, loading: accessLoading, error: accessError } = useCurrentAccess();
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [counts, setCounts] = useState<Record<string, string | undefined>>({});
  const [unitCosts, setUnitCosts] = useState<Record<string, string | undefined>>({});
  const [openingRequired, setOpeningRequired] = useState(false);
  const [countedAt, setCountedAt] = useState(localDateTimeInput);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<StockCountResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pendingCount = useRef<PendingIdempotencyRequest>(null);

  const canCount = can('inventory:count');
  const canOpen = can('inventory:adjust');
  const canSubmit = openingRequired ? canOpen : canCount;

  useEffect(() => {
    if (accessLoading) return;
    const controller = new AbortController();
    requestV2<InventoryResponse>('/api/v2/inventory/balances', {
      signal: controller.signal,
    })
      .then((value) => {
        setBalances(value.balances ?? []);
        setOpeningRequired(Boolean(value.openingRequired));
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(errorText(requestError, 'Không tải được số dư kho.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessLoading, refreshKey]);

  const groups = useMemo(() => {
    const byKind = new Map<string, InventoryBalance[]>();
    for (const balance of balances) {
      const current = byKind.get(balance.kind) ?? [];
      current.push(balance);
      byKind.set(balance.kind, current);
    }
    return [...byKind].map(([kind, rows]) => ({ kind, rows }));
  }, [balances]);

  const enteredLines = balances.filter(
    (balance) =>
      counts[rowKey(balance)] !== undefined &&
      (openingRequired || !balance.lotTracked || Boolean(balance.inventoryLotId)),
  );
  const missingOpeningLines = openingRequired
    ? balances.filter((balance) => counts[rowKey(balance)] === undefined)
    : [];

  function fillLedgerQuantities() {
    setCounts(
      Object.fromEntries(
        balances
          .filter(
            (balance) =>
              openingRequired || !balance.lotTracked || Boolean(balance.inventoryLotId),
          )
          .map((balance) => [
          rowKey(balance),
          String(balance.onHandQuantity ?? balance.quantity ?? 0),
          ]),
      ),
    );
  }

  async function submitCount() {
    if (!canSubmit) {
      setError(
        openingRequired
          ? 'Số dư mở đầu cần chủ quán xác nhận với quyền điều chỉnh kho.'
          : 'Bạn không có quyền ghi phiếu kiểm kho.',
      );
      return;
    }
    if (openingRequired && missingOpeningLines.length > 0) {
      setError(
        `Opening count phải xác nhận đủ mọi hàng hóa. Còn ${missingOpeningLines.length} dòng chưa nhập.`,
      );
      return;
    }
    if (enteredLines.length === 0) {
      setError('Hãy nhập số đếm thực tế cho ít nhất một hàng hóa hoặc lot.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payloadWithoutKey = {
          countedAt: toHcmIso(countedAt),
          lines: enteredLines.map((balance) => ({
            inventoryItemId: balance.inventoryItemId,
            ...(balance.inventoryLotId
              ? { inventoryLotId: balance.inventoryLotId }
              : {}),
            countedQuantity: counts[rowKey(balance)] ?? '0',
            ...(openingRequired &&
            unitCosts[rowKey(balance)] &&
            !/^0(?:\.0+)?$/.test(counts[rowKey(balance)] ?? '0')
              ? { unitCostVnd: unitCosts[rowKey(balance)] }
              : {}),
          })),
          note: note.trim(),
        };
      const result = await requestV2<StockCountResponse>('/api/v2/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: pendingIdempotencyKey(
            pendingCount,
            'stock-count',
            payloadWithoutKey,
          ),
          ...payloadWithoutKey,
        }),
      });
      setLastCount(result);
      setCounts({});
      setUnitCosts({});
      setNote('');
      setCountedAt(localDateTimeInput());
      pendingCount.current = null;
      setRefreshKey((value) => value + 1);
      message.success(`Đã ghi ${result.lineCount} dòng kiểm kho.`);
    } catch (requestError) {
      const copy = errorText(
        requestError,
        'Không thể ghi kiểm kho. Các số lượng bạn nhập vẫn được giữ.',
      );
      setError(copy);
      message.error(copy);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='page-wrap v2-workspace inventory-v2'>
      <PageHeader
        title='Kho & kiểm kho'
        description='So sánh số đếm vật lý với sổ kho theo từng hàng hóa và lot. Phiếu chỉ điều chỉnh các dòng bạn nhập.'
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

      {accessError ? (
        <Alert type='error' showIcon title='Không xác minh được quyền kho' description={accessError} />
      ) : null}
      {!accessLoading && !canCount ? (
        <Alert
          type='info'
          showIcon
          title='Chế độ chỉ xem'
          description='Bạn có thể xem số dư nhưng không có quyền ghi phiếu kiểm kho.'
        />
      ) : null}
      {!accessLoading && openingRequired && canCount && !canOpen ? (
        <Alert
          type='warning'
          showIcon
          title='Opening count cần chủ quán xác nhận'
          description='Phiếu đầu tiên tạo số dư mở đầu cho toàn bộ sổ kho và có thể xác nhận giá vốn. Nhân viên chưa được phép ghi bước cutover này.'
        />
      ) : null}
      {error ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setError(null)}
          title='Chưa thể ghi kiểm kho'
          description={error}
        />
      ) : null}
      {lastCount ? (
        <Alert
          type='success'
          showIcon
          icon={<CheckOutlined />}
          title={`Đã ghi phiếu ${lastCount.countCode}`}
          description={`${formatNumber(lastCount.lineCount)} dòng · ngày ${formatDate(lastCount.businessDate)}`}
        />
      ) : null}

      {canCount ? (
        <Card className='surface-card v2-stock-count-toolbar'>
          <Alert
            type='info'
            showIcon
            title={
              openingRequired
                ? 'Đây là số dư mở đầu cutover: chủ quán phải nhập đủ mọi hàng hóa, kể cả số lượng 0, và tự xác nhận giá vốn nếu có.'
                : 'Đây là phiếu đối chiếu định kỳ; chỉ các hàng hóa hoặc lot được nhập số đếm mới được điều chỉnh.'
            }
          />
          <div className='v2-form-grid'>
            <label className='v2-field'>
              <span>Thời điểm đếm</span>
              <Input
                type='datetime-local'
                value={countedAt}
                onChange={(event) => setCountedAt(event.target.value)}
              />
            </label>
            <label className='v2-field'>
              <span>Ghi chú phiếu</span>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder='Ví dụ: kiểm kho đầu kỳ…'
              />
            </label>
          </div>
          <Space wrap>
            {!openingRequired ? (
              <Button onClick={fillLedgerQuantities}>Điền toàn bộ theo sổ</Button>
            ) : null}
            <Text type='secondary'>{formatNumber(enteredLines.length)} dòng sẽ được ghi</Text>
          </Space>
        </Card>
      ) : null}

      {loading || accessLoading ? (
        <Card className='surface-card'><Skeleton active paragraph={{ rows: 10 }} /></Card>
      ) : balances.length === 0 ? (
        <Card className='surface-card v2-empty-state'>
          <InboxOutlined aria-hidden='true' />
          <Title level={4}>Chưa có hàng hóa trong kho v2</Title>
          <Paragraph>Seed danh mục hàng hóa hoặc hoàn tất opening balance trước khi kiểm kho.</Paragraph>
        </Card>
      ) : (
        <div className='v2-stack'>
          {groups.map((group) => (
            <section key={group.kind} aria-labelledby={`inventory-kind-${group.kind}`}>
              <div className='v2-section-heading'>
                <Title level={4} id={`inventory-kind-${group.kind}`}>{kindCopy(group.kind)}</Title>
                <Tag>{formatNumber(group.rows.length)} dòng</Tag>
              </div>
              <div className='v2-inventory-grid'>
                {group.rows.map((balance) => {
                  const key = rowKey(balance);
      const expected = Number(balance.onHandQuantity ?? balance.quantity ?? 0);
                  const counted = counts[key];
                  const variance = counted === undefined ? null : Number(counted) - expected;
                  const unavailableCycleLot =
                    !openingRequired && balance.lotTracked && !balance.inventoryLotId;
                  return (
                    <Card className='surface-card v2-inventory-card' key={key}>
                      <div className='v2-inventory-heading'>
                        <div>
                          <Space size={[5, 4]} wrap>
                            <Text strong>{balance.name}</Text>
                            <Tag>{balance.code}</Tag>
                            {balance.lotCode ? <Tag color='blue'>Lot {balance.lotCode}</Tag> : null}
                          </Space>
                          <Text type='secondary'>
                          Theo sổ {formatNumber(expected)} {balance.baseUnit}
                            {balance.expiresAt ? ` · HSD ${formatDate(balance.expiresAt)}` : ''}
                          </Text>
                        </div>
                        {balance.inventoryValueVnd != null ? (
                          <Text type='secondary'>{formatVnd(balance.inventoryValueVnd)}</Text>
                        ) : null}
                      </div>
                      <label className='v2-field'>
                        <span>Số đếm thực tế</span>
                        <InputNumber<string>
                          stringMode
                          min='0'
                          precision={9}
                          inputMode='decimal'
                          addonAfter={balance.baseUnit}
                          placeholder='Chưa đếm'
                          value={counted}
                          disabled={!canSubmit || unavailableCycleLot}
                          onChange={(value) =>
                            setCounts((current) => ({
                              ...current,
                              [key]: value ?? undefined,
                            }))
                          }
                          aria-label={`Số đếm ${balance.name}${balance.lotCode ? ` lot ${balance.lotCode}` : ''}`}
                        />
                      </label>
                      {unavailableCycleLot ? (
                        <Text type='secondary'>Chưa có lot để kiểm. Hãy nhận hàng để tạo lot mới.</Text>
                      ) : null}
                      {openingRequired ? (
                        <label className='v2-field'>
                          <span>Giá vốn / {balance.baseUnit} (không bắt buộc)</span>
                          <InputNumber<string>
                            stringMode
                            min='0'
                            precision={9}
                            inputMode='decimal'
                            addonAfter='đ'
                            placeholder='Chủ quán xác nhận'
                            value={unitCosts[key]}
                            disabled={!canOpen || counted == null || /^0(?:\.0+)?$/.test(counted)}
                            onChange={(value) =>
                              setUnitCosts((current) => ({
                                ...current,
                                [key]: value ?? undefined,
                              }))
                            }
                            aria-label={`Giá vốn mở kho ${balance.name}`}
                          />
                        </label>
                      ) : null}
                      {variance !== null ? (
                        <Text type={variance === 0 ? 'success' : 'warning'}>
                          {variance === 0
                            ? 'Khớp sổ kho'
                            : `Chênh ${variance > 0 ? '+' : ''}${formatNumber(variance)} ${balance.baseUnit}`}
                        </Text>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {canCount ? (
        <div className='v2-mobile-action-dock v2-desktop-submit-bar' aria-label='Ghi phiếu kiểm kho'>
          <div>
            <Text type='secondary'>Dòng đã nhập</Text>
            <Text strong>{formatNumber(enteredLines.length)}</Text>
          </div>
          <Button
            type='primary'
            icon={<SaveOutlined />}
            loading={saving}
            disabled={
              !canSubmit ||
              enteredLines.length === 0 ||
              !countedAt ||
              (openingRequired && missingOpeningLines.length > 0)
            }
            onClick={submitCount}
          >
            {openingRequired ? 'Mở sổ kho' : 'Ghi kiểm kho'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
