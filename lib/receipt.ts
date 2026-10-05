import { createHash } from "node:crypto";
import type { ReceiptExtraction } from "@/lib/validators/receipt";
import { isVietnamDateKey, vietnamDateKey } from "@/lib/vietnam-date";

export type ReceiptCatalogItem = {
  id: string;
  name: string;
  code: string;
  purchaseUnit: string;
  packageQuantity: number;
  costUnit: string;
};

export function receiptImageId(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  // The app always converts camera/library inputs to JPEG.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error("Ảnh bill phải là ảnh JPEG hợp lệ.");
  }
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedUnit(value: string) {
  return value.trim().toLocaleLowerCase("vi").normalize("NFD")
    .replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d");
}

export function normalizeReceipt(extracted: ReceiptExtraction, catalog: ReceiptCatalogItem[], today = vietnamDateKey(new Date())) {
  const warnings = [...extracted.warnings];
  let purchaseDate = extracted.purchaseDate;
  if (!purchaseDate || !isVietnamDateKey(purchaseDate) || purchaseDate > today) {
    purchaseDate = null;
    warnings.push("Chưa đọc được ngày hợp lệ trên bill. Hãy chọn ngày nhập trước khi lưu.");
  }
  const lines = extracted.lines.map((line) => {
    const lineWarnings = [...line.warnings];
    let match = catalog.find((item) => item.id === line.ingredientId);
    // A carton and a bottle with the same name must not silently share a quantity.
    if (match && (!line.purchaseUnit || normalizedUnit(line.purchaseUnit) !== normalizedUnit(match.purchaseUnit)
      || (line.packageQuantity !== null && line.packageQuantity !== match.packageQuantity)
      || (line.costUnit !== null && normalizedUnit(line.costUnit) !== normalizedUnit(match.costUnit)))) {
      lineWarnings.push("Quy cách trên bill cần đối chiếu với danh mục. Hãy chọn hàng và kiểm tra số đơn vị mua.");
      match = undefined;
    }
    if (!match) lineWarnings.push("Hãy chọn hàng có sẵn hoặc kiểm tra quy cách của hàng mới.");
    if (line.packageCount === null) lineWarnings.push("Chưa đọc rõ số lượng mua.");
    if (line.totalAmount === null) lineWarnings.push("Chưa đọc rõ thành tiền của dòng hàng.");
    return { ...line, ingredientId: match?.id ?? null, warnings: [...new Set(lineWarnings)] };
  });
  const knownAmounts = lines.every((line) => line.totalAmount !== null);
  if (knownAmounts && extracted.totalAmount !== null
    && lines.reduce((sum, line) => sum + (line.totalAmount ?? 0), 0) !== extracted.totalAmount) {
    warnings.push("Tổng các dòng hàng khác tổng bill. Kiểm tra chiết khấu, thuế và phí trước khi lưu.");
  }
  return { ...extracted, purchaseDate, lines, warnings: [...new Set(warnings)] };
}
