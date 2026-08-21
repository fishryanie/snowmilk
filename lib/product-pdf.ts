import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { calculateSterilizationCost } from "@/lib/calculations/product-onboarding";
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "@/lib/business-profile";
import { formatDate, formatNumber } from "@/lib/formatters";

export type ProductPdfRecord = {
  code: string;
  name: string;
  groupName?: string;
  productMode?: "legacy" | "recipe" | "composed";
  recipeCode?: string;
  recipeName?: string;
  milkMl?: number;
  sellingPrice: number;
  fullCost?: number;
};

type ProductPdfOptions = {
  includeSterilizationCost?: boolean;
  generatedAt?: Date;
  businessProfile?: Pick<BusinessProfile, "displayName" | "wordmark">;
};

type TableColumn = {
  key:
    | "index"
    | "code"
    | "name"
    | "recipe"
    | "volume"
    | "sellingPrice"
    | "sterilizationCost"
    | "fullCost"
    | "profit";
  label: string;
  width: number;
  align: "left" | "right" | "center";
};

const BRAND_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.terracotta;
const INK_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.ink;
const MUTED_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.green;
const LINE_COLOR = "#d9e4e1";
const LIGHT_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.cream;
const PAGE_MARGIN = 36;
const TABLE_TOP = 112;
const FOOTER_HEIGHT = 28;

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

function tableColumns(includeSterilizationCost: boolean): TableColumn[] {
  if (includeSterilizationCost) {
    return [
      { key: "index", label: "STT", width: 28, align: "center" },
      { key: "code", label: "Mã SP", width: 60, align: "left" },
      { key: "name", label: "Sản phẩm", width: 155, align: "left" },
      { key: "recipe", label: "Công thức", width: 135, align: "left" },
      { key: "volume", label: "Dung tích", width: 60, align: "right" },
      { key: "sellingPrice", label: "Giá bán", width: 80, align: "right" },
      {
        key: "sterilizationCost",
        label: "Tiệt trùng",
        width: 72,
        align: "right",
      },
      { key: "fullCost", label: "Full cost", width: 85, align: "right" },
      { key: "profit", label: "Lãi gộp/SP", width: 95, align: "right" },
    ];
  }

  const baseColumns: TableColumn[] = [
    { key: "index", label: "STT", width: 28, align: "center" },
    { key: "code", label: "Mã SP", width: 62, align: "left" },
    { key: "name", label: "Sản phẩm", width: 170, align: "left" },
    { key: "recipe", label: "Công thức", width: 155, align: "left" },
    { key: "volume", label: "Dung tích", width: 64, align: "right" },
    { key: "sellingPrice", label: "Giá bán", width: 88, align: "right" },
  ];
  baseColumns.push(
    { key: "fullCost", label: "Full cost", width: 88, align: "right" },
    { key: "profit", label: "Lãi gộp/SP", width: 88, align: "right" },
  );
  return baseColumns;
}

function addPageHeader(
  doc: PDFKit.PDFDocument,
  generatedAt: Date,
  productCount: number,
  includeSterilizationCost: boolean,
  businessName: string,
) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(17)
    .text(businessName, PAGE_MARGIN, 30, {
      width: 340,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(10.5)
    .text("DANH SÁCH SẢN PHẨM", PAGE_MARGIN, 56, {
      width: 340,
      lineBreak: false,
    });

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(8.5)
    .text(`Ngày xuất: ${formatDate(generatedAt)}`, 520, 33, {
      width: doc.page.width - PAGE_MARGIN - 520,
      align: "right",
      lineBreak: false,
    })
    .text(`${formatNumber(productCount)} sản phẩm`, 520, 50, {
      width: doc.page.width - PAGE_MARGIN - 520,
      align: "right",
      lineBreak: false,
    });

  if (includeSterilizationCost) {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text(
        "Full cost và lãi gộp đã bao gồm phí tiệt trùng.",
        PAGE_MARGIN,
        79,
        { width: 420, lineBreak: false },
      );
  }

  doc
    .moveTo(PAGE_MARGIN, 96)
    .lineTo(doc.page.width - PAGE_MARGIN, 96)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1.5)
    .stroke();
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  y: number,
) {
  const height = 27;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  doc.rect(PAGE_MARGIN, y, tableWidth, height).fill(BRAND_COLOR);

  let x = PAGE_MARGIN;
  for (const column of columns) {
    doc
      .fillColor("#ffffff")
      .fontSize(8)
      .text(column.label, x + 4, y + 8.5, {
        width: column.width - 8,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + height;
}

function rowValues(
  record: ProductPdfRecord,
  index: number,
  includeSterilizationCost: boolean,
) {
  const sterilizationCost = includeSterilizationCost
    ? calculateSterilizationCost(Number(record.milkMl ?? 0))
    : 0;
  const fullCost = Number(record.fullCost ?? 0) + sterilizationCost;
  return {
    index: String(index + 1),
    code: record.code || "-",
    name: `${record.name || "-"}\n${record.groupName || (record.productMode === "recipe" ? "Luồng mới" : "Dữ liệu cũ")}`,
    recipe: record.recipeName || record.recipeCode || "Mẻ sữa mới nhất",
    volume: `${formatNumber(Number(record.milkMl ?? 0))} ml`,
    sellingPrice: currency(Number(record.sellingPrice ?? 0)),
    sterilizationCost: currency(sterilizationCost),
    fullCost: currency(fullCost),
    profit: currency(Number(record.sellingPrice ?? 0) - fullCost),
  };
}

function rowHeight(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  values: ReturnType<typeof rowValues>,
) {
  doc.fontSize(8.2);
  return Math.max(
    30,
    ...columns.map(
      (column) =>
        doc.heightOfString(values[column.key], {
          width: column.width - 8,
          align: column.align,
        }) + 10,
    ),
  );
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  values: ReturnType<typeof rowValues>,
  index: number,
  y: number,
) {
  const height = rowHeight(doc, columns, values);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  if (index % 2 === 1) {
    doc.rect(PAGE_MARGIN, y, tableWidth, height).fill(LIGHT_COLOR);
  }

  let x = PAGE_MARGIN;
  for (const column of columns) {
    doc
      .fillColor(INK_COLOR)
      .fontSize(8.2)
      .text(values[column.key], x + 4, y + 5, {
        width: column.width - 8,
        align: column.align,
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

export async function createProductPdf(
  records: ProductPdfRecord[],
  options: ProductPdfOptions = {},
) {
  if (records.length === 0) {
    throw new Error("Không có sản phẩm để xuất PDF");
  }

  const generatedAt = options.generatedAt ?? new Date();
  const businessProfile = options.businessProfile ?? DEFAULT_BUSINESS_PROFILE;
  const businessName = businessProfile.wordmark.toUpperCase();
  const includeSterilizationCost = Boolean(options.includeSterilizationCost);
  const columns = tableColumns(includeSterilizationCost);

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
        Title: `Danh sách sản phẩm - ${businessProfile.displayName}`,
        Author: businessProfile.displayName,
        Subject: "Danh sách sản phẩm và giá vốn",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Geist", pdfFontPath()).font("Geist");
    addPageHeader(
      doc,
      generatedAt,
      records.length,
      includeSterilizationCost,
      businessName,
    );
    let y = drawTableHeader(doc, columns, TABLE_TOP);

    records.forEach((record, index) => {
      const values = rowValues(record, index, includeSterilizationCost);
      const expectedHeight = rowHeight(doc, columns, values);
      if (y + expectedHeight > doc.page.height - FOOTER_HEIGHT - 12) {
        doc.addPage();
        addPageHeader(
          doc,
          generatedAt,
          records.length,
          includeSterilizationCost,
          businessName,
        );
        y = drawTableHeader(doc, columns, TABLE_TOP);
      }
      y = drawTableRow(doc, columns, values, index, y);
    });

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
