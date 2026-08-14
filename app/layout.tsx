import type { Metadata, Viewport } from 'next';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import { loadBusinessProfile } from '@/lib/business-profile.server';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const profile = await loadBusinessProfile();
  return {
    title: {
      default: `${profile.displayName} — Quản lý vận hành`,
      template: `%s — ${profile.displayName}`,
    },
    description: profile.description,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: profile.displayName,
    },
    other: {
      'apple-mobile-web-app-capable': 'yes',
    },
  };
}

export const viewport: Viewport = {
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#287f96' },
    { media: '(prefers-color-scheme: dark)', color: '#287f96' },
  ],
  width: 'device-width',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const businessProfile = await loadBusinessProfile();
  const v2OperationsEnabled = areV2OperationsEnabled();
  return (
    <html lang='vi'>
      <body>
        <AntdRegistry>
          <Providers businessProfile={businessProfile}>
            <AppShell
              businessProfile={businessProfile}
              v2OperationsEnabled={v2OperationsEnabled}
            >
              {children}
            </AppShell>
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
