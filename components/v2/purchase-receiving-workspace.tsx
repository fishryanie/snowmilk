'use client';

import { useApiQuery } from '@/hooks/use-api-data';

import {
  DeleteOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import {
  businessDateToday,
  errorText,
  localDateTimeInput,
  newIdempotencyKey,
  pendingIdempotencyKey,
  requestV2,
  type PendingIdempotencyRequest,
} from '@/components/v2/api-client';
import { formatDate, formatNumber, formatVnd } from '@/lib/formatters';

const { Text, Title } = Typography;

type PurchaseItemOption = {
  inventoryItemId: string;
  code: string;
  name: string;
  kind: string;
  baseUnit: string;
};

type PurchaseItemsResponse = {
  items: PurchaseItemOption[];
};

type ReceiptLine = {
  lineKey: string;
  inventoryItemId: string;
  itemCode: string;
  itemName: string;
  baseUnit: string;
  quantity: string;
  unitCostVnd: string;
  totalAmountVnd: number;
};

type PurchaseReceipt = {
  id: string;
  receiptCode: string;
  supplier: { name: string; contact?: string };
  businessDate: string;
  receivedAt: string;
  postedAt: string;
  status: string;
  totalAmountVnd: number;
  note: string;
  version: number;
  lines: ReceiptLine[];
};

type ReceiptResponse = { receipts: PurchaseReceipt[] };

type DraftLine = {
  key: string;
  inventoryItemId?: string;
  quantity?: string;
  totalAmountVnd?: number;
};

function newLine(): DraftLine {
  return {
    key: newIdempotencyKey('purchase-line'),
  };
}

function toHcmIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

function kindLabel(kind: string) {
  if (kind === 'raw_material') return 'Nguyên liệu';
  if (kind === 'packaging') return 'Bao bì';
  if (kind === 'semi_finished') return 'Bán thành phẩm';
  if (kind === 'finished_good') return 'Thành phẩm';
  return 'Hàng hóa';
}

export function PurchaseReceivingWorkspace() {
  const { message } = App.useApp();
  const { can, loading: accessLoading, error: accessError } = useCurrentAccess();
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [businessDate, setBusinessDate] = useState(businessDateToday);
  const [receivedAt, setReceivedAt] = useState(localDateTimeInput);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequest = useRef<PendingIdempotencyRequest>(null);

  const canRead = can('purchases:read');
  const canReceive = can('purchases:write');

  const enabled = !accessLoading && canRead;
  const catalog = useApiQuery<PurchaseItemsResponse>(enabled ? '/api/v2/catalog/purchase-items' : null);
  const history = useApiQuery<ReceiptResponse>(enabled ? '/api/v2/purchase-receipts' : null);
  const receipts = history.data?.receipts ?? [];
  const items = useMemo(() => {
    const unique = new Map<string, PurchaseItemOption>();
    for (const balance of catalog.data?.items ?? []) {
      if (!unique.has(balance.inventoryItemId)) unique.set(balance.inventoryItemId, balance);
    }
    return [...unique.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'vi'));
  }, [catalog.data]);
  const loading = accessLoading || catalog.loading || history.loading;
  const loadError = catalog.error || history.error
    ? errorText(catalog.error ?? history.error, 'Không tải được danh mục hoặc lịch sử nhập hàng.') : null;
  function refreshData() {
    catalog.refresh();
    history.refresh();
  }

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.inventoryItemId, item])),
    [items],
  );
  const completeLines = lines.filter(
    (line) =>
      line.inventoryItemId &&
      line.quantity &&
      !/^0(?:\.0+)?$/.test(line.quantity) &&
      Number.isSafeInteger(line.totalAmountVnd) &&
      Number(line.totalAmountVnd) > 0,
  );
  const totalAmountBigInt = completeLines.reduce(
    (sum, line) => sum + BigInt(Number(line.totalAmountVnd)),
    BigInt(0),
  );
  const totalAmountVnd =
    totalAmountBigInt <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(totalAmountBigInt)
      : null;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  async function submitReceipt() {
    if (!supplierName.trim()) {
      setError('Hãy nhập tên nhà cung cấp.');
      return;
    }
    if (completeLines.length !== lines.length) {
      setError('Mỗi dòng cần có hàng hóa, số lượng dương và thành tiền nguyên VND.');
      return;
    }
    if (totalAmountVnd == null) {
      setError('Tổng phiếu vượt giới hạn số nguyên VND an toàn. Hãy tách thành nhiều phiếu.');
      return;
    }
    const payloadWithoutKey = {
      businessDate,
      receivedAt: toHcmIso(receivedAt),
      supplierName: supplierName.trim(),
      supplierContact: supplierContact.trim(),
      lines: completeLines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        totalAmountVnd: line.totalAmountVnd,
      })),
      note: note.trim(),
    };
    const idempotencyKey = pendingIdempotencyKey(
      pendingRequest,
      'purchase-receipt',
      payloadWithoutKey,
    );
    setSaving(true);
    setError(null);
    try {
      const receipt = await requestV2<PurchaseReceipt>('/api/v2/purchase-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey, ...payloadWithoutKey }),
      });
      void history.mutate((current) => ({ ...current, receipts: [receipt, ...(current?.receipts ?? []).filter((row) => row.id !== receipt.id)] }), { revalidate: false });
      setSupplierName('');
      setSupplierContact('');
      setNote('');
      setLines([newLine()]);
      setBusinessDate(businessDateToday());
      setReceivedAt(localDateTimeInput());
      pendingRequest.current = null;
      message.success(`Đã ghi phiếu ${receipt.receiptCode}.`);
    } catch (requestError) {
      const copy = errorText(
        requestError,
        'Không thể ghi phiếu nhập. Toàn bộ dữ liệu đang nhập vẫn được giữ.',
      );
      setError(copy);
      message.error(copy);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='page-wrap v2-workspace purchase-receiving-v2'>
      <PageHeader
        title='Nhập hàng'
        description='Ghi số lượng nhập, thành tiền và đơn giá mua theo từng hàng hóa.'
        actions={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              refreshData();
            }}
            disabled={!canRead}
          >
            Làm mới
          </Button>
        }
      />

      {accessError ? (
        <Alert type='error' showIcon title='Không xác minh được quyền nhập hàng' description={accessError} />
      ) : null}
      {!accessLoading && !canRead ? (
        <Alert
          type='warning'
          showIcon
          title='Bạn không có quyền xem nhập hàng'
          description='Tài khoản hiện tại không có quyền purchases:read.'
        />
      ) : null}
      {!accessLoading && canRead && !canReceive ? (
        <Alert
          type='info'
          showIcon
          title='Chế độ chỉ xem'
          description='Bạn có thể xem lịch sử phiếu nhập nhưng không có quyền ghi nhận hàng mới.'
        />
      ) : null}
      {error || loadError ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setError(null)}
          title='Chưa thể hoàn tất phiếu nhập'
          description={error ?? loadError}
        />
      ) : null}

      {(loading && canRead) || accessLoading ? (
        <Card className='surface-card'><Skeleton active paragraph={{ rows: 12 }} /></Card>
      ) : canRead ? (
        <>
          {canReceive ? (
          <Card className='surface-card' title='Thông tin nhận hàng'>
            <div className='v2-form-grid'>
              <label className='v2-field'>
                <span>Nhà cung cấp</span>
                <Input
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  placeholder='Ví dụ: Chợ đầu mối Thủ Đức'
                  maxLength={200}
                />
              </label>
              <label className='v2-field'>
                <span>Liên hệ (không bắt buộc)</span>
                <Input
                  value={supplierContact}
                  onChange={(event) => setSupplierContact(event.target.value)}
                  placeholder='Số điện thoại hoặc người giao'
                  maxLength={300}
                />
              </label>
              <label className='v2-field'>
                <span>Ngày kinh doanh</span>
                <Input
                  type='date'
                  value={businessDate}
                  onChange={(event) => setBusinessDate(event.target.value)}
                />
              </label>
              <label className='v2-field'>
                <span>Thời điểm nhận</span>
                <Input
                  type='datetime-local'
                  value={receivedAt}
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
              </label>
              <label className='v2-field v2-field-wide'>
                <span>Ghi chú phiếu</span>
                <Input.TextArea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder='Thông tin giao hàng, hóa đơn…'
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  maxLength={2000}
                />
              </label>
            </div>
          </Card>

          ) : null}

          {canReceive ? (
          <section aria-labelledby='purchase-lines-title' className='v2-stack'>
            <div className='v2-section-heading'>
              <div>
                <Title level={4} id='purchase-lines-title'>Hàng thực nhận</Title>
                <Text type='secondary'>Nhập số lượng theo g/ml/cái và thành tiền nguyên VND của từng dòng.</Text>
              </div>
              <Button
                icon={<PlusOutlined />}
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                Thêm dòng
              </Button>
            </div>
            <div className='v2-stack'>
              {lines.map((line, index) => {
                const item = line.inventoryItemId
                  ? itemById.get(line.inventoryItemId)
                  : undefined;
                return (
                  <Card
                    className='surface-card v2-purchase-line'
                    key={line.key}
                    title={`Dòng ${index + 1}`}
                    extra={
                      <Button
                        type='text'
                        danger
                        icon={<DeleteOutlined />}
                        disabled={lines.length === 1}
                        aria-label={`Xóa dòng nhập ${index + 1}`}
                        onClick={() =>
                          setLines((current) => current.filter((row) => row.key !== line.key))
                        }
                      />
                    }
                  >
                    <div className='v2-purchase-line-grid'>
                      <label className='v2-field v2-purchase-item-field'>
                        <span>Hàng hóa</span>
                        <Select
                          showSearch
                          optionFilterProp='label'
                          value={line.inventoryItemId}
                          placeholder='Chọn hàng hóa'
                          aria-label={`Hàng hóa dòng ${index + 1}`}
                          options={items.map((option) => ({
                            value: option.inventoryItemId,
                            label: `${option.name} · ${option.code} · ${kindLabel(option.kind)}`,
                          }))}
                          onChange={(value) =>
                            updateLine(line.key, {
                              inventoryItemId: value,
                                                      })
                          }
                        />
                      </label>
                      <label className='v2-field'>
                        <span>Số lượng {item ? `(${item.baseUnit})` : ''}</span>
                        <InputNumber<string>
                          stringMode
                          min='0.000000001'
                          precision={9}
                          inputMode='decimal'
                          value={line.quantity}
                          placeholder='0'
                          addonAfter={item?.baseUnit ?? 'đv'}
                          aria-label={`Số lượng dòng ${index + 1}`}
                          onChange={(value) =>
                            updateLine(line.key, { quantity: value ?? undefined })
                          }
                        />
                      </label>
                      <label className='v2-field'>
                        <span>Thành tiền</span>
                        <InputNumber
                          min={1}
                          max={Number.MAX_SAFE_INTEGER}
                          precision={0}
                          inputMode='numeric'
                          value={line.totalAmountVnd}
                          placeholder='0'
                          addonAfter='đ'
                          aria-label={`Thành tiền dòng ${index + 1}`}
                          onChange={(value) =>
                            updateLine(line.key, {
                              totalAmountVnd: value == null ? undefined : Number(value),
                            })
                          }
                        />
                      </label>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          ) : null}

          <Card className='surface-card v2-purchase-history' title='Phiếu nhập gần đây'>
            {receipts.length === 0 ? (
              <Empty
                image={<InboxOutlined />}
                description='Chưa có phiếu nhập v2 tại điểm bán này.'
              />
            ) : (
              <div className='v2-history-list'>
                {receipts.map((receipt) => (
                  <article className='v2-history-day' key={receipt.id}>
                    <div className='v2-history-day-heading'>
                      <div>
                        <Space wrap>
                          <Text strong>{receipt.receiptCode}</Text>
                          <Tag color='green'>Đã vào sổ</Tag>
                        </Space>
                        <Text type='secondary'>
                          {formatDate(receipt.businessDate)} · {receipt.supplier.name} · {formatNumber(receipt.lines.length)} dòng
                        </Text>
                      </div>
                      <Text strong>{formatVnd(receipt.totalAmountVnd)}</Text>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          {canReceive ? (
          <div className='v2-mobile-action-dock v2-desktop-submit-bar' aria-label='Ghi phiếu nhập'>
            <div>
              <Text type='secondary'>{formatNumber(completeLines.length)} dòng hợp lệ</Text>
              <Text strong>
                {totalAmountVnd == null ? 'Tổng vượt giới hạn' : formatVnd(totalAmountVnd)}
              </Text>
            </div>
            <Button
              type='primary'
              icon={<SaveOutlined />}
              loading={saving}
              disabled={
                saving ||
                totalAmountVnd == null ||
                completeLines.length !== lines.length ||
                !supplierName.trim()
              }
              onClick={submitReceipt}
            >
              Ghi phiếu
            </Button>
          </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
