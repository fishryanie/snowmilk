import "server-only";

import { Types, type ClientSession } from "mongoose";
import { connectMongo } from "@/lib/mongodb";
import type { CreatePurchaseReceiptInput } from "@/lib/validators/v2/purchase-receipts";
import { AuditLog } from "@/models/v2/AuditLog";
import { InventoryItem } from "@/models/v2/InventoryItem";
import { PurchaseReceipt } from "@/models/v2/PurchaseReceipt";
import { id, type V2Context } from "@/services/v2/context";
import { DomainError, duplicateKey } from "@/services/v2/errors";
import { operationKeySuffix } from "@/services/v2/operation-invariants";
import {
  deriveUnitCostVnd,
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
      itemCode: String(line.itemCodeSnapshot),
      itemName: String(line.itemNameSnapshot),
      baseUnit: String(line.unitSnapshot),
      quantity: decimalString(line.quantity),
      unitCostVnd: decimalString(line.unitCostVnd),
      totalAmountVnd: Number(line.totalAmountVnd),
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

export async function listPurchaseItems(context: V2Context) {
  await connectMongo();
  const items = await InventoryItem.find({ organizationId: context.organizationId, isActive: true })
    .select("code name itemType baseUnit").sort({ itemType: 1, name: 1 }).lean();
  return { items: items.map((item) => ({
    inventoryItemId: String(item._id), code: String(item.code), name: String(item.name),
    kind: String(item.itemType), baseUnit: String(item.baseUnit),
  })) };
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
        const lineKey = `${index + 1}:${source.inventoryItemId}`;
        const unitCostVnd = deriveUnitCostVnd(
          source.totalAmountVnd,
          source.quantity,
        );
        persistedLines.push({
          lineKey,
          inventoryItemId,
          itemCodeSnapshot: item.code,
          itemNameSnapshot: item.name,
          unitSnapshot: item.baseUnit,
          quantity: source.quantity,
          unitCostVnd,
          totalAmountVnd: source.totalAmountVnd,
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
        "Phiếu nhập xung đột với một thay đổi khác. Hãy tải lại và thử lại.",
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
