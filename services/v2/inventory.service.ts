import "server-only";

import { connectMongo } from "@/lib/mongodb";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { InventoryItem } from "@/models/v2/InventoryItem";
import { InventoryLot } from "@/models/v2/InventoryLot";
import { StockCount } from "@/models/v2/StockCount";
import type { V2Context } from "@/services/v2/context";
import { decimalString, documentId } from "@/services/v2/serialize";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

export async function listInventoryBalances(context: V2Context) {
  await connectMongo();
  const scope = {
    organizationId: context.organizationId,
    locationId: context.locationId,
  };
  const balances = (await InventoryBalance.find(scope)
    .sort({ inventoryItemId: 1, inventoryLotId: 1 })
    .lean()) as Plain[];
  const [items, lots, hasPostedCount] = await Promise.all([
    InventoryItem.find({
      organizationId: context.organizationId,
      isActive: true,
    })
      .sort({ itemType: 1, name: 1 })
      .lean(),
    InventoryLot.find({
      ...scope,
      _id: { $in: balances.map((balance) => balance.inventoryLotId).filter(Boolean) },
    }).lean(),
    StockCount.exists({ ...scope, status: "posted" }),
  ]);
  const itemById = new Map((items as Plain[]).map((item) => [String(item._id), item]));
  const lotById = new Map((lots as Plain[]).map((lot) => [String(lot._id), lot]));
  const serializedBalances = balances.map((balance) => {
      const item = itemById.get(String(balance.inventoryItemId));
      const lot = lotById.get(String(balance.inventoryLotId));
      return {
        id: String(balance._id),
        inventoryItemId: String(balance.inventoryItemId),
        inventoryLotId: documentId(balance.inventoryLotId),
        lotCode: lot?.lotCode ?? null,
        code: item?.code ?? "",
        name: item?.name ?? "",
        kind: item?.itemType ?? "",
        baseUnit: item?.baseUnit ?? "",
        quantity: Number(decimalString(balance.onHandQuantity)),
        onHandQuantity: decimalString(balance.onHandQuantity),
        availableQuantity: Number(decimalString(balance.availableQuantity)),
        averageUnitCostVnd:
          balance.averageUnitCostVnd == null
            ? null
            : decimalString(balance.averageUnitCostVnd),
        inventoryValueVnd:
          balance.inventoryValueVnd == null
            ? null
            : Number(balance.inventoryValueVnd),
        costDataQuality: balance.costDataQuality,
        lotTracked: Boolean(item?.lotTracked),
        expiryTracked: Boolean(item?.expiryTracked),
        expiresAt: lot?.expiresAt ?? null,
        status: lot?.status ?? null,
        version: Number(balance.version),
      };
    });
  const balancedItemIds = new Set(
    balances.map((balance) => String(balance.inventoryItemId)),
  );
  for (const item of items as Plain[]) {
    if (balancedItemIds.has(String(item._id))) continue;
    serializedBalances.push({
      id: `unopened:${item._id}`,
      inventoryItemId: String(item._id),
      inventoryLotId: null,
      lotCode: null,
      code: item.code ?? "",
      name: item.name ?? "",
      kind: item.itemType ?? "",
      baseUnit: item.baseUnit ?? "",
      quantity: 0,
      onHandQuantity: "0",
      availableQuantity: 0,
      averageUnitCostVnd: null,
      inventoryValueVnd: null,
      costDataQuality: "missing_cost",
      lotTracked: Boolean(item.lotTracked),
      expiryTracked: Boolean(item.expiryTracked),
      expiresAt: null,
      status: null,
      version: 0,
    });
  }
  return {
    openingRequired: !hasPostedCount,
    balances: serializedBalances.sort(
      (left, right) =>
        String(left.kind).localeCompare(String(right.kind)) ||
        String(left.name).localeCompare(String(right.name)) ||
        String(left.lotCode ?? "").localeCompare(String(right.lotCode ?? "")),
    ),
  };
}
