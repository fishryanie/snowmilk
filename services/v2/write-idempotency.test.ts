import { describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import {
  assertWriteReplay,
  purchaseReceiptRequestHash,
  productionBatchRequestHash,
  stockCountRequestHash,
} from "@/services/v2/write-idempotency";

describe("v2 write idempotency payloads", () => {
  test("production create hash changes with operational payload", () => {
    const input = {
      businessDate: "2026-08-12",
      idempotencyKey: "production-create-key",
      recipeVersionId: new Types.ObjectId().toString(),
      plannedOutputQuantity: 20,
      startedAt: "2026-08-12T06:00:00+07:00",
      note: "Mẻ sáng",
    };
    expect(productionBatchRequestHash(input)).not.toBe(
      productionBatchRequestHash({ ...input, plannedOutputQuantity: 21 }),
    );
  });

  test("stock count hash is order-independent but includes opening cost", () => {
    const lines = [
      {
        inventoryItemId: new Types.ObjectId().toString(),
        countedQuantity: "10",
        unitCostVnd: "1000",
        note: "",
      },
      {
        inventoryItemId: new Types.ObjectId().toString(),
        countedQuantity: "20",
        unitCostVnd: "2000",
        note: "",
      },
    ];
    const input = {
      idempotencyKey: "opening-count-key",
      countedAt: "2026-08-12T06:00:00+07:00",
      lines,
      note: "Cutover",
    };
    expect(stockCountRequestHash(input)).toBe(
      stockCountRequestHash({ ...input, lines: [...lines].reverse() }),
    );
    expect(stockCountRequestHash(input)).toBe(
      stockCountRequestHash({
        ...input,
        lines: [{ ...lines[0], countedQuantity: "10.0" }, lines[1]],
      }),
    );
    expect(stockCountRequestHash(input)).not.toBe(
      stockCountRequestHash({
        ...input,
        lines: [{ ...lines[0], unitCostVnd: "1001" }, lines[1]],
      }),
    );
  });

  test("rejects same key with a different canonical request", () => {
    expect(() => assertWriteReplay("old", "new", "payload kiểm kho")).toThrow(
      "payload kiểm kho khác",
    );
  });

  test("purchase receipt hash ignores retry key but includes exact line amount", () => {
    const input = {
      idempotencyKey: "purchase-receipt-first",
      businessDate: "2026-08-12",
      receivedAt: "2026-08-12T08:00:00+07:00",
      supplierName: "Chợ đầu mối",
      supplierContact: "",
      note: "",
      lines: [
        {
          inventoryItemId: new Types.ObjectId().toString(),
          quantity: "12.500",
          totalAmountVnd: 125_000,
          lotCode: "lot-01",
        },
      ],
    };
    expect(purchaseReceiptRequestHash(input)).toBe(
      purchaseReceiptRequestHash({
        ...input,
        idempotencyKey: "purchase-receipt-retry",
        lines: [{ ...input.lines[0], quantity: "12.5", lotCode: "LOT-01" }],
      }),
    );
    expect(purchaseReceiptRequestHash(input)).not.toBe(
      purchaseReceiptRequestHash({
        ...input,
        lines: [{ ...input.lines[0], totalAmountVnd: 125_001 }],
      }),
    );
  });
});
