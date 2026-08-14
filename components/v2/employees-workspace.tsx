'use client';

import {
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useCurrentAccess } from '@/components/v2/access-context';
import { errorText, requestV2 } from '@/components/v2/api-client';
import { PageHeader } from '@/components/common/page-header';

const { Paragraph, Text, Title } = Typography;

type Membership = {
  id?: string;
  _id?: string;
  version: number;
  name?: string;
  userName?: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
  status: 'active' | 'suspended' | 'invited' | string;
  locationIds?: string[];
};

type MembershipListResponse = Membership[] | { memberships: Membership[] };
type MembershipMutationResponse = Membership | { membership: Membership };
type CreateValues = {
  name: string;
  email: string;
  password: string;
  role: 'staff' | 'viewer';
};

function membershipId(membership: Membership) {
  return membership.id ?? membership._id ?? '';
}

function normalizeList(value: MembershipListResponse) {
  return Array.isArray(value) ? value : value.memberships ?? [];
}

function normalizeMembership(value: MembershipMutationResponse) {
  return 'membership' in value ? value.membership : value;
}

function roleCopy(role: Membership['role']) {
  if (role === 'owner') return 'Chủ quán';
  if (role === 'staff') return 'Nhân viên';
  return 'Chỉ xem';
}

function statusTag(status: Membership['status']) {
  if (status === 'active') return <Tag color='success'>Đang hoạt động</Tag>;
  if (status === 'suspended') return <Tag color='error'>Đã tạm khóa</Tag>;
  return <Tag color='processing'>{status === 'invited' ? 'Đã mời' : status}</Tag>;
}

function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const values = new Uint32Array(14);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

export function EmployeesWorkspace() {
  const { message } = App.useApp();
  const { can, loading: accessLoading, error: accessError } = useCurrentAccess();
  const [form] = Form.useForm<CreateValues>();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const allowed = can('team:manage');

  useEffect(() => {
    if (accessLoading || !allowed) return;
    const controller = new AbortController();
    requestV2<MembershipListResponse>('/api/v2/memberships', {
      signal: controller.signal,
    })
      .then((value) => {
        setMemberships(normalizeList(value));
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(errorText(requestError, 'Không tải được danh sách nhân viên.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessLoading, allowed, refreshKey]);

  function openCreate() {
    form.setFieldsValue({
      name: '',
      email: '',
      password: temporaryPassword(),
      role: 'staff',
    });
    setModalOpen(true);
  }

  async function createMember(values: CreateValues) {
    setSaving(true);
    setError(null);
    try {
      await requestV2<MembershipMutationResponse>('/api/v2/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, locationIds: [] }),
      });
      setModalOpen(false);
      form.resetFields();
      setRefreshKey((value) => value + 1);
      message.success('Đã tạo tài khoản và thông tin đăng nhập tạm thời.');
    } catch (requestError) {
      const copy = errorText(
        requestError,
        'Không thể tạo tài khoản. Thông tin đang nhập vẫn được giữ.',
      );
      setError(copy);
      message.error(copy);
    } finally {
      setSaving(false);
    }
  }

  async function updateMembership(
    membership: Membership,
    patch: Partial<Pick<Membership, 'role' | 'status' | 'locationIds'>>,
  ) {
    const id = membershipId(membership);
    if (!id) return;
    setUpdatingId(id);
    setError(null);
    try {
      const value = await requestV2<MembershipMutationResponse>(
        `/api/v2/memberships/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: membership.version,
            role: patch.role ?? membership.role,
            status: patch.status ?? membership.status,
            locationIds: patch.locationIds ?? membership.locationIds ?? [],
          }),
        },
      );
      const updated = normalizeMembership(value);
      setMemberships((current) =>
        current.map((candidate) =>
          membershipId(candidate) === id ? updated : candidate,
        ),
      );
      message.success('Đã cập nhật quyền nhân viên.');
    } catch (requestError) {
      const copy = errorText(
        requestError,
        'Không thể cập nhật. Danh sách hiện tại chưa bị thay đổi.',
      );
      setError(copy);
      message.error(copy);
    } finally {
      setUpdatingId(null);
    }
  }

  if (accessLoading) {
    return <Card className='surface-card'><Skeleton active paragraph={{ rows: 6 }} /></Card>;
  }

  if (accessError || !allowed) {
    return (
      <div className='page-wrap v2-workspace'>
        <PageHeader
          title='Nhân viên & phân quyền'
          description='Chỉ chủ quán có thể tạo tài khoản, đổi vai trò hoặc tạm khóa nhân viên.'
        />
        <Alert
          type='warning'
          showIcon
          title='Chỉ chủ quán được quản lý nhân viên'
          description={accessError ?? 'Tài khoản hiện tại không có quyền team:manage.'}
        />
      </div>
    );
  }

  return (
    <div className='page-wrap v2-workspace employees-v2'>
      <PageHeader
        title='Nhân viên & phân quyền'
        description='Tạo tài khoản riêng, giới hạn quyền và tạm khóa ngay khi không còn sử dụng.'
        actions={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setLoading(true);
                setRefreshKey((value) => value + 1);
              }}
            >
              Làm mới
            </Button>
            <Button type='primary' icon={<PlusOutlined />} onClick={openCreate}>
              Thêm nhân viên
            </Button>
          </Space>
        }
      />

      {error ? (
        <Alert
          type='error'
          showIcon
          closable
          onClose={() => setError(null)}
          title='Chưa thể cập nhật nhân viên'
          description={error}
        />
      ) : null}

      {loading ? (
        <Card className='surface-card'><Skeleton active paragraph={{ rows: 8 }} /></Card>
      ) : memberships.length === 0 ? (
        <Card className='surface-card v2-empty-state'>
          <TeamOutlined aria-hidden='true' />
          <Title level={4}>Chưa có nhân viên</Title>
          <Paragraph>Tạo tài khoản staff hoặc viewer để không phải dùng chung mật khẩu chủ quán.</Paragraph>
          <Button type='primary' onClick={openCreate}>Thêm nhân viên đầu tiên</Button>
        </Card>
      ) : (
        <div className='v2-employee-grid'>
          {memberships.map((membership) => {
            const id = membershipId(membership);
            const isOwner = membership.role === 'owner';
            const suspended = membership.status === 'suspended';
            return (
              <Card className='surface-card v2-employee-card' key={id || membership.email}>
                <div className='v2-employee-heading'>
                  <div className='v2-employee-avatar' aria-hidden='true'><UserOutlined /></div>
                  <div>
                    <Text strong>{membership.name ?? membership.userName ?? 'Chưa đặt tên'}</Text>
                    <Text type='secondary'>{membership.email}</Text>
                  </div>
                  {statusTag(membership.status)}
                </div>
                <label className='v2-field'>
                  <span>Vai trò</span>
                  <Select
                    value={membership.role}
                    disabled={isOwner || updatingId === id}
                    options={[
                      { value: 'staff', label: roleCopy('staff') },
                      { value: 'viewer', label: roleCopy('viewer') },
                    ]}
                    onChange={(role) => updateMembership(membership, { role })}
                    aria-label={`Vai trò của ${membership.email}`}
                  />
                </label>
                <div className='v2-employee-actions'>
                  <Tag>{roleCopy(membership.role)}</Tag>
                  {!isOwner ? (
                    <Popconfirm
                      title={suspended ? 'Kích hoạt lại tài khoản?' : 'Tạm khóa tài khoản?'}
                      description={
                        suspended
                          ? 'Người này sẽ có thể đăng nhập lại.'
                          : 'Người này sẽ không thể tiếp tục đăng nhập.'
                      }
                      okText={suspended ? 'Kích hoạt' : 'Tạm khóa'}
                      cancelText='Hủy'
                      onConfirm={() =>
                        updateMembership(membership, {
                          status: suspended ? 'active' : 'suspended',
                        })
                      }
                    >
                      <Button
                        danger={!suspended}
                        icon={suspended ? <ReloadOutlined /> : <StopOutlined />}
                        loading={updatingId === id}
                      >
                        {suspended ? 'Kích hoạt lại' : 'Tạm khóa'}
                      </Button>
                    </Popconfirm>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title='Tạo tài khoản nhân viên'
        okText='Tạo tài khoản'
        cancelText='Hủy'
        confirmLoading={saving}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Alert
          type='info'
          showIcon
          title='Gửi riêng email và mật khẩu tạm cho người dùng; không dùng chung tài khoản chủ quán.'
        />
        <Form form={form} layout='vertical' onFinish={createMember} className='v2-employee-form'>
          <Form.Item name='name' label='Tên hiển thị' rules={[{ required: true, message: 'Nhập tên nhân viên' }]}>
            <Input prefix={<UserOutlined />} autoComplete='name' />
          </Form.Item>
          <Form.Item name='email' label='Email đăng nhập' rules={[{ required: true }, { type: 'email', message: 'Email chưa hợp lệ' }]}>
            <Input type='email' autoComplete='email' />
          </Form.Item>
          <Form.Item name='password' label='Mật khẩu tạm' rules={[{ required: true, min: 10, message: 'Mật khẩu cần ít nhất 10 ký tự' }]}>
            <Input.Password
              prefix={<LockOutlined />}
              autoComplete='new-password'
              addonAfter={
                <Button type='text' size='small' onClick={() => form.setFieldValue('password', temporaryPassword())}>
                  Tạo lại
                </Button>
              }
            />
          </Form.Item>
          <Form.Item name='role' label='Vai trò' rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'staff', label: 'Nhân viên · vận hành, chốt ngày, nhập hàng' },
                { value: 'viewer', label: 'Chỉ xem · không thay đổi dữ liệu' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
