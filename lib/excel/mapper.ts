import { createHash } from "node:crypto";
import type ExcelJS from "exceljs";
import { calculateSaleTotals } from "@/lib/calculations/sales";
import { DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE } from "@/lib/purchase-funding";
import { dateValue, numberValue, textValue } from "./value";

export type ImportIssue = {
  sheet: string;
  row: number;
  column?: string;
  message: string;
  severity: "error" | "warning";
};

export type ParsedWorkbook = {
  fileHash: string;
  settings: Record<string, unknown>[];
  equipment: Record<string, unknown>[];
  sizes: Record<string, unknown>[];
  ingredients: Record<string, unknown>[];
  products: Record<string, unknown>[];
  purchases: Record<string, unknown>[];
  milkBatches: Record<string, unknown>[];
  sales: Record<string, unknown>[];
  issues: ImportIssue[];
  metrics: {
    investmentTotal: number;
    purchaseTotal: number;
    totalCups: number;
    grossRevenue: number;
    discountTotal: number;
    netRevenue: number;
    variableCost: number;
    contributionProfit: number;
  };
};

const active = (value: string) => value.trim().toLocaleLowerCase("vi") === "có";
const source = (sheet: string, row: number, legacyId: string) => ({
  sourceSheet: sheet,
  sourceRow: row,
  legacyId,
});

function requiredIssue(
  issues: ImportIssue[],
  sheet: string,
  row: number,
  column: string,
  value: unknown,
  label: string,
) {
  if (value === null || value === undefined || value === "") {
    issues.push({
      sheet,
      row,
      column,
      message: `Thiếu ${label}`,
      severity: "error",
    });
  }
}

export function mapWorkbook(
  workbook: ExcelJS.Workbook,
  rawBytes?: Buffer,
): ParsedWorkbook {
  const issues: ImportIssue[] = [];
  const fileHash = createHash("sha256")
    .update(rawBytes ?? Buffer.from(workbook.worksheets.map((s) => s.name).join("|")))
    .digest("hex");

  const setupSheet = workbook.getWorksheet("Thiết lập");
  const equipmentSheet = workbook.getWorksheet("Đầu tư & Tài sản");
  const sizeSheet = workbook.getWorksheet("Size");
  const ingredientSheet = workbook.getWorksheet("Hàng hóa");
  const productSheet = workbook.getWorksheet("Sản phẩm");
  const purchaseSheet = workbook.getWorksheet("Nhập hàng");
  const batchSheet = workbook.getWorksheet("Mẻ sữa");
  const quickSaleSheet = workbook.getWorksheet("Bán nhanh");
  const saleDetailSheet = workbook.getWorksheet("Bán hàng");

  const requiredSheets = [
    setupSheet,
    equipmentSheet,
    sizeSheet,
    ingredientSheet,
    productSheet,
    purchaseSheet,
    batchSheet,
    quickSaleSheet,
    saleDetailSheet,
  ];
  if (requiredSheets.some((sheet) => !sheet)) {
    throw new Error("Workbook thiếu một hoặc nhiều sheet nghiệp vụ bắt buộc.");
  }

  const settings = [];
  for (let rowNumber = 4; rowNumber <= 12; rowNumber += 1) {
    const row = setupSheet!.getRow(rowNumber);
    const label = textValue(row.getCell(1));
    if (!label) continue;
    settings.push({
      key: label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
      label,
      value: numberValue(row.getCell(2)),
      ...source("Thiết lập", rowNumber, `setting:${rowNumber}`),
    });
  }

  const equipment = [];
  for (let rowNumber = 4; rowNumber <= 203; rowNumber += 1) {
    const row = equipmentSheet!.getRow(rowNumber);
    const name = textValue(row.getCell(2));
    if (!name) continue;
    const code = textValue(row.getCell(12)) || `TS-${String(rowNumber - 3).padStart(3, "0")}`;
    const quantity = numberValue(row.getCell(4));
    const unitPrice = numberValue(row.getCell(5));
    const usefulLifeMonths = numberValue(row.getCell(8));
    const isActive = active(textValue(row.getCell(10)));
    requiredIssue(issues, "Đầu tư & Tài sản", rowNumber, "A", dateValue(row.getCell(1)), "ngày mua");
    equipment.push({
      code,
      purchaseDate: dateValue(row.getCell(1)),
      name,
      category: textValue(row.getCell(3)) || "Khác",
      quantity,
      unitPrice,
      totalAmount: numberValue(row.getCell(6)) || quantity * unitPrice,
      residualValue: numberValue(row.getCell(7)),
      usefulLifeMonths: usefulLifeMonths || undefined,
      monthlyDepreciation: numberValue(row.getCell(9)),
      isActive,
      status: isActive ? "using" : "disposed",
      note: textValue(row.getCell(11)),
      ...source("Đầu tư & Tài sản", rowNumber, `equipment:${code}`),
    });
  }

  const ingredients = [];
  for (let rowNumber = 4; rowNumber <= 203; rowNumber += 1) {
    const row = ingredientSheet!.getRow(rowNumber);
    const name = textValue(row.getCell(2));
    if (!name) continue;
    const code = textValue(row.getCell(1)) || `HH-${String(rowNumber - 3).padStart(3, "0")}`;
    ingredients.push({
      code,
      name,
      category: textValue(row.getCell(3)) || "Khác",
      purchaseUnit: textValue(row.getCell(4)),
      packageQuantity: numberValue(row.getCell(5)) || 1,
      costUnit: textValue(row.getCell(6)),
      referencePackagePrice: numberValue(row.getCell(7)),
      averageUnitCost: numberValue(row.getCell(8)),
      isActive: active(textValue(row.getCell(9))),
      note: textValue(row.getCell(10)),
      ...source("Hàng hóa", rowNumber, `ingredient:${code}`),
    });
  }

  const sizes = [];
  for (let rowNumber = 4; rowNumber <= 53; rowNumber += 1) {
    const row = sizeSheet!.getRow(rowNumber);
    const name = textValue(row.getCell(2));
    if (!name) continue;
    const code =
      textValue(row.getCell(1)) ||
      `SZ-${String(rowNumber - 3).padStart(3, "0")}`;
    sizes.push({
      code,
      name,
      milkMl: numberValue(row.getCell(3)),
      cupSetName: textValue(row.getCell(4)),
      sellingPrice: numberValue(row.getCell(5)),
      isActive: active(textValue(row.getCell(6))),
      ...source("Size", rowNumber, `size:${code}`),
    });
  }

  const products = [];
  for (let rowNumber = 4; rowNumber <= 103; rowNumber += 1) {
    const row = productSheet!.getRow(rowNumber);
    const code = textValue(row.getCell(1));
    const name = textValue(row.getCell(4));
    if (!code || !name) continue;
    const sellingPrice = numberValue(row.getCell(6));
    const fullCost = numberValue(row.getCell(14));
    if (fullCost > sellingPrice * 2) {
      issues.push({
        sheet: "Sản phẩm",
        row: rowNumber,
        column: "N",
        message: `Full cost ${fullCost} cao hơn nhiều so với giá bán ${sellingPrice}; giữ nguyên để đối soát.`,
        severity: "warning",
      });
    }
    products.push({
      code,
      name,
      toppingName: textValue(row.getCell(2)),
      sizeName: textValue(row.getCell(3)),
      toppingGrams: numberValue(row.getCell(5)),
      sellingPrice,
      milkMl: numberValue(row.getCell(7)),
      milkCost: numberValue(row.getCell(8)),
      toppingCost: numberValue(row.getCell(9)),
      packagingCost: numberValue(row.getCell(10)),
      overheadCost: numberValue(row.getCell(11)),
      variableCost: numberValue(row.getCell(12)),
      allocatedFixedCost: numberValue(row.getCell(13)),
      fullCost,
      isActive: active(textValue(row.getCell(15))),
      ...source("Sản phẩm", rowNumber, `product:${code}`),
    });
  }

  const purchases = [];
  for (let rowNumber = 4; rowNumber <= 503; rowNumber += 1) {
    const row = purchaseSheet!.getRow(rowNumber);
    const itemName = textValue(row.getCell(2));
    if (!itemName) continue;
    const itemCode = textValue(row.getCell(3));
    const purchaseDate = dateValue(row.getCell(1));
    requiredIssue(issues, "Nhập hàng", rowNumber, "A", purchaseDate, "ngày nhập");
    purchases.push({
      purchaseDate,
      itemName,
      itemCode,
      category: textValue(row.getCell(4)),
      packageCount: numberValue(row.getCell(5)),
      packageQuantity: numberValue(row.getCell(6)),
      costUnit: textValue(row.getCell(7)),
      referencePackagePrice: numberValue(row.getCell(8)),
      actualPackagePrice: numberValue(row.getCell(9)),
      convertedQuantity: numberValue(row.getCell(10)),
      totalAmount: numberValue(row.getCell(11)),
      fundingSource: DEFAULT_LEGACY_PURCHASE_FUNDING_SOURCE,
      supplier: textValue(row.getCell(12)),
      note: textValue(row.getCell(13)),
      ...source("Nhập hàng", rowNumber, `purchase:${rowNumber}`),
    });
  }

  const batchDetails = new Map<string, Record<string, unknown>[]>();
  for (let rowNumber = 12; rowNumber <= 503; rowNumber += 1) {
    const row = batchSheet!.getRow(rowNumber);
    const batchName = textValue(row.getCell(19));
    const ingredientName = textValue(row.getCell(21));
    if (!batchName || !ingredientName) continue;
    const item = {
      ingredientName,
      quantity: numberValue(row.getCell(22)),
      unit: textValue(row.getCell(23)),
      unitCost: numberValue(row.getCell(24)),
      amount: numberValue(row.getCell(25)),
      note: textValue(row.getCell(26)),
    };
    batchDetails.set(batchName, [...(batchDetails.get(batchName) ?? []), item]);
  }

  const milkBatches = [];
  for (let rowNumber = 4; rowNumber <= 203; rowNumber += 1) {
    const row = batchSheet!.getRow(rowNumber);
    const code = textValue(row.getCell(2));
    const name = textValue(row.getCell(3));
    if (!code || !name) continue;
    const cookedAt = dateValue(row.getCell(1));
    if (!cookedAt) {
      issues.push({
        sheet: "Mẻ sữa",
        row: rowNumber,
        column: "A",
        message: "Mẻ sữa chưa có ngày nấu; dữ liệu vẫn được giữ để truy vết.",
        severity: "warning",
      });
    }
    milkBatches.push({
      code,
      name,
      cookedAt: cookedAt ?? undefined,
      actualLiters: numberValue(row.getCell(4)),
      cookingHours: numberValue(row.getCell(5)),
      stoveKw: numberValue(row.getCell(6)),
      electricityPrice: numberValue(row.getCell(7)),
      otherElectricityCost: numberValue(row.getCell(8)),
      waterCleaningCost: numberValue(row.getCell(9)),
      ingredientCost: numberValue(row.getCell(10)),
      electricityCost: numberValue(row.getCell(11)),
      totalCost: numberValue(row.getCell(12)),
      costPerLiter: numberValue(row.getCell(13)),
      costPerMl: numberValue(row.getCell(14)),
      ingredients: batchDetails.get(name) ?? [],
      note: textValue(row.getCell(17)),
      ...source("Mẻ sữa", rowNumber, `batch:${code}`),
    });
  }

  const productsByName = new Map(products.map((product) => [String(product.name), product]));
  const sales = [];
  for (let rowNumber = 4; rowNumber <= 103; rowNumber += 1) {
    const row = quickSaleSheet!.getRow(rowNumber);
    const saleDate = dateValue(row.getCell(1));
    const batchName = textValue(row.getCell(2));
    if (!saleDate || !batchName) continue;
    const detailStart = 4 + (rowNumber - 4) * 10;
    const items = [];
    for (let column = 4; column <= 13; column += 1) {
      const quantity = numberValue(row.getCell(column));
      if (quantity <= 0) continue;
      const productName = textValue(quickSaleSheet!.getRow(3).getCell(column));
      const product = productsByName.get(productName);
      const detailRow = saleDetailSheet!.getRow(detailStart + column - 4);
      if (!product) {
        issues.push({
          sheet: "Bán nhanh",
          row: rowNumber,
          column: quickSaleSheet!.getColumn(column).letter,
          message: `Không tìm thấy sản phẩm “${productName}”.`,
          severity: "error",
        });
        continue;
      }
      items.push({
        productCode: product.code as string,
        productName,
        sizeName: product.sizeName as string,
        quantity,
        unitPrice: numberValue(detailRow.getCell(7)) || Number(product.sellingPrice),
        unitVariableCost:
          numberValue(detailRow.getCell(15)) || Number(product.variableCost),
      });
    }
    const discountAmount = Array.from({ length: 10 }, (_, index) =>
      numberValue(saleDetailSheet!.getRow(detailStart + index).getCell(8)),
    ).reduce((sum, value) => sum + value, 0);
    const totals = calculateSaleTotals(items, discountAmount);
    sales.push({
      saleDate,
      entryMode: "itemized",
      batchName,
      batchCode:
        milkBatches.find((batch) => batch.name === batchName)?.code ?? "",
      paymentMethod: textValue(row.getCell(3)) || "Tiền mặt",
      ...totals,
      note: textValue(row.getCell(16)),
      ...source("Bán nhanh", rowNumber, `sale-quick:${rowNumber}`),
    });
  }

  const sum = (records: Record<string, unknown>[], key: string) =>
    records.reduce((total, record) => total + Number(record[key] ?? 0), 0);
  const metrics = {
    investmentTotal: sum(equipment, "totalAmount"),
    purchaseTotal: sum(purchases, "totalAmount"),
    totalCups: sum(sales, "totalCups"),
    grossRevenue: sum(sales, "grossRevenue"),
    discountTotal: sum(sales, "discountAmount"),
    netRevenue: sum(sales, "netRevenue"),
    variableCost: sum(sales, "totalVariableCost"),
    contributionProfit: sum(sales, "contributionProfit"),
  };

  return {
    fileHash,
    settings,
    equipment,
    sizes,
    ingredients,
    products,
    purchases,
    milkBatches,
    sales,
    issues,
    metrics,
  };
}

export function importSummary(parsed: ParsedWorkbook) {
  const countBySheet = [
    ["Thiết lập", parsed.settings.length],
    ["Đầu tư & Tài sản", parsed.equipment.length],
    ["Size", parsed.sizes.length],
    ["Hàng hóa", parsed.ingredients.length],
    ["Sản phẩm", parsed.products.length],
    ["Nhập hàng", parsed.purchases.length],
    ["Mẻ sữa", parsed.milkBatches.length],
    ["Bán nhanh", parsed.sales.length],
  ] as const;
  return {
    sheets: countBySheet.map(([sheetName, totalRows]) => {
      const errors = parsed.issues.filter(
        (issue) => issue.sheet === sheetName && issue.severity === "error",
      );
      return {
        sheetName,
        totalRows,
        successRows: Math.max(0, totalRows - errors.length),
        failedRows: errors.length,
        errors,
      };
    }),
    totals: {
      totalRows: countBySheet.reduce((sum, [, count]) => sum + count, 0),
      successRows:
        countBySheet.reduce((sum, [, count]) => sum + count, 0) -
        parsed.issues.filter((issue) => issue.severity === "error").length,
      failedRows: parsed.issues.filter((issue) => issue.severity === "error").length,
    },
  };
}
