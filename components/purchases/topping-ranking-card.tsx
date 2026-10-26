'use client';

import { InfoCircleOutlined, ReloadOutlined, TrophyOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Skeleton, Typography } from 'antd';
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
  const { data: report, loading, usingFallback, refresh } = useApiData<ToppingRankingReport>(
    `/api/reports/topping-ranking?refresh=${refreshToken}`,
    EMPTY_REPORT,
    { refreshIntervalMs: 60_000 },
  );
  const leader = report.ranking.find(row => row.totalKg > 0);
  const activeCount = report.ranking.filter(row => row.purchaseCount > 0).length;

  return (
    <div className='topping-workspace'>
      <div className='topping-heading'>
        <div>
          <Title level={2}>Tổng quan topping</Title>
          <Text type='secondary'>Lũy kế lượng nhập đến {report.asOfDate ? formatDate(report.asOfDate) : 'hôm nay'}</Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh} aria-label='Làm mới bảng xếp hạng topping'>
          Làm mới
        </Button>
      </div>

      {usingFallback ? (
        <Alert
          type='warning'
          showIcon
          title='Chưa tải được dữ liệu topping'
          description='Vui lòng thử làm mới sau ít phút.'
        />
      ) : null}

      {loading && report.ranking.length === 0 ? (
        <Card className='surface-card'><Skeleton active paragraph={{ rows: 6 }} /></Card>
      ) : (
        <>
          <div className='topping-overview-grid'>
            <div className='topping-metrics'>
              <div className='topping-metric'>
                <Text type='secondary'>Tổng lượng nhập</Text>
                <strong>{formatNumber(report.totalKg)} <span>kg</span></strong>
              </div>
              <div className='topping-metric'>
                <Text type='secondary'>Topping đã nhập</Text>
                <strong>{formatNumber(activeCount)} <span>loại</span></strong>
              </div>
              <div className='topping-metric'>
                <Text type='secondary'>Số lần nhập</Text>
                <strong>{formatNumber(report.purchaseCount)} <span>lần</span></strong>
              </div>
            </div>
            {leader ? (
              <div className='topping-spotlight'>
                <div className='topping-spotlight-label'><TrophyOutlined aria-hidden /> Nhập nhiều nhất</div>
                <div className='topping-spotlight-main'>
                  <Title level={3}>{leader.name}</Title>
                  <strong>{formatNumber(leader.totalKg)} <span>kg</span></strong>
                </div>
                <div className='topping-spotlight-track' aria-hidden>
                  <span style={{ width: `${leader.sharePercent}%` }} />
                </div>
                <div className='topping-spotlight-meta'>
                  <span>{formatNumber(leader.sharePercent)}% tổng lượng nhập</span>
                  <span>{formatNumber(leader.purchaseCount)} lần nhập</span>
                </div>
              </div>
            ) : null}
          </div>

          <Card className='surface-card topping-ranking-card'>
            <div className='topping-list-heading'>
              <div>
                <Title level={3}>Xếp hạng theo khối lượng</Title>
                <Text type='secondary'>{formatNumber(report.ranking.length)} loại topping trong danh mục</Text>
              </div>
              <span className='topping-unit-label'>Đơn vị: kg</span>
            </div>

            {report.ranking.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='Chưa có dữ liệu nhập topping' />
            ) : (
              <div className='topping-ranking-list' role='list' aria-label='Bảng xếp hạng topping theo khối lượng nhập'>
                {report.ranking.map(row => (
                  <div className='topping-ranking-row' role='listitem' key={`${row.code}:${row.name}`}>
                    <span className='topping-ranking-rank' data-rank={row.rank}>{String(row.rank).padStart(2, '0')}</span>
                    <div className='topping-ranking-item'>
                      <div className='topping-ranking-item-heading'>
                        <div className='topping-ranking-name'>
                          <Text strong>{row.name}</Text>
                          {row.code ? <Text type='secondary'>{row.code}</Text> : null}
                        </div>
                        <div className='topping-ranking-value'>
                          <Text strong>{formatNumber(row.totalKg)} <span>kg</span></Text>
                          <Text type='secondary'>{formatNumber(row.sharePercent)}%</Text>
                        </div>
                      </div>
                      <div className='topping-ranking-track' aria-hidden>
                        <span
                          className='topping-ranking-bar'
                          data-leader={row.rank === 1}
                          style={{ width: `${leader ? (row.totalKg / leader.totalKg) * 100 : 0}%` }}
                        />
                      </div>
                      <div className='topping-ranking-meta'>
                        <span>{formatNumber(row.purchaseCount)} lần nhập</span>
                        <span>{row.lastPurchaseDate ? `Gần nhất ${formatDate(row.lastPurchaseDate)}` : 'Chưa nhập hàng'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className='topping-ranking-footer'>
              <span><InfoCircleOutlined aria-hidden /> Xếp hạng dựa trên lượng nhập, không phải số ly bán.</span>
              <span>{report.updatedAt ? `Cập nhật ${dayjs(report.updatedAt).format('HH:mm · DD/MM/YYYY')}` : 'Chưa có dữ liệu cập nhật'}</span>
            </div>
          </Card>
        </>
      )}

      {report.excludedPurchaseCount > 0 ? (
        <Alert
          type='warning'
          showIcon
          title={`${formatNumber(report.excludedPurchaseCount)} lần nhập chưa thể quy đổi sang kg`}
          description={`Đơn vị chưa hỗ trợ: ${report.excludedUnits.join(', ')}. Các lần nhập này chưa được tính vào bảng xếp hạng.`}
        />
      ) : null}
    </div>
  );
}
