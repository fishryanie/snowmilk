'use client';

import {
  FireOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Empty, Skeleton, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useApiData } from '@/hooks/use-api-data';
import type { ToppingRankingReport } from '@/lib/calculations/topping-ranking';
import { formatDate, formatNumber } from '@/lib/formatters';

const { Text, Title } = Typography;

const EMPTY_REPORT: ToppingRankingReport = {
  asOfDate: '',
  updatedAt: '',
  totalKg: 0,
  purchaseCount: 0,
  excludedPurchaseCount: 0,
  excludedUnits: [],
  ranking: [],
};

type ToppingRankingCardProps = {
  refreshToken: number;
};

export function ToppingRankingCard({ refreshToken }: ToppingRankingCardProps) {
  const url = `/api/reports/topping-ranking?refresh=${refreshToken}`;
  const {
    data: report,
    loading,
    usingFallback,
    refresh,
  } = useApiData<ToppingRankingReport>(url, EMPTY_REPORT, {
    refreshIntervalMs: 60_000,
  });
  const leader = report.ranking.find((row) => row.totalKg > 0);
  const leaderKg = leader?.totalKg ?? 0;
  const ranking = report.ranking;

  return (
    <Card
      className='surface-card topping-ranking-card'
      title={
        <div className='topping-ranking-title'>
          <span className='topping-ranking-title-icon' aria-hidden>
            <TrophyOutlined />
          </span>
          <span>
            <span>Topping bán chạy theo lượng nhập</span>
            <Text type='secondary'>Lũy kế đến {report.asOfDate ? formatDate(report.asOfDate) : 'hôm nay'}</Text>
          </span>
          <Tooltip title='Đây là chỉ báo nhu cầu dựa trên khối lượng nhập, không phải số ly bán thực tế.'>
            <InfoCircleOutlined className='topping-ranking-info' aria-label='Giải thích cách xếp hạng' />
          </Tooltip>
        </div>
      }
      extra={
        <div className='topping-ranking-actions'>
          <Tag color={usingFallback ? 'warning' : 'success'}>{usingFallback ? 'Mất kết nối' : 'Live · 1 phút'}</Tag>
          <Button
            type='text'
            size='small'
            icon={<ReloadOutlined />}
            loading={loading}
            aria-label='Làm mới bảng xếp hạng topping'
            onClick={refresh}
          />
        </div>
      }>
      {usingFallback ? (
        <Alert
          type='warning'
          showIcon
          title='Chưa thể tải bảng xếp hạng trực tiếp từ MongoDB.'
          style={{ marginBottom: 14 }}
        />
      ) : null}
      {report.excludedPurchaseCount > 0 ? (
        <Alert
          type='warning'
          showIcon
          title={`${formatNumber(report.excludedPurchaseCount)} lần nhập chưa được xếp hạng`}
          description={`Không thể quy đổi các đơn vị ${report.excludedUnits.join(', ')} sang kg.`}
          style={{ marginBottom: 14 }}
        />
      ) : null}

      {loading && report.ranking.length === 0 ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : ranking.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu nhập topping' />
      ) : (
        <div className='topping-ranking-layout' aria-live='polite'>
          {leader ? (
            <div className='topping-ranking-leader'>
              <div className='topping-ranking-leader-icon' aria-hidden>
                <FireOutlined />
              </div>
              <div>
                <Text type='secondary'>Đang dẫn đầu</Text>
                <Title level={3}>{leader.name}</Title>
                <Text>
                  <strong>{formatNumber(leader.totalKg)} kg</strong> · {formatNumber(leader.purchaseCount)} lần nhập
                </Text>
              </div>
              <div className='topping-ranking-leader-share'>
                <strong>{formatNumber(leader.sharePercent)}%</strong>
                <span>tổng lượng topping</span>
              </div>
            </div>
          ) : null}

          <div className='topping-ranking-list' role='list' aria-label='Bảng xếp hạng topping theo khối lượng nhập'>
            {ranking.map((row) => {
              const relativeWidth = leaderKg > 0 ? (row.totalKg / leaderKg) * 100 : 0;
              return (
                <div className='topping-ranking-row' role='listitem' key={`${row.code}:${row.name}`}>
                  <span className='topping-ranking-rank' data-rank={row.rank}>
                    {row.rank}
                  </span>
                  <div className='topping-ranking-item'>
                    <div className='topping-ranking-item-heading'>
                      <span>
                        <Text strong>{row.name}</Text>
                        {row.code ? <Text type='secondary'>{row.code}</Text> : null}
                      </span>
                      <span className='topping-ranking-value'>
                        <Text strong>{formatNumber(row.totalKg)} kg</Text>
                        <Text type='secondary'>{formatNumber(row.sharePercent)}%</Text>
                      </span>
                    </div>
                    <div className='topping-ranking-track' aria-hidden>
                      <span
                        className='topping-ranking-bar'
                        style={{ width: `${Math.max(row.totalKg > 0 ? 3 : 0, relativeWidth)}%` }}
                      />
                    </div>
                    <div className='topping-ranking-meta'>
                      <span>{formatNumber(row.purchaseCount)} lần nhập</span>
                      <span>{row.lastPurchaseDate ? `Gần nhất ${formatDate(row.lastPurchaseDate)}` : 'Chưa nhập hàng'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className='topping-ranking-footer'>
            <Text type='secondary'>
              Tổng {formatNumber(report.totalKg)} kg từ {formatNumber(report.purchaseCount)} lần nhập
            </Text>
            <Text type='secondary'>
              {report.updatedAt ? `Cập nhật lúc ${dayjs(report.updatedAt).format('HH:mm DD/MM/YYYY')}` : 'Đang cập nhật'}
            </Text>
          </div>
        </div>
      )}
    </Card>
  );
}
