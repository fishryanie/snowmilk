import { describe, expect, test } from "bun:test";
import { ReceiptScanError, receiptModelName, receiptProviderError } from "./receipt-provider";

describe("receipt vision configuration", () => {
  test("uses the official vision API identifier by default", () => {
    for (const value of [undefined, "", "  ", "deepseek-flash", "deepseek-flash\n"]) {
      expect(receiptModelName(value)).toBe("deepseek-flash");
    }
    expect(receiptModelName("deepseek-v4-flash-vision-exp")).toBe("deepseek-v4-flash-vision-exp");
  });

  test("rejects the production failure's display name and text-only models before a paid scan", () => {
    for (const value of ["DeepSeek-V4.1-Flash", "\"deepseek-flash\"", "deepseek-v4-pro"]) {
      let failure: unknown;
      try { receiptModelName(value); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(ReceiptScanError);
      expect((failure as ReceiptScanError).status).toBe(503);
      expect((failure as ReceiptScanError).message).toContain("cấu hình");
    }
  });
});

describe("receipt provider failures", () => {
  test("a rejected model is a server configuration error, not a blurry photo", () => {
    const failure = receiptProviderError(400);
    expect(failure.status).toBe(503);
    expect(failure.message).toContain("Cấu hình");
    expect(failure.message).not.toContain("ảnh rõ hơn");
  });

  test("distinguishes credentials, billing, access, throttling and outages", () => {
    expect(receiptProviderError(401).message).toContain("API key");
    expect(receiptProviderError(402).message).toContain("số dư");
    expect(receiptProviderError(403).message).toContain("quyền truy cập");
    expect(receiptProviderError(429).status).toBe(429);
    expect(receiptProviderError(500).status).toBe(503);
    expect(receiptProviderError(503).message).toContain("Ảnh vẫn được giữ");
  });
});
