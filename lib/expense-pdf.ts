import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/lib/formatters";
import { milkSterilizationDescription } from "@/lib/expense-categories";

export type ExpensePdfRecord = {
  id: string;
  expenseDate: string | Date;
  category: string;
  description: string;
  milkLiters?: number;
  milkUnitPrice?: number;
  amount: number;
};

const BRAND_COLOR = "#16645a";
const INK_COLOR = "#17343b";
const MUTED_COLOR = "#60767b";
const LINE_COLOR = "#d9e4e1";
const LIGHT_COLOR = "#eef6f4";
const PAGE_MARGIN = 42;
const BUSINESS_NAME = "SỮA TUYẾT VÂN NAM";

function currency(value: number) {
  return `${formatNumber(value)} đ`;
}

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

function addPageHeader(doc: PDFKit.PDFDocument, generatedAt: Date) {
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(17)
    .text(BUSINESS_NAME, PAGE_MARGIN, 40, {
      width: 280,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(10.5)
    .text("HÓA ĐƠN CHI PHÍ", PAGE_MARGIN, 66, {
      width: 280,
      lineBreak: false,
    });

  doc
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .text(`Ngày lập: ${formatDate(generatedAt)}`, 330, 53, {
      width: 223,
      align: "right",
    });

  doc
    .moveTo(PAGE_MARGIN, 98)
    .lineTo(doc.page.width - PAGE_MARGIN, 98)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1.5)
    .stroke();
}

const tableColumns = [
  { key: "index", label: "STT", width: 28, align: "center" as const },
  { key: "date", label: "Ngày", width: 62, align: "left" as const },
  { key: "category", label: "Nhóm", width: 90, align: "left" as const },
  { key: "description", label: "Nội dung", width: 230, align: "left" as const },
  { key: "amount", label: "Số tiền", width: 101, align: "right" as const },
];

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const height = 28;
  doc
    .rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, height)
    .fill(BRAND_COLOR);
  let x = PAGE_MARGIN;
  for (const column of tableColumns) {
    doc
      .fillColor("#ffffff")
      .fontSize(8.5)
      .text(column.label, x + 4, y + 9, {
        width: column.width - 8,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  }
  return y + height;
}

function rowValues(record: ExpensePdfRecord, index: number) {
  const generatedDescription = milkSterilizationDescription(
    Number(record.milkLiters ?? 0),
    Number(record.milkUnitPrice ?? 0),
  );
  const milkDetail =
    generatedDescription && record.description.trim() !== generatedDescription
      ? `\n${generatedDescription}`
      : "";
  return {
    index: String(index + 1),
    date: formatDate(record.expenseDate),
    description: `${record.description || "-"}${milkDetail}`.replaceAll(
      "₫",
      "đ",
    ),
    category: record.category || "-",
    amount: currency(Number(record.amount ?? 0)),
  };
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  record: ExpensePdfRecord,
  index: number,
  y: number,
) {
  const values = rowValues(record, index);
  doc.fontSize(8.2);
  const contentHeight = Math.max(
    ...tableColumns.map((column) =>
      doc.heightOfString(values[column.key as keyof typeof values], {
        width: column.width - 8,
        align: column.align,
      }),
    ),
  );
  const height = Math.max(29, contentHeight + 10);

  if (index % 2 === 1) {
    doc
      .rect(PAGE_MARGIN, y, doc.page.width - PAGE_MARGIN * 2, height)
      .fill(LIGHT_COLOR);
  }
  let x = PAGE_MARGIN;
  for (const column of tableColumns) {
    doc
      .fillColor(INK_COLOR)
      .text(values[column.key as keyof typeof values], x + 4, y + 6, {
        width: column.width - 8,
        align: column.align,
      });
    x += column.width;
  }
  doc
    .moveTo(PAGE_MARGIN, y + height)
    .lineTo(doc.page.width - PAGE_MARGIN, y + height)
    .strokeColor(LINE_COLOR)
    .lineWidth(0.5)
    .stroke();
  return y + height;
}

function addSummary(
  doc: PDFKit.PDFDocument,
  records: ExpensePdfRecord[],
  y: number,
) {
  const total = records.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
  const boxX = 310;
  const boxWidth = doc.page.width - PAGE_MARGIN - boxX;
  const rows = [["Số khoản chi", formatNumber(records.length)]];
  for (const [label, value] of rows) {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(9)
      .text(label, boxX, y, { width: 105 })
      .fillColor(INK_COLOR)
      .text(value, boxX + 105, y, { width: boxWidth - 105, align: "right" });
    y += 21;
  }
  doc
    .moveTo(boxX, y)
    .lineTo(boxX + boxWidth, y)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1)
    .stroke();
  y += 9;
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(11)
    .text("TỔNG CỘNG", boxX, y, { width: 105 })
    .text(currency(total), boxX + 105, y, {
      width: boxWidth - 105,
      align: "right",
    });
  return y + 28;
}

function addSignatures(doc: PDFKit.PDFDocument, y: number) {
  const width = (doc.page.width - PAGE_MARGIN * 2) / 3;
  const labels = ["Người lập phiếu", "Người duyệt", "Người nhận tiền"];
  labels.forEach((label, index) => {
    doc
      .fillColor(INK_COLOR)
      .fontSize(9)
      .text(label, PAGE_MARGIN + width * index, y, { width, align: "center" })
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text("(Ký và ghi rõ họ tên)", PAGE_MARGIN + width * index, y + 16, {
        width,
        align: "center",
      });
  });
}

export async function createExpensePdf(
  records: ExpensePdfRecord[],
  generatedAt = new Date(),
) {
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
        Title: "Hóa đơn chi phí - Sữa Tuyết Vân Nam",
        Author: "Sữa Tuyết Vân Nam",
        Subject: "Tổng hợp các khoản chi phí đã chọn",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Geist", pdfFontPath()).font("Geist");
    addPageHeader(doc, generatedAt);
    let y = drawTableHeader(doc, 116);

    records.forEach((record, index) => {
      const values = rowValues(record, index);
      doc.fontSize(8.2);
      const expectedHeight = Math.max(
        29,
        ...tableColumns.map(
          (column) =>
            doc.heightOfString(values[column.key as keyof typeof values], {
              width: column.width - 8,
              align: column.align,
            }) + 10,
        ),
      );
      if (y + expectedHeight > doc.page.height - 74) {
        doc.addPage();
        addPageHeader(doc, generatedAt);
        y = drawTableHeader(doc, 116);
      }
      y = drawTableRow(doc, record, index, y);
    });

    if (y + 120 > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      addPageHeader(doc, generatedAt);
      y = 122;
    } else {
      y += 16;
    }
    y = addSummary(doc, records, y);
    addSignatures(doc, y + 20);

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc
        .fillColor(MUTED_COLOR)
        .fontSize(8)
        .text(
          `Trang ${pageIndex + 1}/${pageRange.count}`,
          PAGE_MARGIN,
          doc.page.height - 28,
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
