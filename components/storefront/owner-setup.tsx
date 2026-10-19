'use client';

import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { errorText, requestV2 } from '@/components/v2/api-client';
import { normalizeBootstrapToken } from '@/lib/auth/bootstrap-token';

type SetupValues = { name: string; email: string; password: string; token: string };

export function OwnerSetup({ ready, organizationId }: { ready: boolean; organizationId: string }) {
  const [form] = Form.useForm<SetupValues>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createOwner({ token, ...values }: SetupValues) {
    setSaving(true);
    setError(null);
    try {
      await requestV2('/api/v2/auth/bootstrap-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bootstrap-token': normalizeBootstrapToken(token) },
        body: JSON.stringify({ ...values, organizationId }),
      });
      form.resetFields();
      setDone(true);
    } catch (setupError) {
      setError(errorText(setupError, 'Không thể tạo tài khoản chủ quán.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className='auth-page'>
      <Card className='auth-card' variant='borderless'>
        <Typography.Title level={3}>Thiết lập chủ quán lần đầu</Typography.Title>
        <Space orientation='vertical' size={16} style={{ width: '100%' }}>
          {!ready ? (
            <Alert
              type='warning'
              showIcon
              title='Cửa hàng online chưa được thiết lập trên server.'
              description='Người quản trị server cần hoàn tất cấu hình cửa hàng và cấp mã thiết lập một lần. Sau đó tải lại trang để tạo tài khoản chủ quán.'
            />
          ) : done ? (
            <Alert
              type='success'
              showIcon
              title='Đã tạo tài khoản chủ quán.'
              description='Bạn có thể đăng nhập bằng email và mật khẩu vừa đăng ký để quản lý món, QR và đơn hàng.'
            />
          ) : (
            <>
              <Typography.Paragraph>
                Chỉ dùng khi tiệm chưa có tài khoản chủ quán. Nhập mã thiết lập một lần do người quản trị server cung cấp.
              </Typography.Paragraph>
              {error ? <Alert type='error' showIcon title={error} /> : null}
              <Form form={form} layout='vertical' disabled={saving} onFinish={values => void createOwner(values)}>
                <Form.Item name='name' label='Tên chủ quán' rules={[{ required: true, min: 2, whitespace: true, message: 'Nhập tên từ 2 ký tự.' }]}>
                  <Input maxLength={100} autoComplete='name' />
                </Form.Item>
                <Form.Item name='email' label='Email đăng nhập' rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ.' }]}>
                  <Input type='email' autoComplete='email' />
                </Form.Item>
                <Form.Item name='password' label='Mật khẩu' rules={[{ required: true, min: 10, message: 'Mật khẩu cần ít nhất 10 ký tự.' }]}>
                  <Input.Password maxLength={128} autoComplete='new-password' />
                </Form.Item>
                <Form.Item
                  name='token'
                  label='Mã thiết lập một lần'
                  extra='Lấy giá trị AUTH_BOOTSTRAP_TOKEN trong .env.local của server này. Có thể dán cả dòng AUTH_BOOTSTRAP_TOKEN=…'
                  normalize={normalizeBootstrapToken}
                  rules={[
                    { required: true, whitespace: true, message: 'Nhập mã thiết lập được cấp.' },
                    { min: 24, message: 'Hãy dán giá trị mã sau dấu =, không nhập tên biến AUTH_BOOTSTRAP_TOKEN.' },
                  ]}>
                  <Input.Password autoComplete='off' placeholder='Dán mã thiết lập hoặc cả dòng cấu hình' />
                </Form.Item>
                <Button block type='primary' htmlType='submit' loading={saving}>
                  Tạo tài khoản chủ quán
                </Button>
              </Form>
            </>
          )}
          <Link href='/sign-in?next=%2Fstorefront%2Forders'>
            <Button block type={done ? 'primary' : 'default'}>
              Đăng nhập quản trị
            </Button>
          </Link>
        </Space>
      </Card>
    </main>
  );
}
