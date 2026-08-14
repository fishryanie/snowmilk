import "server-only";

import { Types, type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import { multiplyDecimalRateToVnd } from "@/lib/v2/money";
import type {
  CompleteProductionBatchInput,
  CreateProductionBatchInput,
} from "@/lib/validators/v2/production-batches";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { InventoryItem } from "@/models/v2/InventoryItem";
import { InventoryLot } from "@/models/v2/InventoryLot";
import { ProductionBatch } from "@/models/v2/ProductionBatch";
import { RecipeVersion } from "@/models/v2/RecipeVersion";
import { Sku } from "@/models/v2/Sku";
import { StockMovement } from "@/models/v2/StockMovement";
import { compareDecimalStringsExact } from "@/models/v2/helpers";
import {
  id,
  parseBusinessDate,
  type V2Context,
} from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import { decimalString } from "@/services/v2/serialize";
import { operationKeySuffix } from "@/services/v2/operation-invariants";
import { isProductionRecipeEligible } from "@/services/v2/production-invariants";
import {
  assertWriteReplay,
  productionBatchRequestHash,
} from "@/services/v2/write-idempotency";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

function businessDateAtHcm(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function serializeBatch(batch: Plain) {
  return {
    id: String(batch._id),
    version: Number(batch.version),
    status: String(batch.status),
    batchCode: String(batch.batchCode),
    businessDate: String(batch.businessDate),
    productName: String(batch.skuNameSnapshot),
    skuCode: String(batch.skuCodeSnapshot),
    startedAt: batch.startedAt ?? null,
    completedAt: batch.completedAt ?? null,
    goodOutputQuantity: Number(decimalString(batch.goodOutputQuantity)),
    wasteOutputQuantity: Number(decimalString(batch.wasteOutputQuantity)),
    soldQuantity:
      batch.soldQuantity == null
        ? null
        : Number(decimalString(batch.soldQuantity)),
    remainingQuantity:
      batch.remainingQuantity == null
        ? null
        : Number(decimalString(batch.remainingQuantity)),
    actualCostPerUnitVnd:
      batch.actualCostPerOutputUnitVnd == null
        ? null
        : Number(decimalString(batch.actualCostPerOutputUnitVnd)),
    costDataQuality: String(batch.costDataQuality),
    expiresAt: batch.expiresAt ?? null,
    note: batch.note ?? "",
  };
}

export async function listProduction(context: V2Context) {
  await connectMongo();
  const scope = { organizationId: context.organizationId };
  const [recipes, batches] = await Promise.all([
    RecipeVersion.find({ ...scope, status: "released", isActive: true })
      .sort({ name: 1, versionNumber: -1 })
      .lean(),
    ProductionBatch.find({ ...scope, locationId: context.locationId })
      .sort({ businessDate: -1, createdAt: -1 })
      .limit(100)
      .lean(),
  ]);
  const recipeRows = recipes as Plain[];
  const skus = (await Sku.find({
    ...scope,
    _id: { $in: recipeRows.map((recipe) => recipe.skuId) },
    fulfillmentMode: "preproduced",
    isActive: true,
  }).lean()) as Plain[];
  const skuById = new Map(skus.map((sku) => [String(sku._id), sku]));
  const batchRows = batches as Plain[];
  const outputLotIds = batchRows
    .map((batch) => batch.outputInventoryLotId)
    .filter(Boolean);
  const outputBalances = (await InventoryBalance.find({
    ...scope,
    locationId: context.locationId,
    inventoryLotId: { $in: outputLotIds },
  }).lean()) as Plain[];
  const balanceByLotId = new Map(
    outputBalances.map((balance) => [String(balance.inventoryLotId), balance]),
  );
  const productionRecipes = recipeRows.filter((recipe) =>
    isProductionRecipeEligible(recipe, skuById.get(String(recipe.skuId))),
  );
  return {
    recipeVersions: productionRecipes.map((recipe) => {
      const sku = skuById.get(String(recipe.skuId));
      return {
        id: String(recipe._id),
        productName: String(sku?.name ?? recipe.name),
        skuCode: String(sku?.code ?? ""),
        version: Number(recipe.versionNumber),
        finishedSpec: recipe.finishedSpec.map((line: Plain) => ({
          name: line.itemName,
          quantity: Number(decimalString(line.quantity)),
          unit: line.unit,
        })),
        components: recipe.components.map((component: Plain) => ({
          inventoryItemId: String(component.inventoryItemId),
          name: component.itemName,
          baseUnit: component.unit,
          expectedQuantity:
            component.inputQuantity == null
              ? 0
              : Number(decimalString(component.inputQuantity)),
        })),
      };
    }),
    batches: batchRows.map((batch) => {
      const balance = balanceByLotId.get(String(batch.outputInventoryLotId));
      const remainingQuantity = balance
        ? decimalString(balance.onHandQuantity)
        : batch.status === "completed"
          ? "0"
          : null;
      const goodOutput = Number(decimalString(batch.goodOutputQuantity));
      const remaining = remainingQuantity == null ? null : Number(remainingQuantity);
      return serializeBatch({
        ...batch,
        remainingQuantity,
        soldQuantity: remaining == null ? null : String(goodOutput - remaining),
      });
    }),
  };
}

export async function createProductionBatch(
  context: V2Context,
  input: CreateProductionBatchInput,
) {
  await connectMongo();
  const requestHash = productionBatchRequestHash(input);
  const startedAt = new Date(input.startedAt ?? new Date());
  const businessDate = parseBusinessDate(
    (input as CreateProductionBatchInput & { businessDate?: string }).businessDate ??
      businessDateAtHcm(startedAt),
  );
  const existing = await ProductionBatch.findOne({
    organizationId: context.organizationId,
    locationId: context.locationId,
    idempotencyKey: input.idempotencyKey,
  }).lean();
  if (existing) {
    assertWriteReplay(existing.requestHash, requestHash, "nội dung tạo mẻ");
    return serializeBatch(existing as Plain);
  }

  const recipe = (await RecipeVersion.findOne({
    _id: id(input.recipeVersionId, "recipeVersionId"),
    organizationId: context.organizationId,
    status: "released",
    isActive: true,
  }).lean()) as Plain | null;
  if (!recipe) {
    throw new DomainError(
      "Công thức không tồn tại hoặc chưa được phát hành.",
      422,
      "RECIPE_NOT_RELEASED",
    );
  }
  const [sku, outputItem] = (await Promise.all([
    Sku.findOne({ _id: recipe.skuId, organizationId: context.organizationId }).lean(),
    InventoryItem.findOne({
      _id: recipe.outputInventoryItemId,
      organizationId: context.organizationId,
    }).lean(),
  ])) as [Plain | null, Plain | null];
  if (!sku || !outputItem || sku.fulfillmentMode !== "preproduced") {
    throw new DomainError(
      "Công thức chưa liên kết đúng SKU và thành phẩm làm sẵn.",
      422,
      "INVALID_PRODUCTION_RECIPE",
    );
  }
  const batchCode = `${sku.code}-${businessDate.replaceAll("-", "")}-${operationKeySuffix(input.idempotencyKey)}`;
  try {
    const batch = await ProductionBatch.create({
      organizationId: context.organizationId,
      locationId: context.locationId,
      businessDate,
      batchCode,
      skuId: sku._id,
      skuCodeSnapshot: sku.code,
      skuNameSnapshot: sku.name,
      recipeVersionId: recipe._id,
      recipeVersionSnapshot: {
        recipeCode: recipe.recipeCode,
        versionNumber: recipe.versionNumber,
        contentHash: recipe.contentHash,
      },
      outputInventoryItemId: outputItem._id,
      outputItemCodeSnapshot: outputItem.code,
      outputItemNameSnapshot: outputItem.name,
      outputUnit: outputItem.baseUnit,
      plannedOutputQuantity: String(input.plannedOutputQuantity),
      shelfLifeHours: recipe.shelfLifeHours ?? null,
      startedAt,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "draft",
      idempotencyKey: input.idempotencyKey,
      requestHash,
      note: input.note,
      actor: context.actor,
    });
    return serializeBatch(batch.toObject());
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const repeated = await ProductionBatch.findOne({
      organizationId: context.organizationId,
      locationId: context.locationId,
      idempotencyKey: input.idempotencyKey,
    }).lean();
    if (!repeated) throw error;
    assertWriteReplay(repeated.requestHash, requestHash, "nội dung tạo mẻ");
    return serializeBatch(repeated as Plain);
  }
}

async function balanceForInput(
  context: V2Context,
  component: CompleteProductionBatchInput["components"][number],
  occurredAt: Date,
  session: ClientSession,
) {
  const inventoryItemId = id(component.inventoryItemId, "inventoryItemId");
  const inventoryLotId = component.inventoryLotId
    ? id(component.inventoryLotId, "inventoryLotId")
    : null;
  const item = (await InventoryItem.findOne({
    organizationId: context.organizationId,
    _id: inventoryItemId,
  })
    .session(session)
    .lean()) as Plain | null;
  if (!item) {
    throw new DomainError(
      `Nguyên liệu ${component.inventoryItemId} không tồn tại.`,
      422,
      "INVENTORY_ITEM_NOT_FOUND",
    );
  }
  if (item.lotTracked && !inventoryLotId) {
    throw new DomainError(
      `${item.name} được theo dõi theo lot; hãy chọn lot thực dùng.`,
      422,
      "INVENTORY_LOT_REQUIRED",
    );
  }
  if (!item.lotTracked && inventoryLotId) {
    throw new DomainError(
      `${item.name} không theo dõi theo lot.`,
      422,
      "INVENTORY_LOT_NOT_ALLOWED",
    );
  }
  const [balance, lot] = (await Promise.all([
    InventoryBalance.findOne({
      organizationId: context.organizationId,
      locationId: context.locationId,
      inventoryItemId,
      inventoryLotId,
      availableQuantity: { $gte: Types.Decimal128.fromString(component.quantity) },
    })
      .session(session)
      .lean(),
    inventoryLotId
      ? InventoryLot.findOne({
          _id: inventoryLotId,
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId,
          status: "available",
          onHandQuantity: {
            $gte: Types.Decimal128.fromString(component.quantity),
          },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: occurredAt } }],
        })
          .session(session)
          .lean()
      : Promise.resolve(null),
  ])) as [Plain | null, Plain | null];
  if (!balance || (inventoryLotId && !lot)) {
    throw new DomainError(
      `Không đủ tồn nguyên liệu ${component.inventoryItemId}.`,
      409,
      "INSUFFICIENT_RAW_STOCK",
    );
  }
  return { balance, item, inventoryItemId, inventoryLotId, lot };
}

export async function completeProductionBatch(
  context: V2Context,
  batchId: string,
  input: CompleteProductionBatchInput,
) {
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: ReturnType<typeof serializeBatch> | null = null;
  try {
    await session.withTransaction(async () => {
      const batch = (await ProductionBatch.findOne({
        _id: id(batchId),
        organizationId: context.organizationId,
        locationId: context.locationId,
      }).session(session)) as Plain | null;
      if (!batch) throw new DomainError("Không tìm thấy mẻ sản xuất.", 404, "NOT_FOUND");
      if (batch.status === "completed") {
        if (batch.completionIdempotencyKey !== input.idempotencyKey) {
          throw new DomainError(
            "Mẻ đã được hoàn tất bởi một yêu cầu khác.",
            409,
            "IDEMPOTENCY_KEY_REUSED",
          );
        }
        output = serializeBatch(batch.toObject());
        return;
      }
      if (batch.status !== "draft" || Number(batch.version) !== input.version) {
        throw new DomainError("Mẻ đã thay đổi. Hãy tải lại.", 409, "VERSION_CONFLICT");
      }
      const completedAt = new Date(input.completedAt);
      if (batch.startedAt && completedAt < new Date(batch.startedAt)) {
        throw new DomainError(
          "Thời điểm hoàn tất không thể trước thời điểm bắt đầu.",
          422,
          "INVALID_COMPLETION_TIME",
        );
      }
      const recipe = (await RecipeVersion.findById(batch.recipeVersionId)
        .session(session)
        .lean()) as Plain | null;
      if (!recipe || !["released", "retired"].includes(recipe.status)) {
        throw new DomainError("Phiên bản công thức không còn hợp lệ.", 409);
      }
      const recipeComponentIds = new Set(
        (recipe.components as Plain[]).map((component) =>
          String(component.inventoryItemId),
        ),
      );
      const suppliedComponentIds = new Set(
        input.components.map((component) => component.inventoryItemId),
      );
      const hasUnexpectedComponent = [...suppliedComponentIds].some(
        (componentId) => !recipeComponentIds.has(componentId),
      );
      const hasMissingComponent = [...recipeComponentIds].some(
        (componentId) => !suppliedComponentIds.has(componentId),
      );
      if (hasUnexpectedComponent || hasMissingComponent) {
        throw new DomainError(
          "Nguyên liệu thực dùng phải khớp danh sách nguyên liệu của công thức.",
          422,
          "PRODUCTION_COMPONENT_MISMATCH",
        );
      }
      let totalActualCostVnd = 0;
      let hasMissingCost = false;
      const actualInputs: Plain[] = [];
      for (const [index, component] of input.components.entries()) {
        const { balance, item, inventoryItemId, inventoryLotId } =
          await balanceForInput(context, component, completedAt, session);
        const unitCostVnd =
          balance.averageUnitCostVnd == null
            ? null
            : decimalString(balance.averageUnitCostVnd);
        const componentMissingCost =
          balance.costDataQuality !== "complete" || unitCostVnd == null;
        const amountVnd = componentMissingCost
          ? null
          : multiplyDecimalRateToVnd(component.quantity, unitCostVnd);
        if (componentMissingCost) hasMissingCost = true;
        if (amountVnd != null) totalActualCostVnd += amountVnd;
        const delta = Types.Decimal128.fromString(`-${component.quantity}`);
        const balanceIncrement: Record<string, unknown> = {
          onHandQuantity: delta,
          availableQuantity: delta,
          version: 1,
        };
        if (amountVnd != null) balanceIncrement.inventoryValueVnd = -amountVnd;
        const updated = await InventoryBalance.findOneAndUpdate(
          {
            _id: balance._id,
            availableQuantity: { $gte: Types.Decimal128.fromString(component.quantity) },
          },
          {
            $inc: balanceIncrement,
            $set: { lastMovementAt: completedAt, actor: context.actor },
          },
          { new: true, session },
        );
        if (!updated) {
          throw new DomainError(
            `Tồn ${item.name} vừa thay đổi. Hãy tải lại.`,
            409,
            "INVENTORY_CONFLICT",
          );
        }
        if (inventoryLotId) {
          const updatedLot = await InventoryLot.findOneAndUpdate(
            {
              _id: inventoryLotId,
              organizationId: context.organizationId,
              locationId: context.locationId,
              inventoryItemId,
              status: "available",
              onHandQuantity: {
                $gte: Types.Decimal128.fromString(component.quantity),
              },
            },
            { $inc: { onHandQuantity: delta, version: 1 }, $set: { actor: context.actor } },
            { new: true, session },
          );
          if (!updatedLot) {
            throw new DomainError(
              `Lot ${item.name} vừa thay đổi. Hãy tải lại.`,
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
          [{
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId,
            inventoryLotId,
            itemCodeSnapshot: item.code,
            itemNameSnapshot: item.name,
            unitSnapshot: item.baseUnit,
            movementType: "production_consume",
            quantityDelta: `-${component.quantity}`,
            unitCostVnd,
            inventoryValueDeltaVnd: amountVnd == null ? null : -amountVnd,
            businessDate: batch.businessDate,
            occurredAt: completedAt,
            sourceType: "production_batch",
            sourceId: batch._id,
            sourceLineKey: `input:${index}`,
            idempotencyKey: `${input.idempotencyKey}:input:${index}`,
            actor: context.actor,
          }],
          { session },
        );
        const linkedMovement = await InventoryBalance.updateOne(
          {
            _id: balance._id,
            organizationId: context.organizationId,
            locationId: context.locationId,
          },
          { $set: { lastMovementId: movement[0]._id } },
          { session },
        );
        if (linkedMovement.matchedCount !== 1) {
          throw new DomainError(
            "Không thể liên kết bút toán xuất nguyên liệu với balance vừa cập nhật.",
            409,
            "INVENTORY_CONFLICT",
          );
        }
        actualInputs.push({
          inventoryItemId,
          inventoryLotId,
          itemCodeSnapshot: item.code,
          itemNameSnapshot: item.name,
          actualQuantity: component.quantity,
          unit: item.baseUnit,
          unitCostVnd: componentMissingCost ? null : unitCostVnd,
          amountVnd: componentMissingCost ? null : amountVnd,
          stockMovementId: movement[0]._id,
        });
      }
      const goodOutput = input.goodOutputQuantity;
      if (goodOutput <= 0) {
        throw new DomainError("Mẻ hoàn thành phải có ít nhất một hộp đạt.", 422);
      }
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : batch.expiresAt
          ? new Date(batch.expiresAt)
          : recipe.shelfLifeHours
            ? new Date(
                completedAt.getTime() +
                  Number(recipe.shelfLifeHours) * 60 * 60 * 1_000,
              )
          : null;
      if (!expiresAt || expiresAt <= completedAt) {
        throw new DomainError(
          "Hãy cấu hình hạn dùng sau thời điểm hoàn tất mẻ.",
          422,
          "MISSING_SHELF_LIFE",
        );
      }
      const unitCost = hasMissingCost
        ? null
        : (() => {
            const scale = BigInt(1_000_000);
            const scaled = (BigInt(totalActualCostVnd) * scale) / BigInt(goodOutput);
            const whole = scaled / scale;
            const fraction = String(scaled % scale)
              .padStart(6, "0")
              .replace(/0+$/, "");
            return fraction ? `${whole}.${fraction}` : String(whole);
          })();
      const lotCode = `${batch.batchCode}-FG`;
      const lot = await InventoryLot.create(
        [{
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId: batch.outputInventoryItemId,
          lotCode,
          sourceType: "production",
          sourceId: batch._id,
          producedAt: completedAt,
          expiresAt,
          initialQuantity: String(goodOutput),
          onHandQuantity: String(goodOutput),
          unitCostVnd: unitCost,
          costDataQuality: hasMissingCost ? "missing_cost" : "complete",
          status: "available",
          actor: context.actor,
        }],
        { session },
      );
      const outputMovement = await StockMovement.create(
        [{
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId: batch.outputInventoryItemId,
          inventoryLotId: lot[0]._id,
          itemCodeSnapshot: batch.outputItemCodeSnapshot,
          itemNameSnapshot: batch.outputItemNameSnapshot,
          unitSnapshot: batch.outputUnit,
          movementType: "production_output",
          quantityDelta: String(goodOutput),
          unitCostVnd: unitCost,
          inventoryValueDeltaVnd: hasMissingCost ? null : totalActualCostVnd,
          businessDate: batch.businessDate,
          occurredAt: completedAt,
          sourceType: "production_batch",
          sourceId: batch._id,
          sourceLineKey: "output",
          idempotencyKey: `${input.idempotencyKey}:output`,
          actor: context.actor,
        }],
        { session },
      );
      await InventoryBalance.create(
        [{
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId: batch.outputInventoryItemId,
          inventoryLotId: lot[0]._id,
          onHandQuantity: String(goodOutput),
          reservedQuantity: "0",
          availableQuantity: String(goodOutput),
          averageUnitCostVnd: unitCost,
          inventoryValueVnd: hasMissingCost ? null : totalActualCostVnd,
          costDataQuality: hasMissingCost ? "missing_cost" : "complete",
          lastMovementId: outputMovement[0]._id,
          lastMovementAt: completedAt,
          actor: context.actor,
        }],
        { session },
      );
      batch.actualInputs = actualInputs;
      batch.goodOutputQuantity = String(goodOutput);
      batch.wasteOutputQuantity = String(input.wasteOutputQuantity);
      batch.totalActualCostVnd = hasMissingCost ? null : totalActualCostVnd;
      batch.actualCostVnd = hasMissingCost ? null : totalActualCostVnd;
      batch.actualCostPerOutputUnitVnd = unitCost;
      batch.costPerOutputVnd = unitCost;
      batch.costDataQuality = hasMissingCost ? "missing_cost" : "complete";
      batch.actualYieldPercent = (() => {
        const totalOutput = goodOutput + input.wasteOutputQuantity;
        const scaled =
          (BigInt(goodOutput) * BigInt(100_000_000)) / BigInt(totalOutput);
        const whole = scaled / BigInt(1_000_000);
        const fraction = String(scaled % BigInt(1_000_000))
          .padStart(6, "0")
          .replace(/0+$/, "");
        return fraction ? `${whole}.${fraction}` : String(whole);
      })();
      batch.shelfLifeHours = recipe.shelfLifeHours ?? null;
      batch.completedAt = completedAt;
      batch.expiresAt = expiresAt;
      batch.outputInventoryLotId = lot[0]._id;
      batch.outputStockMovementId = outputMovement[0]._id;
      batch.status = "completed";
      batch.completionIdempotencyKey = input.idempotencyKey;
      batch.note = input.note ?? batch.note;
      batch.version = Number(batch.version) + 1;
      batch.actor = context.actor;
      await batch.save({ session });
      output = serializeBatch(batch.toObject());
    });
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể hoàn tất mẻ.", 503);
  return output;
}
