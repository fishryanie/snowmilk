'use client';

import { Alert, Button, Skeleton } from 'antd';
import { CommentOutlined, RobotOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { CurrentAccessProvider, useCurrentAccess } from '@/components/v2/access-context';

function Content({ children }: { children: ReactNode }) {
  const { access, loading, error } = useCurrentAccess();
  const pathname = usePathname();
  return <div className='zalo-workspace'>
    <header className='zalo-page-heading'>
      <div><span className='zalo-eyebrow'>KẾT NỐI KHÁCH HÀNG</span><h1>Zalo Bot</h1><p>Mọi cuộc trò chuyện, ở cùng một nơi.</p></div>
      <span className='zalo-channel'><span /> Bot Cái Tiệm Sữa</span>
    </header>
    <nav className='zalo-tabs' aria-label='Quản lý Zalo Bot'>
      <Link href='/zalo' className={pathname === '/zalo' ? 'is-active' : ''}><CommentOutlined /> Hội thoại</Link>
      <Link href='/zalo/settings' className={pathname === '/zalo/settings' ? 'is-active' : ''}><RobotOutlined /> Trả lời tự động</Link>
    </nav>
    {loading ? <Skeleton active /> : !access || error ? <Alert showIcon type='warning' title='Đăng nhập để xem tin nhắn khách hàng' description={error || 'Dùng tài khoản quản trị hoặc nhân viên của tiệm.'} action={<Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}><Button type='primary'>Đăng nhập</Button></Link>} /> : <Fragment key={`${access.userId}:${access.organizationId}`}>{children}</Fragment>}
  </div>;
}
export function ZaloShell({ children }: { children: ReactNode }) {
  return <CurrentAccessProvider><Content>{children}</Content></CurrentAccessProvider>;
}
