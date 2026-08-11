import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/lib/formatters";
import { purchaseFundingSourceLabel, type PurchaseFundingSource } from "@/lib/purchase-funding";

export type PurchasePdfRecord = {
  purchaseDate: string | Date;
  itemCode: string;
  itemName: string;
  category: string;
  packageCount: number;
  packageQuantity: number;
  costUnit: string;
  actualPackagePrice: number;
  convertedQuantity: number;
  totalAmount: number;
  fundingSource?: PurchaseFundingSource;
  supplier?: string;
};

export type PurchasePdfFilters = {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  fundingSource?: PurchaseFundingSource;
};

type TableColumn = {
  key:
    | "index"
    | "date"
    | "item"
    | "category"
    | "packages"
    | "packageSpec"
    | "quantity"
    | "price"
    | "amount"
    | "funding"
    | "supplier";
  label: string;
  width: number;
  align: "left" | "right" | "center";
};

const BRAND_COLOR = "#16645a";
const INK_COLOR = "#17343b";
const MUTED_COLOR = "#60767b";
const LINE_COLOR = "#d9e4e1";
const LIGHT_COLOR = "#eef6f4";
const PAGE_MARGIN = 32;
const TABLE_TOP = 126;
const FOOTER_HEIGHT = 28;
const BUSINESS_NAME = "SỮA TUYẾT VÂN NAM";

const tableColumns: TableColumn[] = [
  { key: "index", label: "STT", width: 27, align: "center" },
  { key: "date", label: "Ngày nhập", width: 58, align: "left" },
  { key: "item", label: "Hàng hóa", width: 116, align: "left" },
  { key: "category", label: "Nhóm", width: 64, align: "left" },
  { key: "packages", label: "Số gói", width: 47, align: "right" },
  { key: "packageSpec", label: "Quy cách/gói", width: 66, align: "right" },
  { key: "quantity", label: "Tổng lượng", width: 67, align: "right" },
  { key: "price", label: "Giá/gói", width: 78, align: "right" },
  { key: "amount", label: "Tổng tiền", width: 84, align: "right" },
  { key: "funding", label: "Nguồn tiền", width: 79, align: "left" },
  { key: "supplier", label: "Nhà cung cấp", width: 91, align: "left" },
];

function pdfFontPath() {
  const fontPath = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "compiled",
    "@vercel",
    "og",
    "Geist-Regular.ttf",
  );
  if (!fs.existsSync(fontPath)) {
    throw new Error("Không tìm thấy font tiếng Việt để tạo PDF");
  }
  return fontPath;
}

function currency(value: number) {
  return `${formatNumber(Math.round(value))} đ`;
}

function filterDescription(filters: PurchasePdfFilters) {
  const parts = [
    filters.query ? `Từ khóa: ${filters.query}` : "",
    filters.dateFrom || filters.dateTo
      ? `Ngày: ${filters.dateFrom ? formatDate(filters.dateFrom) : "đầu kỳ"} - ${
          filters.dateTo ? formatDate(filters.dateTo) : "hiện tại"
        }`
      : "",
    filters.category ? `Nhóm: ${filters.category}` : "",
    filters.fundingSource
      ? `Nguồn: ${purchaseFundingSourceLabel(filters.fundingSource)}`
      : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : "Tất cả dữ liệu";
}

function addPageHeader(
  doc: PDFKit.PDFDocument,
  generatedAt: Date,
  recordCount: number,
  filters: PurchasePdfFilters,
) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(17)
    .text(BUSINESS_NAME, PAGE_MARGIN, 28, {
      width: 360,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(10.5)
    .text("DANH SÁCH NHẬP HÀNG", PAGE_MARGIN, 54, {
      width: 360,
      lineBreak: false,
    });

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(8.5)
    .text(`Ngày xuất: ${formatDate(generatedAt)}`, 550, 31, {
      width: doc.page.width - PAGE_MARGIN - 550,
      align: "right",
      lineBreak: false,
    })
    .text(`${formatNumber(recordCount)} lần nhập`, 550, 48, {
      width: doc.page.width - PAGE_MARGIN - 550,
      align: "right",
      lineBreak: false,
    });

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(8)
    .text(`Bộ lọc: ${filterDescription(filters)}`, PAGE_MARGIN, 79, {
      width: doc.page.width - PAGE_MARGIN * 2,
      height: 25,
      ellipsis: true,
    })
    .moveTo(PAGE_MARGIN, 108)
    .lineTo(doc.page.width - PAGE_MARGIN, 108)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1.5)
    .stroke();
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const height = 28;
  const tableWidth = tableColumns.reduce((sum, column) => sum + column.width, 0);
  doc.rect(PAGE_MARGIN, y, tableWidth, height).fill(BRAND_COLOR);

  let x = PAGE_MARGIN;
  for (const column of tableColumns) {
    doc
      .fillColor("#ffffff")
      .fontSize(7.5)
      .text(column.label, x + 3, y + 9, {
        width: column.width - 6,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + height;
}

function rowValues(record: PurchasePdfRecord, index: number) {
  return {
    index: String(index + 1),
    date: formatDate(record.purchaseDate),
    item: `${record.itemName || "-"}\n${record.itemCode || "-"}`,
    category: record.category || "-",
    packages: formatNumber(Number(record.packageCount ?? 0)),
    packageSpec: `${formatNumber(Number(record.packageQuantity ?? 0))} ${record.costUnit || ""}`.trim(),
    quantity: `${formatNumber(Number(record.convertedQuantity ?? 0))} ${record.costUnit || ""}`.trim(),
    price: currency(Number(record.actualPackagePrice ?? 0)),
    amount: currency(Number(record.totalAmount ?? 0)),
    funding: purchaseFundingSourceLabel(record.fundingSource),
    supplier: record.supplier?.trim() || "-",
  };
}

function rowHeight(
  doc: PDFKit.PDFDocument,
  values: ReturnType<typeof rowValues>,
) {
  doc.fontSize(7.5);
  return Math.max(
    30,
    ...tableColumns.map(
      column =>
        doc.heightOfString(values[column.key], {
          width: column.width - 6,
          align: column.align,
        }) + 10,
    ),
  );
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: ReturnType<typeof rowValues>,
  index: number,
  y: number,
) {
  const height = rowHeight(doc, values);
  const tableWidth = tableColumns.reduce((sum, column) => sum + column.width, 0);
  if (index % 2 === 1) {
    doc.rect(PAGE_MARGIN, y, tableWidth, height).fill(LIGHT_COLOR);
  }

  let x = PAGE_MARGIN;
  for (const column of tableColumns) {
    doc
      .fillColor(INK_COLOR)
      .fontSize(7.5)
      .text(values[column.key], x + 3, y + 5, {
        width: column.width - 6,
        height: height - 10,
        align: column.align,
        ellipsis: true,
      });
    x += column.width;
  }
  doc
    .moveTo(PAGE_MARGIN, y + height)
    .lineTo(PAGE_MARGIN + tableWidth, y + height)
    .strokeColor(LINE_COLOR)
    .lineWidth(0.5)
    .stroke();
  return y + height;
}

function addSummary(
  doc: PDFKit.PDFDocument,
  records: PurchasePdfRecord[],
  y: number,
) {
  let totalAmount = 0;
  let totalPackages = 0;
  for (const record of records) {
    totalAmount += Number(record.totalAmount ?? 0);
    totalPackages += Number(record.packageCount ?? 0);
  }
  const averageAmount = records.length > 0 ? totalAmount / records.length : 0;
  const boxWidth = 286;
  const boxX = doc.page.width - PAGE_MARGIN - boxWidth;
  const rows = [
    ["Tổng số lần nhập", formatNumber(records.length)],
    ["Tổng số gói", formatNumber(totalPackages)],
    ["Bình quân/lần", currency(averageAmount)],
  ];

  doc.roundedRect(boxX, y, boxWidth, 100, 5).fill(LIGHT_COLOR);
  let rowY = y + 11;
  for (const [label, value] of rows) {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(8.5)
      .text(label, boxX + 12, rowY, { width: 112 })
      .fillColor(INK_COLOR)
      .text(value, boxX + 124, rowY, {
        width: boxWidth - 136,
        align: "right",
      });
    rowY += 20;
  }
  doc
    .moveTo(boxX + 12, rowY)
    .lineTo(boxX + boxWidth - 12, rowY)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1)
    .stroke()
    .fillColor(BRAND_COLOR)
    .fontSize(10.5)
    .text("TỔNG TIỀN", boxX + 12, rowY + 9, { width: 112 })
    .text(currency(totalAmount), boxX + 124, rowY + 9, {
      width: boxWidth - 136,
      align: "right",
    });
}

export async function createPurchasePdf(
  records: PurchasePdfRecord[],
  options: { filters?: PurchasePdfFilters; generatedAt?: Date } = {},
) {
  if (records.length === 0) {
    throw new Error("Không có lần nhập hàng để xuất PDF");
  }

  const filters = options.filters ?? {};
  const generatedAt = options.generatedAt ?? new Date();
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      font: pdfFontPath(),
      margins: {
        top: PAGE_MARGIN,
        right: PAGE_MARGIN,
        bottom: 0,
        left: PAGE_MARGIN,
      },
      bufferPages: true,
      info: {
        Title: "Danh sách nhập hàng - Sữa Tuyết Vân Nam",
        Author: "Sữa Tuyết Vân Nam",
        Subject: "Danh sách nhập hàng theo bộ lọc và tổng hợp chi phí",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Geist", pdfFontPath()).font("Geist");
    addPageHeader(doc, generatedAt, records.length, filters);
    let y = drawTableHeader(doc, TABLE_TOP);

    records.forEach((record, index) => {
      const values = rowValues(record, index);
      const expectedHeight = rowHeight(doc, values);
      if (y + expectedHeight > doc.page.height - FOOTER_HEIGHT - 34) {
        doc.addPage();
        addPageHeader(doc, generatedAt, records.length, filters);
        y = drawTableHeader(doc, TABLE_TOP);
      }
      y = drawTableRow(doc, values, index, y);
    });

    if (y + 118 > doc.page.height - FOOTER_HEIGHT) {
      doc.addPage();
      addPageHeader(doc, generatedAt, records.length, filters);
      y = TABLE_TOP;
    } else {
      y += 16;
    }
    addSummary(doc, records, y);

    const pageRange = doc.bufferedPageRange();
    for (
      let pageIndex = pageRange.start;
      pageIndex < pageRange.start + pageRange.count;
      pageIndex += 1
    ) {
      doc.switchToPage(pageIndex);
      doc
        .fillColor(MUTED_COLOR)
        .fontSize(8)
        .text(
          `Trang ${pageIndex + 1}/${pageRange.count}`,
          PAGE_MARGIN,
          doc.page.height - 21,
          {
            width: doc.page.width - PAGE_MARGIN * 2,
            align: "center",
            lineBreak: false,
          },
        );
    }
    doc.end();
  });
}
