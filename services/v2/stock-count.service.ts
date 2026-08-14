import "server-only";

import { Types } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import type { CreateStockCountInput } from "@/lib/validators/v2/stock-counts";
import { AuditLog } from "@/models/v2/AuditLog";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { InventoryItem } from "@/models/v2/InventoryItem";
import { InventoryLot } from "@/models/v2/InventoryLot";
import { StockCount } from "@/models/v2/StockCount";
import { StockMovement } from "@/models/v2/StockMovement";
import { id, type V2Context } from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import {
  assertCompleteOpeningCount,
  assertOpeningCostPolicy,
} from "@/services/v2/stock-count-policy";
import { decimalString } from "@/services/v2/serialize";
import {
  decimalDifference,
  operationKeySuffix,
  stockCountAmounts,
} from "@/services/v2/operation-invariants";
import {
  assertWriteReplay,
  stockCountRequestHash,
} from "@/services/v2/write-idempotency";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

export async function isOpeningStockCount(context: V2Context) {
  await connectMongo();
  const [hasPostedCount, existingBalance, existingMovement] = await Promise.all([
    StockCount.exists({
      organizationId: context.organizationId,
      locationId: context.locationId,
      status: "posted",
    }),
    InventoryBalance.exists({
      organizationId: context.organizationId,
      locationId: context.locationId,
    }),
    StockMovement.exists({
      organizationId: context.organizationId,
      locationId: context.locationId,
    }),
  ]);
  return !hasPostedCount && !existingBalance && !existingMovement;
}

export async function createStockCount(
  context: V2Context,
  input: CreateStockCountInput,
) {
  const mongoose = await connectMongo();
  const requestHash = stockCountRequestHash(input);
  const session = await mongoose.startSession();
  let output: Plain | null = null;
  let attemptedCountType: "opening" | "cycle" | null = null;
  try {
    await session.withTransaction(async () => {
      const existing = await StockCount.findOne({
        organizationId: context.organizationId,
        locationId: context.locationId,
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean();
      if (existing) {
        assertWriteReplay(
          existing.requestHash,
          requestHash,
          "nội dung phiếu kiểm kho",
        );
        output = existing as Plain;
        return;
      }
      const hasPostedCount = await StockCount.exists({
        organizationId: context.organizationId,
        locationId: context.locationId,
        status: "posted",
      }).session(session);
      const countType = hasPostedCount ? "cycle" : "opening";
      attemptedCountType = countType;
      assertOpeningCostPolicy(context, input, countType);
      const openingItems =
        countType === "opening"
          ? ((await InventoryItem.find({
              organizationId: context.organizationId,
              isActive: true,
            })
              .session(session)
              .lean()) as Plain[])
          : null;
      const openingItemById = new Map(
        (openingItems ?? []).map((item) => [String(item._id), item]),
      );
      if (openingItems) {
        assertCompleteOpeningCount(
          openingItems.map((item) => String(item._id)),
          input.lines.map((line) => line.inventoryItemId),
        );
        const [existingBalance, existingMovement] = await Promise.all([
          InventoryBalance.exists({
            organizationId: context.organizationId,
            locationId: context.locationId,
          }).session(session),
          StockMovement.exists({
            organizationId: context.organizationId,
            locationId: context.locationId,
          }).session(session),
        ]);
        if (existingBalance || existingMovement) {
          throw new DomainError(
            "Điểm bán đã có sổ tồn vận hành; không thể tạo opening count.",
            409,
            "OPENING_LEDGER_CONFLICT",
          );
        }
      }
      const countedAt = new Date(input.countedAt);
      const businessDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(countedAt);
      const countId = new Types.ObjectId();
      const lines: Plain[] = [];
      for (const [index, source] of input.lines.entries()) {
        const inventoryItemId = id(source.inventoryItemId, "inventoryItemId");
        const inventoryLotId = source.inventoryLotId
          ? id(source.inventoryLotId, "inventoryLotId")
          : null;
        const item = openingItems
          ? openingItemById.get(String(inventoryItemId)) ?? null
          : ((await InventoryItem.findOne({
              organizationId: context.organizationId,
              _id: inventoryItemId,
              isActive: true,
            })
              .session(session)
              .lean()) as Plain | null);
        if (!item) throw new DomainError("Hàng hóa kiểm kho không tồn tại.", 422);
        if (countType === "opening" && inventoryLotId) {
          throw new DomainError(
            "Lot mở kho do máy chủ tạo; không gửi inventoryLotId cho phiếu opening.",
            422,
            "OPENING_LOT_SERVER_MANAGED",
          );
        }
        if (item.lotTracked && !inventoryLotId && countType !== "opening") {
          throw new DomainError(
            `${item.name} được theo dõi theo lot; hãy chọn lot cần kiểm.`,
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
        const [balance, existingLot] = (await Promise.all([
          InventoryBalance.findOne({
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId,
            inventoryLotId,
          })
            .session(session)
            .lean(),
          inventoryLotId
            ? InventoryLot.findOne({
                _id: inventoryLotId,
                organizationId: context.organizationId,
                locationId: context.locationId,
                inventoryItemId,
              })
                .session(session)
                .lean()
            : Promise.resolve(null),
        ])) as [Plain | null, Plain | null];
        if (countType === "opening" && balance) {
          throw new DomainError(
            `Không thể tạo số dư mở đầu cho ${item.name} vì đã có sổ tồn vận hành.`,
            409,
            "OPENING_BALANCE_CONFLICT",
          );
        }
        if (inventoryLotId && !existingLot) {
          throw new DomainError(
            `Lot của ${item.name} không tồn tại tại điểm bán này.`,
            422,
            "INVENTORY_LOT_NOT_FOUND",
          );
        }
        let lot = existingLot;
        let resolvedInventoryLotId = inventoryLotId;
        let openingLotCreated = false;
        if (
          countType === "opening" &&
          item.lotTracked &&
          !resolvedInventoryLotId &&
          decimalDifference(source.countedQuantity, "0") !== "0"
        ) {
          const openingLot = await InventoryLot.create(
            [
              {
                organizationId: context.organizationId,
                locationId: context.locationId,
                inventoryItemId,
                lotCode: `OPENING-${businessDate.replaceAll("-", "")}-${operationKeySuffix(`${input.idempotencyKey}:${source.inventoryItemId}`)}`,
                sourceType: "opening",
                sourceId: countId,
                receivedAt: countedAt,
                expiresAt: null,
                initialQuantity: source.countedQuantity,
                onHandQuantity: source.countedQuantity,
                unitCostVnd: source.unitCostVnd ?? null,
                costDataQuality:
                  source.unitCostVnd == null ? "missing_cost" : "complete",
                status:
                  decimalDifference(source.countedQuantity, "0") === "0"
                    ? "depleted"
                    : "available",
                actor: context.actor,
              },
            ],
            { session },
          );
          lot = openingLot[0].toObject();
          resolvedInventoryLotId = openingLot[0]._id;
          openingLotCreated = true;
        }
        const expectedQuantity = decimalString(balance?.onHandQuantity ?? "0");
        if (
          lot &&
          !openingLotCreated &&
          decimalDifference(decimalString(lot.onHandQuantity), expectedQuantity) !==
            "0"
        ) {
          throw new DomainError(
            `Số dư balance và lot ${lot.lotCode} đang lệch; cần đối soát ledger trước.`,
            409,
            "INVENTORY_LEDGER_MISMATCH",
          );
        }
        const amounts = stockCountAmounts({
          expectedQuantity,
          countedQuantity: source.countedQuantity,
          averageUnitCostVnd:
            countType === "opening" && source.unitCostVnd != null
              ? source.unitCostVnd
              : balance?.averageUnitCostVnd == null
                ? null
                : decimalString(balance.averageUnitCostVnd),
          costDataQuality:
            countType === "opening" && source.unitCostVnd != null
              ? "complete"
              : balance?.costDataQuality,
        });
        const reservedQuantity = decimalString(balance?.reservedQuantity ?? "0");
        const availableAfterCount = stockCountAmounts({
          expectedQuantity: reservedQuantity,
          countedQuantity: source.countedQuantity,
          averageUnitCostVnd: null,
          costDataQuality: "missing_cost",
        }).varianceQuantity;
        if (availableAfterCount.startsWith("-")) {
          throw new DomainError(
            `Số đếm ${item.name} thấp hơn số lượng đang được giữ chỗ.`,
            409,
            "RESERVED_STOCK_CONFLICT",
          );
        }
        lines.push({
          lineKey: `${source.inventoryItemId}:${resolvedInventoryLotId ?? "no-lot"}`,
          inventoryItemId,
          inventoryLotId: resolvedInventoryLotId,
          itemCodeSnapshot: item.code,
          itemNameSnapshot: item.name,
          unitSnapshot: item.baseUnit,
          expectedQuantity,
          countedQuantity: source.countedQuantity,
          varianceQuantity: amounts.varianceQuantity,
          unitCostVnd: amounts.unitCostVnd,
          varianceValueVnd: amounts.varianceValueVnd,
          countedInventoryValueVnd: amounts.countedInventoryValueVnd,
          costDataQuality: amounts.costDataQuality,
          reservedQuantity,
          availableAfterCount,
          balanceId: balance?._id ?? null,
          balanceVersion: balance?.version ?? null,
          lotVersion: countType === "opening" ? null : (lot?.version ?? null),
          lotStatus: lot?.status ?? null,
          openingLotCreated,
          note: source.note,
          adjustmentMovementId: null,
          index,
        });
      }
      for (const line of lines) {
        if (line.varianceQuantity === "0") continue;
        const movement = await StockMovement.create(
          [{
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId: line.inventoryItemId,
            inventoryLotId: line.inventoryLotId,
            itemCodeSnapshot: line.itemCodeSnapshot,
            itemNameSnapshot: line.itemNameSnapshot,
            unitSnapshot: line.unitSnapshot,
            movementType: countType === "opening" ? "opening" : "count_reconcile",
            quantityDelta: line.varianceQuantity,
            unitCostVnd: line.unitCostVnd,
            inventoryValueDeltaVnd: line.varianceValueVnd,
            businessDate,
            occurredAt: countedAt,
            sourceType: "stock_count",
            sourceId: countId,
            sourceLineKey: line.lineKey,
            reason:
              countType === "opening"
                ? "Số dư mở đầu từ kiểm kho vật lý tại cutover"
                : "Đối chiếu kiểm kho vật lý",
            idempotencyKey: `${input.idempotencyKey}:${line.index}`,
            actor: context.actor,
          }],
          { session },
        );
        line.adjustmentMovementId = movement[0]._id;
        if (line.balanceId) {
          const updatedBalance = await InventoryBalance.findOneAndUpdate(
            {
              _id: line.balanceId,
              organizationId: context.organizationId,
              locationId: context.locationId,
              version: line.balanceVersion,
              onHandQuantity: Types.Decimal128.fromString(line.expectedQuantity),
            },
            {
              $set: {
                onHandQuantity: Types.Decimal128.fromString(line.countedQuantity),
                availableQuantity: Types.Decimal128.fromString(
                  line.availableAfterCount,
                ),
                averageUnitCostVnd:
                  line.unitCostVnd == null
                    ? null
                    : Types.Decimal128.fromString(line.unitCostVnd),
                inventoryValueVnd: line.countedInventoryValueVnd,
                costDataQuality: line.costDataQuality,
                lastMovementId: movement[0]._id,
                lastMovementAt: countedAt,
                actor: context.actor,
              },
              $inc: { version: 1 },
            },
            { new: true, session },
          );
          if (!updatedBalance) {
            throw new DomainError(
              `Tồn ${line.itemNameSnapshot} vừa thay đổi. Hãy tải lại.`,
              409,
              "INVENTORY_CONFLICT",
            );
          }
        } else {
          await InventoryBalance.create(
            [
              {
                organizationId: context.organizationId,
                locationId: context.locationId,
                inventoryItemId: line.inventoryItemId,
                inventoryLotId: line.inventoryLotId,
                onHandQuantity: line.countedQuantity,
                reservedQuantity: "0",
                availableQuantity: line.countedQuantity,
                averageUnitCostVnd: line.unitCostVnd,
                inventoryValueVnd: line.countedInventoryValueVnd,
                costDataQuality: line.costDataQuality,
                lastMovementId: movement[0]._id,
                lastMovementAt: countedAt,
                actor: context.actor,
              },
            ],
            { session },
          );
        }
        if (line.inventoryLotId && !line.openingLotCreated) {
          const nextLotStatus =
            decimalDifference(line.countedQuantity, "0") === "0"
              ? "depleted"
              : line.lotStatus === "depleted"
                ? "available"
                : line.lotStatus;
          const updatedLot = await InventoryLot.findOneAndUpdate(
            {
              _id: line.inventoryLotId,
              organizationId: context.organizationId,
              locationId: context.locationId,
              inventoryItemId: line.inventoryItemId,
              version: line.lotVersion,
              onHandQuantity: Types.Decimal128.fromString(line.expectedQuantity),
            },
            {
              $set: {
                onHandQuantity: Types.Decimal128.fromString(line.countedQuantity),
                status: nextLotStatus,
                actor: context.actor,
              },
              $inc: { version: 1 },
            },
            { new: true, session },
          );
          if (!updatedLot) {
            throw new DomainError(
              `Lot ${line.itemNameSnapshot} vừa thay đổi. Hãy tải lại.`,
              409,
              "INVENTORY_CONFLICT",
            );
          }
        }
      }
      const count = await StockCount.create(
        [{
          _id: countId,
          organizationId: context.organizationId,
          locationId: context.locationId,
          businessDate,
          countCode: `${countType === "opening" ? "OPENING" : "COUNT"}-${businessDate.replaceAll("-", "")}-${operationKeySuffix(input.idempotencyKey)}`,
          countType,
          status: "posted",
          lines: lines.map((line) => {
            const copy = { ...line };
            delete copy.index;
            delete copy.countedInventoryValueVnd;
            delete copy.costDataQuality;
            delete copy.reservedQuantity;
            delete copy.availableAfterCount;
            delete copy.balanceId;
            delete copy.balanceVersion;
            delete copy.lotVersion;
            delete copy.lotStatus;
            delete copy.openingLotCreated;
            return copy;
          }),
          countedAt,
          postedAt: new Date(),
          idempotencyKey: input.idempotencyKey,
          requestHash,
          note: input.note,
          actor: context.actor,
        }],
        { session },
      );
      await AuditLog.create(
        [
          {
            organizationId: context.organizationId,
            locationId: context.locationId,
            action: "post",
            resourceType: "stock_count",
            resourceId: String(countId),
            resourceVersion: Number(count[0].version),
            requestId: input.idempotencyKey,
            idempotencyKey: input.idempotencyKey,
            occurredAt: count[0].postedAt,
            changes: [],
            metadata: {
              countType,
              businessDate,
              lineCount: lines.length,
              costConfirmedLineCount: input.lines.filter(
                (line) => line.unitCostVnd != null,
              ).length,
            },
            actor: context.actor,
          },
        ],
        { session },
      );
      output = count[0].toObject();
    });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const repeated = (await StockCount.findOne({
      organizationId: context.organizationId,
      locationId: context.locationId,
      idempotencyKey: input.idempotencyKey,
    }).lean()) as Plain | null;
    if (repeated) {
      assertWriteReplay(
        repeated.requestHash,
        requestHash,
        "nội dung phiếu kiểm kho",
      );
      output = repeated;
    } else if (attemptedCountType === "opening") {
      throw new DomainError(
        "Opening count đã được ghi bởi một yêu cầu khác. Hãy tải lại tồn kho.",
        409,
        "OPENING_ALREADY_POSTED",
      );
    } else {
      throw new DomainError(
        "Phiếu kiểm kho xung đột với thay đổi tồn kho khác. Hãy tải lại.",
        409,
        "STOCK_COUNT_CONFLICT",
      );
    }
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể ghi phiếu kiểm kho.", 503);
  const result = output as Plain;
  return {
    id: String(result._id),
    businessDate: result.businessDate,
    countCode: result.countCode,
    status: result.status,
    lineCount: result.lines.length,
  };
}
