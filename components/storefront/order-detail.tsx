'use client';

import { PictureOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Image, Input, Modal, Popconfirm, Skeleton, Space, Table, Timeline, Typography } from 'antd';
import { useState } from 'react';
import { useCurrentAccess } from '@/components/v2/access-context';
import { errorText, requestV2 } from '@/components/v2/api-client';
import {
  formatStamp,
  money,
  orderTransitions,
  paymentMethodLabels,
  statusLabels,
  type OrderStatus,
  type QuotedLine,
  type ShopOrder,
} from '@/lib/storefront-core/types';
import { OnlineError, OrderStatusTag, saveOnline, useOnlineQuery } from './shared';

const actionLabels: Partial<Record<OrderStatus, string>> = {
  paid: 'Xác nhận đã nhận tiền',
  preparing: 'Bắt đầu chuẩn bị',
  delivering: 'Bắt đầu giao hàng',
  completed: 'Xác nhận đã giao',
  cancelled: 'Hủy đơn',
};

function actionLabel(status: OrderStatus, order: ShopOrder) {
  return status === 'completed' && order.paymentMethod === 'cod' ? 'Xác nhận đã giao và thu đủ tiền' : actionLabels[status];
}

export function OnlineOrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useCurrentAccess();
  const { message } = App.useApp();
  const query = useOnlineQuery<ShopOrder>(`/api/storefront-admin/orders/${id}`, 15000);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const order = query.data;
  const nextStatuses = order ? orderTransitions[order.status] : [];

  async function showReceipt() {
    setReceiptLoading(true);
    setReceiptError(null);
    try {
      const result = await requestV2<{ image: string }>(`/api/storefront-admin/receipt/${id}`);
      setReceipt(result.image);
    } catch (loadError) {
      setReceiptError(errorText(loadError, 'Không tải được ảnh bill.'));
    } finally {
      setReceiptLoading(false);
    }
  }

  async function changeStatus(status: OrderStatus) {
    if (status === 'cancelled' && !note.trim()) {
      setError('Nhập lý do hủy trong ô ghi chú để khách biết.');
      return;
    }
    setSaving(status);
    setError(null);
    try {
      await saveOnline(`orders/${id}`, { status, note: note.trim() });
      setNote('');
      void message.success('Đã cập nhật trạng thái đơn cho khách.');
      onChanged();
      query.reload();
    } catch (saveError) {
      setError(errorText(saveError, 'Không cập nhật được đơn.'));
      void query.reload();
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal
      open
      title={order ? `Đơn ${order.code}` : 'Chi tiết đơn online'}
      onCancel={onClose}
      footer={null}
      width={860}
      closable={!saving}
      mask={{ closable: !saving }}>
      <Space orientation='vertical' size={20} style={{ width: '100%' }}>
        <OnlineError error={query.error} retry={() => void query.reload()} />
        {order ? (
          <>
            <Space wrap>
              <OrderStatusTag status={order.status} />
              <Typography.Text type='secondary'>Tạo lúc {formatStamp(order.createdAt)}</Typography.Text>
              <Button size='small' icon={<ReloadOutlined />} loading={query.loading} onClick={() => void query.reload()}>
                Làm mới đơn
              </Button>
            </Space>
            <Descriptions
              bordered
              size='small'
              column={1}
              items={[
                { key: 'name', label: 'Người nhận', children: order.customer.name },
                { key: 'phone', label: 'Điện thoại', children: <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a> },
                {
                  key: 'address',
                  label: 'Địa chỉ giao',
                  children: (
                    <Space orientation='vertical'>
                      <span>{order.customer.address}</span>
                      {order.customer.location ? (
                        <a
                          target='_blank'
                          rel='noreferrer'
                          href={`https://www.google.com/maps/search/?api=1&query=${order.customer.location.lat},${order.customer.location.lng}`}>
                          Mở vị trí giao trên bản đồ
                        </a>
                      ) : null}
                    </Space>
                  ),
                },
                { key: 'note', label: 'Khách ghi chú', children: order.customer.note || 'Không có' },
                { key: 'paymentMethod', label: 'Hình thức thanh toán', children: paymentMethodLabels[order.paymentMethod] },
              ]}
            />
            <Table<QuotedLine>
              rowKey='key'
              size='small'
              pagination={false}
              dataSource={order.quote.lines}
              scroll={{ x: 540 }}
              columns={[
                {
                  title: 'Món / topping',
                  key: 'name',
                  render: (_, line) => (
                    <>
                      <Typography.Text strong>{line.name}</Typography.Text>
                      {line.toppings.length ? (
                        <>
                          <br />
                          <Typography.Text type='secondary'>{line.toppings.map(topping => topping.name).join(', ')}</Typography.Text>
                        </>
                      ) : null}
                    </>
                  ),
                },
                { title: 'SL', dataIndex: 'quantity', width: 50 },
                { title: 'Đơn giá', dataIndex: 'unitPrice', render: (value: number) => money(value) },
                { title: 'Thành tiền', dataIndex: 'total', render: (value: number) => money(value) },
              ]}
            />
            <Descriptions
              column={1}
              size='small'
              items={[
                { key: 'subtotal', label: 'Tiền món', children: money(order.quote.subtotal) },
                { key: 'delivery', label: 'Phí giao hàng', children: money(order.quote.deliveryFee) },
                { key: 'total', label: 'Tổng thanh toán', children: <Typography.Text strong>{money(order.quote.total)}</Typography.Text> },
              ]}
            />
            {order.paymentMethod === 'cod' ? (
              <Alert
                type='info'
                showIcon
                title='Thanh toán khi nhận hàng (COD)'
                description={
                  order.status === 'cancelled'
                    ? 'Đơn đã hủy.'
                    : order.status === 'completed'
                      ? 'Đã xác nhận giao hàng và thu tiền.'
                      : `Cần thu ${money(order.quote.total)} khi giao. Chỉ hoàn tất đơn sau khi đã thu đủ tiền.`
                }
              />
            ) : (
              <div>
                <Typography.Title level={5}>Bill chuyển khoản của khách</Typography.Title>
                {order.hasReceipt ? (
                  <Button icon={<PictureOutlined />} loading={receiptLoading} onClick={() => void showReceipt()}>
                    {receipt ? 'Tải lại bill' : 'Xem ảnh bill'}
                  </Button>
                ) : (
                  <Typography.Text type='secondary'>Khách chưa gửi bill chuyển khoản.</Typography.Text>
                )}
                {receiptError ? <Alert type='error' showIcon title={receiptError} style={{ marginTop: 12 }} /> : null}
                {receipt ? (
                  <div className='storefront-receipt'>
                    <Image
                      src={receipt}
                      alt={`Bill chuyển khoản đơn ${order.code}`}
                      width={300}
                      style={{ maxWidth: '100%', maxHeight: 500, objectFit: 'contain' }}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {can('sales:write') && nextStatuses.length > 0 ? (
              <>
                {order.status === 'payment_review' ? (
                  <Alert type='info' showIcon title='Đối chiếu bill với giao dịch thực nhận trước khi xác nhận đã nhận tiền.' />
                ) : null}
                <div>
                  <label htmlFor='online-order-note'>Ghi chú cập nhật cho khách (bắt buộc khi hủy)</label>
                  <Input.TextArea
                    id='online-order-note'
                    value={note}
                    onChange={event => setNote(event.target.value)}
                    maxLength={500}
                    showCount
                    rows={3}
                    disabled={saving !== null}
                    style={{ marginTop: 8, marginBottom: 16 }}
                  />
                  {error ? <Alert type='error' showIcon title={error} style={{ marginBottom: 16 }} /> : null}
                  <Space wrap>
                    {nextStatuses.map(status => (
                      <Popconfirm
                        key={status}
                        title={status === 'paid' ? 'Đã nhận đủ tiền vào tài khoản tiệm?' : `${actionLabel(status, order)}?`}
                        description={
                          status === 'cancelled' && order.paymentMethod === 'bank_transfer' && ['paid', 'preparing', 'delivering'].includes(order.status)
                            ? 'Đơn đã thanh toán. Ghi rõ thỏa thuận hoàn tiền trong lý do hủy; thao tác này chỉ cập nhật trạng thái đơn.'
                            : undefined
                        }
                        okText='Xác nhận'
                        cancelText='Quay lại'
                        onConfirm={() => changeStatus(status)}>
                        <Button
                          type={status === 'cancelled' ? 'default' : 'primary'}
                          danger={status === 'cancelled'}
                          disabled={saving !== null || query.loading}
                          loading={saving === status}>
                          {actionLabel(status, order)}
                        </Button>
                      </Popconfirm>
                    ))}
                  </Space>
                </div>
              </>
            ) : null}
            <div>
              <Typography.Title level={5}>Lịch sử đơn hàng</Typography.Title>
              <Timeline
                items={order.events.map(event => ({
                  content: (
                    <>
                      <Typography.Text strong>{statusLabels[event.status]}</Typography.Text>
                      <br />
                      <Typography.Text type='secondary'>{formatStamp(event.at)}</Typography.Text>
                      {event.note ? <p style={{ whiteSpace: 'pre-wrap' }}>{event.note}</p> : null}
                    </>
                  ),
                }))}
              />
            </div>
          </>
        ) : query.loading ? (
          <Skeleton active />
        ) : null}
      </Space>
    </Modal>
  );
}
