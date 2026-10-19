'use client';

import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { formatStamp, money, orderStatuses, statusLabels, type ShopOrder } from '@/lib/storefront-core/types';
import { OnlineOrderDetail } from './order-detail';
import { OnlineError, OrderStatusTag, useOnlineQuery } from './shared';

type OrderList = { orders: ShopOrder[]; nextCursor: string | null };
type Filter = { phone: string; status: string; cursors: string[] };

export function OnlineOrders() {
  const [filter, setFilter] = useState<Filter>({ phone: '', status: 'all', cursors: [] });
  const [phoneDraft, setPhoneDraft] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
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
        <Table<ShopOrder>
          rowKey='id'
          dataSource={query.data?.orders ?? []}
          loading={query.loading}
          pagination={false}
          scroll={{ x: 920 }}
          locale={{ emptyText: query.error ? 'Chưa tải được đơn hàng. Hãy thử lại.' : 'Chưa có đơn phù hợp.' }}
          columns={[
            {
              title: 'Mã đơn / thời gian',
              key: 'code',
              render: (_, order) => (
                <>
                  <Typography.Text strong>{order.code}</Typography.Text>
                  <br />
                  <Typography.Text type='secondary'>{formatStamp(order.createdAt)}</Typography.Text>
                </>
              ),
            },
            {
              title: 'Khách hàng',
              key: 'customer',
              render: (_, order) => (
                <>
                  <Typography.Text>{order.customer.name}</Typography.Text>
                  <br />
                  <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
                </>
              ),
            },
            { title: 'Tổng tiền', key: 'total', render: (_, order) => money(order.quote.total) },
            {
              title: 'Thanh toán',
              key: 'paymentMethod',
              render: (_, order) => (
                <Tag color={order.paymentMethod === 'cod' ? 'gold' : 'blue'}>{order.paymentMethod === 'cod' ? 'COD · thu khi giao' : 'Chuyển khoản'}</Tag>
              ),
            },
            { title: 'Trạng thái', key: 'status', render: (_, order) => <OrderStatusTag status={order.status} /> },
            {
              title: 'Bill',
              key: 'receipt',
              render: (_, order) => (order.paymentMethod === 'cod' ? 'Thu khi giao' : order.hasReceipt ? <Tag color='blue'>Đã gửi bill</Tag> : 'Chưa có bill'),
            },
            {
              title: 'Thao tác',
              key: 'action',
              fixed: 'right',
              width: 120,
              render: (_, order) => (
                <Button icon={<EyeOutlined />} onClick={() => setSelected(order.id)}>
                  Chi tiết
                </Button>
              ),
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
      {selected ? <OnlineOrderDetail id={selected} onClose={() => setSelected(null)} onChanged={() => void query.reload()} /> : null}
    </>
  );
}
