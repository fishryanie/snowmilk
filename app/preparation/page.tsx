import type { Metadata } from 'next';
import { ProductionWorkspace } from '@/components/v2/production-workspace';
import { V2RolloutNotice } from '@/components/v2/v2-rollout-notice';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export const metadata: Metadata = {
  title: 'Chuẩn bị món',
};

export default function PreparationPage() {
  return areV2OperationsEnabled() ? (
    <ProductionWorkspace />
  ) : (
    <V2RolloutNotice feature='Chuẩn bị món & làm mẻ' />
  );
}
