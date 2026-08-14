import type { Metadata } from 'next';
import { EmployeesWorkspace } from '@/components/v2/employees-workspace';
import { V2RolloutNotice } from '@/components/v2/v2-rollout-notice';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export const metadata: Metadata = { title: 'Nhân viên' };

export default function EmployeesPage() {
  return areV2OperationsEnabled() ? (
    <EmployeesWorkspace />
  ) : (
    <V2RolloutNotice feature='Nhân viên & phân quyền' />
  );
}
