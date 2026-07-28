'use client';

import {
  AppstoreOutlined,
  BarChartOutlined,
  CalculatorOutlined,
  CloudUploadOutlined,
  DollarOutlined,
  ExperimentOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SkinOutlined,
  ColumnWidthOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { RouteSkeleton } from '@/components/common/route-skeleton';
import Snowfall from 'react-snowfall';

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;

const menuDefinitions: Array<{ key: string; icon: ReactNode; label: string; pageTitle?: string }> = [
  { key: '/dashboard', icon: <BarChartOutlined />, label: 'Tổng quan' },
  { key: '/divestments', icon: <WalletOutlined />, label: 'Thoái vốn' },
  { key: '/sales', icon: <DollarOutlined />, label: 'Bán hàng', pageTitle: 'Chốt bán hàng cuối ngày' },
  { key: '/inventory', icon: <InboxOutlined />, label: 'Kiểm kho', pageTitle: 'Kiểm kho cuối ngày' },
  { key: '/batches', icon: <ExperimentOutlined />, label: 'Mẻ sữa' },
  { key: '/purchases', icon: <ShoppingCartOutlined />, label: 'Nhập hàng' },
  { key: '/expenses', icon: <ShoppingOutlined />, label: 'Chi phí' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'Sản phẩm' },
  { key: '/sizes', icon: <ColumnWidthOutlined />, label: 'Size' },
  { key: '/ingredients', icon: <SkinOutlined />, label: 'Hàng hóa' },
  { key: '/costing', icon: <CalculatorOutlined />, label: 'Giá vốn', pageTitle: 'Công thức & giá vốn' },
  { key: '/equipment', icon: <ToolOutlined />, label: 'Tài sản', pageTitle: 'Đầu tư & tài sản' },
  { key: '/import', icon: <CloudUploadOutlined />, label: 'Nhập Excel', pageTitle: 'Nhập dữ liệu Excel' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Cài đặt', pageTitle: 'Cài đặt chi phí' },
];

const mobileQuickLinks = ['/sales', '/purchases', '/inventory'].flatMap(key => {
  const item = menuDefinitions.find(candidate => candidate.key === key);
  return item ? [item] : [];
});

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className='brand'>
      <div className='brand-mark' aria-hidden='true'>
        <Image src='/snowmilk-logo-transparent.png' width={42} height={42} alt='' unoptimized />
      </div>
      {!compact && (
        <div>
          <Title level={5}>Sữa Tuyết</Title>
          <Text>Quản lý vận hành</Text>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();
  const mobile = !screens.lg;
  const compactSnowfall = !screens.md;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [snowflakeImages, setSnowflakeImages] = useState<HTMLImageElement[]>([]);
  const currentItem = menuDefinitions.find(item => pathname.startsWith(item.key)) ?? menuDefinitions[0];
  const currentKey = currentItem.key;
  const currentPageTitle = currentItem.pageTitle ?? currentItem.label;
  const selectedKey = navigatingTo ?? currentKey;
  const menuItems = menuDefinitions.map(item => ({
    ...item,
    label: (
      <Link
        href={item.key}
        onNavigate={() => {
          if (item.key === currentKey) return;
          setNavigatingTo(item.key);
          setDrawerOpen(false);
        }}>
        {item.label}
      </Link>
    ),
  }));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNavigatingTo(null));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!navigatingTo) return;
    const timeout = window.setTimeout(() => setNavigatingTo(null), 10_000);
    return () => window.clearTimeout(timeout);
  }, [navigatingTo]);

  useEffect(() => {
    const snowflakeImage = new window.Image();
    snowflakeImage.onload = () => setSnowflakeImages([snowflakeImage]);
    snowflakeImage.src = '/logo.png';

    return () => {
      snowflakeImage.onload = null;
    };
  }, []);

  useEffect(() => {
    let frame = 0;

    const updateHeader = () => {
      frame = 0;
      const nextScrolled = window.scrollY > 20;
      setHeaderScrolled(current => (current === nextScrolled ? current : nextScrolled));
    };

    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;
    let revealFrame = 0;
    let keyboardOpen = false;
    let shouldRevealFocusedControl = false;
    let viewportBaseline = viewport.height;

    const isEditableControl = (element: Element | null): element is HTMLElement =>
      element instanceof HTMLElement &&
      (element.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]') ||
        element.closest('.ant-select') !== null);

    const revealFocusedControl = () => {
      revealFrame = 0;
      const activeControl = document.activeElement;
      if (!isEditableControl(activeControl)) return;

      const bounds = activeControl.getBoundingClientRect();
      const visibleTop = viewport.offsetTop + 16;
      const visibleBottom = viewport.offsetTop + viewport.height - 88;
      if (bounds.top < visibleTop || bounds.bottom > visibleBottom) {
        activeControl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };

    const updateViewport = () => {
      frame = 0;
      const activeControl = document.activeElement;
      const hasEditableFocus = isEditableControl(activeControl);
      const heightLoss = viewportBaseline - viewport.height;
      const nextKeyboardOpen = heightLoss > 120 && (hasEditableFocus || keyboardOpen);

      root.style.setProperty('--mobile-viewport-height', `${Math.round(viewport.height)}px`);
      root.style.setProperty('--mobile-viewport-offset-top', `${Math.round(viewport.offsetTop)}px`);
      root.classList.toggle('mobile-keyboard-open', nextKeyboardOpen);

      if (nextKeyboardOpen && (shouldRevealFocusedControl || !keyboardOpen)) {
        shouldRevealFocusedControl = false;
        window.cancelAnimationFrame(revealFrame);
        revealFrame = window.requestAnimationFrame(revealFocusedControl);
      }

      keyboardOpen = nextKeyboardOpen;
      if (!keyboardOpen && !hasEditableFocus) {
        viewportBaseline = Math.max(viewportBaseline, viewport.height);
      }
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateViewport);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditableControl(event.target as Element | null)) return;
      viewportBaseline = Math.max(viewportBaseline, viewport.height);
      shouldRevealFocusedControl = true;
      scheduleUpdate();
    };

    const handleOrientationChange = () => {
      viewportBaseline = viewport.height;
      scheduleUpdate();
    };

    updateViewport();
    viewport.addEventListener('resize', scheduleUpdate);
    viewport.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', scheduleUpdate);

    return () => {
      viewport.removeEventListener('resize', scheduleUpdate);
      viewport.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', scheduleUpdate);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(revealFrame);
      root.classList.remove('mobile-keyboard-open');
      root.style.removeProperty('--mobile-viewport-height');
      root.style.removeProperty('--mobile-viewport-offset-top');
    };
  }, []);

  useEffect(() => {
    const hasOpenSelectDropdown = () =>
      document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') !== null;

    const blockBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      if (!hasOpenSelectDropdown() || !event.cancelable) return;

      // rc-virtual-list implements its own touch/wheel scrolling. Cancelling the
      // browser default still lets that handler run, but prevents iOS from
      // handing the same gesture to the drawer or page at the list boundaries.
      event.preventDefault();
    };

    document.addEventListener('touchmove', blockBackgroundScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener('wheel', blockBackgroundScroll, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener('touchmove', blockBackgroundScroll, { capture: true });
      document.removeEventListener('wheel', blockBackgroundScroll, { capture: true });
    };
  }, []);

  const navigation = (theme: 'dark' | 'light') => (
    <Menu mode='inline' theme={theme} selectedKeys={[selectedKey]} items={menuItems} onClick={() => setDrawerOpen(false)} className='app-menu' />
  );

  return (
    <Layout className='app-layout'>
      {snowflakeImages.length > 0 ? (
        <Snowfall
          images={snowflakeImages}
          changeFrequency={100}
          snowflakeCount={compactSnowfall ? 36 : 100}
          speed={[0.5, 1.5]}
          wind={[-1, 1]}
          radius={compactSnowfall ? [2, 8] : [5, 20]}
          rotationSpeed={[0.5, 3]}
          style={{
            position: 'fixed',
            height: '100dvh',
            width: '100vw',
            zIndex: 1000,
          }}
        />
      ) : null}

      {!mobile && (
        <Sider width={248} collapsedWidth={80} collapsed={collapsed} theme='dark' className='app-sider' id='desktop-navigation'>
          <Brand compact={collapsed} />
          {navigation('dark')}
        </Sider>
      )}
      <Layout>
        <Header className={`app-header${headerScrolled ? ' is-scrolled' : ''}`}>
          <Space className='header-leading'>
            <Button
              type='text'
              className='header-menu-button'
              icon={mobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => (mobile ? setDrawerOpen(true) : setCollapsed(value => !value))}
              aria-label={mobile ? 'Mở menu' : collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              aria-controls={mobile ? 'mobile-navigation' : 'desktop-navigation'}
              aria-expanded={mobile ? drawerOpen : !collapsed}
            />
            <span className='header-page-title' aria-hidden='true'>
              {currentPageTitle}
            </span>
          </Space>
          <Space>
            <Tag color='gold'>Local</Tag>
            <div className='status-dot' />
            <Text className='desktop-only'>MongoDB</Text>
          </Space>
        </Header>
        <Content className='app-content' aria-busy={Boolean(navigatingTo)}>
          {navigatingTo ? <RouteSkeleton /> : children}
        </Content>
      </Layout>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement='left'
        size={280}
        title={<Brand />}
        styles={{ body: { padding: 8 } }}
        id='mobile-navigation'>
        {navigation('light')}
      </Drawer>
      <nav className='mobile-quick-nav' aria-label='Thao tác nhanh'>
        {mobileQuickLinks.map(item => {
          const active = currentKey === item.key;
          return (
            <Link
              key={item.key}
              href={item.key}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
              onNavigate={() => {
                if (!active) setNavigatingTo(item.key);
              }}>
              <span className='mobile-quick-nav-icon' aria-hidden='true'>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button type='button' onClick={() => setDrawerOpen(true)} aria-label='Mở tất cả chức năng' aria-controls='mobile-navigation' aria-expanded={drawerOpen}>
          <span className='mobile-quick-nav-icon' aria-hidden='true'>
            <MenuOutlined />
          </span>
          <span>Thêm</span>
        </button>
      </nav>
    </Layout>
  );
}
