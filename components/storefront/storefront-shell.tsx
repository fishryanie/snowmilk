'use client';

import { Alert, Button, Skeleton, Space, Tabs } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { prefetchRouteData } from '@/lib/route-data';
import { CurrentAccessProvider, useCurrentAccess } from '@/components/v2/access-context';

const tabs = [
  { key: '/storefront/orders', label: 'Đơn hàng' },
  { key: '/storefront/products', label: 'Món trên app' },
  { key: '/storefront/settings', label: 'Shop & QR' },
];

function StorefrontContent({ children }: { children: ReactNode }) {
  const { access, loading, error } = useCurrentAccess();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className='storefront-workspace'>
      <Tabs activeKey={pathname} items={tabs} onChange={path => {
        prefetchRouteData(path);
        router.push(path);
      }} />
      {loading ? (
        <Skeleton active />
      ) : error || !access ? (
        <Alert
          type='warning'
          showIcon
          title='Đăng nhập để quản lý cửa hàng online'
          description={error || 'Vui lòng đăng nhập bằng tài khoản quản trị của tiệm.'}
          action={
            <Space wrap>
              <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>
                <Button type='primary'>Đăng nhập quản trị</Button>
              </Link>
              <Link href='/sign-in/storefront-setup'>
                <Button>Thiết lập chủ quán lần đầu</Button>
              </Link>
            </Space>
          }
        />
      ) : (
        <Space orientation='vertical' size={20} style={{ width: '100%' }}>
          {children}
        </Space>
      )}
    </div>
  );
}

export function StorefrontShell({ children }: { children: ReactNode }) {
  // Online operations require a real session even while legacy rollout auth is disabled.
  return (
    <CurrentAccessProvider>
      <StorefrontContent>{children}</StorefrontContent>
    </CurrentAccessProvider>
  );
}
