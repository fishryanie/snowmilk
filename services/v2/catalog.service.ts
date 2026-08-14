import "server-only";

import { connectMongo } from "@/lib/mongodb";
import { BusinessLine } from "@/models/v2/BusinessLine";
import { Category } from "@/models/v2/Category";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { Sku } from "@/models/v2/Sku";
import { SkuPrice } from "@/models/v2/SkuPrice";
import type { V2Context } from "@/services/v2/context";
import { decimalString, documentId } from "@/services/v2/serialize";

type PlainDocument = Record<string, unknown> & { _id: unknown };

export async function listCatalogSkus(context: V2Context, at = new Date()) {
  await connectMongo();
  const scope = { organizationId: context.organizationId };
  const [skus, businessLines, categories] = await Promise.all([
    Sku.find({ ...scope, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    BusinessLine.find({ ...scope, isActive: true }).lean(),
    Category.find({ ...scope, isActive: true }).lean(),
  ]);

  const skuIds = (skus as PlainDocument[]).map((sku) => sku._id);
  const outputItemIds = (skus as PlainDocument[])
    .map((sku) => sku.outputInventoryItemId)
    .filter(Boolean);
  const [prices, balances] = await Promise.all([
    SkuPrice.find({
      ...scope,
      skuId: { $in: skuIds },
      isActive: true,
      effectiveFrom: { $lte: at },
      $and: [
        { $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }] },
        { $or: [{ locationId: context.locationId }, { locationId: null }] },
      ],
    })
      .sort({ effectiveFrom: -1 })
      .lean(),
    InventoryBalance.find({
      ...scope,
      locationId: context.locationId,
      inventoryItemId: { $in: outputItemIds },
    }).lean(),
  ]);

  const businessLineById = new Map(
    (businessLines as PlainDocument[]).map((line) => [String(line._id), line]),
  );
  const categoryById = new Map(
    (categories as PlainDocument[]).map((category) => [
      String(category._id),
      category,
    ]),
  );
  const priceBySkuId = new Map<string, PlainDocument>();
  for (const price of prices as PlainDocument[]) {
    const key = String(price.skuId);
    const current = priceBySkuId.get(key);
    const priceIsLocationSpecific = String(price.locationId ?? "") === String(context.locationId);
    const currentIsLocationSpecific =
      String(current?.locationId ?? "") === String(context.locationId);
    if (!current || (priceIsLocationSpecific && !currentIsLocationSpecific)) {
      priceBySkuId.set(key, price);
    }
  }
  const availableByItemId = new Map<string, number>();
  for (const balance of balances as PlainDocument[]) {
    const key = String(balance.inventoryItemId);
    const current = availableByItemId.get(key) ?? 0;
    availableByItemId.set(
      key,
      current + Number(decimalString(balance.availableQuantity)),
    );
  }

  const items = (skus as PlainDocument[]).map((sku) => {
    const businessLine = businessLineById.get(String(sku.businessLineId));
    const category = categoryById.get(String(sku.categoryId));
    const price = priceBySkuId.get(String(sku._id));
    const outputInventoryItemId = documentId(sku.outputInventoryItemId);
    return {
      id: String(sku._id),
      code: String(sku.code),
      name: String(sku.name),
      variantName: sku.variantName ? String(sku.variantName) : null,
      salesUnit: String(sku.salesUnit),
      fulfillmentMode: String(sku.fulfillmentMode),
      fulfillment: String(sku.fulfillmentMode),
      businessLine: businessLine
        ? {
            id: String(businessLine._id),
            code: String(businessLine.code),
            name: String(businessLine.name),
            pathCodes: businessLine.pathCodes ?? [],
          }
        : null,
      category: category
        ? {
            id: String(category._id),
            code: String(category.code),
            name: String(category.name),
          }
        : null,
      unitPriceVnd: price ? Number(price.unitPriceVnd) : null,
      priceEffectiveFrom: price?.effectiveFrom ?? null,
      outputInventoryItemId,
      availableQuantity:
        outputInventoryItemId == null
          ? null
          : availableByItemId.get(outputInventoryItemId) ?? 0,
      canSell:
        Boolean(price) &&
        (sku.fulfillmentMode !== "preproduced" ||
          (outputInventoryItemId != null &&
            (availableByItemId.get(outputInventoryItemId) ?? 0) > 0)),
    };
  });
  return { skus: items };
}
