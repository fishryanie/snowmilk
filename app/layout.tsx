import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import { loadBusinessProfile } from '@/lib/business-profile.server';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';
import './globals.css';

const sans = localFont({
  src: [
    { path: '../public/fonts/be-vietnam-regular.woff2', weight: '400' },
    { path: '../public/fonts/be-vietnam-semibold.woff2', weight: '600 800' },
  ],
  variable: '--font-be-vietnam',
  display: 'swap',
});

const serif = localFont({
  src: '../public/fonts/dm-serif.woff2',
  weight: '400',
  variable: '--font-dm-serif',
  display: 'swap',
});

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
    { media: '(prefers-color-scheme: light)', color: '#f5faff' },
    { media: '(prefers-color-scheme: dark)', color: '#f5faff' },
  ],
  colorScheme: 'light',
  width: 'device-width',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const businessProfile = await loadBusinessProfile();
  const v2OperationsEnabled = areV2OperationsEnabled();
  return (
    <html lang='vi' className={`${sans.variable} ${serif.variable}`}>
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
