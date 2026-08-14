import { describe, expect, test } from "bun:test";
import { allocateFefo } from "@/services/v2/inventory-allocation";

describe("FEFO finished goods", () => {
  test("uses the earliest expiry and splits across lots", () => {
    const result = allocateFefo(
      [
        {
          balanceId: "late",
          inventoryLotId: "lot-late",
          availableQuantity: "5",
          unitCostVnd: "12000",
          expiresAt: new Date("2026-08-14T00:00:00Z"),
        },
        {
          balanceId: "early",
          inventoryLotId: "lot-early",
          availableQuantity: "2",
          unitCostVnd: "10000",
          expiresAt: new Date("2026-08-13T00:00:00Z"),
        },
      ],
      4,
    );
    expect(result.map(({ balanceId, quantity }) => [balanceId, quantity])).toEqual([
      ["early", 2],
      ["late", 2],
    ]);
  });

  test("blocks selling beyond finished stock", () => {
    expect(() =>
      allocateFefo(
        [
          {
            balanceId: "one",
            inventoryLotId: "lot",
            availableQuantity: "1",
            unitCostVnd: "10000",
          },
        ],
        2,
      ),
    ).toThrow("Không đủ thành phẩm");
  });
});
