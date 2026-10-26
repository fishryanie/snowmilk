import type { ReactNode } from 'react';
import { ZaloShell } from '@/components/zalo/zalo-shell';
import './zalo.css';

export default function ZaloLayout({ children }: { children: ReactNode }) {
  return <ZaloShell>{children}</ZaloShell>;
}
