'use client';

import {
  CheckCircleOutlined,
  FilterOutlined,
  LineChartOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Skeleton,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { formatDate, formatNumber, formatVnd } from '@/lib/formatters';
import {
  businessDateToday,
  dateDaysAgo,
  errorText,
  requestV2,
} from '@/components/v2/api-client';

const { Text, Title } = Typography;

type RevenueTotals = {
  grossRevenueVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  collectedVnd: number;
  cogsVnd?: number | null;
  profitVnd?: number | null;
  costCompleteness?: string | number | null;
};

type BusinessLineRevenue = {
  id?: string;
  code: string;
  name: string;
  grossRevenueVnd?: number;
  discountVnd?: number;
  refundVnd?: number;
  netRevenueVnd: number;
  quantity?: number;
  children?: BusinessLineRevenue[];
};

type DailyRevenue = Partial<RevenueTotals> & {
  businessDate?: string;
  date?: string;
  quantity?: number;
  badges?: string[];
};

type ProductRevenue = {
  skuId?: string;
  code?: string;
  name: string;
  businessLineCode?: string;
  businessLineName?: string;
  quantity?: number;
  grossRevenueVnd?: number;
  netRevenueVnd: number;
};

type DataQualityItem =
  | string
  | {
      code?: string;
      label?: string;
      message?: string;
      severity?: 'info' | 'warning' | 'error' | string;
      count?: number;
    };

type RevenueReport = {
  totals: RevenueTotals;
  businessLines: BusinessLineRevenue[];
  daily: DailyRevenue[];
  products: ProductRevenue[];
  dataQuality: DataQualityItem[];
};

type CatalogSku = {
  id: string;
  code: string;
  name: string;
  businessLine: { id?: string; code: string; name: string } | null;
};

type CatalogResponse = { skus: CatalogSku[] };

type ReportFilters = {
  from: string;
  to: string;
  businessLineId: string;
  skuId: string;
};

function flattenBusinessLines(lines: BusinessLineRevenue[]): BusinessLineRevenue[] {
  const result: BusinessLineRevenue[] = [];
  for (const line of lines) {
    result.push(line);
    if (line.children?.length) result.push(...flattenBusinessLines(line.children));
  }
  return result;
}

function reportUrl(filters: ReportFilters, includeDetailFilters: boolean) {
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (includeDetailFilters && filters.businessLineId) {
    query.set('businessLineId', filters.businessLineId);
  }
  if (includeDetailFilters && filters.skuId) query.set('skuId', filters.skuId);
  return `/api/v2/reports/revenue?${query.toString()}`;
}

function completenessLabel(value: RevenueTotals['costCompleteness']) {
  if (value === null || value === undefined || value === 'missing') {
    return <Tag color='warning'>Chưa đủ dữ liệu giá vốn</Tag>;
  }
  if (value === 'complete' || value === 1 || value === 100) {
    return <Tag color='success'>Giá vốn đầy đủ</Tag>;
  }
  if (typeof value === 'number') {
    return <Tag color='warning'>Giá vốn {Math.round(value <= 1 ? value * 100 : value)}%</Tag>;
  }
  return <Tag color='warning'>Giá vốn một phần</Tag>;
}

function qualityCopy(item: DataQualityItem) {
  if (typeof item === 'string') return item;
  const copy = item.message ?? item.label ?? item.code ?? 'Cần kiểm tra dữ liệu';
  return item.count ? `${copy} (${formatNumber(item.count)})` : copy;
}

export function RevenueReportWorkspace() {
  const initialFilters: ReportFilters = {
    from: dateDaysAgo(29),
    to: businessDateToday(),
    businessLineId: '',
    skuId: '',
  };
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(initialFilters);
  const [catalog, setCatalog] = useState<CatalogSku[]>([]);
  const [allReport, setAllReport] = useState<RevenueReport | null>(null);
  const [detailReport, setDetailReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestV2<CatalogResponse>('/api/v2/catalog/skus', { signal: controller.signal })
      .then((result) => setCatalog(result.skus ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const hasDetailFilter = Boolean(
      appliedFilters.businessLineId || appliedFilters.skuId,
    );
    const overallRequest = requestV2<RevenueReport>(
      reportUrl(appliedFilters, false),
      { signal: controller.signal },
    );
    const detailRequest = hasDetailFilter
      ? requestV2<RevenueReport>(reportUrl(appliedFilters, true), {
          signal: controller.signal,
        })
      : overallRequest;

    Promise.all([overallRequest, detailRequest])
      .then(([overall, detail]) => {
        setAllReport(overall);
        setDetailReport(detail);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(
          `${errorText(requestError, 'Không thể tải báo cáo.')} Báo cáo gần nhất vẫn được giữ trên màn hình.`,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [appliedFilters]);

  const businessLineOptions = useMemo(() => {
    const byKey = new Map<string, { value: string; label: string }>();
    for (const line of flattenBusinessLines(allReport?.businessLines ?? [])) {
      if (!line.id) continue;
      const value = line.id;
      byKey.set(value, { value, label: `${line.name} · ${line.code}` });
    }
    for (const sku of catalog) {
      if (!sku.businessLine?.id) continue;
      const value = sku.businessLine.id;
      if (!byKey.has(value)) {
        byKey.set(value, {
          value,
          label: `${sku.businessLine.name} · ${sku.businessLine.code}`,
        });
      }
    }
    return [...byKey.values()];
  }, [allReport?.businessLines, catalog]);

  const productOptions = useMemo(
    () =>
      catalog
        .filter((sku) => {
          if (!sku.businessLine) return !draftFilters.businessLineId;
          if (!draftFilters.businessLineId) return true;
          return sku.businessLine.id === draftFilters.businessLineId;
        })
        .map((sku) => ({ value: sku.id, label: `${sku.name} · ${sku.code}` })),
    [catalog, draftFilters.businessLineId],
  );

  function applyFilters() {
    if (!draftFilters.from || !draftFilters.to || draftFilters.from > draftFilters.to) {
      setError('Khoảng ngày không hợp lệ. Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return;
    }
    setRefreshing(true);
    setError(null);
    setAppliedFilters({ ...draftFilters });
  }

  const detailIsFiltered = Boolean(
    appliedFilters.businessLineId || appliedFilters.skuId,
  );
  const details = detailReport ?? allReport;

  return (
    <div className='page-wrap v2-workspace report-v2'>
      <PageHeader
        title='Báo cáo doanh thu'
        description='Theo dõi riêng Sữa Tuyết, Sữa tươi và Đồ ăn sáng, đồng thời luôn giữ tổng doanh thu toàn Bếp ở đầu báo cáo.'
        actions={completenessLabel(allReport?.totals.costCompleteness)}
      />

      <Card className='surface-card v2-filter-card'>
        <div className='v2-report-filters'>
          <label className='v2-field'>
            <span>Từ ngày</span>
            <Input
              type='date'
              value={draftFilters.from}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, from: event.target.value }))
              }
            />
          </label>
          <label className='v2-field'>
            <span>Đến ngày</span>
            <Input
              type='date'
              value={draftFilters.to}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
          <label className='v2-field'>
            <span>Nhóm doanh thu</span>
            <Select
              allowClear
              value={draftFilters.businessLineId || undefined}
              placeholder='Tất cả nhóm'
              options={businessLineOptions}
              onChange={(value) =>
                setDraftFilters((current) => ({
                  ...current,
                  businessLineId: value ?? '',
                  skuId: '',
                }))
              }
              aria-label='Lọc nhóm doanh thu'
            />
          </label>
          <label className='v2-field'>
            <span>Món</span>
            <Select
              showSearch
              allowClear
              optionFilterProp='label'
              value={draftFilters.skuId || undefined}
              placeholder='Tất cả món'
              options={productOptions}
              onChange={(value) =>
                setDraftFilters((current) => ({ ...current, skuId: value ?? '' }))
              }
              aria-label='Lọc theo món'
            />
          </label>
          <Button
            type='primary'
            icon={<FilterOutlined />}
            loading={refreshing}
            onClick={applyFilters}
          >
            Xem báo cáo
          </Button>
        </div>
      </Card>

      {error ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setError(null)}
          title='Chưa thể cập nhật báo cáo'
          description={error}
        />
      ) : null}

      {loading && !allReport ? (
        <div className='v2-stack'>
          <div className='v2-report-kpis'>
            {Array.from({ length: 4 }, (_, index) => (
              <Card className='surface-card' key={index}><Skeleton active paragraph={{ rows: 2 }} /></Card>
            ))}
          </div>
          <Card className='surface-card'><Skeleton active paragraph={{ rows: 8 }} /></Card>
        </div>
      ) : allReport ? (
        <>
          <section className='v2-report-overall' aria-labelledby='overall-revenue-title'>
            <div className='v2-section-heading'>
              <div>
                <Text type='secondary'>Không bị thay đổi bởi bộ lọc nhóm/món</Text>
                <Title level={3} id='overall-revenue-title'>Tổng toàn Bếp</Title>
              </div>
              <Tag color='green'>Tất cả món</Tag>
            </div>
            <div className='v2-report-kpis'>
              <Card className='surface-card v2-total-revenue-card'>
                <Statistic title='Doanh thu thuần' value={allReport.totals.netRevenueVnd} formatter={(value) => formatVnd(Number(value))} />
              </Card>
              <Card className='surface-card'>
                <Statistic title='Doanh thu gộp' value={allReport.totals.grossRevenueVnd} formatter={(value) => formatVnd(Number(value))} />
              </Card>
              <Card className='surface-card'>
                <Statistic title='Giảm giá + hoàn' value={allReport.totals.discountVnd + allReport.totals.refundVnd} formatter={(value) => formatVnd(Number(value))} />
              </Card>
              <Card className='surface-card'>
                <Statistic title='Đã thu' value={allReport.totals.collectedVnd} formatter={(value) => formatVnd(Number(value))} />
                <Text type={allReport.totals.collectedVnd === allReport.totals.netRevenueVnd ? 'success' : 'danger'}>
                  Chênh lệch {formatVnd(allReport.totals.collectedVnd - allReport.totals.netRevenueVnd)}
                </Text>
              </Card>
            </div>
          </section>

          <section aria-labelledby='business-line-title'>
            <div className='v2-section-heading'>
              <div>
                <Text type='secondary'>Doanh thu được phân riêng nhưng cộng chung ở trên</Text>
                <Title level={3} id='business-line-title'>Theo nhóm kinh doanh</Title>
              </div>
            </div>
            <div className='v2-business-line-grid'>
              {allReport.businessLines.map((line) => (
                <Card className='surface-card v2-business-line-card' key={line.id ?? line.code}>
                  <div className='v2-business-line-heading'>
                    <div>
                      <Text type='secondary'>{line.code}</Text>
                      <Title level={4}>{line.name}</Title>
                    </div>
                    <strong>{formatVnd(line.netRevenueVnd)}</strong>
                  </div>
                  {line.children?.length ? (
                    <div className='v2-business-line-children'>
                      {line.children.map((child) => (
                        <div key={child.id ?? child.code}>
                          <span>{child.name}</span>
                          <strong>{formatVnd(child.netRevenueVnd)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>

          {allReport.dataQuality.length > 0 ? (
            <section aria-labelledby='data-quality-title'>
              <div className='v2-section-heading'>
                <div>
                  <Text type='secondary'>Giúp đọc đúng dữ liệu legacy và ước tính</Text>
                  <Title level={3} id='data-quality-title'>Chất lượng dữ liệu</Title>
                </div>
              </div>
              <div className='v2-quality-list'>
                {allReport.dataQuality.map((item, index) => {
                  const severity = typeof item === 'string' ? 'info' : item.severity;
                  return (
                    <Alert
                      key={typeof item === 'string' ? `${item}-${index}` : item.code ?? index}
                      type={severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info'}
                      showIcon
                      icon={severity === 'warning' ? <WarningOutlined /> : undefined}
                      title={qualityCopy(item)}
                    />
                  );
                })}
              </div>
            </section>
          ) : (
            <Alert
              type='success'
              showIcon
              icon={<CheckCircleOutlined />}
              title='Không có cảnh báo chất lượng dữ liệu trong kỳ này'
            />
          )}

          <section aria-labelledby='detail-report-title'>
            <div className='v2-section-heading'>
              <div>
                <Text type='secondary'>
                  {detailIsFiltered ? 'Đang áp dụng bộ lọc nhóm hoặc món' : 'Tất cả nhóm và món'}
                </Text>
                <Title level={3} id='detail-report-title'>Chi tiết kỳ báo cáo</Title>
              </div>
              {detailIsFiltered ? <Tag color='processing'>Đang lọc</Tag> : null}
            </div>
            <div className='v2-report-detail-kpis'>
              <div><span>Doanh thu thuần</span><strong>{formatVnd(details?.totals.netRevenueVnd)}</strong></div>
              <div><span>Giá vốn</span><strong>{details?.totals.cogsVnd == null ? 'Chưa đủ dữ liệu' : formatVnd(details.totals.cogsVnd)}</strong></div>
              <div><span>Lợi nhuận</span><strong>{details?.totals.profitVnd == null ? 'Chưa đủ dữ liệu' : formatVnd(details.totals.profitVnd)}</strong></div>
            </div>

            <Card className='surface-card v2-report-table-card' title='Theo ngày'>
              <div className='v2-table-scroll'>
                <table className='v2-data-table'>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th>Số lượng</th>
                      <th>Doanh thu gộp</th>
                      <th>Giảm / hoàn</th>
                      <th>Doanh thu thuần</th>
                      <th>Đã thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details?.daily ?? []).map((row, index) => (
                      <tr key={row.businessDate ?? row.date ?? index}>
                        <td>
                          <strong>{formatDate(row.businessDate ?? row.date)}</strong>
                          {row.badges?.length ? (
                            <div className='v2-daily-badges'>
                              {row.badges.map((badge) => (
                                <Tag
                                  key={badge}
                                  color={
                                    badge === 'Số lượng ước tính'
                                      ? 'warning'
                                      : badge === 'Số lượng thực tế'
                                        ? 'success'
                                        : 'blue'
                                  }
                                >
                                  {badge}
                                </Tag>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td>{formatNumber(row.quantity)}</td>
                        <td>{formatVnd(row.grossRevenueVnd)}</td>
                        <td>{formatVnd(Number(row.discountVnd ?? 0) + Number(row.refundVnd ?? 0))}</td>
                        <td><strong>{formatVnd(row.netRevenueVnd)}</strong></td>
                        <td>{formatVnd(row.collectedVnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(details?.daily.length ?? 0) === 0 ? (
                  <div className='v2-table-empty'>Không có dữ liệu trong khoảng ngày đã chọn.</div>
                ) : null}
              </div>
            </Card>

            <Card className='surface-card v2-report-table-card' title='Theo món'>
              <div className='v2-table-scroll'>
                <table className='v2-data-table'>
                  <thead>
                    <tr>
                      <th>Món</th>
                      <th>Nhóm</th>
                      <th>Số lượng</th>
                      <th>Doanh thu gộp</th>
                      <th>Doanh thu thuần</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details?.products ?? []).map((product, index) => (
                      <tr key={product.skuId ?? product.code ?? index}>
                        <td><strong>{product.name}</strong><br /><Text type='secondary'>{product.code}</Text></td>
                        <td>{product.businessLineName ?? product.businessLineCode ?? '—'}</td>
                        <td>{formatNumber(product.quantity)}</td>
                        <td>{formatVnd(product.grossRevenueVnd)}</td>
                        <td><strong>{formatVnd(product.netRevenueVnd)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(details?.products.length ?? 0) === 0 ? (
                  <div className='v2-table-empty'>Chưa có dòng món thực tế cho bộ lọc này.</div>
                ) : null}
              </div>
            </Card>
          </section>
        </>
      ) : (
        <Card className='surface-card v2-empty-state'>
          <LineChartOutlined aria-hidden='true' />
          <Title level={4}>Chưa có dữ liệu báo cáo</Title>
          <Text type='secondary'>Thử chọn lại khoảng ngày hoặc tải lại trang.</Text>
        </Card>
      )}
    </div>
  );
}
