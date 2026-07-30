import { GoodsPage } from "@/components/inventory/goods-page";
import { isVietnamDateKey } from "@/lib/vietnam-date";

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const initialSnapshotDate =
    typeof params.date === "string" && isVietnamDateKey(params.date)
      ? params.date
      : undefined;

  return (
    <GoodsPage
      initialSnapshotDate={initialSnapshotDate}
      initialTab={params.tab === "catalog" ? "catalog" : "inventory"}
    />
  );
}
