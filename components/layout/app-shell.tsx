'use client';

import {
  AppstoreOutlined,
  BarChartOutlined,
  CalculatorOutlined,
  ColumnWidthOutlined,
  DollarOutlined,
  ExperimentOutlined,
  LineChartOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SkinOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Grid, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useEffect,
  useState,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { RouteSkeleton } from '@/components/common/route-skeleton';
import {
  CurrentAccessProvider,
  roleLabel,
  useCurrentAccess,
} from '@/components/v2/access-context';
import type { Permission } from '@/lib/auth/permissions';
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from '@/lib/business-profile';

const { Header, Content, Sider } = Layout;
const { Text, Title } = Typography;

type NavigationItem = {
  key: string;
  icon: ReactNode;
  label: string;
  mobileLabel?: string;
  pageTitle?: string;
  permission: Permission;
  v2Only?: boolean;
  legacyOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: 'Vận hành',
    items: [
      {
        key: '/dashboard',
        icon: <BarChartOutlined />,
        label: 'Tổng quan',
        permission: 'reports:read',
      },
      {
        key: '/sales',
        icon: <DollarOutlined />,
        label: 'Chốt ngày',
        pageTitle: 'Chốt bán hàng cuối ngày',
        permission: 'sales:read',
      },
      {
        key: '/preparation',
        icon: <ExperimentOutlined />,
        label: 'Chuẩn bị',
        pageTitle: 'Chuẩn bị món & làm mẻ',
        permission: 'production:read',
        v2Only: true,
      },
      {
        key: '/inventory',
        icon: <SkinOutlined />,
        label: 'Kho',
        pageTitle: 'Kho & kiểm kho',
        permission: 'inventory:read',
        v2Only: true,
      },
      {
        key: '/ingredients',
        icon: <SkinOutlined />,
        label: 'Hàng hóa & kho',
        mobileLabel: 'Kho',
        permission: 'inventory:read',
        legacyOnly: true,
      },
    ],
  },
  {
    label: 'Danh mục',
    items: [
      {
        key: '/products',
        icon: <AppstoreOutlined />,
        label: 'Món & giá',
        permission: 'catalog:read',
      },
      {
        key: '/costing',
        icon: <CalculatorOutlined />,
        label: 'Giá vốn',
        pageTitle: 'Giá vốn sản phẩm',
        permission: 'catalog:write',
      },
      {
        key: '/ingredients',
        icon: <SkinOutlined />,
        label: 'Hàng hóa',
        pageTitle: 'Danh mục hàng hóa',
        permission: 'inventory:read',
        v2Only: true,
      },
      {
        key: '/sizes',
        icon: <ColumnWidthOutlined />,
        label: 'Biến thể & size',
        permission: 'catalog:write',
      },
      {
        key: '/batches',
        icon: <ExperimentOutlined />,
        label: 'Mẻ chuẩn bị',
        pageTitle: 'Nền sữa & topping đã nấu',
        permission: 'catalog:write',
      },
    ],
  },
  {
    label: 'Tài chính',
    items: [
      {
        key: '/purchases',
        icon: <ShoppingCartOutlined />,
        label: 'Nhập hàng',
        permission: 'purchases:read',
      },
      {
        key: '/expenses',
        icon: <ShoppingOutlined />,
        label: 'Chi phí',
        permission: 'finance:write',
      },
      {
        key: '/reports',
        icon: <LineChartOutlined />,
        label: 'Báo cáo',
        permission: 'reports:read',
        v2Only: true,
      },
      {
        key: '/payroll',
        icon: <TeamOutlined />,
        label: 'Lương',
        pageTitle: 'Chi lương nhân sự',
        permission: 'finance:write',
      },
      {
        key: '/divestments',
        icon: <WalletOutlined />,
        label: 'Vốn',
        permission: 'finance:write',
      },
      {
        key: '/equipment',
        icon: <ToolOutlined />,
        label: 'Tài sản',
        pageTitle: 'Đầu tư & tài sản',
        permission: 'finance:write',
      },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        key: '/employees',
        icon: <TeamOutlined />,
        label: 'Nhân viên',
        pageTitle: 'Nhân viên & phân quyền',
        permission: 'team:manage',
        v2Only: true,
      },
      {
        key: '/settings',
        icon: <SettingOutlined />,
        label: 'Cài đặt',
        pageTitle: 'Cài đặt hệ thống',
        permission: 'settings:manage',
      },
    ],
  },
];

const menuDefinitions = navigationGroups.flatMap((group) => group.items);
function Brand({
  compact = false,
  profile,
}: {
  compact?: boolean;
  profile: BusinessProfile;
}) {
  const markText = profile.wordmark.trim();
  const compactMark =
    markText.length <= 4
      ? markText
      : markText
          .split(/\s+/)
          .map((part) => part[0])
          .join('')
          .slice(0, 3)
          .toLocaleUpperCase('vi-VN');
  return (
    <div className='brand'>
      <div
        className={`brand-mark${profile.logoUrl ? ' has-logo' : ''}`}
        style={
          profile.logoUrl
            ? ({ '--brand-logo-url': `url("${profile.logoUrl}")` } as CSSProperties)
            : undefined
        }
        aria-hidden='true'
      >
        {!profile.logoUrl ? (
          <span>{compactMark || DEFAULT_BUSINESS_PROFILE.wordmark.slice(0, 1)}</span>
        ) : null}
      </div>
      {!compact ? (
        <div className='brand-copy'>
          <Title level={5}>{profile.displayName}</Title>
          <Text>{profile.tagline}</Text>
        </div>
      ) : null}
    </div>
  );
}

function useNavigationProgress(pathname: string) {
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNavigatingTo(null));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!navigatingTo) return;
    const timeout = window.setTimeout(() => setNavigatingTo(null), 10_000);
    return () => window.clearTimeout(timeout);
  }, [navigatingTo]);

  return [navigatingTo, setNavigatingTo] as const;
}

function useHeaderScrollState() {
  const [headerScrolled, setHeaderScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const updateHeader = () => {
      frame = 0;
      const nextScrolled = window.scrollY > 20;
      setHeaderScrolled((current) => (current === nextScrolled ? current : nextScrolled));
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

  return headerScrolled;
}

function useMobileViewportHandling() {
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
      (element.matches(
        'input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]',
      ) || element.closest('.ant-select') !== null);

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
      root.style.setProperty(
        '--mobile-viewport-offset-top',
        `${Math.round(viewport.offsetTop)}px`,
      );
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
}

function useSelectDropdownScrollGuard() {
  useEffect(() => {
    const hasOpenSelectDropdown = () =>
      document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)') !== null;
    const blockBackgroundScroll = (event: TouchEvent | WheelEvent) => {
      if (!hasOpenSelectDropdown() || !event.cancelable) return;
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
}

function AuthenticatedShell({
  children,
  pathname,
  businessProfile,
  v2OperationsEnabled,
}: PropsWithChildren<{
  pathname: string;
  businessProfile: BusinessProfile;
  v2OperationsEnabled: boolean;
}>) {
  const screens = Grid.useBreakpoint();
  const mobile = !screens.lg;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headerScrolled = useHeaderScrollState();
  const [navigatingTo, setNavigatingTo] = useNavigationProgress(pathname);
  useMobileViewportHandling();
  useSelectDropdownScrollGuard();
  const { access, loading: accessLoading, error: accessError, can } = useCurrentAccess();
  const currentItem =
    menuDefinitions.find((item) => pathname.startsWith(item.key)) ?? menuDefinitions[0];
  const currentKey = currentItem.key;
  const currentPageTitle = currentItem.pageTitle ?? currentItem.label;
  const selectedKey = navigatingTo ?? currentKey;

  const rolloutGroups = navigationGroups.flatMap((group) => {
    const items = group.items.filter(
      (item) =>
        (v2OperationsEnabled || !item.v2Only) &&
        (!v2OperationsEnabled || !item.legacyOnly),
    );
    return items.length > 0 ? [{ ...group, items }] : [];
  });
  const visibleGroups = accessLoading
    ? rolloutGroups
    : rolloutGroups.flatMap((group) => {
        const items = group.items.filter((item) => can(item.permission));
        return items.length > 0 ? [{ ...group, items }] : [];
      });
  const menuItems: MenuProps['items'] = visibleGroups.map((group) => ({
    type: 'group',
    key: `group-${group.label}`,
    label: group.label,
    children: group.items.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: (
        <Link
          href={item.key}
          onNavigate={() => {
            if (item.key === currentKey) return;
            setNavigatingTo(item.key);
            setDrawerOpen(false);
          }}
        >
          {item.label}
        </Link>
      ),
    })),
  }));
  const mobileQuickLinks = (
    v2OperationsEnabled
      ? ['/dashboard', '/sales', '/preparation', '/inventory']
      : ['/dashboard', '/sales', '/ingredients']
  ).flatMap((key) => {
    const item = menuDefinitions.find(
      (candidate) =>
        candidate.key === key &&
        (v2OperationsEnabled ? !candidate.legacyOnly : !candidate.v2Only),
    );
    return item ? [item] : [];
  });
  const visibleMobileQuickLinks = accessLoading
    ? mobileQuickLinks
    : mobileQuickLinks.filter((item) => can(item.permission));

  const navigation = (theme: 'dark' | 'light') => (
    <Menu
      mode='inline'
      theme={theme}
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={() => setDrawerOpen(false)}
      className='app-menu'
    />
  );

  const profileStyles = {
    '--canvas': businessProfile.brandColors.cream,
    '--ink': businessProfile.brandColors.ink,
    '--brand': businessProfile.brandColors.terracotta,
    '--brand-soft': `color-mix(in srgb, ${businessProfile.brandColors.terracotta} 14%, white)`,
    '--success': businessProfile.brandColors.green,
  } as CSSProperties;

  return (
    <Layout className='app-layout' style={profileStyles}>
      {!mobile ? (
        <Sider
          width={252}
          collapsedWidth={80}
          collapsed={collapsed}
          theme='dark'
          className='app-sider'
          id='desktop-navigation'
        >
          <Brand compact={collapsed} profile={businessProfile} />
          {navigation('dark')}
        </Sider>
      ) : null}
      <Layout>
        <Header className={`app-header${headerScrolled ? ' is-scrolled' : ''}`}>
          <Space className='header-leading'>
            <Button
              type='text'
              className='header-menu-button'
              icon={
                mobile ? (
                  <MenuOutlined />
                ) : collapsed ? (
                  <MenuUnfoldOutlined />
                ) : (
                  <MenuFoldOutlined />
                )
              }
              onClick={() =>
                mobile ? setDrawerOpen(true) : setCollapsed((value) => !value)
              }
              aria-label={
                mobile
                  ? 'Mở menu'
                  : collapsed
                    ? 'Mở rộng thanh điều hướng'
                    : 'Thu gọn thanh điều hướng'
              }
              aria-controls={mobile ? 'mobile-navigation' : 'desktop-navigation'}
              aria-expanded={mobile ? drawerOpen : !collapsed}
            />
            <span className='header-page-title' aria-hidden='true'>
              {currentPageTitle}
            </span>
          </Space>
          <Space size={8}>
            {v2OperationsEnabled ? (
              <Tag color={accessError ? 'error' : access?.role === 'owner' ? 'gold' : 'default'}>
                {accessError ? 'Chưa rõ quyền' : roleLabel(access?.role)}
              </Tag>
            ) : null}
            <Tag className='online-data-tag'>Dữ liệu online</Tag>
            <div className='status-dot' aria-hidden='true' />
            <Text className='desktop-only'>MongoDB Atlas</Text>
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
        size={300}
        title={<Brand profile={businessProfile} />}
        styles={{ body: { padding: 8 } }}
        id='mobile-navigation'
      >
        {navigation('light')}
      </Drawer>
      <nav
        className='mobile-quick-nav'
        aria-label='Điều hướng chính'
        style={{
          gridTemplateColumns: `repeat(${visibleMobileQuickLinks.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {visibleMobileQuickLinks.map((item) => {
          const active = currentKey === item.key;
          return (
            <Link
              key={item.key}
              href={item.key}
              className={active ? 'is-active' : undefined}
              aria-current={active ? 'page' : undefined}
              onNavigate={() => {
                if (!active) setNavigatingTo(item.key);
              }}
            >
              <span className='mobile-quick-nav-icon' aria-hidden='true'>
                {item.icon}
              </span>
              <span>{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
        <button
          type='button'
          onClick={() => setDrawerOpen(true)}
          aria-label='Mở tất cả chức năng'
          aria-controls='mobile-navigation'
          aria-expanded={drawerOpen}
        >
          <span className='mobile-quick-nav-icon' aria-hidden='true'>
            <MenuOutlined />
          </span>
          <span>Thêm</span>
        </button>
      </nav>
    </Layout>
  );
}

export function AppShell({
  children,
  businessProfile = DEFAULT_BUSINESS_PROFILE,
  v2OperationsEnabled = false,
}: PropsWithChildren<{
  businessProfile?: BusinessProfile;
  v2OperationsEnabled?: boolean;
}>) {
  const pathname = usePathname();

  if (pathname.startsWith('/sign-in')) return children;

  return (
    <CurrentAccessProvider enabled={v2OperationsEnabled}>
      <AuthenticatedShell
        pathname={pathname}
        businessProfile={businessProfile}
        v2OperationsEnabled={v2OperationsEnabled}
      >
        {children}
      </AuthenticatedShell>
    </CurrentAccessProvider>
  );
}
