'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Image, Input, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { errorText } from '@/components/v2/api-client';
import { money, type ShopProduct } from '@/lib/storefront-core/types';
import { ProductEditor, availabilityOptions } from './product-editor';
import { OnlineError, saveOnline, useOnlineQuery, type Catalog } from './shared';

export function OnlineProducts() {
  const { can } = useCurrentAccess();
  const { message } = App.useApp();
  const query = useOnlineQuery<Catalog>('/api/storefront-admin/catalog');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [editor, setEditor] = useState<{ product: ShopProduct | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = can('catalog:write');
  const products = (query.data?.products ?? []).filter(
    p => (status === 'all' || p.status === status) && `${p.name} ${p.category}`.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN')),
  );

  async function deleteProduct(product: ShopProduct) {
    setDeleting(product.id);
    setError(null);
    try {
      await saveOnline(`products/${product.id}/delete`, { expectedRevision: product.revision });
      void message.success('Đã xóa món khỏi menu app.');
      query.reload();
    } catch (deleteError) {
      setError(errorText(deleteError, 'Không thể xóa món.'));
      void query.reload();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader
        title='Món trên app'
        description='Thêm, sửa, xóa món, ảnh, giá bán, topping và số lượng còn nhận đơn online.'
        actions={
          allowed ? (
            <Button type='primary' icon={<PlusOutlined />} onClick={() => setEditor({ product: null })}>
              Thêm món
            </Button>
          ) : undefined
        }
      />
      <Alert
        type='info'
        showIcon
        title='Đây là menu khách thấy trên app đặt món.'
        description='Giá và số lượng ở đây áp dụng cho bán online. Danh mục “Món & giá” vẫn dùng cho công thức và giá vốn.'
      />
      <OnlineError error={query.error} retry={() => void query.reload()} />
      {error ? <Alert type='error' showIcon title={error} closable onClose={() => setError(null)} /> : null}
      <Card>
        <div className='storefront-toolbar'>
          <Input.Search
            allowClear
            placeholder='Tìm tên món hoặc nhóm món'
            aria-label='Tìm món trên app'
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <Select
            aria-label='Lọc trạng thái món'
            value={status}
            onChange={setStatus}
            options={[{ value: 'all', label: 'Tất cả trạng thái' }, ...availabilityOptions]}
            style={{ minWidth: 170 }}
          />
          <Button icon={<ReloadOutlined />} loading={query.loading} onClick={() => void query.reload()}>
            Làm mới
          </Button>
        </div>
        <Table<ShopProduct>
          rowKey='id'
          dataSource={products}
          loading={query.loading}
          scroll={{ x: 860 }}
          pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: query.error ? 'Chưa tải được menu. Hãy thử lại.' : 'Chưa có món phù hợp.' }}
          columns={[
            {
              title: 'Món',
              key: 'name',
              render: (_, p) => (
                <div className='storefront-product-name'>
                  {p.imageUrl ? <Image src={p.imageUrl} alt={p.name} width={56} height={56} style={{ objectFit: 'cover', borderRadius: 10 }} /> : null}
                  <div>
                    <Typography.Text strong>{p.name}</Typography.Text>
                    <br />
                    <Typography.Text type='secondary'>
                      {p.category} · {p.unit}
                    </Typography.Text>
                  </div>
                </div>
              ),
            },
            { title: 'Giá bán', dataIndex: 'price', render: (value: number) => money(value) },
            { title: 'Còn bán', key: 'stock', render: (_, p) => (p.stock === null ? 'Không giới hạn' : `${p.stock} ${p.unit}`) },
            {
              title: 'Trạng thái',
              key: 'status',
              render: (_, p) => (
                <Tag color={p.status === 'hidden' ? 'default' : p.status === 'sold_out' || p.stock === 0 ? 'orange' : 'success'}>
                  {p.status === 'available' && p.stock === 0 ? 'Hết hàng' : availabilityOptions.find(o => o.value === p.status)?.label}
                </Tag>
              ),
            },
            { title: 'Thứ tự', dataIndex: 'sortOrder', width: 80 },
            ...(allowed
              ? [
                  {
                    title: 'Thao tác',
                    key: 'actions',
                    fixed: 'right' as const,
                    width: 190,
                    render: (_: unknown, p: ShopProduct) => (
                      <Space>
                        <Button icon={<EditOutlined />} disabled={deleting !== null} onClick={() => setEditor({ product: p })}>
                          Sửa
                        </Button>
                        <Popconfirm
                          title={`Xóa món “${p.name}”?`}
                          description='Món sẽ được gỡ khỏi menu. Các đơn đã đặt vẫn giữ thông tin món.'
                          okText='Xóa món'
                          cancelText='Giữ lại'
                          okButtonProps={{ danger: true }}
                          onConfirm={() => deleteProduct(p)}>
                          <Button danger icon={<DeleteOutlined />} loading={deleting === p.id} disabled={deleting !== null}>
                            Xóa
                          </Button>
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      {editor ? (
        <ProductEditor
          product={editor.product}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void query.reload();
          }}
        />
      ) : null}
    </>
  );
}
