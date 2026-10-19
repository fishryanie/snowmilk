'use client';

import { SaveOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Form, Input, InputNumber, Skeleton, Space, Switch } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { errorText } from '@/components/v2/api-client';
import type { ShopSettings } from '@/lib/storefront-core/types';
import { OnlineError, OnlineImageUpload, saveOnline, useOnlineQuery } from './shared';

function SettingsForm({ initial }: { initial: ShopSettings }) {
  const { can } = useCurrentAccess();
  const { message } = App.useApp();
  const [form] = Form.useForm<ShopSettings>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrImage = Form.useWatch('qrImage', form) ?? initial.qrImage;
  const allowed = can('settings:manage');

  async function save(values: ShopSettings) {
    if (!allowed || uploading) return;
    setSaving(true);
    setError(null);
    try {
      await saveOnline('settings', values);
      void message.success('Đã lưu thông tin tiệm và QR chuyển khoản lên app.');
    } catch (saveError) {
      setError(errorText(saveError, 'Không thể lưu cài đặt.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Form form={form} initialValues={initial} layout='vertical' onFinish={values => void save(values)} disabled={!allowed || saving}>
      <Space orientation='vertical' size={20} style={{ width: '100%' }}>
        {!allowed ? <Alert type='info' showIcon title='Chỉ chủ quán có quyền thay đổi thông tin tiệm và QR.' /> : null}
        {error ? <Alert type='error' showIcon title={error} /> : null}
        <div className='storefront-settings-grid'>
          <Space orientation='vertical' size={20} style={{ width: '100%' }}>
            <Card title='Thông tin hiển thị trên app'>
              <Form.Item name='name' label='Tên tiệm' rules={[{ required: true, min: 2, whitespace: true, message: 'Nhập tên tiệm từ 2 ký tự.' }]}>
                <Input maxLength={80} />
              </Form.Item>
              <Form.Item name='tagline' label='Dòng giới thiệu ngắn'>
                <Input maxLength={160} />
              </Form.Item>
              <Form.Item name='description' label='Giới thiệu menu'>
                <Input.TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
              <Form.Item name='phone' label='Số điện thoại tiệm' extra='Khách dùng số này để liên hệ khi cần hỗ trợ đơn hàng.'>
                <Input type='tel' maxLength={30} autoComplete='tel' />
              </Form.Item>
              <Form.Item name='address' label='Địa chỉ tiệm'>
                <Input.TextArea rows={2} maxLength={300} />
              </Form.Item>
              <Form.Item name='isOpen' label='Nhận đơn online' valuePropName='checked'>
                <Switch checkedChildren='Đang mở' unCheckedChildren='Tạm ngừng' />
              </Form.Item>
            </Card>
            <Card title='Giao hàng'>
              <div className='storefront-field-grid'>
                <Form.Item name='deliveryFee' label='Phí giao hàng (đ)' rules={[{ required: true, message: 'Nhập phí giao hàng.' }]}>
                  <InputNumber min={0} max={10000000} precision={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name='freeDeliveryFrom'
                  label='Miễn phí giao từ (đ)'
                  extra='Nhập 0 nếu không áp dụng.'
                  rules={[{ required: true, message: 'Nhập mức miễn phí giao hàng.' }]}>
                  <InputNumber min={0} max={10000000} precision={0} style={{ width: '100%' }} />
                </Form.Item>
              </div>
              <Form.Item name='deliveryNote' label='Lưu ý khu vực / thời gian giao'>
                <Input.TextArea rows={3} maxLength={300} showCount />
              </Form.Item>
            </Card>
          </Space>
          <Card title='QR chuyển khoản của tiệm'>
            <Space orientation='vertical' size={16} style={{ width: '100%' }}>
              <Alert
                type={qrImage ? 'info' : 'warning'}
                showIcon
                title={qrImage ? 'Khách sẽ quét ảnh QR này để chuyển khoản.' : 'Chưa có QR: khách vẫn có thể đặt COD; thanh toán chuyển khoản chưa sẵn sàng.'}
                description='Chọn ảnh QR đúng tài khoản nhận tiền của tiệm, kiểm tra ảnh rồi bấm Lưu cài đặt.'
              />
              <Form.Item name='qrImage' label='Ảnh QR chuyển khoản'>
                <OnlineImageUpload kind='qr' disabled={!allowed || saving} onBusyChange={setUploading} />
              </Form.Item>
              <Form.Item name='paymentNote' label='Hướng dẫn chuyển khoản'>
                <Input.TextArea rows={3} maxLength={300} showCount />
              </Form.Item>
            </Space>
          </Card>
        </div>
        {allowed ? (
          <Button type='primary' htmlType='submit' icon={<SaveOutlined />} loading={saving} disabled={uploading}>
            Lưu cài đặt
          </Button>
        ) : null}
      </Space>
    </Form>
  );
}

export function OnlineSettings() {
  const query = useOnlineQuery<ShopSettings>('/api/storefront-admin/settings');
  return (
    <>
      <PageHeader title='Shop & QR chuyển khoản' description='Cập nhật thông tin tiệm, cách giao hàng và QR nhận tiền hiển thị trên app đặt món.' />
      <OnlineError error={query.error} retry={() => void query.reload()} />
      {query.data ? <SettingsForm initial={query.data} /> : query.loading ? <Skeleton active /> : null}
    </>
  );
}
