import type { PropsWithChildren } from 'react';
import { DashboardRevenueOverview } from '@/components/v2/dashboard-revenue-overview';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export default function DashboardLayout({ children }: PropsWithChildren) {
  if (!areV2OperationsEnabled()) return children;
  return (
    <div className='v2-dashboard-layout'>
      <DashboardRevenueOverview />
    </div>
  );
}
