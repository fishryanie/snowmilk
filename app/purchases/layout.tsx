import type { PropsWithChildren } from 'react';
import { PurchaseReceivingWorkspace } from '@/components/v2/purchase-receiving-workspace';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export default function PurchasesLayout({ children }: PropsWithChildren) {
  if (areV2OperationsEnabled()) {
    return <PurchaseReceivingWorkspace />;
  }
  return children;
}
