import "server-only";

import { connectMongo } from "@/lib/mongodb";
import {
  normalizeProductGroupName,
  productGroupBusinessLineCode,
} from "@/lib/product-groups";
import { MIGRATION_VERSION } from "@/lib/v2/constants";
import { Product } from "@/models/Product";
import { BusinessLine } from "@/models/v2/BusinessLine";
import { CatalogProduct } from "@/models/v2/CatalogProduct";
import { Category } from "@/models/v2/Category";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { Sku } from "@/models/v2/Sku";
import { SkuPrice } from "@/models/v2/SkuPrice";
import type { V2Context } from "@/services/v2/context";
import { decimalString, documentId } from "@/services/v2/serialize";

type PlainDocument = Record<string, unknown> & { _id: unknown };

const ONBOARDED_PRODUCT_SOURCE = "products";

async function resolveProductBusinessLine(
  scope: { organizationId: unknown },
  parent: PlainDocument,
  groupNameValue: unknown,
  actor: V2Context["actor"],
) {
  const groupName = normalizeProductGroupName(groupNameValue);
  const code = productGroupBusinessLineCode(groupName);
  if (code === String(parent.code)) return parent;

  return BusinessLine.findOneAndUpdate(
    { ...scope, code },
    {
      $set: {
        name: groupName,
        parentId: parent._id,
        pathCodes: [String(parent.code)],
        depth: 1,
        isPosting: true,
        isActive: true,
        actor,
      },
      $setOnInsert: {
        ...scope,
        code,
        sortOrder: 0,
        version: 1,
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
}

async function syncOnboardedProducts(context: V2Context, at: Date) {
  const scope = { organizationId: context.organizationId };
  const [products, defaultBusinessLine, category] = (await Promise.all([
    Product.find({ productMode: "composed" }).lean(),
    BusinessLine.findOne({ ...scope, code: "BREAKFAST", isActive: true }).lean(),
    Category.findOne({
      ...scope,
      code: "BREAKFAST_HEALTHY",
      isActive: true,
    }).lean(),
  ])) as [PlainDocument[], PlainDocument | null, PlainDocument | null];

  if (!products.length) return;
  if (!defaultBusinessLine || !category) {
    throw new Error(
      "Danh mục Đồ ăn sáng / Healthy chưa sẵn sàng để đồng bộ món bán.",
    );
  }

  const groupNames = [
    ...new Set(
      products.map((product) => normalizeProductGroupName(product.groupName)),
    ),
  ];
  const businessLines = await Promise.all(
    groupNames.map((groupName) =>
      resolveProductBusinessLine(
        scope,
        defaultBusinessLine,
        groupName,
        context.actor,
      ),
    ),
  );
  const businessLineByCode = new Map(
    businessLines.flatMap((line) =>
      line ? [[String(line.code), line] as const] : [],
    ),
  );

  await Promise.all(products.map(async (product) => {
    const sourceId = String(product._id);
    const code = String(product.code).trim().toUpperCase();
    const name = String(product.name).trim();
    const isActive = Boolean(product.isActive);
    const groupCode = productGroupBusinessLineCode(product.groupName);
    const businessLine =
      businessLineByCode.get(groupCode) ?? defaultBusinessLine;
    const legacySource = {
      sourceCollection: ONBOARDED_PRODUCT_SOURCE,
      sourceId,
      migrationVersion: MIGRATION_VERSION,
    };
    const catalogProduct = await CatalogProduct.findOneAndUpdate(
      {
        ...scope,
        "legacySource.sourceCollection": ONBOARDED_PRODUCT_SOURCE,
        "legacySource.sourceId": sourceId,
      },
      {
        $set: {
          name,
          description: String(product.note ?? ""),
          defaultBusinessLineId: businessLine._id,
          defaultCategoryId: category._id,
          isActive,
          actor: context.actor,
        },
        $setOnInsert: {
          ...scope,
          code,
          legacySource,
          sortOrder: 0,
          version: 1,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    if (!catalogProduct) return;

    const sku = await Sku.findOneAndUpdate(
      {
        ...scope,
        "legacySource.sourceCollection": ONBOARDED_PRODUCT_SOURCE,
        "legacySource.sourceId": sourceId,
      },
      {
        $set: {
          name,
          businessLineId: businessLine._id,
          categoryId: category._id,
          isActive,
          actor: context.actor,
        },
        $setOnInsert: {
          ...scope,
          catalogProductId: catalogProduct._id,
          code,
          salesUnit: "box",
          fulfillmentMode: "made_to_order",
          sortOrder: 0,
          legacySource,
          version: 1,
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true },
    );
    if (!sku || !isActive) return;

    const unitPriceVnd = Number(product.sellingPrice ?? 0);
    if (!Number.isSafeInteger(unitPriceVnd) || unitPriceVnd < 0) return;
    const currentPrice = (await SkuPrice.findOne({
      ...scope,
      locationId: null,
      skuId: sku._id,
      isActive: true,
      effectiveFrom: { $lte: at },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
    })
      .sort({ effectiveFrom: -1 })
      .lean()) as PlainDocument | null;
    if (currentPrice && Number(currentPrice.unitPriceVnd) === unitPriceVnd) {
      return;
    }
    if (currentPrice) {
      await SkuPrice.updateOne(
        { _id: currentPrice._id },
        { $set: { effectiveTo: at, isActive: false, actor: context.actor } },
      );
    }
    await SkuPrice.create({
      ...scope,
      locationId: null,
      skuId: sku._id,
      unitPriceVnd,
      effectiveFrom: at,
      effectiveTo: null,
      note: "Đồng bộ từ màn Sản phẩm",
      isActive: true,
      version: 1,
      actor: context.actor,
    });
  }));
}

export async function listCatalogSkus(context: V2Context, at = new Date()) {
  await connectMongo();
  await syncOnboardedProducts(context, at);
  const scope = { organizationId: context.organizationId };
  const [skus, businessLines, categories] = await Promise.all([
    Sku.find({ ...scope, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
    BusinessLine.find({ ...scope, isActive: true }).lean(),
    Category.find({ ...scope, isActive: true }).lean(),
  ]);

  const skuIds = (skus as PlainDocument[]).map((sku) => sku._id);
  const outputItemIds = (skus as PlainDocument[]).flatMap((sku) =>
    sku.outputInventoryItemId ? [sku.outputInventoryItemId] : [],
  );
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
