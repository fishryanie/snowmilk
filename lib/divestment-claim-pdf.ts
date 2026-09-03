import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  DEFAULT_BUSINESS_PROFILE,
  type BusinessProfile,
} from "@/lib/business-profile";
import { formatDate, formatNumber } from "@/lib/formatters";
import type { DivestmentClaimSourceType } from "@/lib/divestment-claims";

export type DivestmentClaimPdfRecord = {
  sourceType: DivestmentClaimSourceType;
  code: string;
  name: string;
  category: string;
  purchaseDate: string | Date;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
};

type TableColumn = {
  key: "index" | "date" | "item" | "quantity" | "unitPrice" | "amount";
  label: string;
  width: number;
  align: "left" | "right" | "center";
};

const BRAND_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.terracotta;
const INK_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.ink;
const MUTED_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.green;
const LIGHT_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.cream;
const LINE_COLOR = "#d9e4e1";
const PAGE_MARGIN = 42;
const TABLE_TOP = 132;
const PAGE_BOTTOM_RESERVE = 120;

const tableColumns: TableColumn[] = [
  { key: "index", label: "STT", width: 27, align: "center" },
  { key: "date", label: "Ngày", width: 60, align: "left" },
  { key: "item", label: "Món / khoản claim", width: 165, align: "left" },
  { key: "quantity", label: "Số lượng", width: 55, align: "right" },
  { key: "unitPrice", label: "Đơn giá", width: 95, align: "right" },
  { key: "amount", label: "Thành tiền", width: 109, align: "right" },
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

function sourceTypeLabel(sourceType: DivestmentClaimSourceType) {
  return sourceType === "equipment" ? "Tài sản" : "Nhập hàng";
}

function addPageHeader(
  doc: PDFKit.PDFDocument,
  generatedAt: Date,
  claimDate: string | Date,
  recordCount: number,
  businessName: string,
) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(17)
    .text(businessName, PAGE_MARGIN, 34, {
      width: 300,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(11)
    .text("BÁO CÁO CÁC KHOẢN CLAIM ĐÃ CHỌN", PAGE_MARGIN, 61, {
      width: 360,
      lineBreak: false,
    });

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .text(`Ngày lập: ${formatDate(generatedAt)}`, 350, 38, {
      width: doc.page.width - PAGE_MARGIN - 350,
      align: "right",
      lineBreak: false,
    })
    .text(`Ngày claim: ${formatDate(claimDate)}`, 350, 55, {
      width: doc.page.width - PAGE_MARGIN - 350,
      align: "right",
      lineBreak: false,
    })
    .text(`${formatNumber(recordCount)} mục đã chọn`, 350, 72, {
      width: doc.page.width - PAGE_MARGIN - 350,
      align: "right",
      lineBreak: false,
    });

  doc
    .moveTo(PAGE_MARGIN, 106)
    .lineTo(doc.page.width - PAGE_MARGIN, 106)
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
      .fontSize(8)
      .text(column.label, x + 4, y + 9, {
        width: column.width - 8,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + height;
}

function rowValues(record: DivestmentClaimPdfRecord, index: number) {
  const itemDetails = [
    record.code,
    record.category,
    sourceTypeLabel(record.sourceType),
  ].filter(Boolean);
  return {
    index: String(index + 1),
    date: formatDate(record.purchaseDate),
    item: `${record.name || "-"}${itemDetails.length > 0 ? `\n${itemDetails.join(" - ")}` : ""}`,
    quantity: `${formatNumber(Number(record.quantity ?? 0))} ${record.unit || ""}`.trim(),
    unitPrice: currency(Number(record.unitPrice ?? 0)),
    amount: currency(Number(record.amount ?? 0)),
  };
}

function rowHeight(
  doc: PDFKit.PDFDocument,
  values: ReturnType<typeof rowValues>,
) {
  doc.fontSize(8.2);
  return Math.max(
    32,
    ...tableColumns.map(
      (column) =>
        doc.heightOfString(values[column.key], {
          width: column.width - 8,
          align: column.align,
        }) + 12,
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
      .fontSize(8.2)
      .text(values[column.key], x + 4, y + 6, {
        width: column.width - 8,
        height: height - 12,
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
  records: DivestmentClaimPdfRecord[],
  y: number,
) {
  const total = records.reduce(
    (sum, record) => sum + Number(record.amount ?? 0),
    0,
  );
  const boxWidth = 280;
  const boxX = doc.page.width - PAGE_MARGIN - boxWidth;

  doc.roundedRect(boxX, y, boxWidth, 73, 5).fill(LIGHT_COLOR);
  doc
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .text("Số mục đã chọn", boxX + 12, y + 13, { width: 118 })
    .fillColor(INK_COLOR)
    .text(formatNumber(records.length), boxX + 130, y + 13, {
      width: boxWidth - 142,
      align: "right",
    })
    .moveTo(boxX + 12, y + 37)
    .lineTo(boxX + boxWidth - 12, y + 37)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1)
    .stroke()
    .fillColor(BRAND_COLOR)
    .fontSize(11)
    .text("TỔNG CỘNG", boxX + 12, y + 49, { width: 118 })
    .text(currency(total), boxX + 130, y + 49, {
      width: boxWidth - 142,
      align: "right",
    });
}

export async function createDivestmentClaimPdf(
  records: DivestmentClaimPdfRecord[],
  options: {
    claimDate: string | Date;
    generatedAt?: Date;
    businessProfile?: Pick<BusinessProfile, "displayName" | "wordmark">;
  },
) {
  if (records.length === 0) {
    throw new Error("Vui lòng chọn ít nhất một khoản để xuất PDF");
  }

  const generatedAt = options.generatedAt ?? new Date();
  const businessProfile = options.businessProfile ?? DEFAULT_BUSINESS_PROFILE;
  const businessName = businessProfile.wordmark.toUpperCase();
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      font: pdfFontPath(),
      margins: {
        top: PAGE_MARGIN,
        right: PAGE_MARGIN,
        bottom: 0,
        left: PAGE_MARGIN,
      },
      bufferPages: true,
      info: {
        Title: `Báo cáo claim - ${businessProfile.displayName}`,
        Author: businessProfile.displayName,
        Subject: "Các khoản claim đã chọn và tổng số tiền",
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
      options.claimDate,
      records.length,
      businessName,
    );
    let y = drawTableHeader(doc, TABLE_TOP);

    records.forEach((record, index) => {
      const values = rowValues(record, index);
      const expectedHeight = rowHeight(doc, values);
      if (y + expectedHeight > doc.page.height - PAGE_BOTTOM_RESERVE) {
        doc.addPage();
        addPageHeader(
          doc,
          generatedAt,
          options.claimDate,
          records.length,
          businessName,
        );
        y = drawTableHeader(doc, TABLE_TOP);
      }
      y = drawTableRow(doc, values, index, y);
    });

    if (y + 96 > doc.page.height - PAGE_BOTTOM_RESERVE) {
      doc.addPage();
      addPageHeader(
        doc,
        generatedAt,
        options.claimDate,
        records.length,
        businessName,
      );
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
          doc.page.height - 23,
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
