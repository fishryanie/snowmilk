'use client';

import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { useState } from 'react';
import { errorText } from '@/components/v2/api-client';
import { getMaxToppings, type ShopProduct } from '@/lib/storefront-core/types';
import { OnlineImageUpload, saveOnline } from './shared';

type ProductValues = Omit<ShopProduct, 'id' | 'revision'>;

export const availabilityOptions = [
  { value: 'available', label: 'Đang bán' },
  { value: 'sold_out', label: 'Tạm ngừng bán' },
  { value: 'hidden', label: 'Ẩn khỏi app' },
];

export function ProductEditor({ product, onClose, onSaved }: { product: ShopProduct | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ProductValues>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlimitedToppings, setUnlimitedToppings] = useState(() => product ? getMaxToppings(product) === null : false);
  const initial: ProductValues = product
    ? {
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        imagePosition: product.imagePosition,
        badge: product.badge,
        unit: product.unit,
        status: product.status,
        toppings: product.toppings,
        maxToppings: getMaxToppings(product) ?? 1,
        sortOrder: product.sortOrder,
      }
    : {
        name: '',
        category: 'Sữa',
        description: '',
        price: 0,
        imageUrl: '',
        imagePosition: 'center',
        badge: '',
        unit: 'ly',
        status: 'available',
        toppings: [],
        maxToppings: 1,
        sortOrder: 0,
      };

  async function save(values: ProductValues) {
    if (uploading) return;
    setSaving(true);
    setError(null);
    try {
      await saveOnline(product ? `products/${product.id}` : 'products', {
        ...values,
        maxToppings: unlimitedToppings ? null : values.maxToppings,
        ...(product ? { expectedRevision: product.revision } : {}),
      });
      void message.success(product ? 'Đã cập nhật món trên app.' : 'Đã thêm món lên app.');
      onSaved();
    } catch (saveError) {
      setError(errorText(saveError, 'Không lưu được món.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={product ? `Sửa món: ${product.name}` : 'Thêm món lên app'}
      width={760}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText='Lưu món'
      cancelText='Đóng'
      confirmLoading={saving}
      okButtonProps={{ disabled: uploading }}
      cancelButtonProps={{ disabled: saving || uploading }}
      closable={!saving && !uploading}
      mask={{ closable: !saving && !uploading }}>
      <Form form={form} initialValues={initial} layout='vertical' onFinish={values => void save(values)} disabled={saving}>
        {error ? <Alert type='error' showIcon title={error} style={{ marginBottom: 20 }} /> : null}
        <Form.Item name='name' label='Tên món' rules={[{ required: true, min: 2, whitespace: true, message: 'Nhập tên món từ 2 ký tự.' }]}>
          <Input maxLength={120} />
        </Form.Item>
        <div className='storefront-field-grid'>
          <Form.Item name='category' label='Nhóm món' rules={[{ required: true, whitespace: true, message: 'Nhập nhóm món.' }]}>
            <Input maxLength={60} placeholder='Sữa tuyết, Sữa tươi…' />
          </Form.Item>
          <Form.Item name='unit' label='Đơn vị bán' rules={[{ required: true, whitespace: true, message: 'Nhập đơn vị bán.' }]}>
            <Input maxLength={40} placeholder='ly, chai, phần…' />
          </Form.Item>
          <Form.Item name='price' label='Giá bán (đ)' rules={[{ required: true, message: 'Nhập giá bán.' }]}>
            <InputNumber min={0} max={10000000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name='status' label='Trạng thái'>
            <Select options={availabilityOptions} />
          </Form.Item>
          <Form.Item name='sortOrder' label='Thứ tự trên menu' rules={[{ required: true, message: 'Nhập thứ tự hiển thị.' }]}>
            <InputNumber min={0} max={10000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name='description' label='Mô tả món'>
          <Input.TextArea rows={3} maxLength={800} showCount />
        </Form.Item>
        <Form.Item name='badge' label='Nhãn trên ảnh'>
          <Input maxLength={30} placeholder='Bán chạy, Món mới…' />
        </Form.Item>
        <Form.Item name='imageUrl' label='Ảnh món'>
          <OnlineImageUpload kind='product' disabled={saving} onBusyChange={setUploading} />
        </Form.Item>
        <Form.Item name='imagePosition' label='Vị trí ảnh trong khung'>
          <Select
            options={[
              { value: 'center', label: 'Chính giữa' },
              { value: 'top', label: 'Phía trên' },
              { value: 'bottom', label: 'Phía dưới' },
            ]}
          />
        </Form.Item>
        <Typography.Title level={5}>Topping tùy chọn</Typography.Title>
        <Form.Item label='Số lượng chọn tối đa' extra='Giới hạn số loại topping khách có thể chọn cho mỗi phần.'>
          <Space wrap align='start'>
            <Form.Item
              name='maxToppings'
              rules={unlimitedToppings ? [] : [{ required: true, type: 'integer', min: 1, message: 'Nhập số nguyên từ 1 trở lên.' }]}
              style={{ marginBottom: 0 }}>
              <InputNumber min={1} precision={0} disabled={saving || unlimitedToppings} aria-label='Số lượng topping chọn tối đa' />
            </Form.Item>
            <Checkbox checked={unlimitedToppings} onChange={event => setUnlimitedToppings(event.target.checked)}>
              Không giới hạn
            </Checkbox>
          </Space>
        </Form.Item>
        <Form.List name='toppings'>
          {(fields, { add, remove }) => (
            <Space orientation='vertical' size={12} style={{ width: '100%' }}>
              {fields.map(({ key, name, ...rest }) => (
                <div key={key} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                  <Form.Item {...rest} name={[name, 'id']} hidden>
                    <Input />
                  </Form.Item>
                  <div className='storefront-field-grid'>
                    <Form.Item {...rest} name={[name, 'name']} label='Tên topping' rules={[{ required: true, whitespace: true, message: 'Nhập tên topping.' }]}>
                      <Input maxLength={60} />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'price']} label='Giá thêm (đ)' rules={[{ required: true, message: 'Nhập giá topping.' }]}>
                      <InputNumber min={0} max={10000000} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <Space wrap>
                    <Form.Item {...rest} name={[name, 'available']} label='Cho phép chọn topping' valuePropName='checked' style={{ marginBottom: 0 }}>
                      <Switch />
                    </Form.Item>
                    <Button danger type='text' icon={<MinusCircleOutlined />} onClick={() => remove(name)}>
                      Xóa topping
                    </Button>
                  </Space>
                </div>
              ))}
              <Button
                icon={<PlusOutlined />}
                disabled={fields.length >= 12}
                onClick={() => add({ id: crypto.randomUUID(), name: '', price: 0, available: true })}>
                Thêm topping
              </Button>
            </Space>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
