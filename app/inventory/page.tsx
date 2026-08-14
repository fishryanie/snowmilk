import { redirect } from "next/navigation";
import { InventoryWorkspace } from '@/components/v2/inventory-workspace';
import { areV2OperationsEnabled } from '@/lib/v2/feature-flag';

export default function InventoryPage() {
  if (!areV2OperationsEnabled()) redirect('/ingredients');
  return <InventoryWorkspace />;
}
