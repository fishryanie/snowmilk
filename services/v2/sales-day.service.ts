import "server-only";

import { createHash } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { calculateSalesDay, multiplyDecimalRateToVnd } from "@/lib/v2/money";
import type {
  CloseSalesDayInput,
  ReopenSalesDayInput,
  SaveSalesDayDraftInput,
} from "@/lib/validators/v2/sales-days";
import { BusinessLine } from "@/models/v2/BusinessLine";
import { AuditLog } from "@/models/v2/AuditLog";
import { Category } from "@/models/v2/Category";
import { DailyRevenueFact } from "@/models/v2/DailyRevenueFact";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { InventoryLot } from "@/models/v2/InventoryLot";
import { RevenueEntry } from "@/models/v2/RevenueEntry";
import { SalesDay } from "@/models/v2/SalesDay";
import { Sku } from "@/models/v2/Sku";
import { SkuPrice } from "@/models/v2/SkuPrice";
import { StockMovement } from "@/models/v2/StockMovement";
import { compareDecimalStringsExact } from "@/models/v2/helpers";
import {
  id,
  parseBusinessDate,
  type V2Context,
} from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import {
  allocateFefo,
  type AvailableLot,
} from "@/services/v2/inventory-allocation";
import {
  persistedSalesTotals,
  reversalRevenueSnapshot,
  salesOperationRequestHash,
} from "@/services/v2/operation-invariants";
import { assertWriteReplay } from "@/services/v2/write-idempotency";
import { decimalString, documentId } from "@/services/v2/serialize";

const CALCULATION_VERSION = "sales-v2.1";

// Mongoose lean/hydrated documents are dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDocument = Record<string, any>;

function priceMoment(businessDate: string) {
  return new Date(`${businessDate}T23:59:59.999+07:00`);
}

function costRate(totalVnd: number, quantity: number) {
  if (quantity <= 0) return "0";
  const scale = BigInt(1_000_000);
  const numerator = BigInt(totalVnd) * scale;
  const quotient = numerator / BigInt(quantity);
  const whole = quotient / scale;
  const fraction = String(quotient % scale).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function serializeLine(line: AnyDocument) {
  return {
    lineKey: String(line.lineKey),
    skuId: documentId(line.skuId),
    skuCode: String(line.skuCodeSnapshot),
    skuName: String(line.skuNameSnapshot),
    businessLine: line.businessLineSnapshot,
    category: line.categorySnapshot ?? null,
    quantity: decimalString(line.quantity),
    quantitySource: String(line.quantitySource),
    salesUnit: String(line.salesUnitSnapshot),
    unitPriceVnd: Number(line.unitPriceVnd),
    grossRevenueVnd: Number(line.grossRevenueVnd),
    discountVnd: Number(line.discountVnd),
    refundVnd: Number(line.refundVnd),
    netRevenueVnd: Number(line.netRevenueVnd),
    unitCostVnd: line.unitCostVnd == null ? null : decimalString(line.unitCostVnd),
    cogsVnd: line.cogsVnd == null ? null : Number(line.cogsVnd),
    profitVnd: line.profitVnd == null ? null : Number(line.profitVnd),
    dataQuality: String(line.dataQuality),
  };
}

export function serializeSalesDay(day: AnyDocument | null, businessDate: string) {
  if (!day) {
    return {
      id: null,
      businessDate,
      status: "draft",
      version: 0,
      lines: [],
      payments: { cashVnd: 0, bankTransferVnd: 0, otherVnd: 0 },
      totals: {
        grossRevenueVnd: 0,
        discountVnd: 0,
        refundVnd: 0,
        netRevenueVnd: 0,
        collectedVnd: 0,
        cogsVnd: null,
        profitVnd: null,
      },
      dataQuality: "complete",
      calculationVersion: CALCULATION_VERSION,
      note: "",
    };
  }
  const tender = (method: string) =>
    Number(day.tenders?.find((item: AnyDocument) => item.method === method)?.amountVnd ?? 0);
  return {
    id: String(day._id),
    businessDate: String(day.businessDate),
    status: String(day.status),
    version: Number(day.version),
    lines: (day.lines ?? []).map(serializeLine),
    payments: {
      cashVnd: tender("cash"),
      bankTransferVnd: tender("bank_transfer"),
      otherVnd: tender("other") + tender("delivery_app"),
    },
    totals: {
      grossRevenueVnd: Number(day.grossRevenueVnd),
      discountVnd: Number(day.discountVnd),
      refundVnd: Number(day.refundVnd),
      netRevenueVnd: Number(day.netRevenueVnd),
      collectedVnd: Number(day.collectedVnd),
      cogsVnd: day.cogsVnd == null ? null : Number(day.cogsVnd),
      profitVnd: day.profitVnd == null ? null : Number(day.profitVnd),
    },
    dataQuality: String(day.dataQuality),
    calculationVersion: String(day.calculationVersion),
    closedAt: day.closedAt ?? null,
    reopenedAt: day.reopenedAt ?? null,
    reopenReason: day.reopenReason ?? null,
    note: day.note ?? "",
  };
}

export async function getSalesDay(context: V2Context, rawBusinessDate: string) {
  const businessDate = parseBusinessDate(rawBusinessDate);
  await connectMongo();
  const day = await SalesDay.findOne({
    organizationId: context.organizationId,
    locationId: context.locationId,
    businessDate,
  }).lean();
  return serializeSalesDay(day as AnyDocument | null, businessDate);
}

function choosePrices(prices: AnyDocument[], locationId: Types.ObjectId) {
  const selected = new Map<string, AnyDocument>();
  for (const price of prices) {
    const key = String(price.skuId);
    const current = selected.get(key);
    const local = String(price.locationId ?? "") === String(locationId);
    const currentLocal = String(current?.locationId ?? "") === String(locationId);
    if (!current || (local && !currentLocal)) selected.set(key, price);
  }
  return selected;
}

async function draftLines(
  context: V2Context,
  businessDate: string,
  input: SaveSalesDayDraftInput,
) {
  const requested = input.lines.filter((line) => line.quantity > 0);
  const skuIds = requested.map((line) => id(line.skuId, "skuId"));
  const scope = { organizationId: context.organizationId };
  const at = priceMoment(businessDate);
  const [skus, prices] = await Promise.all([
    Sku.find({ ...scope, _id: { $in: skuIds }, isActive: true }).lean(),
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
  ]);
  if (skus.length !== skuIds.length) {
    throw new DomainError(
      "Có món không tồn tại hoặc đã ngừng bán.",
      422,
      "SKU_NOT_SELLABLE",
    );
  }
  const skuById = new Map((skus as AnyDocument[]).map((sku) => [String(sku._id), sku]));
  const priceBySkuId = choosePrices(prices as AnyDocument[], context.locationId);
  for (const line of requested) {
    if (!priceBySkuId.has(line.skuId)) {
      throw new DomainError(
        `Món ${skuById.get(line.skuId)?.name ?? line.skuId} chưa có giá hiệu lực cho ngày bán.`,
        422,
        "MISSING_SKU_PRICE",
      );
    }
  }
  const businessLineIds = (skus as AnyDocument[]).map((sku) => sku.businessLineId);
  const categoryIds = (skus as AnyDocument[]).map((sku) => sku.categoryId);
  const [businessLines, categories] = await Promise.all([
    BusinessLine.find({ ...scope, _id: { $in: businessLineIds }, isActive: true }).lean(),
    Category.find({ ...scope, _id: { $in: categoryIds }, isActive: true }).lean(),
  ]);
  const lineById = new Map(
    (businessLines as AnyDocument[]).map((item) => [String(item._id), item]),
  );
  const categoryById = new Map(
    (categories as AnyDocument[]).map((item) => [String(item._id), item]),
  );
  const calculation = calculateSalesDay(
    requested.map((line) => ({
      lineKey: line.skuId,
      skuId: line.skuId,
      quantity: line.quantity,
      unitPriceVnd: Number(priceBySkuId.get(line.skuId)?.unitPriceVnd),
      discountVnd: line.discountVnd,
      refundVnd: line.refundVnd,
    })),
    input.globalDiscountVnd,
    input.payments,
  );
  const lines = calculation.lines.map((calculated) => {
    const sku = skuById.get(calculated.skuId)!;
    const businessLine = lineById.get(String(sku.businessLineId));
    const category = categoryById.get(String(sku.categoryId));
    if (!businessLine || !category || businessLine.isPosting === false) {
      throw new DomainError(
        `Món ${sku.name} chưa có business line/category cấp lá hợp lệ.`,
        422,
        "INVALID_REPORTING_DIMENSION",
      );
    }
    return {
      lineKey: calculated.lineKey,
      skuId: sku._id,
      skuCodeSnapshot: sku.code,
      skuNameSnapshot: sku.name,
      businessLineSnapshot: {
        id: businessLine._id,
        code: businessLine.code,
        name: businessLine.name,
        pathCodes: businessLine.pathCodes ?? [],
      },
      categorySnapshot: {
        id: category._id,
        code: category.code,
        name: category.name,
      },
      quantity: String(calculated.quantity),
      quantitySource: "actual",
      salesUnitSnapshot: sku.salesUnit,
      unitPriceVnd: calculated.unitPriceVnd,
      grossRevenueVnd: calculated.grossRevenueVnd,
      discountVnd: calculated.discountVnd,
      refundVnd: calculated.refundVnd,
      netRevenueVnd: calculated.netRevenueVnd,
      unitCostVnd: null,
      cogsVnd: null,
      profitVnd: null,
      dataQuality: "missing_cost",
    };
  });
  return { lines, calculation };
}

export async function saveSalesDayDraft(
  context: V2Context,
  rawBusinessDate: string,
  input: SaveSalesDayDraftInput,
) {
  const businessDate = parseBusinessDate(rawBusinessDate);
  await connectMongo();
  const { lines, calculation } = await draftLines(context, businessDate, input);
  const tenders = [
    { method: "cash", amountVnd: calculation.payments.cashVnd },
    { method: "bank_transfer", amountVnd: calculation.payments.bankTransferVnd },
    { method: "other", amountVnd: calculation.payments.otherVnd },
  ].filter((item) => item.amountVnd > 0);
  const scope = {
    organizationId: context.organizationId,
    locationId: context.locationId,
    businessDate,
  };
  const existing = await SalesDay.findOne(scope);
  if (!existing) {
    if (input.version !== 0) {
      throw new DomainError(
        "Ngày bán chưa tồn tại; version tạo mới phải bằng 0.",
        409,
        "VERSION_CONFLICT",
      );
    }
    try {
      const created = await SalesDay.create({
        ...scope,
        status: "draft",
        lines,
        tenders,
        ...persistedSalesTotals(calculation.totals),
        cogsVnd: null,
        profitVnd: null,
        // Draft costs are intentionally unresolved until the transactional close.
        // Persisting an empty draft as `complete` would contradict the null COGS
        // contract enforced by SalesDay.
        dataQuality: "missing_cost",
        calculationVersion: CALCULATION_VERSION,
        note: input.note,
        actor: context.actor,
      });
      return serializeSalesDay(created.toObject(), businessDate);
    } catch (error) {
      if (duplicateKey(error)) {
        throw new DomainError(
          "Ngày bán vừa được tạo ở một phiên khác. Hãy tải lại.",
          409,
          "VERSION_CONFLICT",
        );
      }
      throw error;
    }
  }
  if (existing.status === "closed") {
    throw new DomainError(
      "Ngày đã chốt. Owner phải mở lại và ghi lý do trước khi sửa.",
      409,
      "SALES_DAY_CLOSED",
    );
  }
  if (Number(existing.version) !== input.version) {
    throw new DomainError(
      "Dữ liệu ngày bán đã thay đổi ở phiên khác. Hãy tải lại.",
      409,
      "VERSION_CONFLICT",
    );
  }
  existing.set({
    lines,
    tenders,
    ...persistedSalesTotals(calculation.totals),
    cogsVnd: null,
    profitVnd: null,
    dataQuality: "missing_cost",
    calculationVersion: CALCULATION_VERSION,
    note: input.note,
    version: input.version + 1,
    actor: context.actor,
  });
  await existing.save();
  return serializeSalesDay(existing.toObject(), businessDate);
}

async function sellFinishedGood(
  context: V2Context,
  day: AnyDocument,
  line: AnyDocument,
  closeVersion: number,
  idempotencyKey: string,
  occurredAt: Date,
  session: ClientSession,
) {
  const sku = (await Sku.findOne({
    _id: line.skuId,
    organizationId: context.organizationId,
    isActive: true,
  })
    .session(session)
    .lean()) as AnyDocument | null;
  if (!sku) throw new DomainError(`Không tìm thấy SKU ${line.skuCodeSnapshot}.`, 409);
  if (sku.fulfillmentMode !== "preproduced") {
    return {
      cogsVnd: line.cogsVnd == null ? null : Number(line.cogsVnd),
      unitCostVnd: line.unitCostVnd ?? null,
    };
  }
  if (!sku.outputInventoryItemId) {
    throw new DomainError(
      `${sku.name} là món làm sẵn nhưng chưa liên kết thành phẩm kho.`,
      409,
      "MISSING_FINISHED_GOOD",
    );
  }
  const balances = (await InventoryBalance.find({
    organizationId: context.organizationId,
    locationId: context.locationId,
    inventoryItemId: sku.outputInventoryItemId,
    availableQuantity: { $gt: 0 },
  })
    .session(session)
    .lean()) as AnyDocument[];
  const lotIds = balances.map((balance) => balance.inventoryLotId).filter(Boolean);
  const lots = (await InventoryLot.find({
    _id: { $in: lotIds },
    organizationId: context.organizationId,
    locationId: context.locationId,
    status: "available",
    $or: [{ expiresAt: null }, { expiresAt: { $gt: occurredAt } }],
  })
    .session(session)
    .lean()) as AnyDocument[];
  const lotById = new Map(lots.map((lot) => [String(lot._id), lot]));
  const available: AvailableLot[] = balances
    .filter(
      (balance) =>
        !balance.inventoryLotId || lotById.has(String(balance.inventoryLotId)),
    )
    .map((balance) => {
      const lot = lotById.get(String(balance.inventoryLotId));
      return {
        balanceId: String(balance._id),
        inventoryLotId: documentId(balance.inventoryLotId),
        availableQuantity: decimalString(balance.availableQuantity),
        unitCostVnd:
          balance.averageUnitCostVnd == null
            ? null
            : decimalString(balance.averageUnitCostVnd),
        costDataQuality: balance.costDataQuality,
        expiresAt: lot?.expiresAt ?? null,
        producedAt: lot?.producedAt ?? null,
      };
    });
  const quantity = Number(decimalString(line.quantity));
  const allocations = allocateFefo(available, quantity);
  let cogsVnd = 0;
  let hasMissingCost = false;
  for (const [index, allocation] of allocations.entries()) {
    const allocationHasCost =
      allocation.costDataQuality === "complete" &&
      allocation.unitCostVnd != null;
    const amountVnd = allocationHasCost
      ? multiplyDecimalRateToVnd(
          String(allocation.quantity),
          allocation.unitCostVnd!,
        )
      : null;
    if (amountVnd == null) hasMissingCost = true;
    else cogsVnd += amountVnd;
    const delta = Types.Decimal128.fromString(String(-allocation.quantity));
    const balanceIncrement: Record<string, unknown> = {
      onHandQuantity: delta,
      availableQuantity: delta,
      version: 1,
    };
    if (amountVnd != null) balanceIncrement.inventoryValueVnd = -amountVnd;
    const updated = await InventoryBalance.findOneAndUpdate(
      {
        _id: id(allocation.balanceId, "balanceId"),
        availableQuantity: { $gte: Types.Decimal128.fromString(String(allocation.quantity)) },
      },
      {
        $inc: balanceIncrement,
        $set: { lastMovementAt: occurredAt, actor: context.actor },
      },
      { new: true, session },
    );
    if (!updated) {
      throw new DomainError(
        `Tồn ${sku.name} vừa thay đổi. Hãy tải lại trước khi chốt.`,
        409,
        "INVENTORY_CONFLICT",
      );
    }
    if (allocation.inventoryLotId) {
      const updatedLot = await InventoryLot.findOneAndUpdate(
        {
          _id: id(allocation.inventoryLotId, "inventoryLotId"),
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId: sku.outputInventoryItemId,
          status: "available",
          onHandQuantity: {
            $gte: Types.Decimal128.fromString(String(allocation.quantity)),
          },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: occurredAt } }],
        },
        {
          $inc: { onHandQuantity: delta, version: 1 },
          $set: { actor: context.actor },
        },
        { new: true, session },
      );
      if (!updatedLot) {
        throw new DomainError(
          `Lot ${sku.name} vừa thay đổi. Hãy tải lại trước khi chốt.`,
          409,
          "INVENTORY_CONFLICT",
        );
      }
      if (compareDecimalStringsExact(updatedLot.onHandQuantity, "0") === 0) {
        await InventoryLot.updateOne(
          { _id: updatedLot._id },
          { $set: { status: "depleted", actor: context.actor } },
          { session },
        );
      }
    }
    const movement = await StockMovement.create(
      [
        {
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId: sku.outputInventoryItemId,
          inventoryLotId: allocation.inventoryLotId
            ? id(allocation.inventoryLotId, "inventoryLotId")
            : null,
          itemCodeSnapshot: sku.code,
          itemNameSnapshot: sku.name,
          unitSnapshot: "each",
          movementType: "sale_consume",
          quantityDelta: String(-allocation.quantity),
          unitCostVnd: allocation.unitCostVnd,
          inventoryValueDeltaVnd: amountVnd == null ? null : -amountVnd,
          businessDate: day.businessDate,
          occurredAt,
          sourceType: "sales_day",
          sourceId: day._id,
          sourceLineKey: `${line.lineKey}:v${closeVersion}:${index}`,
          idempotencyKey: `${idempotencyKey}:stock:${line.lineKey}:${index}`,
          actor: context.actor,
        },
      ],
      { session },
    );
    const linkedMovement = await InventoryBalance.updateOne(
      {
        _id: updated._id,
        organizationId: context.organizationId,
        locationId: context.locationId,
      },
      { $set: { lastMovementId: movement[0]._id } },
      { session },
    );
    if (linkedMovement.matchedCount !== 1) {
      throw new DomainError(
        "Không thể liên kết bút toán bán với balance vừa cập nhật.",
        409,
        "INVENTORY_CONFLICT",
      );
    }
  }
  return hasMissingCost
    ? { cogsVnd: null, unitCostVnd: null }
    : { cogsVnd, unitCostVnd: costRate(cogsVnd, quantity) };
}

function factDimensions(day: AnyDocument) {
  const dimensions: AnyDocument[] = [];
  const lineGroups = new Map<string, AnyDocument>();
  for (const line of day.lines as AnyDocument[]) {
    const businessKey = `business_line:${line.businessLineSnapshot.code}`;
    const current = lineGroups.get(businessKey) ?? {
      dimensionType: "business_line",
      dimensionId: line.businessLineSnapshot.id,
      dimensionCode: line.businessLineSnapshot.code,
      dimensionName: line.businessLineSnapshot.name,
      quantity: 0,
      grossRevenueVnd: 0,
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: 0,
      collectedVnd: 0,
      cogsVnd: 0,
      profitVnd: 0,
      dataQuality: "complete",
    };
    current.quantity += Number(decimalString(line.quantity));
    for (const key of [
      "grossRevenueVnd",
      "discountVnd",
      "refundVnd",
      "netRevenueVnd",
    ]) {
      current[key] += Number(line[key]);
    }
    if (line.cogsVnd == null || line.profitVnd == null) {
      current.cogsVnd = null;
      current.profitVnd = null;
      current.dataQuality = "missing_cost";
    } else if (current.cogsVnd != null && current.profitVnd != null) {
      current.cogsVnd += Number(line.cogsVnd);
      current.profitVnd += Number(line.profitVnd);
    }
    lineGroups.set(businessKey, current);
    dimensions.push({
      dimensionType: "sku",
      dimensionId: line.skuId,
      dimensionCode: line.skuCodeSnapshot,
      dimensionName: line.skuNameSnapshot,
      quantity: line.quantity,
      grossRevenueVnd: line.grossRevenueVnd,
      discountVnd: line.discountVnd,
      refundVnd: line.refundVnd,
      netRevenueVnd: line.netRevenueVnd,
      collectedVnd: 0,
      cogsVnd: line.cogsVnd,
      profitVnd: line.profitVnd,
      dataQuality: line.dataQuality,
    });
  }
  dimensions.push(...lineGroups.values());
  for (const tender of day.tenders as AnyDocument[]) {
    dimensions.push({
      dimensionType: "tender",
      dimensionId: null,
      dimensionCode: tender.method,
      dimensionName: tender.method,
      quantity: "0",
      grossRevenueVnd: 0,
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: 0,
      collectedVnd: tender.amountVnd,
      cogsVnd: 0,
      profitVnd: 0,
      dataQuality: "complete",
    });
  }
  return dimensions;
}

async function writeFact(day: AnyDocument, session: ClientSession) {
  const dimensions = factDimensions(day);
  const sourceChecksum = createHash("sha256")
    .update(
      JSON.stringify({
        salesDayId: String(day._id),
        version: day.version,
        totals: [
          day.grossRevenueVnd,
          day.discountVnd,
          day.refundVnd,
          day.netRevenueVnd,
          day.collectedVnd,
          day.cogsVnd ?? null,
          day.profitVnd ?? null,
        ],
        dimensions,
      }),
    )
    .digest("hex");
  await DailyRevenueFact.updateOne(
    {
      organizationId: day.organizationId,
      locationId: day.locationId,
      businessDate: day.businessDate,
    },
    {
      $set: {
        salesDayId: day._id,
        salesDayVersion: day.version,
        grossRevenueVnd: day.grossRevenueVnd,
        discountVnd: day.discountVnd,
        refundVnd: day.refundVnd,
        netRevenueVnd: day.netRevenueVnd,
        collectedVnd: day.collectedVnd,
        cogsVnd: day.cogsVnd,
        profitVnd: day.profitVnd,
        dimensions,
        dataQuality: day.dataQuality,
        calculationVersion: day.calculationVersion,
        rebuiltAt: new Date(),
        sourceChecksum,
      },
      $setOnInsert: {
        organizationId: day.organizationId,
        locationId: day.locationId,
        businessDate: day.businessDate,
        version: 1,
      },
    },
    { upsert: true, session },
  );
}

async function audit(
  context: V2Context,
  eventType: string,
  entityId: Types.ObjectId,
  idempotencyKey: string,
  requestHash: string,
  details: AnyDocument,
  session: ClientSession,
) {
  await AuditLog.create(
    [{
      organizationId: context.organizationId,
      locationId: context.locationId,
      action: eventType.endsWith("reopened") ? "reopen" : "close",
      resourceType: "sales_day",
      resourceId: String(entityId),
      resourceVersion: Number(details.version ?? 1),
      requestId: idempotencyKey,
      idempotencyKey,
      requestHash,
      reason: typeof details.reason === "string" ? details.reason : undefined,
      changes: [],
      metadata: details,
      actor: context.actor,
      occurredAt: new Date(),
    }],
    { session },
  );
}

export async function closeSalesDay(
  context: V2Context,
  rawBusinessDate: string,
  input: CloseSalesDayInput,
) {
  const businessDate = parseBusinessDate(rawBusinessDate);
  const requestHash = salesOperationRequestHash("close", businessDate, input);
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: ReturnType<typeof serializeSalesDay> | null = null;
  try {
    await session.withTransaction(async () => {
      const day = (await SalesDay.findOne({
        organizationId: context.organizationId,
        locationId: context.locationId,
        businessDate,
      }).session(session)) as AnyDocument | null;
      if (!day) throw new DomainError("Ngày bán chưa có bản nháp.", 404, "NOT_FOUND");
      const previousClose = await AuditLog.findOne({
        organizationId: context.organizationId,
        locationId: context.locationId,
        action: "close",
        resourceType: "sales_day",
        resourceId: String(day._id),
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean();
      if (previousClose) {
        assertWriteReplay(
          previousClose.requestHash ?? previousClose.metadata?.requestHash,
          requestHash,
          "nội dung chốt ngày",
        );
        if (
          day.status === "closed" &&
          Number(day.version) === Number(previousClose.resourceVersion)
        ) {
          output = serializeSalesDay(day.toObject(), businessDate);
          return;
        }
        throw new DomainError(
          "Lần chốt này đã bị thay thế bởi thao tác mở lại hoặc chốt mới.",
          409,
          "IDEMPOTENCY_OPERATION_SUPERSEDED",
        );
      }
      if (day.status === "closed") {
        throw new DomainError("Ngày này đã được chốt.", 409, "SALES_DAY_CLOSED");
      }
      if (Number(day.version) !== input.version) {
        throw new DomainError(
          "Bản nháp đã thay đổi. Hãy tải lại trước khi chốt.",
          409,
          "VERSION_CONFLICT",
        );
      }
      if (!day.lines.length) {
        throw new DomainError("Không thể chốt ngày chưa có món bán.", 422);
      }
      if (Number(day.collectedVnd) !== Number(day.netRevenueVnd)) {
        throw new DomainError(
          "Tiền đã thu phải bằng doanh thu thuần trước khi chốt.",
          422,
          "PAYMENT_MISMATCH",
          {
            collectedVnd: day.collectedVnd,
            netRevenueVnd: day.netRevenueVnd,
          },
        );
      }
      const closeVersion = Number(day.version) + 1;
      const occurredAt = new Date();
      let totalCogs = 0;
      for (const line of day.lines as AnyDocument[]) {
        const cost = await sellFinishedGood(
          context,
          day,
          line,
          closeVersion,
          input.idempotencyKey,
          occurredAt,
          session,
        );
        line.cogsVnd = cost.cogsVnd;
        line.unitCostVnd = cost.unitCostVnd;
        line.profitVnd =
          cost.cogsVnd == null
            ? null
            : Number(line.netRevenueVnd) - cost.cogsVnd;
        if (cost.unitCostVnd != null && cost.cogsVnd != null) {
          line.dataQuality = "complete";
          totalCogs += cost.cogsVnd;
        }
      }
      const hasMissingCost = day.lines.some(
        (line: AnyDocument) => line.dataQuality !== "complete",
      );
      day.cogsVnd = hasMissingCost ? null : totalCogs;
      day.profitVnd = hasMissingCost
        ? null
        : Number(day.netRevenueVnd) - totalCogs;
      day.dataQuality = hasMissingCost ? "missing_cost" : "complete";
      day.status = "closed";
      day.closedAt = occurredAt;
      day.closedBy = context.actor;
      day.idempotencyKey = input.idempotencyKey;
      day.calculationVersion = CALCULATION_VERSION;
      day.version = closeVersion;
      day.actor = context.actor;
      await day.save({ session });

      const revenueDocuments = (day.lines as AnyDocument[]).map((line) => ({
        organizationId: context.organizationId,
        locationId: context.locationId,
        salesDayId: day._id,
        lineKey: `${line.lineKey}:v${closeVersion}`,
        businessDate,
        entryType: "sale",
        skuId: line.skuId,
        skuCodeSnapshot: line.skuCodeSnapshot,
        skuNameSnapshot: line.skuNameSnapshot,
        businessLineId: line.businessLineSnapshot.id,
        businessLineCodeSnapshot: line.businessLineSnapshot.code,
        businessLineNameSnapshot: line.businessLineSnapshot.name,
        businessLinePathCodesSnapshot: line.businessLineSnapshot.pathCodes,
        categoryId: line.categorySnapshot?.id ?? null,
        categoryCodeSnapshot: line.categorySnapshot?.code,
        categoryNameSnapshot: line.categorySnapshot?.name,
        quantity: line.quantity,
        quantitySource: line.quantitySource,
        salesUnitSnapshot: line.salesUnitSnapshot,
        grossRevenueVnd: line.grossRevenueVnd,
        discountVnd: line.discountVnd,
        refundVnd: line.refundVnd,
        netRevenueVnd: line.netRevenueVnd,
        cogsVnd: line.cogsVnd,
        profitVnd: line.profitVnd,
        dataQuality: line.dataQuality,
        calculationVersion: CALCULATION_VERSION,
        idempotencyKey: `${input.idempotencyKey}:revenue:${line.lineKey}`,
        occurredAt,
        actor: context.actor,
      }));
      await RevenueEntry.create(revenueDocuments, { session });
      await writeFact(day.toObject(), session);
      await audit(
        context,
        "sales_day.closed",
        day._id,
        input.idempotencyKey,
        requestHash,
        {
          businessDate,
          version: closeVersion,
          netRevenueVnd: day.netRevenueVnd,
          requestHash,
        },
        session,
      );
      output = serializeSalesDay(day.toObject(), businessDate);
    });
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể hoàn tất chốt ngày.", 503);
  return output;
}

export async function reopenSalesDay(
  context: V2Context,
  rawBusinessDate: string,
  input: ReopenSalesDayInput,
) {
  const businessDate = parseBusinessDate(rawBusinessDate);
  const requestHash = salesOperationRequestHash("reopen", businessDate, input);
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: ReturnType<typeof serializeSalesDay> | null = null;
  try {
    await session.withTransaction(async () => {
      const day = (await SalesDay.findOne({
        organizationId: context.organizationId,
        locationId: context.locationId,
        businessDate,
      }).session(session)) as AnyDocument | null;
      if (!day) throw new DomainError("Không tìm thấy ngày bán.", 404, "NOT_FOUND");
      const previousAudit = await AuditLog.findOne({
        organizationId: context.organizationId,
        locationId: context.locationId,
        action: "reopen",
        resourceType: "sales_day",
        resourceId: String(day._id),
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean();
      if (previousAudit) {
        assertWriteReplay(
          previousAudit.requestHash ?? previousAudit.metadata?.requestHash,
          requestHash,
          "nội dung mở lại ngày",
        );
        if (
          day.status === "reopened" &&
          Number(day.version) === Number(previousAudit.resourceVersion)
        ) {
          output = serializeSalesDay(day.toObject(), businessDate);
          return;
        }
        throw new DomainError(
          "Lần mở lại này đã bị thay thế bởi thao tác chốt mới.",
          409,
          "IDEMPOTENCY_OPERATION_SUPERSEDED",
        );
      }
      if (day.status !== "closed") {
        throw new DomainError("Chỉ ngày đã chốt mới có thể mở lại.", 409);
      }
      if (Number(day.version) !== input.version) {
        throw new DomainError("Ngày bán đã thay đổi. Hãy tải lại.", 409, "VERSION_CONFLICT");
      }
      if (
        day.legacySource ||
        (day.lines as AnyDocument[]).some((line) => !line.skuId)
      ) {
        throw new DomainError(
          "Ngày lịch sử chỉ là snapshot đối soát và không thể mở lại bằng luồng SKU v2.",
          409,
          "LEGACY_SALES_DAY_IMMUTABLE",
        );
      }
      const saleEntries = (await RevenueEntry.find({
        organizationId: context.organizationId,
        locationId: context.locationId,
        salesDayId: day._id,
        entryType: "sale",
      })
        .session(session)
        .lean()) as AnyDocument[];
      const existingRevenueReversals = await RevenueEntry.distinct("reversalOfId", {
        organizationId: context.organizationId,
        locationId: context.locationId,
        salesDayId: day._id,
        entryType: "reversal",
      }).session(session);
      const reversedRevenueIds = new Set(existingRevenueReversals.map(String));
      const activeEntries = saleEntries.filter(
        (entry) => !reversedRevenueIds.has(String(entry._id)),
      );
      if (activeEntries.length) {
        await RevenueEntry.create(
          activeEntries.map((entry) => ({
            ...Object.fromEntries(
              Object.entries(entry).filter(
                ([key]) => !["_id", "createdAt", "updatedAt"].includes(key),
              ),
            ),
            lineKey: `${entry.lineKey}:reversal`,
            entryType: "reversal",
            ...reversalRevenueSnapshot({
              quantity: decimalString(entry.quantity),
              quantitySource: String(entry.quantitySource),
              salesUnitSnapshot: String(entry.salesUnitSnapshot),
              grossRevenueVnd: Number(entry.grossRevenueVnd),
              discountVnd: Number(entry.discountVnd),
              refundVnd: Number(entry.refundVnd),
              netRevenueVnd: Number(entry.netRevenueVnd),
              cogsVnd: entry.cogsVnd == null ? null : Number(entry.cogsVnd),
              profitVnd:
                entry.profitVnd == null ? null : Number(entry.profitVnd),
            }),
            reversalOfId: entry._id,
            reversalReason: input.reason,
            idempotencyKey: `${input.idempotencyKey}:revenue:${entry._id}`,
            occurredAt: new Date(),
            actor: context.actor,
          })),
          { session },
        );
      }
      const saleMovements = (await StockMovement.find({
        organizationId: context.organizationId,
        locationId: context.locationId,
        sourceType: "sales_day",
        sourceId: day._id,
        movementType: "sale_consume",
      })
        .session(session)
        .lean()) as AnyDocument[];
      const reversedMovementIds = new Set(
        (
          await StockMovement.distinct("reversalOfId", {
            organizationId: context.organizationId,
            locationId: context.locationId,
            sourceType: "reversal",
          }).session(session)
        ).map(String),
      );
      for (const movement of saleMovements.filter(
        (item) => !reversedMovementIds.has(String(item._id)),
      )) {
        const restoredQuantity = decimalString(movement.quantityDelta).replace(/^-/, "");
        const delta = Types.Decimal128.fromString(restoredQuantity);
        const restoredValueVnd =
          movement.inventoryValueDeltaVnd == null
            ? null
            : -Number(movement.inventoryValueDeltaVnd);
        const balanceIncrement: Record<string, unknown> = {
          onHandQuantity: delta,
          availableQuantity: delta,
          version: 1,
        };
        if (restoredValueVnd != null) {
          balanceIncrement.inventoryValueVnd = restoredValueVnd;
        }
        const restoredBalance = await InventoryBalance.findOneAndUpdate(
          {
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId: movement.inventoryItemId,
            inventoryLotId: movement.inventoryLotId ?? null,
          },
          {
            $inc: balanceIncrement,
            $set: { lastMovementAt: new Date(), actor: context.actor },
          },
          { new: true, session },
        );
        if (!restoredBalance) {
          throw new DomainError(
            "Không thể khôi phục tồn kho vì balance không còn tồn tại.",
            409,
            "INVENTORY_CONFLICT",
          );
        }
        if (movement.inventoryLotId) {
          const restoredLot = await InventoryLot.findOneAndUpdate(
            {
              _id: movement.inventoryLotId,
              organizationId: context.organizationId,
              locationId: context.locationId,
              inventoryItemId: movement.inventoryItemId,
            },
            {
              $inc: { onHandQuantity: delta, version: 1 },
              $set: { status: "available", actor: context.actor },
            },
            { new: true, session },
          );
          if (!restoredLot) {
            throw new DomainError(
              "Không thể khôi phục lot thành phẩm vì lot không còn tồn tại.",
              409,
              "INVENTORY_CONFLICT",
            );
          }
        }
        const reversal = await StockMovement.create(
          [
            {
              organizationId: movement.organizationId,
              locationId: movement.locationId,
              inventoryItemId: movement.inventoryItemId,
              inventoryLotId: movement.inventoryLotId,
              itemCodeSnapshot: movement.itemCodeSnapshot,
              itemNameSnapshot: movement.itemNameSnapshot,
              unitSnapshot: movement.unitSnapshot,
              movementType: "reversal",
              quantityDelta: restoredQuantity,
              unitCostVnd: movement.unitCostVnd,
              inventoryValueDeltaVnd: restoredValueVnd,
              businessDate,
              occurredAt: new Date(),
              sourceType: "reversal",
              sourceId: day._id,
              sourceLineKey: `${movement.sourceLineKey}:reversal`,
              reversalOfId: movement._id,
              reason: input.reason,
              idempotencyKey: `${input.idempotencyKey}:stock:${movement._id}`,
              actor: context.actor,
            },
          ],
          { session },
        );
        const linkedMovement = await InventoryBalance.updateOne(
          {
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId: movement.inventoryItemId,
            inventoryLotId: movement.inventoryLotId ?? null,
          },
          { $set: { lastMovementId: reversal[0]._id } },
          { session },
        );
        if (linkedMovement.matchedCount !== 1) {
          throw new DomainError(
            "Không thể liên kết bút toán đảo với balance vừa khôi phục.",
            409,
            "INVENTORY_CONFLICT",
          );
        }
      }
      day.status = "reopened";
      day.reopenedAt = new Date();
      day.reopenedBy = context.actor;
      day.reopenReason = input.reason;
      day.version = Number(day.version) + 1;
      day.actor = context.actor;
      await day.save({ session });
      await DailyRevenueFact.deleteOne(
        {
          organizationId: context.organizationId,
          locationId: context.locationId,
          businessDate,
        },
        { session },
      );
      await audit(
        context,
        "sales_day.reopened",
        day._id,
        input.idempotencyKey,
        requestHash,
        {
          businessDate,
          reason: input.reason,
          version: day.version,
          requestHash,
        },
        session,
      );
      output = serializeSalesDay(day.toObject(), businessDate);
    });
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể mở lại ngày bán.", 503);
  return output;
}
