import "server-only";
import { connectMongo } from "@/lib/mongodb";
import { sha256Canonical } from "@/lib/v2/canonical";
import type { ReceiptImportInput } from "@/lib/validators/receipt";
import { ReceiptImport } from "@/models/ReceiptImport";
import { createResource } from "@/services/resource.service";

export class ReceiptImportError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

function replay(record: { requestHash?: string; purchaseIds?: unknown[] }, requestHash: string) {
  if (record.requestHash !== requestHash) {
    throw new ReceiptImportError("Ảnh bill này đã được lưu với dữ liệu khác. Hãy kiểm tra các phiếu đã nhập.");
  }
  return { purchaseIds: (record.purchaseIds ?? []).map(String), replayed: true };
}

export async function importReceipt(input: ReceiptImportInput) {
  const mongo = await connectMongo();
  const requestHash = sha256Canonical(input.lines);
  const saved = await ReceiptImport.findById(input.receiptId).lean();
  if (saved) return replay(saved, requestHash);
  // Collection creation must happen outside the transaction on first use.
  await ReceiptImport.init();
  try {
    return await mongo.connection.transaction(async () => {
      const existing = await ReceiptImport.findById(input.receiptId).lean();
      if (existing) return replay(existing, requestHash);
      // The _id index serializes simultaneous submissions of the same image.
      const receipt = await ReceiptImport.create({ _id: input.receiptId, requestHash, purchaseIds: [] });
      const purchaseIds: string[] = [];
      const newItems = new Map<string, { id: string; category: string; purchaseUnit: string; packageQuantity: number; costUnit: string }>();
      for (const line of input.lines) {
        let payload: Record<string, unknown> = line;
        const nameKey = line.source === "new" ? line.itemName.trim().toLocaleLowerCase("vi") : "";
        const prior = newItems.get(nameKey);
        if (line.source === "new" && prior) {
          if (line.category !== prior.category || line.purchaseUnit !== prior.purchaseUnit
            || line.packageQuantity !== prior.packageQuantity || line.costUnit !== prior.costUnit) {
            throw new ReceiptImportError(`Hàng “${line.itemName}” có nhiều quy cách. Hãy đặt tên riêng cho từng quy cách.`, 422);
          }
          payload = { source: "existing", ingredientId: prior.id, purchaseDate: line.purchaseDate,
            packageCount: line.packageCount, totalAmount: line.totalAmount, actualPackagePrice: line.actualPackagePrice,
            fundingSource: line.fundingSource, supplier: line.supplier, note: line.note,
            sterilizationOutsourcedLiters: line.sterilizationOutsourcedLiters,
            sterilizationUnitPrice: line.sterilizationUnitPrice, sterilizationProvider: line.sterilizationProvider };
        }
        const purchase = await createResource("purchases", payload, { inTransaction: true });
        if (!purchase) throw new ReceiptImportError("Không lưu được mặt hàng trên bill.", 500);
        if (line.source === "new" && line.saveToCatalog && !prior) {
          newItems.set(nameKey, { id: String(purchase.get("ingredientId")), category: line.category,
            purchaseUnit: line.purchaseUnit, packageQuantity: line.packageQuantity, costUnit: line.costUnit });
        }
        purchaseIds.push(String(purchase._id));
      }
      receipt.set("purchaseIds", purchaseIds);
      await receipt.save();
      return { purchaseIds, replayed: false };
    }, { readPreference: "primary", maxCommitTimeMS: 10000 });
  } catch (error) {
    // A concurrent transaction may win. Only return its committed result.
    const committed = await ReceiptImport.findById(input.receiptId).lean();
    if (committed) return replay(committed, requestHash);
    if ((error as { code?: number }).code === 20) {
      throw new ReceiptImportError("Máy chủ MongoDB cần hỗ trợ transaction để lưu bill. Chưa có mặt hàng nào được lưu.", 503);
    }
    throw error;
  }
}
