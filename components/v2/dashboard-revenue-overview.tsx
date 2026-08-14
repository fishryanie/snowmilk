'use client';

import { Alert, Card, Skeleton, Statistic, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { businessDateToday, errorText, requestV2 } from '@/components/v2/api-client';
import { formatNumber, formatVnd } from '@/lib/formatters';

const { Text, Title } = Typography;

type RevenueLine = {
  id?: string;
  code: string;
  name: string;
  quantity?: number;
  netRevenueVnd: number;
  children?: RevenueLine[];
};

type QualityItem = string | { code?: string; label?: string; count?: number };

type DashboardRevenue = {
  totals: {
    grossRevenueVnd: number;
    discountVnd: number;
    refundVnd: number;
    netRevenueVnd: number;
    collectedVnd: number;
    cogsVnd?: number | null;
    profitVnd?: number | null;
    costCompleteness?: string | number | null;
  };
  businessLines: RevenueLine[];
  dataQuality: QualityItem[];
};

function qualityCount(items: QualityItem[], code: string) {
  return items.reduce((total, item) => {
    if (typeof item === 'string') return total;
    return item.code === code ? total + Number(item.count ?? 0) : total;
  }, 0);
}

export function DashboardRevenueOverview() {
  const today = businessDateToday();
  const from = `${today.slice(0, 7)}-01`;
  const [report, setReport] = useState<DashboardRevenue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestV2<DashboardRevenue>(
      `/api/v2/reports/revenue?${new URLSearchParams({ from, to: today })}`,
      { signal: controller.signal },
    )
      .then((value) => {
        setReport(value);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(errorText(requestError, 'Không tải được doanh thu toàn Bếp.'));
      });
    return () => controller.abort();
  }, [from, today]);

  const quantityQuality = useMemo(() => {
    if (!report) return { actual: 0, estimated: 0 };
    return {
      actual: qualityCount(report.dataQuality, 'actual_quantity'),
      estimated: qualityCount(report.dataQuality, 'estimated_quantity'),
    };
  }, [report]);

  if (error) {
    return (
      <Alert
        className='v2-dashboard-overview'
        type='warning'
        showIcon
        title='Tổng doanh thu v2 chưa đồng bộ'
        description={error}
      />
    );
  }

  if (!report) {
    return (
      <Card className='surface-card v2-dashboard-overview'>
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }

  return (
    <section className='v2-dashboard-overview' aria-labelledby='v2-dashboard-revenue-title'>
      <div className='v2-section-heading'>
        <div>
          <Text type='secondary'>Tháng này · mọi món và mọi nhóm doanh thu</Text>
          <Title level={3} id='v2-dashboard-revenue-title'>Doanh thu toàn Bếp</Title>
        </div>
        <Tag color='green'>Dữ liệu v2</Tag>
      </div>

      <div className='v2-dashboard-primary-grid'>
        <Card className='surface-card v2-total-revenue-card'>
          <Statistic
            title='1. Doanh thu thuần tất cả món'
            value={report.totals.netRevenueVnd}
            formatter={(value) => formatVnd(Number(value))}
          />
          <Text type='secondary'>Gộp Sữa + Đồ ăn sáng + các nhóm mở rộng sau này</Text>
        </Card>
        {report.businessLines.map((line, index) => (
          <Card className='surface-card v2-business-line-card' key={line.id ?? line.code}>
            <Text type='secondary'>{index + 2}. {line.code}</Text>
            <Title level={4}>{line.name}</Title>
            <strong className='v2-dashboard-line-total'>{formatVnd(line.netRevenueVnd)}</strong>
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

      <div className='v2-dashboard-secondary-grid'>
        <Card className='surface-card'>
          <Text type='secondary'>Giảm giá · hoàn tiền · tiền đã thu</Text>
          <dl className='v2-batch-metrics'>
            <div><dt>Giảm giá</dt><dd>{formatVnd(report.totals.discountVnd)}</dd></div>
            <div><dt>Hoàn tiền</dt><dd>{formatVnd(report.totals.refundVnd)}</dd></div>
            <div><dt>Đã thu</dt><dd>{formatVnd(report.totals.collectedVnd)}</dd></div>
            <div><dt>Chênh lệch</dt><dd>{formatVnd(report.totals.collectedVnd - report.totals.netRevenueVnd)}</dd></div>
          </dl>
        </Card>
        <Card className='surface-card'>
          <Text type='secondary'>Số lượng & chất lượng dữ liệu</Text>
          <div className='v2-dashboard-quality-tags'>
            <Tag color='success'>Số lượng thực tế · {formatNumber(quantityQuality.actual)} dòng</Tag>
            {quantityQuality.estimated > 0 ? (
              <Tag color='warning'>Số lượng ước tính · {formatNumber(quantityQuality.estimated)} dòng</Tag>
            ) : null}
          </div>
        </Card>
        <Card className='surface-card'>
          <Text type='secondary'>Giá vốn & lợi nhuận</Text>
          <Title level={4}>
            {report.totals.profitVnd == null ? 'Chưa đủ dữ liệu' : formatVnd(report.totals.profitVnd)}
          </Title>
          <Text type='secondary'>
            Giá vốn {report.totals.cogsVnd == null ? 'chưa hoàn chỉnh' : formatVnd(report.totals.cogsVnd)}
          </Text>
        </Card>
      </div>
    </section>
  );
}
