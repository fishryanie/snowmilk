import type { Metadata } from 'next';
import { RevenueReportWorkspace } from '@/components/v2/revenue-report-workspace';
import { V2RolloutNotice } from '@/components/v2/v2-rollout-notice';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export const metadata: Metadata = {
  title: 'Báo cáo doanh thu',
};

export default function ReportsPage() {
  return areV2OperationsEnabled() ? (
    <RevenueReportWorkspace />
  ) : (
    <V2RolloutNotice feature='Báo cáo doanh thu v2' />
  );
}
