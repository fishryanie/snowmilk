import { describe, expect, test } from "bun:test";
import {
  operationKeySuffix,
  persistedSalesTotals,
  reversalRevenueSnapshot,
  salesOperationRequestHash,
} from "@/services/v2/operation-invariants";
import { DomainError } from "@/services/v2/errors";
import { assertWriteReplay } from "@/services/v2/write-idempotency";

describe("v2 service persistence invariants", () => {
  test("does not send calculated paymentDifferenceVnd into strict SalesDay", () => {
    expect(
      persistedSalesTotals({
        grossRevenueVnd: 20_000,
        discountVnd: 0,
        refundVnd: 0,
        netRevenueVnd: 20_000,
        collectedVnd: 20_000,
        paymentDifferenceVnd: 0,
      }),
    ).toEqual({
      grossRevenueVnd: 20_000,
      discountVnd: 0,
      refundVnd: 0,
      netRevenueVnd: 20_000,
      collectedVnd: 20_000,
    });
  });



  test("hashes the complete idempotency key, not only a collision-prone suffix", () => {
    expect(operationKeySuffix("first-shared-tail")).not.toBe(
      operationKeySuffix("second-shared-tail"),
    );
    expect(operationKeySuffix("stable")).toBe(operationKeySuffix("stable"));
  });

  test("close replay binds the idempotency key to the sales-day version", () => {
    const first = salesOperationRequestHash("close", "2026-08-12", {
      version: 3,
    });
    expect(
      salesOperationRequestHash("close", "2026-08-12", { version: 3 }),
    ).toBe(first);

    try {
      assertWriteReplay(
        first,
        salesOperationRequestHash("close", "2026-08-12", { version: 5 }),
        "nội dung chốt ngày",
      );
      throw new Error("Expected an idempotency conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("IDEMPOTENCY_KEY_REUSED");
    }
  });

  test("reopen replay binds the key to version, date, and normalized reason", () => {
    const first = salesOperationRequestHash("reopen", "2026-08-12", {
      version: 4,
      reason: "Sai số kiểm đếm",
    });
    expect(
      salesOperationRequestHash("reopen", "2026-08-12", {
        version: 4,
        reason: "Sai số kiểm đếm",
      }),
    ).toBe(first);
    expect(
      salesOperationRequestHash("reopen", "2026-08-12", {
        version: 4,
        reason: "Khách hoàn tiền",
      }),
    ).not.toBe(first);
    expect(
      salesOperationRequestHash("reopen", "2026-08-13", {
        version: 4,
        reason: "Sai số kiểm đếm",
      }),
    ).not.toBe(first);
  });

  test("reopen reversal negates the immutable revenue-entry quantity snapshot", () => {
    expect(
      reversalRevenueSnapshot({
        quantity: "5",
        quantitySource: "actual",
        salesUnitSnapshot: "box",
        grossRevenueVnd: 100_000,
        discountVnd: 10_000,
        refundVnd: 0,
        netRevenueVnd: 90_000,
        cogsVnd: 40_000,
        profitVnd: 50_000,
      }),
    ).toEqual({
      quantity: "-5",
      quantitySource: "actual",
      salesUnitSnapshot: "box",
      grossRevenueVnd: -100_000,
      discountVnd: -10_000,
      refundVnd: -0,
      netRevenueVnd: -90_000,
      cogsVnd: -40_000,
      profitVnd: -50_000,
    });
  });
});
