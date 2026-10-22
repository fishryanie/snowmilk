import "server-only";

import { createHash } from "node:crypto";
import { Types, type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { Product } from "@/models/Product";
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
import { RevenueEntry } from "@/models/v2/RevenueEntry";
import { SalesDay } from "@/models/v2/SalesDay";
import { Sku } from "@/models/v2/Sku";
import { SkuPrice } from "@/models/v2/SkuPrice";
import {
  id,
  parseBusinessDate,
  type V2Context,
} from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import {
  persistedSalesTotals,
  reversalRevenueSnapshot,
  salesOperationRequestHash,
} from "@/services/v2/operation-invariants";
import { assertWriteReplay } from "@/services/v2/write-idempotency";
import { decimalString, documentId } from "@/services/v2/serialize";

const CALCULATION_VERSION = "sales-v2.2";

// Mongoose lean/hydrated documents are dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDocument = Record<string, any>;

function priceMoment(businessDate: string) {
  return new Date(`${businessDate}T23:59:59.999+07:00`);
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
): Promise<ReturnType<typeof serializeSalesDay>> {
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
      const products = await Product.find({
        code: { $in: (day.lines as AnyDocument[]).map((line) => line.skuCodeSnapshot) },
      }).select("code fullCost").session(session).lean();
      const costByCode = new Map(products.map((product) => [String(product.code), Number(product.fullCost)]));
      for (const line of day.lines as AnyDocument[]) {
        const unitCost = costByCode.get(String(line.skuCodeSnapshot));
        const hasCost = unitCost != null && Number.isFinite(unitCost) && unitCost > 0;
        line.unitCostVnd = hasCost ? String(unitCost) : null;
        line.cogsVnd = hasCost
          ? multiplyDecimalRateToVnd(decimalString(line.quantity), String(unitCost))
          : null;
        line.profitVnd = hasCost ? Number(line.netRevenueVnd) - line.cogsVnd : null;
        line.dataQuality = hasCost ? "complete" : "missing_cost";
        if (hasCost) totalCogs += line.cogsVnd;
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
): Promise<ReturnType<typeof serializeSalesDay>> {
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
