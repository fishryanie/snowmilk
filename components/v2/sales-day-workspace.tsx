'use client';

import {
  BankOutlined,
  CheckCircleOutlined,
  EditOutlined,
  SaveOutlined,
  ShoppingOutlined,
  WalletOutlined,
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
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { formatVnd, formatVndInput, parseVndInput } from '@/lib/formatters';
import {
  businessDateToday,
  errorText,
  pendingIdempotencyKey,
  requestV2,
  type PendingIdempotencyRequest,
} from '@/components/v2/api-client';

const { Paragraph, Text, Title } = Typography;

type CatalogSku = {
  id: string;
  code: string;
  name: string;
  unitPriceVnd: number | null;
  businessLine: { id?: string; code: string; name: string } | null;
  category?: { id?: string; code: string; name: string } | null;
  fulfillment: 'made_to_order' | 'preproduced' | string;
  availableQuantity?: number | null;
  canSell?: boolean;
};

type SalesLineDraft = {
  lineKey?: string;
  skuId: string | null;
  skuCode?: string;
  skuName?: string;
  businessLine?: { id?: string; code?: string; name?: string } | null;
  category?: { id?: string; code?: string; name?: string } | null;
  quantity: number | string;
  quantitySource?: 'actual' | 'estimated' | 'legacy' | string;
  salesUnit?: string;
  unitPriceVnd?: number | null;
  grossRevenueVnd?: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd?: number;
  dataQuality?: string;
};

type SalesTotalsSnapshot = {
  grossRevenueVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  collectedVnd: number;
  cogsVnd?: number | null;
  profitVnd?: number | null;
};

type SalesDay = {
  id?: string;
  businessDate: string;
  status: 'draft' | 'closed' | 'reopened';
  version: number;
  lines: SalesLineDraft[];
  payments: {
    cashVnd: number;
    bankTransferVnd: number;
    otherVnd: number;
  };
  note?: string;
  totals?: SalesTotalsSnapshot;
  dataQuality?: string;
  calculationVersion?: string;
};

type CatalogResponse = { skus: CatalogSku[] };
type SalesDayResponse = SalesDay | { salesDay: SalesDay };

function emptySalesDay(businessDate: string): SalesDay {
  return {
    businessDate,
    status: 'draft',
    version: 0,
    lines: [],
    payments: { cashVnd: 0, bankTransferVnd: 0, otherVnd: 0 },
    note: '',
  };
}

function normalizeSalesDay(value: SalesDayResponse): SalesDay {
  return 'salesDay' in value ? value.salesDay : value;
}

function statusTag(status: SalesDay['status']) {
  if (status === 'closed') return <Tag color='success'>Đã chốt</Tag>;
  if (status === 'reopened') return <Tag color='warning'>Đã mở lại</Tag>;
  return <Tag color='processing'>Bản nháp</Tag>;
}

function quantitySourceTag(source: SalesLineDraft['quantitySource']) {
  if (source === 'estimated') return <Tag color='warning'>Số lượng ước tính</Tag>;
  if (source === 'actual') return <Tag color='success'>Số lượng thực tế</Tag>;
  return <Tag>Dữ liệu lịch sử</Tag>;
}

export function SalesDayWorkspace({ initialDate }: { initialDate?: string }) {
  const { message } = App.useApp();
  const { can, loading: accessLoading, error: accessError } = useCurrentAccess();
  const [businessDate, setBusinessDate] = useState(initialDate ?? businessDateToday);
  const [skus, setSkus] = useState<CatalogSku[]>([]);
  const [day, setDay] = useState<SalesDay>(() =>
    emptySalesDay(initialDate ?? businessDateToday()),
  );
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [dayError, setDayError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const saveRequest = useRef<PendingIdempotencyRequest>(null);
  const reopenRequest = useRef<PendingIdempotencyRequest>(null);
  const closeAttempt = useRef<{
    draftFingerprint: string;
    version: number;
    key: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestV2<CatalogResponse>('/api/v2/catalog/skus', { signal: controller.signal })
      .then((result) => {
        setSkus(result.skus ?? []);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCatalogError(errorText(error, 'Không thể tải danh sách món.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    requestV2<SalesDayResponse>(`/api/v2/sales-days/${businessDate}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setDay(normalizeSalesDay(result));
        setDayError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const messageText = errorText(error, 'Không thể tải bản chốt ngày.');
        if (/không tìm thấy|not found|chưa có/i.test(messageText)) {
          setDay(emptySalesDay(businessDate));
        } else {
          setDayError(messageText);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDayLoading(false);
      });
    return () => controller.abort();
  }, [businessDate]);

  const lineBySku = useMemo(
    () =>
      new Map(
        day.lines.flatMap((line) =>
          line.skuId ? ([[line.skuId, line]] as const) : [],
        ),
      ),
    [day.lines],
  );

  const skuById = useMemo(
    () => new Map(skus.map((sku) => [sku.id, sku])),
    [skus],
  );

  const unmatchedLines = useMemo(
    () => day.lines.filter((line) => !line.skuId || !skuById.has(line.skuId)),
    [day.lines, skuById],
  );

  const skuGroups = useMemo(() => {
    const groups = new Map<string, { code: string; name: string; skus: CatalogSku[] }>();
    for (const sku of skus) {
      const code = sku.businessLine?.code ?? 'OTHER';
      const current = groups.get(code) ?? {
        code,
        name: sku.businessLine?.name ?? 'Món khác',
        skus: [],
      };
      current.skus.push(sku);
      groups.set(code, current);
    }
    return [...groups.values()];
  }, [skus]);

  const totals = useMemo(() => {
    let grossVnd = 0;
    let discountVnd = 0;
    let refundVnd = 0;
    let quantity = 0;
    const blocked: CatalogSku[] = [];

    for (const line of day.lines) {
      const sku = line.skuId ? skuById.get(line.skuId) : undefined;
      const lineQuantity = Math.max(0, Number(line?.quantity ?? 0));
      quantity += lineQuantity;
      grossVnd += lineQuantity * Number(line.unitPriceVnd ?? sku?.unitPriceVnd ?? 0);
      discountVnd += Math.max(0, Number(line?.discountVnd ?? 0));
      refundVnd += Math.max(0, Number(line?.refundVnd ?? 0));
      if (
        sku?.fulfillment === 'preproduced' &&
        sku.availableQuantity != null &&
        lineQuantity > sku.availableQuantity
      ) {
        blocked.push(sku);
      }
    }

    let netVnd = Math.max(0, grossVnd - discountVnd - refundVnd);
    let collectedVnd =
      Number(day.payments.cashVnd ?? 0) +
      Number(day.payments.bankTransferVnd ?? 0) +
      Number(day.payments.otherVnd ?? 0);
    if (day.status === 'closed' && day.totals) {
      grossVnd = day.totals.grossRevenueVnd;
      discountVnd = day.totals.discountVnd;
      refundVnd = day.totals.refundVnd;
      netVnd = day.totals.netRevenueVnd;
      collectedVnd = day.totals.collectedVnd;
    }
    return {
      grossVnd,
      discountVnd,
      refundVnd,
      netVnd,
      collectedVnd,
      differenceVnd: collectedVnd - netVnd,
      quantity,
      blocked,
    };
  }, [day.lines, day.payments, day.status, day.totals, skuById]);

  function updateLine(skuId: string, patch: Partial<SalesLineDraft>) {
    setDay((current) => {
      const existing = current.lines.find((line) => line.skuId === skuId) ?? {
        skuId,
        quantity: 0,
        discountVnd: 0,
        refundVnd: 0,
      };
      const next = { ...existing, ...patch };
      return {
        ...current,
        lines: [...current.lines.filter((line) => line.skuId !== skuId), next],
      };
    });
  }

  function updatePayment(key: keyof SalesDay['payments'], value: number | null) {
    setDay((current) => ({
      ...current,
      payments: { ...current.payments, [key]: Math.max(0, Number(value ?? 0)) },
    }));
  }

  function draftPayload() {
    return {
      version: day.version,
      lines: day.lines
        .filter(
          (line) =>
            Boolean(line.skuId) &&
            (Number(line.quantity) > 0 || line.discountVnd > 0 || line.refundVnd > 0),
        )
        .map((line) => ({
          skuId: line.skuId as string,
          quantity: Math.max(0, Number(line.quantity ?? 0)),
          discountVnd: Math.max(0, Number(line.discountVnd ?? 0)),
          refundVnd: Math.max(0, Number(line.refundVnd ?? 0)),
        })),
      payments: day.payments,
      note: day.note?.trim() ?? '',
    };
  }

  async function saveDraft(options?: { quiet?: boolean }) {
    if (!can('sales:write')) {
      throw new Error('Tài khoản hiện tại không có quyền sửa bản chốt ngày.');
    }
    if (unmatchedLines.length > 0) {
      throw new Error(
        'Ngày này có dòng lịch sử chưa gắn SKU. Không thể ghi đè bằng form SKU mới.',
      );
    }
    const payloadWithoutKey = draftPayload();
    const payload = {
      idempotencyKey: pendingIdempotencyKey(
        saveRequest,
        `sales-day-save-${businessDate}`,
        payloadWithoutKey,
      ),
      ...payloadWithoutKey,
    };
    const result = await requestV2<SalesDayResponse>(
      `/api/v2/sales-days/${businessDate}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    const saved = normalizeSalesDay(result);
    setDay(saved);
    saveRequest.current = null;
    if (!options?.quiet) message.success('Đã lưu bản nháp cuối ngày.');
    return saved;
  }

  async function handleSave() {
    setSaving(true);
    setSubmitError(null);
    try {
      await saveDraft();
    } catch (error) {
      const text = errorText(error, 'Không thể lưu bản nháp. Dữ liệu bạn nhập vẫn được giữ.');
      setSubmitError(text);
      message.error(text);
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseDay() {
    if (!can('sales:close')) {
      setSubmitError('Tài khoản hiện tại không có quyền chốt ngày.');
      return;
    }
    if (totals.blocked.length > 0) {
      setSubmitError('Số hộp bán đang vượt tồn thành phẩm. Hãy bổ sung mẻ đã làm.');
      return;
    }
    if (totals.differenceVnd !== 0) {
      setSubmitError('Tiền thực nhận phải bằng doanh thu thuần trước khi chốt ngày.');
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const currentDraft = draftPayload();
      const draftFingerprint = JSON.stringify({
        businessDate,
        lines: currentDraft.lines,
        payments: currentDraft.payments,
        note: currentDraft.note,
      });
      let attempt = closeAttempt.current;
      if (!attempt || attempt.draftFingerprint !== draftFingerprint) {
        const saved = await saveDraft({ quiet: true });
        const closePayload = { version: saved.version };
        attempt = {
          draftFingerprint,
          version: saved.version,
          key: pendingIdempotencyKey(
            { current: null },
            `sales-day-close-${businessDate}`,
            closePayload,
          ),
        };
        closeAttempt.current = attempt;
      }
      const result = await requestV2<SalesDayResponse>(
        `/api/v2/sales-days/${businessDate}/close`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: attempt.version,
            idempotencyKey: attempt.key,
          }),
        },
      );
      setDay(normalizeSalesDay(result));
      closeAttempt.current = null;
      message.success('Đã chốt ngày và cập nhật doanh thu, tồn kho.');
    } catch (error) {
      const text = errorText(
        error,
        'Không thể chốt ngày. Toàn bộ dữ liệu bạn nhập vẫn được giữ.',
      );
      setSubmitError(text);
      message.error(text);
    } finally {
      setSaving(false);
    }
  }

  async function handleReopenDay() {
    if (!can('sales:reopen')) {
      setSubmitError('Chỉ chủ quán có quyền mở lại ngày đã chốt.');
      return;
    }
    if (unmatchedLines.length > 0) {
      setSubmitError(
        'Ngày legacy có dòng chưa gắn SKU nên không thể mở lại bằng luồng v2. Hãy giữ nguyên snapshot lịch sử.',
      );
      return;
    }
    if (reopenReason.trim().length < 5) {
      setSubmitError('Hãy ghi lý do mở lại ít nhất 5 ký tự.');
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      const payloadWithoutKey = {
        version: day.version,
        reason: reopenReason.trim(),
      };
      const result = await requestV2<SalesDayResponse>(
        `/api/v2/sales-days/${businessDate}/reopen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: pendingIdempotencyKey(
              reopenRequest,
              `sales-day-reopen-${businessDate}`,
              payloadWithoutKey,
            ),
            ...payloadWithoutKey,
          }),
        },
      );
      setDay(normalizeSalesDay(result));
      setReopenReason('');
      reopenRequest.current = null;
      message.success('Đã mở lại ngày và đảo các bút toán kho, doanh thu.');
    } catch (error) {
      const text = errorText(
        error,
        'Không thể mở lại ngày. Lý do bạn nhập vẫn được giữ.',
      );
      setSubmitError(text);
      message.error(text);
    } finally {
      setSaving(false);
    }
  }

  const locked = day.status === 'closed';
  const canWrite = can('sales:write');
  const canClose = can('sales:close');
  const canReopen = can('sales:reopen');
  const readOnly = locked || !canWrite;

  return (
    <div className='page-wrap v2-workspace sales-day-v2'>
      <PageHeader
        title='Chốt bán hàng cuối ngày'
        description='Nhập số lượng thực bán theo món. Giá, nhóm doanh thu và giá vốn luôn được máy chủ lấy tại thời điểm chốt.'
        actions={
          <Space wrap>
            {day.dataQuality && day.dataQuality !== 'complete' ? (
              <Tag color='warning'>{day.dataQuality}</Tag>
            ) : null}
            {statusTag(day.status)}
          </Space>
        }
      />

      <div className='v2-toolbar'>
        <label className='v2-field v2-date-field'>
          <span>Ngày bán</span>
          <Input
            type='date'
            value={businessDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              if (!nextDate) return;
              setDayLoading(true);
              setDayError(null);
              setDay(emptySalesDay(nextDate));
              setBusinessDate(nextDate);
            }}
            aria-label='Ngày bán'
          />
        </label>
        <div className='v2-toolbar-note'>
          <CheckCircleOutlined aria-hidden='true' />
          <span>Giá bán được chụp lại khi chốt; đổi giá sau này không đổi lịch sử.</span>
        </div>
      </div>

      {catalogError ? (
        <Alert type='error' showIcon title='Không tải được danh sách món' description={catalogError} />
      ) : null}
      {accessError ? (
        <Alert
          type='error'
          showIcon
          title='Không xác minh được quyền chốt ngày'
          description={accessError}
        />
      ) : null}
      {!accessLoading && !canWrite ? (
        <Alert
          type='info'
          showIcon
          title='Chế độ chỉ xem'
          description='Bạn có thể xem số lượng và doanh thu nhưng không thể sửa hoặc chốt ngày.'
        />
      ) : null}
      {dayError ? (
        <Alert
          type='warning'
          showIcon
          title='Chưa đồng bộ được ngày này'
          description={`${dayError} Dữ liệu đang nhập trên màn hình không bị xóa.`}
        />
      ) : null}
      {submitError ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          title='Chưa thể hoàn tất'
          description={submitError}
          action={
            totals.blocked.length > 0 ? (
              <Link href='/preparation'>Bổ sung mẻ đã làm</Link>
            ) : undefined
          }
        />
      ) : null}

      <div className='v2-two-column'>
        <main className='v2-stack' aria-busy={catalogLoading || dayLoading}>
          {catalogLoading || dayLoading ? (
            <Card className='surface-card'>
              <Skeleton active paragraph={{ rows: 8 }} />
            </Card>
          ) : skus.length === 0 ? (
            <Card className='surface-card v2-empty-state'>
              <ShoppingOutlined aria-hidden='true' />
              <Title level={4}>Chưa có món đang bán</Title>
              <Paragraph>Hãy tạo SKU và giá bán trước khi chốt ngày.</Paragraph>
              <Link href='/products'>Đi tới Món & giá</Link>
            </Card>
          ) : (
            skuGroups.map((group) => (
              <section key={group.code} aria-labelledby={`sales-group-${group.code}`}>
                <div className='v2-section-heading'>
                  <div>
                    <Text type='secondary'>Nhóm doanh thu</Text>
                    <Title level={4} id={`sales-group-${group.code}`}>
                      {group.name}
                    </Title>
                  </div>
                  <Tag>{group.code}</Tag>
                </div>
                <div className='v2-product-list'>
                  {group.skus.map((sku) => {
                    const line = lineBySku.get(sku.id);
                    const quantity = Number(line?.quantity ?? 0);
                    const unitPriceVnd = line?.unitPriceVnd ?? sku.unitPriceVnd;
                    const missingPrice = unitPriceVnd == null;
                    const stockBlocked =
                      sku.fulfillment === 'preproduced' &&
                      sku.availableQuantity != null &&
                      quantity > sku.availableQuantity;
                    return (
                      <Card
                        key={sku.id}
                        className={`surface-card v2-product-card${stockBlocked ? ' is-blocked' : ''}`}
                      >
                        <div className='v2-product-main'>
                          <div className='v2-product-copy'>
                            <Space size={[6, 4]} wrap>
                              <Text strong>{sku.name}</Text>
                              <Tag>{sku.code}</Tag>
                              {sku.fulfillment === 'preproduced' ? (
                                <Tag color='green'>Làm sẵn</Tag>
                              ) : null}
                              {locked && line ? quantitySourceTag(line.quantitySource) : null}
                              {missingPrice ? <Tag color='error'>Chưa có giá</Tag> : null}
                            </Space>
                            <Text type='secondary'>
                              {missingPrice ? 'Chưa thể bán' : `${formatVnd(unitPriceVnd)} / món`}
                              {sku.availableQuantity != null
                                ? ` · Còn ${sku.availableQuantity}`
                                : ''}
                            </Text>
                          </div>
                          <label className='v2-quantity-control'>
                            <span>Số lượng bán</span>
                            <InputNumber
                              min={0}
                              precision={0}
                              inputMode='numeric'
                              value={quantity}
                              disabled={readOnly || missingPrice}
                              onChange={(value) =>
                                updateLine(sku.id, { quantity: Number(value ?? 0) })
                              }
                              aria-label={`Số lượng ${sku.name} đã bán`}
                            />
                          </label>
                        </div>
                        <div className='v2-product-subtotal'>
                          <Text type='secondary'>Thành tiền</Text>
                          <Text strong>{formatVnd(quantity * Number(unitPriceVnd ?? 0))}</Text>
                        </div>
                        {stockBlocked ? (
                          <Alert
                            type='warning'
                            showIcon
                            title={`Vượt tồn ${quantity - Number(sku.availableQuantity)} hộp`}
                            description={
                              <Link href='/preparation'>Mở Chuẩn bị để bổ sung mẻ đã làm</Link>
                            }
                          />
                        ) : null}
                        <details className='v2-line-adjustments'>
                          <summary>Giảm giá hoặc hoàn tiền cho món này</summary>
                          <div className='v2-adjustment-grid'>
                            <label className='v2-field'>
                              <span>Giảm giá</span>
                              <InputNumber
                                min={0}
                                precision={0}
                                step={1_000}
                                inputMode='numeric'
                                formatter={formatVndInput}
                                parser={parseVndInput}
                                value={line?.discountVnd ?? 0}
                                disabled={readOnly}
                                onChange={(value) =>
                                  updateLine(sku.id, {
                                    discountVnd: Number(value ?? 0),
                                  })
                                }
                                aria-label={`Giảm giá ${sku.name}`}
                              />
                            </label>
                            <label className='v2-field'>
                              <span>Hoàn tiền</span>
                              <InputNumber
                                min={0}
                                precision={0}
                                step={1_000}
                                inputMode='numeric'
                                formatter={formatVndInput}
                                parser={parseVndInput}
                                value={line?.refundVnd ?? 0}
                                disabled={readOnly}
                                onChange={(value) =>
                                  updateLine(sku.id, { refundVnd: Number(value ?? 0) })
                                }
                                aria-label={`Hoàn tiền ${sku.name}`}
                              />
                            </label>
                          </div>
                        </details>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {unmatchedLines.length > 0 ? (
            <Card className='surface-card v2-history-lines' title='Dữ liệu lịch sử chưa gắn SKU'>
              <Alert
                type='info'
                showIcon
                title='Các dòng này được giữ nguyên snapshot; hệ thống không suy đoán xuống SKU.'
              />
              <ul>
                {unmatchedLines.map((line, index) => (
                  <li key={line.lineKey ?? `${line.skuCode ?? 'legacy'}-${index}`}>
                    <div>
                      <Text strong>{line.skuName ?? line.skuCode ?? 'Doanh thu lịch sử'}</Text>
                      <Space size={[5, 4]} wrap>
                        {quantitySourceTag(line.quantitySource)}
                        {line.businessLine?.name ? <Tag>{line.businessLine.name}</Tag> : null}
                      </Space>
                    </div>
                    <div>
                      <Text type='secondary'>{formatVnd(line.unitPriceVnd)} × {Number(line.quantity)}</Text>
                      <Text strong>{formatVnd(line.netRevenueVnd ?? line.grossRevenueVnd)}</Text>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className='surface-card' title='Tiền thực nhận'>
            <div className='v2-payment-grid'>
              <label className='v2-field'>
                <span><WalletOutlined /> Tiền mặt</span>
                <InputNumber
                  min={0}
                  precision={0}
                  step={1_000}
                  inputMode='numeric'
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  value={day.payments.cashVnd}
                  disabled={readOnly}
                  onChange={(value) => updatePayment('cashVnd', value)}
                  aria-label='Tiền mặt đã nhận'
                />
              </label>
              <label className='v2-field'>
                <span><BankOutlined /> Chuyển khoản</span>
                <InputNumber
                  min={0}
                  precision={0}
                  step={1_000}
                  inputMode='numeric'
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  value={day.payments.bankTransferVnd}
                  disabled={readOnly}
                  onChange={(value) => updatePayment('bankTransferVnd', value)}
                  aria-label='Tiền chuyển khoản đã nhận'
                />
              </label>
              <label className='v2-field'>
                <span>Phương thức khác</span>
                <InputNumber
                  min={0}
                  precision={0}
                  step={1_000}
                  inputMode='numeric'
                  formatter={formatVndInput}
                  parser={parseVndInput}
                  value={day.payments.otherVnd}
                  disabled={readOnly}
                  onChange={(value) => updatePayment('otherVnd', value)}
                  aria-label='Tiền nhận bằng phương thức khác'
                />
              </label>
            </div>
            <label className='v2-field v2-note-field'>
              <span>Ghi chú (không bắt buộc)</span>
              <Input.TextArea
                rows={3}
                value={day.note}
                disabled={readOnly}
                onChange={(event) =>
                  setDay((current) => ({ ...current, note: event.target.value }))
                }
                placeholder='Ví dụ: hoàn tiền, đơn biếu tặng…'
              />
            </label>
          </Card>
        </main>

        <aside className='v2-summary-column' aria-label='Tổng kết chốt ngày'>
          <Card className='surface-card v2-sticky-summary'>
            <Text type='secondary'>Doanh thu thuần</Text>
            <Title level={2}>{formatVnd(totals.netVnd)}</Title>
            <div className='v2-summary-list'>
              <div><span>Số món bán</span><strong>{totals.quantity}</strong></div>
              <div><span>Doanh thu gộp</span><strong>{formatVnd(totals.grossVnd)}</strong></div>
              <div><span>Giảm giá</span><strong>− {formatVnd(totals.discountVnd)}</strong></div>
              <div><span>Hoàn tiền</span><strong>− {formatVnd(totals.refundVnd)}</strong></div>
              <div><span>Đã thu</span><strong>{formatVnd(totals.collectedVnd)}</strong></div>
              <div className={totals.differenceVnd === 0 ? 'is-balanced' : 'is-unbalanced'}>
                <span>Chênh lệch</span>
                <strong>{formatVnd(totals.differenceVnd)}</strong>
              </div>
            </div>
            {!locked && canWrite ? (
              <Space orientation='vertical' className='v2-summary-actions'>
                <Button
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={handleSave}
                  disabled={catalogLoading || dayLoading}
                  block
                >
                  Lưu bản nháp
                </Button>
                {canClose ? (
                  <Button
                    type='primary'
                    icon={<CheckCircleOutlined />}
                    loading={saving}
                    disabled={
                      totals.quantity <= 0 ||
                      totals.differenceVnd !== 0 ||
                      totals.blocked.length > 0 ||
                      unmatchedLines.length > 0
                    }
                    onClick={handleCloseDay}
                    block
                  >
                    Chốt ngày
                  </Button>
                ) : null}
              </Space>
            ) : null}
            {locked ? <Alert type='success' showIcon title='Ngày này đã được chốt' /> : null}
            {locked && canReopen && unmatchedLines.length === 0 ? (
              <div className='v2-reopen-panel'>
                <label className='v2-field'>
                  <span>Lý do mở lại (bắt buộc)</span>
                  <Input.TextArea
                    rows={3}
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    placeholder='Ví dụ: cần sửa số lượng món nhập nhầm…'
                  />
                </label>
                <Button
                  icon={<EditOutlined />}
                  loading={saving}
                  disabled={reopenReason.trim().length < 5}
                  onClick={handleReopenDay}
                  block
                >
                  Mở lại ngày
                </Button>
              </div>
            ) : null}
            {locked && canReopen && unmatchedLines.length > 0 ? (
              <Alert
                type='warning'
                showIcon
                title='Snapshot legacy được khóa'
                description='Ngày có dòng chưa gắn SKU nên không mở lại bằng form v2.'
              />
            ) : null}
          </Card>
        </aside>
      </div>
      {!locked && canWrite ? (
        <div className='v2-mobile-action-dock' aria-label='Tổng kết và chốt ngày'>
          <div>
            <Text type='secondary'>Doanh thu thuần</Text>
            <Text strong>{formatVnd(totals.netVnd)}</Text>
          </div>
          {canClose ? (
            <Button
              type='primary'
              icon={<CheckCircleOutlined />}
              loading={saving}
              disabled={
                totals.quantity <= 0 ||
                totals.differenceVnd !== 0 ||
                totals.blocked.length > 0 ||
                unmatchedLines.length > 0
              }
              onClick={handleCloseDay}
            >
              Chốt ngày
            </Button>
          ) : (
            <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
              Lưu nháp
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
