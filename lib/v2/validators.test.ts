import { describe, expect, test } from "bun:test";
import {
  closeSalesDaySchema,
  completeProductionBatchSchema,
  createProductionBatchSchema,
  createStockCountSchema,
  reopenSalesDaySchema,
  revenueReportFiltersSchema,
  saveSalesDayDraftSchema,
} from "@/lib/validators/v2";

const id = "507f1f77bcf86cd799439011";
const idempotencyKey = "request_20260812_0001";

describe("v2 API input validators", () => {
  test("sales draft accepts quantities/payments and rejects client snapshots", () => {
    const valid = {
      version: 0,
      idempotencyKey,
      lines: [{ skuId: id, quantity: 2 }],
      payments: { cashVnd: 40_000 },
    };
    expect(saveSalesDayDraftSchema.safeParse(valid).success).toBe(true);
    expect(
      saveSalesDayDraftSchema.safeParse({
        ...valid,
        lines: [{ skuId: id, quantity: 2, unitPriceVnd: 20_000 }],
      }).success,
    ).toBe(false);
    expect(
      saveSalesDayDraftSchema.safeParse({ ...valid, netRevenueVnd: 40_000 })
        .success,
    ).toBe(false);
  });

  test("close/reopen require optimistic version and idempotency", () => {
    expect(
      closeSalesDaySchema.safeParse({ version: 1, idempotencyKey }).success,
    ).toBe(true);
    expect(
      reopenSalesDaySchema.safeParse({
        version: 1,
        idempotencyKey,
        reason: "Đối soát lại tiền cuối ngày",
      }).success,
    ).toBe(true);
    expect(
      reopenSalesDaySchema.safeParse({
        version: 1,
        idempotencyKey,
        reason: "sửa",
      }).success,
    ).toBe(false);
  });

  test("validates production lifecycle and expiry order", () => {
    expect(
      createProductionBatchSchema.safeParse({
        businessDate: "2026-08-12",
        idempotencyKey,
        recipeVersionId: id,
        startedAt: "2026-08-12T06:00:00+07:00",
        plannedOutputQuantity: 20,
      }).success,
    ).toBe(true);
    expect(
      completeProductionBatchSchema.safeParse({
        version: 1,
        idempotencyKey,
        completedAt: "2026-08-12T07:00:00+07:00",
        components: [{ inventoryItemId: id, quantity: "4000.5" }],
        goodOutputQuantity: 19,
        wasteOutputQuantity: 1,
        expiresAt: "2026-08-13T07:00:00+07:00",
      }).success,
    ).toBe(true);
  });

  test("validates stock count decimals and duplicate lots", () => {
    expect(
      createStockCountSchema.safeParse({
        idempotencyKey,
        countedAt: "2026-08-12T20:00:00+07:00",
        lines: [{ inventoryItemId: id, countedQuantity: "12.5" }],
      }).success,
    ).toBe(true);
    expect(
      createStockCountSchema.safeParse({
        idempotencyKey,
        countedAt: "2026-08-12T20:00:00+07:00",
        lines: [
          { inventoryItemId: id, countedQuantity: "12" },
          { inventoryItemId: id, countedQuantity: "13" },
        ],
      }).success,
    ).toBe(false);
  });

  test("validates report date range and rejects unknown filters", () => {
    expect(
      revenueReportFiltersSchema.safeParse({
        from: "2026-07-22",
        to: "2026-08-11",
      }).success,
    ).toBe(true);
    expect(
      revenueReportFiltersSchema.safeParse({
        from: "2026-08-12",
        to: "2026-08-11",
      }).success,
    ).toBe(false);
    expect(
      revenueReportFiltersSchema.safeParse({
        from: "2026-07-22",
        to: "2026-08-11",
        includeSecrets: true,
      }).success,
    ).toBe(false);
  });
});

