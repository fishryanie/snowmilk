import LegacySalesPage from '@/components/legacy/legacy-sales-page';
import { SalesDayWorkspace } from '@/components/v2/sales-day-workspace';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export default function SalesPage() {
  return areV2OperationsEnabled() ? <SalesDayWorkspace /> : <LegacySalesPage />;
}
