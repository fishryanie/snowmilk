'use client';

import { Alert, App, Input, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { errorText } from '@/components/v2/api-client';
import { money, statusLabels, type AdminOrderSummary, type OrderStatus } from '@/lib/storefront-core/types';
import { saveOnline } from './shared';

export type OrderAction = { order: AdminOrderSummary; target: OrderStatus | 'delete' };

export function OrderActionDialog({ action, onClose, onChanged }: {
  action: OrderAction;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { message } = App.useApp();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { order, target } = action;
  const deleting = target === 'delete';
  const cancelling = target === 'cancelled';
  const label = deleting ? 'Xóa đơn' : cancelling ? 'Hủy đơn' : 'Cập nhật trạng thái';

  async function submit() {
    if (saving) return;
    if (cancelling && !note.trim()) {
      setError('Nhập lý do hủy để khách biết.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveOnline(`orders/${order.id}${deleting ? '/delete' : ''}`, deleting ? {} : { status: target, note: note.trim() });
      void message.success(deleting ? 'Đã xóa đơn hàng.' : 'Đã cập nhật trạng thái đơn cho khách.');
      onChanged();
      onClose();
    } catch (saveError) {
      setError(errorText(saveError, 'Không cập nhật được đơn hàng.'));
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={`${label} ${order.code}`}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={label}
      cancelText='Quay lại'
      confirmLoading={saving}
      okButtonProps={{ danger: deleting || cancelling }}
      cancelButtonProps={{ disabled: saving }}
      closable={!saving}
      mask={{ closable: !saving }}
      keyboard={!saving}>
      <Space orientation='vertical' size={16} style={{ width: '100%' }}>
        <Typography.Text>{order.customer.name} · {order.customer.phone} · {money(order.total)}</Typography.Text>
        {deleting ? (
          <Alert
            type='warning'
            showIcon
            title='Xóa vĩnh viễn đơn hàng và lịch sử của đơn?'
            description='Khách sẽ không còn tra cứu được đơn này. Nếu đơn đang xử lý, số lượng món sẽ được hoàn lại. Thao tác này không thực hiện hoàn tiền.'
          />
        ) : (
          <>
            <Typography.Text>{statusLabels[order.status]} → {statusLabels[target]}</Typography.Text>
            {target === 'paid' ? <Alert type='info' showIcon title='Chỉ xác nhận sau khi đã đối chiếu bill và nhận đủ tiền vào tài khoản tiệm.' /> : null}
            {target === 'completed' ? <Alert type='info' showIcon title='Xác nhận đã giao hàng; với đơn COD, cần thu đủ tiền trước khi hoàn tất.' /> : null}
            {cancelling ? <Alert type='warning' showIcon title='Số lượng món sẽ được hoàn lại. Nếu khách đã trả tiền, ghi rõ thỏa thuận hoàn tiền trong lý do hủy.' /> : null}
            <div>
              <label htmlFor='online-order-action-note'>{cancelling ? 'Lý do hủy (bắt buộc)' : 'Ghi chú cho khách'}</label>
              <Input.TextArea
                id='online-order-action-note'
                value={note}
                onChange={event => setNote(event.target.value)}
                maxLength={500}
                showCount
                rows={3}
                disabled={saving}
                style={{ marginTop: 8, marginBottom: 16 }}
              />
            </div>
          </>
        )}
        {error ? <Alert type='error' showIcon title={error} /> : null}
      </Space>
    </Modal>
  );
}
