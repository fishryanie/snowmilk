import { describe, expect, test } from "bun:test";
import { Decimal128, ObjectId } from "mongodb";
import { assertUpsertedDocumentMatches } from "./migration-integrity";

describe("migration idempotent upsert integrity", () => {
  test("accepts BSON-equivalent immutable fields and ignores operational metadata", () => {
    const id = new ObjectId();
    expect(() =>
      assertUpsertedDocumentMatches(
        {
          organizationId: id,
          quantity: Decimal128.fromString("400.00"),
          createdAt: new Date(),
        },
        {
          organizationId: new ObjectId(id.toHexString()),
          quantity: Decimal128.fromString("400.00"),
        },
        "fixture",
      ),
    ).not.toThrow();
  });

  test("blocks a same-key document whose immutable body differs", () => {
    expect(() =>
      assertUpsertedDocumentMatches(
        { code: "SP-001", unitPriceVnd: 19_000 },
        { code: "SP-001", unitPriceVnd: 20_000 },
        "v2_sku_prices",
      ),
    ).toThrow("unitPriceVnd");
  });
});
