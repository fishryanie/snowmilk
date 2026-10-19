import type { ReactNode } from 'react';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import './storefront.css';

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
