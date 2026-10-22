import { describe, expect, test } from "bun:test";
import { Types } from "mongoose";
import {
  assertWriteReplay,
  purchaseReceiptRequestHash,
} from "@/services/v2/write-idempotency";

describe("v2 write idempotency payloads", () => {


  test("rejects same key with a different canonical request", () => {
    expect(() => assertWriteReplay("old", "new", "nội dung phiếu nhập")).toThrow(
      "nội dung phiếu nhập khác",
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
        },
      ],
    };
    expect(purchaseReceiptRequestHash(input)).toBe(
      purchaseReceiptRequestHash({
        ...input,
        idempotencyKey: "purchase-receipt-retry",
        lines: [{ ...input.lines[0], quantity: "12.5" }],
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
