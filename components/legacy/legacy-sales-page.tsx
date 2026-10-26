'use client';

import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Empty, Form, Input, InputNumber, Modal, Skeleton, Space, Table, Tooltip } from 'antd';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useCurrentAccess } from '@/components/v2/access-context';
import { useApiQuery } from '@/hooks/use-api-data';
import { apiFetch } from '@/lib/api-client';
import { formatDate, formatNumber, formatVnd, formatVndInput, parseVndInput } from '@/lib/formatters';
import { isVietnamDateKey, vietnamDateKey } from '@/lib/vietnam-date';

type SaleRecord = {
  saleDate: string;
  cashReceived: number;
  bankTransferReceived: number;
};
type History = { history: SaleRecord[]; nextCursor: string | null };

export default function SalesPage() {
  const { message, modal } = App.useApp();
  const { can, error: accessError } = useCurrentAccess();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors.at(-1);
  const history = useApiQuery<History>(`/api/sales?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { refreshIntervalMs: 0 });
  const [form] = Form.useForm<SaleRecord>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const canSave = can('sales:close');

  function openForm(record?: SaleRecord) {
    form.resetFields();
    form.setFieldsValue(
      record
        ? {
            ...record,
            saleDate: vietnamDateKey(new Date(record.saleDate)),
          }
        : { saleDate: vietnamDateKey(new Date()), cashReceived: 0, bankTransferReceived: 0 },
    );
    setEditing(Boolean(record));
    setSubmitError(null);
    setOpen(true);
  }

  async function save(values: SaleRecord, overwrite: boolean) {
    setSaving(true);
    setSubmitError(null);
    try {
      const response = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, overwrite }),
      });
      const body = await response.json();
      if (response.status === 409 && !overwrite) {
        modal.confirm({
          title: 'Ngày này đã được chốt',
          content: body.message,
          okText: 'Cập nhật',
          cancelText: 'Hủy',
          onOk: () => save(values, true),
        });
        return;
      }
      if (!response.ok || !body.success) throw new Error(body.message ?? 'Không thể lưu chốt ngày.');
      message.success(body.message);
      setOpen(false);
      setCursors([null]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể lưu chốt ngày.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='page-wrap sales-page'>
      <PageHeader
        title='Chốt doanh thu'
        description='Lưu ngày, tiền mặt và tiền chuyển khoản.'
        actions={
          <Button type='primary' icon={<PlusOutlined />} disabled={!canSave} onClick={() => openForm()}>
            <span className='sales-create-desktop-label'>Chốt doanh thu</span>
            <span className='sales-create-mobile-label'>Chốt ngày</span>
          </Button>
        }
      />
      {accessError ? <Alert type='error' showIcon title={accessError} /> : null}
      {history.error ? (
        <Alert
          type='error'
          showIcon
          title='Không tải được lịch sử chốt ngày'
          description={history.error.message}
          action={<Button onClick={history.refresh}>Thử lại</Button>}
        />
      ) : null}
      <Table<SaleRecord>
        bordered
        size='small'
        className='sales-history-table rounded-2xl!'
        rowKey='saleDate'
        loading={history.loading}
        dataSource={history.data?.history ?? []}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có ngày chốt doanh thu' }}
        columns={[
          {
            title: 'Ngày',
            dataIndex: 'saleDate',
            render: formatDate,
          },
          { title: 'Tiền CK', dataIndex: 'bankTransferReceived', align: 'right', render: formatVnd },
          { title: 'Tiền mặt', dataIndex: 'cashReceived', align: 'right', render: formatVnd },
          {
            title: 'Tổng tiền',
            key: 'total',
            align: 'right',
            render: (_, record) => <strong>{formatVnd(record.cashReceived + record.bankTransferReceived)}</strong>,
          },
          {
            key: 'edit',
            align: 'center',
            fixed: 'right',
            width: 60,
            render: (_, record) => (
              <Tooltip title='Sửa'>
                <Button
                  type='text'
                  size='small'
                  icon={<EditOutlined />}
                  aria-label={`Sửa chốt ngày ${formatDate(record.saleDate)}`}
                  disabled={!canSave}
                  onClick={() => openForm(record)}
                />
              </Tooltip>
            ),
          },
        ]}
      />
      <div className='sales-mobile-history' aria-busy={history.loading}>
        {history.loading ? (
          <Card className='surface-card'>
            <Skeleton active title paragraph={{ rows: 3 }} />
          </Card>
        ) : history.data?.history.length ? (
          <div className='sales-mobile-table'>
            <div className='sales-mobile-list-heading' aria-hidden='true'>
              <span>Ngày</span>
              <span>TM / CK (₫)</span>
              <span>Tổng (₫)</span>
            </div>
            <ul className='sales-mobile-list' aria-label='Lịch sử chốt doanh thu'>
              {history.data.history.map(record => (
                <li className='sales-mobile-row' key={record.saleDate}>
                  <button
                    type='button'
                    className='sales-mobile-edit'
                    aria-label={`Sửa chốt ngày ${formatDate(record.saleDate)}`}
                    disabled={!canSave}
                    onClick={() => openForm(record)}>
                    <span className='sales-mobile-date'>
                      {formatDate(record.saleDate).slice(0, 5)} <EditOutlined aria-hidden />
                    </span>
                    <span className='sales-mobile-year'>{formatDate(record.saleDate).slice(6)}</span>
                  </button>
                  <dl className='sales-mobile-amounts'>
                    <div>
                      <dt aria-label='Tiền mặt'>TM</dt>
                      <dd>{formatNumber(record.cashReceived)}</dd>
                    </div>
                    <div>
                      <dt aria-label='Tiền chuyển khoản'>CK</dt>
                      <dd>{formatNumber(record.bankTransferReceived)}</dd>
                    </div>
                  </dl>
                  <strong className='sales-mobile-total' aria-label={`Tổng tiền ${formatVnd(record.cashReceived + record.bankTransferReceived)}`}>
                    {formatNumber(record.cashReceived + record.bankTransferReceived)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Card className='surface-card'>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={history.error ? 'Chưa tải được lịch sử chốt ngày' : 'Chưa có ngày chốt doanh thu'}
            />
          </Card>
        )}
      </div>
      <Space className='sales-pagination'>
        <Button disabled={cursors.length === 1 || history.loading} onClick={() => setCursors(current => current.slice(0, -1))}>
          Trang trước
        </Button>
        <span>Trang {cursors.length}</span>
        <Button
          disabled={!history.data?.nextCursor || history.loading || Boolean(history.error)}
          onClick={() => setCursors(current => [...current, history.data!.nextCursor])}>
          Trang sau
        </Button>
      </Space>
      <Modal
        title={editing ? 'Sửa chốt doanh thu' : 'Chốt doanh thu'}
        open={open}
        okText='Lưu chốt ngày'
        cancelText='Hủy'
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        mask={{ closable: !saving }}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}>
        <Form form={form} layout='vertical' onFinish={values => save(values, editing)} disabled={saving}>
          <Form.Item
            name='saleDate'
            label='Ngày'
            rules={[
              { required: true, message: 'Hãy chọn ngày.' },
              { validator: (_, value) => (isVietnamDateKey(value) ? Promise.resolve() : Promise.reject(new Error('Ngày không hợp lệ.'))) },
            ]}>
            <Input type='date' disabled={editing || saving} />
          </Form.Item>
          <Form.Item
            name='cashReceived'
            label='Tiền mặt'
            rules={[
              { required: true, message: 'Hãy nhập tiền mặt, có thể nhập 0.' },
              { type: 'integer', min: 0, max: 1_000_000_000_000, message: 'Nhập số tiền nguyên, không âm.' },
            ]}>
            <InputNumber
              min={0}
              max={1_000_000_000_000}
              precision={0}
              step={1000}
              inputMode='numeric'
              formatter={formatVndInput}
              parser={parseVndInput}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name='bankTransferReceived'
            label='Tiền chuyển khoản'
            rules={[
              { required: true, message: 'Hãy nhập tiền chuyển khoản, có thể nhập 0.' },
              { type: 'integer', min: 0, max: 1_000_000_000_000, message: 'Nhập số tiền nguyên, không âm.' },
            ]}>
            <InputNumber
              min={0}
              max={1_000_000_000_000}
              precision={0}
              step={1000}
              inputMode='numeric'
              formatter={formatVndInput}
              parser={parseVndInput}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
        {submitError ? <Alert type='error' showIcon title={submitError} /> : null}
      </Modal>
    </div>
  );
}
