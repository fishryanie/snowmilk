import "server-only";

import { Types, type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import type { CreatePurchaseReceiptInput } from "@/lib/validators/v2/purchase-receipts";
import { AuditLog } from "@/models/v2/AuditLog";
import { InventoryBalance } from "@/models/v2/InventoryBalance";
import { InventoryItem } from "@/models/v2/InventoryItem";
import { InventoryLot } from "@/models/v2/InventoryLot";
import { PurchaseReceipt } from "@/models/v2/PurchaseReceipt";
import { StockCount } from "@/models/v2/StockCount";
import { StockMovement } from "@/models/v2/StockMovement";
import { id, type V2Context } from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import { operationKeySuffix } from "@/services/v2/operation-invariants";
import {
  deriveUnitCostVnd,
  purchaseBalanceAmounts,
  sumVndExact,
} from "@/services/v2/purchase-receipt-invariants";
import { decimalString } from "@/services/v2/serialize";
import {
  assertWriteReplay,
  purchaseReceiptRequestHash,
} from "@/services/v2/write-idempotency";

// Mongoose lean documents are structurally dynamic at this repository boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

function assertIdempotentReplay(receipt: Plain, expectedHash: string) {
  assertWriteReplay(receipt.requestHash, expectedHash, "nội dung phiếu nhập");
}

function serializeReceipt(receipt: Plain) {
  return {
    id: String(receipt._id),
    receiptCode: String(receipt.receiptCode),
    supplier: {
      name: String(receipt.supplierSnapshot?.name ?? ""),
      contact: String(receipt.supplierSnapshot?.contact ?? ""),
    },
    businessDate: String(receipt.businessDate),
    receivedAt: new Date(receipt.receivedAt).toISOString(),
    postedAt: new Date(receipt.postedAt).toISOString(),
    status: String(receipt.status),
    totalAmountVnd: Number(receipt.totalAmountVnd),
    note: String(receipt.note ?? ""),
    version: Number(receipt.version),
    lines: (receipt.lines as Plain[]).map((line) => ({
      lineKey: String(line.lineKey),
      inventoryItemId: String(line.inventoryItemId),
      inventoryLotId: line.inventoryLotId ? String(line.inventoryLotId) : null,
      itemCode: String(line.itemCodeSnapshot),
      itemName: String(line.itemNameSnapshot),
      baseUnit: String(line.unitSnapshot),
      quantity: decimalString(line.quantity),
      unitCostVnd: decimalString(line.unitCostVnd),
      totalAmountVnd: Number(line.totalAmountVnd),
      lotCode: line.lotCodeSnapshot ? String(line.lotCodeSnapshot) : null,
      expiresAt: line.expiresAt ? new Date(line.expiresAt).toISOString() : null,
    })),
  };
}

async function existingReceipt(
  context: V2Context,
  idempotencyKey: string,
  session?: ClientSession,
) {
  const query = PurchaseReceipt.findOne({
    organizationId: context.organizationId,
    locationId: context.locationId,
    idempotencyKey,
  });
  if (session) query.session(session);
  return (await query.lean()) as Plain | null;
}

export async function listPurchaseReceipts(context: V2Context, limit = 100) {
  await connectMongo();
  const receipts = (await PurchaseReceipt.find({
    organizationId: context.organizationId,
    locationId: context.locationId,
  })
    .sort({ receivedAt: -1, _id: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .lean()) as Plain[];
  return { receipts: receipts.map(serializeReceipt) };
}

export async function createPurchaseReceipt(
  context: V2Context,
  input: CreatePurchaseReceiptInput,
) {
  const canonicalRequestHash = purchaseReceiptRequestHash(input);
  const mongoose = await connectMongo();
  const session = await mongoose.startSession();
  let output: Plain | null = null;
  try {
    await session.withTransaction(async () => {
      const repeated = await existingReceipt(
        context,
        input.idempotencyKey,
        session,
      );
      if (repeated) {
        assertIdempotentReplay(repeated, canonicalRequestHash);
        output = repeated;
        return;
      }

      const hasOpeningCount = await StockCount.exists({
        organizationId: context.organizationId,
        locationId: context.locationId,
        status: "posted",
      }).session(session);
      if (!hasOpeningCount) {
        throw new DomainError(
          "Hãy hoàn tất kiểm kho mở đầu tại điểm bán trước khi nhận hàng v2.",
          409,
          "OPENING_STOCK_REQUIRED",
        );
      }

      const inventoryItemIds = [...new Set(input.lines.map((line) => line.inventoryItemId))]
        .map((value) => id(value, "inventoryItemId"));
      const items = (await InventoryItem.find({
        organizationId: context.organizationId,
        _id: { $in: inventoryItemIds },
        isActive: true,
      })
        .session(session)
        .lean()) as Plain[];
      const itemById = new Map(items.map((item) => [String(item._id), item]));
      if (itemById.size !== inventoryItemIds.length) {
        throw new DomainError(
          "Một hoặc nhiều hàng hóa không tồn tại hoặc đã ngừng sử dụng.",
          422,
          "INVENTORY_ITEM_NOT_FOUND",
        );
      }

      const receiptId = new Types.ObjectId();
      const receivedAt = new Date(input.receivedAt);
      const postedAt = new Date();
      const persistedLines: Plain[] = [];

      for (const [index, source] of input.lines.entries()) {
        const inventoryItemId = id(source.inventoryItemId, "inventoryItemId");
        const item = itemById.get(String(inventoryItemId));
        if (!item) {
          throw new DomainError("Hàng hóa nhập không tồn tại.", 422);
        }
        if (!item.lotTracked && (source.lotCode || source.expiresAt)) {
          throw new DomainError(
            `${item.name} không theo dõi lot; không được nhập mã lot hoặc hạn dùng.`,
            422,
            "INVENTORY_LOT_NOT_ALLOWED",
          );
        }
        if (item.expiryTracked && !source.expiresAt) {
          throw new DomainError(
            `${item.name} có theo dõi hạn dùng; hãy nhập hạn dùng của lot nhận hàng.`,
            422,
            "INVENTORY_EXPIRY_REQUIRED",
          );
        }

        const lineKey = `${index + 1}:${source.inventoryItemId}`;
        const unitCostVnd = deriveUnitCostVnd(
          source.totalAmountVnd,
          source.quantity,
        );
        let inventoryLotId: Types.ObjectId | null = null;
        let lotCodeSnapshot: string | null = null;

        if (item.lotTracked) {
          const lotCode =
            source.lotCode?.trim().toLocaleUpperCase("vi-VN") ||
            `PUR-${input.businessDate.replaceAll("-", "")}-${operationKeySuffix(`${input.idempotencyKey}:${index}`)}`;
          const duplicateLot = await InventoryLot.exists({
            organizationId: context.organizationId,
            locationId: context.locationId,
            inventoryItemId,
            lotCode,
          }).session(session);
          if (duplicateLot) {
            throw new DomainError(
              `Lot ${lotCode} của ${item.name} đã tồn tại. Hãy dùng mã lot nhận hàng khác.`,
              409,
              "INVENTORY_LOT_EXISTS",
            );
          }
          const lot = await InventoryLot.create(
            [
              {
                organizationId: context.organizationId,
                locationId: context.locationId,
                inventoryItemId,
                lotCode,
                sourceType: "purchase",
                sourceId: receiptId,
                receivedAt,
                expiresAt: source.expiresAt ? new Date(source.expiresAt) : null,
                initialQuantity: source.quantity,
                onHandQuantity: source.quantity,
                unitCostVnd,
                costDataQuality: "complete",
                status: "available",
                actor: context.actor,
              },
            ],
            { session },
          );
          inventoryLotId = lot[0]._id;
          lotCodeSnapshot = lotCode;
        }

        const balance = (await InventoryBalance.findOne({
          organizationId: context.organizationId,
          locationId: context.locationId,
          inventoryItemId,
          inventoryLotId,
        })
          .session(session)
          .lean()) as Plain | null;
        const amounts = purchaseBalanceAmounts({
          existingOnHandQuantity: decimalString(balance?.onHandQuantity ?? "0"),
          existingAvailableQuantity: decimalString(balance?.availableQuantity ?? "0"),
          existingInventoryValueVnd:
            balance?.inventoryValueVnd == null
              ? null
              : Number(balance.inventoryValueVnd),
          existingCostDataQuality: balance?.costDataQuality,
          incomingQuantity: source.quantity,
          incomingAmountVnd: source.totalAmountVnd,
        });
        const movement = await StockMovement.create(
          [
            {
              organizationId: context.organizationId,
              locationId: context.locationId,
              inventoryItemId,
              inventoryLotId,
              itemCodeSnapshot: item.code,
              itemNameSnapshot: item.name,
              unitSnapshot: item.baseUnit,
              movementType: "purchase_receive",
              quantityDelta: source.quantity,
              unitCostVnd,
              inventoryValueDeltaVnd: source.totalAmountVnd,
              businessDate: input.businessDate,
              occurredAt: receivedAt,
              sourceType: "purchase",
              sourceId: receiptId,
              sourceLineKey: lineKey,
              idempotencyKey: `${input.idempotencyKey}:stock:${index}`,
              actor: context.actor,
            },
          ],
          { session },
        );

        if (balance) {
          const updated = await InventoryBalance.findOneAndUpdate(
            {
              _id: balance._id,
              organizationId: context.organizationId,
              locationId: context.locationId,
              version: balance.version,
              onHandQuantity: balance.onHandQuantity,
            },
            {
              $set: {
                onHandQuantity: Types.Decimal128.fromString(amounts.onHandQuantity),
                availableQuantity: Types.Decimal128.fromString(
                  amounts.availableQuantity,
                ),
                averageUnitCostVnd:
                  amounts.averageUnitCostVnd == null
                    ? null
                    : Types.Decimal128.fromString(amounts.averageUnitCostVnd),
                inventoryValueVnd: amounts.inventoryValueVnd,
                costDataQuality: amounts.costDataQuality,
                lastMovementId: movement[0]._id,
                lastMovementAt: receivedAt,
                actor: context.actor,
              },
              $inc: { version: 1 },
            },
            { new: true, session },
          );
          if (!updated) {
            throw new DomainError(
              `Tồn ${item.name} vừa thay đổi. Hãy tải lại trước khi nhập.`,
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
                inventoryItemId,
                inventoryLotId,
                onHandQuantity: amounts.onHandQuantity,
                reservedQuantity: "0",
                availableQuantity: amounts.availableQuantity,
                averageUnitCostVnd: amounts.averageUnitCostVnd,
                inventoryValueVnd: amounts.inventoryValueVnd,
                costDataQuality: amounts.costDataQuality,
                lastMovementId: movement[0]._id,
                lastMovementAt: receivedAt,
                actor: context.actor,
              },
            ],
            { session },
          );
        }

        persistedLines.push({
          lineKey,
          inventoryItemId,
          inventoryLotId,
          itemCodeSnapshot: item.code,
          itemNameSnapshot: item.name,
          unitSnapshot: item.baseUnit,
          quantity: source.quantity,
          unitCostVnd,
          totalAmountVnd: source.totalAmountVnd,
          lotCodeSnapshot,
          expiresAt: source.expiresAt ? new Date(source.expiresAt) : null,
          stockMovementId: movement[0]._id,
        });
      }

      const totalAmountVnd = sumVndExact(
        input.lines.map((line) => line.totalAmountVnd),
        "Tổng phiếu nhập",
      );
      const receipt = await PurchaseReceipt.create(
        [
          {
            _id: receiptId,
            organizationId: context.organizationId,
            locationId: context.locationId,
            receiptCode: `PUR-${input.businessDate.replaceAll("-", "")}-${operationKeySuffix(input.idempotencyKey)}`,
            supplierSnapshot: {
              name: input.supplierName,
              contact: input.supplierContact || undefined,
            },
            businessDate: input.businessDate,
            receivedAt,
            lines: persistedLines,
            totalAmountVnd,
            status: "posted",
            postedAt,
            idempotencyKey: input.idempotencyKey,
            requestHash: canonicalRequestHash,
            note: input.note,
            actor: context.actor,
          },
        ],
        { session },
      );
      await AuditLog.create(
        [
          {
            organizationId: context.organizationId,
            locationId: context.locationId,
            action: "post",
            resourceType: "purchase_receipt",
            resourceId: String(receiptId),
            resourceVersion: Number(receipt[0].version),
            requestId: input.idempotencyKey,
            idempotencyKey: input.idempotencyKey,
            occurredAt: postedAt,
            changes: [],
            metadata: {
              businessDate: input.businessDate,
              supplierName: input.supplierName,
              lineCount: persistedLines.length,
              totalAmountVnd,
            },
            actor: context.actor,
          },
        ],
        { session },
      );
      output = receipt[0].toObject();
    });
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const repeated = await existingReceipt(context, input.idempotencyKey);
    if (repeated) {
      assertIdempotentReplay(repeated, canonicalRequestHash);
      output = repeated;
    } else {
      throw new DomainError(
        "Phiếu nhập xung đột với thay đổi kho khác. Hãy tải lại và thử lại.",
        409,
        "PURCHASE_RECEIPT_CONFLICT",
      );
    }
  } finally {
    await session.endSession();
  }
  if (!output) throw new DomainError("Không thể ghi phiếu nhập.", 503);
  return serializeReceipt(output);
}
