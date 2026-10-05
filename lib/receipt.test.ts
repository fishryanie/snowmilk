import { describe, expect, test } from "bun:test";
import { normalizeReceipt, receiptImageId } from "./receipt";
import { receiptExtractionSchema, receiptImportSchema } from "./validators/receipt";

const catalog = [{ id: "a".repeat(24), name: "Sữa tươi", code: "NL001", purchaseUnit: "chai", packageQuantity: 1.5, costUnit: "lít" }];
const extraction = {
  purchaseDate: "2026-09-30", supplier: "Nhà cung cấp", invoiceNumber: null, totalAmount: 120000,
  warnings: [], lines: [{ itemName: "Sữa tươi", ingredientId: catalog[0].id, category: "Nguyên liệu" as const,
    purchaseUnit: "chai", packageQuantity: 1.5, costUnit: "lít", packageCount: 4, totalAmount: 120000, warnings: [] }],
};

describe("receipt scan validation", () => {
  test("preserves bill date and exact catalog matches", () => {
    const result = normalizeReceipt(extraction, catalog, "2026-10-05");
    expect(result.purchaseDate).toBe("2026-09-30");
    expect(result.lines[0].ingredientId).toBe(catalog[0].id);
  });
  test("does not assume today when date is missing, impossible, or future", () => {
    for (const date of [null, "2026-02-30", "2999-01-01"]) {
      const result = normalizeReceipt({ ...extraction, purchaseDate: date }, catalog, "2026-10-05");
      expect(result.purchaseDate).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
  test("rejects hallucinated catalog ids and mismatched packaging units", () => {
    for (const line of [{ ...extraction.lines[0], ingredientId: "fake" },
      { ...extraction.lines[0], purchaseUnit: "thùng" },
      { ...extraction.lines[0], packageQuantity: 12 },
      { ...extraction.lines[0], costUnit: "ml" }]) {
      expect(normalizeReceipt({ ...extraction, lines: [line] }, catalog).lines[0].ingredientId).toBeNull();
    }
  });
  test("flags mismatched bill total without assigning fees to a product", () => {
    const result = normalizeReceipt({ ...extraction, totalAmount: 125000 }, catalog);
    expect(result.warnings.some((value) => value.includes("Tổng"))).toBe(true);
    expect(result.lines[0].totalAmount).toBe(120000);
  });
  test("rejects empty extraction, negative quantity and fractional VND", () => {
    expect(receiptExtractionSchema.safeParse({ ...extraction, lines: [] }).success).toBe(false);
    expect(receiptExtractionSchema.safeParse({ ...extraction, lines: [{ ...extraction.lines[0], packageCount: -1 }] }).success).toBe(false);
    expect(receiptExtractionSchema.safeParse({ ...extraction, totalAmount: 12.5 }).success).toBe(false);
  });
  test("fingerprints JPEG bytes and refuses non-image strings", () => {
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 1, 2, 3]).toString("base64");
    expect(receiptImageId(jpeg)).toBe(receiptImageId(jpeg));
    expect(receiptImageId(jpeg)).toHaveLength(64);
    expect(() => receiptImageId(Buffer.from("not an image").toString("base64"))).toThrow("JPEG");
  });
});

test("imports require one valid bill day, whole VND and a bounded line count", () => {
  const line = { source: "existing", ingredientId: catalog[0].id, purchaseDate: "2026-09-30T12:00:00+07:00", packageCount: 4, totalAmount: 120000 };
  const valid = { receiptId: "b".repeat(64), lines: [line] };
  expect(receiptImportSchema.safeParse(valid).success).toBe(true);
  for (const lines of [[], Array(41).fill(line), [line, { ...line, purchaseDate: "2026-09-29T12:00:00+07:00" }], [{ ...line, totalAmount: 1.5 }]]) {
    expect(receiptImportSchema.safeParse({ ...valid, lines }).success).toBe(false);
  }
});
