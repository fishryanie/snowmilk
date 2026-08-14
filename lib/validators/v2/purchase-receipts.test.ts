import { describe, expect, it } from "bun:test";
import { createPurchaseReceiptSchema } from "./purchase-receipts";

const itemId = "64f111111111111111111111";

function validInput() {
  return {
    idempotencyKey: "purchase-receipt-123",
    businessDate: "2026-08-12",
    receivedAt: "2026-08-12T08:00:00+07:00",
    supplierName: "Chợ đầu mối",
    lines: [{ inventoryItemId: itemId, quantity: "12.5", totalAmountVnd: 125_000 }],
  };
}

describe("createPurchaseReceiptSchema", () => {
  it("normalizes a valid exact-money receipt", () => {
    const parsed = createPurchaseReceiptSchema.parse(validInput());
    expect(parsed.lines[0].quantity).toBe("12.5");
    expect(parsed.lines[0].totalAmountVnd).toBe(125_000);
    expect(parsed.note).toBe("");
  });

  it("rejects floating-point VND amounts", () => {
    const input = validInput();
    input.lines[0].totalAmountVnd = 125_000.5;
    expect(() => createPurchaseReceiptSchema.parse(input)).toThrow();
  });

  it("rejects duplicate item and lot lines", () => {
    const input = validInput();
    input.lines = [
      { ...input.lines[0], lotCode: "LOT-01" } as never,
      { ...input.lines[0], lotCode: "lot-01" } as never,
    ];
    expect(() => createPurchaseReceiptSchema.parse(input)).toThrow(
      "Một hàng hóa/lot chỉ được nhập một lần",
    );
  });

  it("rejects an expiry at or before receiving", () => {
    const input = validInput();
    input.lines = [
      { ...input.lines[0], expiresAt: "2026-08-12T07:59:00+07:00" } as never,
    ];
    expect(() => createPurchaseReceiptSchema.parse(input)).toThrow(
      "Hạn dùng phải sau thời điểm nhận hàng",
    );
  });
});
