'use client';

import {
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CoffeeOutlined,
  DeleteOutlined,
  DollarOutlined,
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Button, Card, Input, Select, Table, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { formatStamp, money, orderStatuses, orderTransitions, statusLabels, type AdminOrderSummary } from '@/lib/storefront-core/types';
import { OrderActionDialog, type OrderAction } from './order-action-dialog';
import { OnlineOrderDetail } from './order-detail';
import { OnlineError, useOnlineQuery } from './shared';

type OrderList = { orders: AdminOrderSummary[]; nextCursor: string | null };
type Filter = { phone: string; status: string; cursors: string[] };

const statusIcons = {
  awaiting_payment: <ClockCircleOutlined style={{ color: '#ad6800' }} />,
  payment_review: <SearchOutlined style={{ color: '#d46b08' }} />,
  paid: <DollarOutlined style={{ color: '#389e0d' }} />,
  preparing: <CoffeeOutlined style={{ color: '#08979c' }} />,
  delivering: <CarOutlined style={{ color: '#1677ff' }} />,
  completed: <CheckCircleOutlined style={{ color: '#389e0d' }} />,
  cancelled: <StopOutlined style={{ color: '#cf1322' }} />,
  expired: <CloseCircleOutlined style={{ color: '#8c8c8c' }} />,
};

export function OnlineOrders() {
  const { can } = useCurrentAccess();
  const canWrite = can('sales:write');
  const [filter, setFilter] = useState<Filter>({ phone: '', status: 'all', cursors: [] });
  const [phoneDraft, setPhoneDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<OrderAction | null>(null);
  const params = new URLSearchParams();
  if (filter.phone) params.set('phone', filter.phone);
  if (filter.status !== 'all') params.set('status', filter.status);
  if (filter.cursors.length) params.set('before', filter.cursors[filter.cursors.length - 1]);
  const query = useOnlineQuery<OrderList>(`/api/storefront-admin/orders?${params}`, 15000);

  return (
    <>
      <PageHeader
        title='Đơn hàng online'
        description='Theo dõi đơn COD, kiểm tra bill chuyển khoản và cập nhật quá trình chuẩn bị, giao hàng cho khách.'
        actions={
          <Button icon={<ReloadOutlined />} loading={query.loading} onClick={() => void query.reload()}>
            Làm mới
          </Button>
        }
      />
      <OnlineError error={query.error} retry={() => void query.reload()} />
      <Card>
        <div className='storefront-toolbar'>
          <Input.Search
            allowClear
            type='tel'
            aria-label='Tìm đơn theo số điện thoại'
            placeholder='Nhập đầy đủ số điện thoại khách'
            value={phoneDraft}
            onChange={event => {
              setPhoneDraft(event.target.value);
              if (!event.target.value) setFilter(current => ({ ...current, phone: '', cursors: [] }));
            }}
            onSearch={phone => setFilter(current => ({ ...current, phone: phone.trim(), cursors: [] }))}
            enterButton='Tìm'
          />
          <Select
            aria-label='Lọc trạng thái đơn'
            value={filter.status}
            onChange={status => setFilter(current => ({ ...current, status, cursors: [] }))}
            style={{ minWidth: 220 }}
            options={[{ value: 'all', label: 'Tất cả trạng thái' }, ...orderStatuses.map(status => ({ value: status, label: statusLabels[status] }))]}
          />
          <Typography.Text type='secondary'>Tự cập nhật mỗi 15 giây · 50 đơn/trang</Typography.Text>
        </div>
        <Table<AdminOrderSummary>
          bordered
          rowKey='id'
          size='small'
          dataSource={query.data?.orders ?? []}
          loading={query.loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: query.error ? 'Chưa tải được đơn hàng. Hãy thử lại.' : 'Chưa có đơn phù hợp.' }}
          columns={[
            {
              title: 'Mã đơn hàng',
              key: 'code',
              render: (_, order) => <Typography.Text strong>{order.code}</Typography.Text>,
            },
            { title: 'Ngày đặt',  key: 'createdAt', render: (_, order) => formatStamp(order.createdAt) },
            { title: 'Tổng tiền', key: 'total', align: 'right', render: (_, order) => money(order.total) },
            { title: 'Tên', dataIndex: ['customer', 'name'], key: 'name' },
            {
              title: 'SĐT',
              key: 'phone',
              render: (_, order) => <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>,
            },
            {
              title: 'Trạng thái',
              key: 'status',
              align: 'center',
              render: (_, order) => {
                const next = orderTransitions[order.status].find(status => status !== 'cancelled');
                const label = `${statusLabels[order.status]}${canWrite && next ? ` · Chuyển sang: ${statusLabels[next]}` : ''}`;
                return (
                  <Tooltip title={label}>
                    <span>
                      <Button
                        size='small'
                        aria-label={label}
                        icon={statusIcons[order.status]}
                        disabled={!canWrite || !next}
                        onClick={() => {
                          if (next) setAction({ order, target: next });
                        }}>
                        {statusLabels[order.status]}
                      </Button>
                    </span>
                  </Tooltip>
                );
              },
            },
            {
              key: 'delete',
              align: 'center',
              title: 'Actions',
              render: (_, order) => [
                <Tooltip title='Xóa đơn' key='delete'>
                  <Button
                    type='text'
                    size='small'
                    danger
                    aria-label={`Xóa đơn ${order.code}`}
                    icon={<DeleteOutlined />}
                    disabled={!canWrite}
                    onClick={() => setAction({ order, target: 'delete' })}
                  />
                </Tooltip>,
                <Tooltip title={orderTransitions[order.status].includes('cancelled') ? 'Hủy đơn' : 'Đơn đã kết thúc, không thể hủy'} key='cancel'>
                  <Button
                    type='text'
                    size='small'
                    danger
                    aria-label={`Hủy đơn ${order.code}`}
                    icon={<StopOutlined />}
                    disabled={!canWrite || !orderTransitions[order.status].includes('cancelled')}
                    onClick={() => setAction({ order, target: 'cancelled' })}
                  />
                </Tooltip>,
                <Tooltip title='Xem chi tiết' key='view'>
                  <Button type='text' size='small' aria-label={`Xem chi tiết đơn ${order.code}`} icon={<EyeOutlined />} onClick={() => setSelected(order.id)} />
                </Tooltip>,
              ],
            },
          ]}
        />
        <div className='storefront-pagination'>
          <Button
            disabled={!filter.cursors.length || query.loading}
            onClick={() => setFilter(current => ({ ...current, cursors: current.cursors.slice(0, -1) }))}>
            Trang trước
          </Button>
          <Typography.Text>Trang {filter.cursors.length + 1}</Typography.Text>
          <Button
            disabled={!query.data?.nextCursor || query.loading}
            onClick={() => {
              const cursor = query.data?.nextCursor;
              if (cursor) setFilter(current => ({ ...current, cursors: [...current.cursors, cursor] }));
            }}>
            Trang sau
          </Button>
        </div>
      </Card>
      {selected ? <OnlineOrderDetail key={selected} id={selected} onClose={() => setSelected(null)} onChanged={() => void query.reload()} /> : null}
      {action ? (
        <OrderActionDialog key={`${action.order.id}:${action.target}`} action={action} onClose={() => setAction(null)} onChanged={() => void query.reload()} />
      ) : null}
    </>
  );
}
