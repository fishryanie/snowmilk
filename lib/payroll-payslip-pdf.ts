import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/lib/formatters";
import { DEFAULT_BUSINESS_PROFILE } from "@/lib/business-profile";
import type { PayrollPayslipSnapshot } from "@/lib/payroll-payslip";

export type PayrollPayslipPdfData = {
  id: string;
  employeeName: string;
  period: string;
  withdrawalDate: string | Date;
  amount: number;
  sharePercentSnapshot: number;
  note?: string;
  snapshot: PayrollPayslipSnapshot;
  isPreview?: boolean;
};

const BRAND_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.terracotta;
const INK_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.ink;
const MUTED_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.green;
const LINE_COLOR = "#d9e4e1";
const LIGHT_COLOR = DEFAULT_BUSINESS_PROFILE.brandColors.cream;
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = 511;

function currency(value: number) {
  return `${formatNumber(value)} đ`;
}

function periodLabel(period: string) {
  const [year, month] = period.split("-");
  return `${month}/${year}`;
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
    throw new Error("Không tìm thấy font tiếng Việt để tạo phiếu lương");
  }
  return fontPath;
}

function sectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
) {
  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 30, 8)
    .fill("#f4f8f8")
    .fillColor(BRAND_COLOR)
    .fontSize(9)
    .text(title, PAGE_MARGIN + 12, y + 10, {
      width: CONTENT_WIDTH - 24,
      lineBreak: false,
    });
  return y + 39;
}

function calculationRow(
  doc: PDFKit.PDFDocument,
  {
    label,
    value,
    y,
    total = false,
  }: {
    label: string;
    value: number;
    y: number;
    total?: boolean;
  },
) {
  if (total) {
    doc
      .moveTo(PAGE_MARGIN, y)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
      .strokeColor(BRAND_COLOR)
      .lineWidth(0.9)
      .stroke();
    y += 8;
  }

  doc
    .fillColor(total ? INK_COLOR : MUTED_COLOR)
    .fontSize(total ? 10 : 9)
    .text(label, PAGE_MARGIN + 12, y + 1, {
      width: 300,
      lineBreak: false,
    })
    .fillColor(total ? BRAND_COLOR : INK_COLOR)
    .fontSize(total ? 11 : 9.5)
    .text(currency(value), PAGE_MARGIN + 324, y, {
      width: CONTENT_WIDTH - 336,
      align: "right",
      lineBreak: false,
    });

  return y + (total ? 22 : 19);
}

function salaryFormulaRow(
  doc: PDFKit.PDFDocument,
  {
    distributablePool,
    sharePercent,
    entitlement,
    y,
  }: {
    distributablePool: number;
    sharePercent: number;
    entitlement: number;
    y: number;
  },
) {
  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 48, 8)
    .fill("#f8fbfa")
    .fillColor(MUTED_COLOR)
    .fontSize(8)
    .text("Công thức tính lương", PAGE_MARGIN + 12, y + 8, {
      width: 180,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(10)
    .text(
      `${currency(distributablePool)} × ${formatNumber(sharePercent)}%`,
      PAGE_MARGIN + 12,
      y + 26,
      { width: 280, lineBreak: false },
    )
    .fillColor(BRAND_COLOR)
    .fontSize(11)
    .text(`= ${currency(entitlement)}`, PAGE_MARGIN + 300, y + 25, {
      width: CONTENT_WIDTH - 312,
      align: "right",
      lineBreak: false,
    });
  return y + 58;
}

function addHeader(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
) {
  const reference = data.id.slice(-8).toUpperCase();
  const statusLabel = data.isPreview
    ? "BẢN XEM TRƯỚC - CHƯA CHI"
    : `Mã phiếu: PL-${reference}`;
  const dateLabel = data.isPreview ? "Ngày xem" : "Ngày lập";
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(18)
    .text("PHIẾU LƯƠNG", PAGE_MARGIN, 38, {
      width: 300,
      lineBreak: false,
    });
  doc
    .fillColor(MUTED_COLOR)
    .fontSize(8.5)
    .text(`Kỳ lương: ${periodLabel(data.period)}`, PAGE_MARGIN, 65, {
      width: 300,
      lineBreak: false,
    });
  doc
    .fillColor(data.isPreview ? "#b56b17" : MUTED_COLOR)
    .fontSize(8.5)
    .text(statusLabel, 320, 43, {
      width: 233,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(MUTED_COLOR)
    .text(`${dateLabel}: ${formatDate(new Date())}`, 340, 60, {
      width: 213,
      align: "right",
      lineBreak: false,
    });
  doc
    .moveTo(PAGE_MARGIN, 92)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, 92)
    .strokeColor(BRAND_COLOR)
    .lineWidth(1.5)
    .stroke();
}

function addEmployeeSummary(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 72, 10)
    .fill(LIGHT_COLOR);

  const columns = [
    ["Nhân sự", data.employeeName],
    ["Vai trò", data.snapshot.employeeRole || "-"],
    [
      data.isPreview ? "Ngày dự kiến chi" : "Ngày chi",
      formatDate(data.withdrawalDate),
    ],
    ["Tỷ lệ được nhận", `${formatNumber(data.sharePercentSnapshot)}%`],
  ];
  const widths = [160, 115, 130, 106];
  let x = PAGE_MARGIN;
  columns.forEach(([label, value], index) => {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text(label, x + 12, y + 14, {
        width: widths[index] - 20,
        lineBreak: false,
      })
      .fillColor(INK_COLOR)
      .fontSize(9.5)
      .text(value, x + 12, y + 35, {
        width: widths[index] - 20,
        height: 28,
        ellipsis: true,
      });
    x += widths[index];
  });
  return y + 80;
}

function addExplanation(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  const snapshot = data.snapshot;
  y = sectionTitle(doc, "CƠ SỞ TÍNH LƯƠNG", y);
  y = calculationRow(doc, {
    label: "Số dư tiền tiệm",
    value: snapshot.businessCashBalance,
    y,
  });
  y = calculationRow(doc, {
    label: "Trừ tiền cá nhân chưa hoàn",
    value: snapshot.outstandingOwnerCapital,
    y,
  });
  y = calculationRow(doc, {
    label: "Trừ quỹ lương đã chốt kỳ trước",
    value: snapshot.previouslySettledPools,
    y,
  });
  y = calculationRow(doc, {
    label: "Trừ các quỹ tiệm giữ lại",
    value: snapshot.reserveFundsTotal ?? snapshot.workingCapitalReserve,
    y,
  });
  y = calculationRow(doc, {
    label: "Quỹ lương có thể chia",
    value: snapshot.distributablePool,
    total: true,
    y,
  });
  return y + 12;
}

function addReconciliation(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  const additionalAmount = Math.max(
    0,
    data.amount - data.snapshot.employeeEntitlement,
  );
  const deductionAmount = Math.max(
    0,
    data.snapshot.employeeEntitlement - data.amount,
  );
  y = sectionTitle(doc, "CHI TIẾT THANH TOÁN", y);
  y = salaryFormulaRow(doc, {
    distributablePool: data.snapshot.distributablePool,
    sharePercent: data.sharePercentSnapshot,
    entitlement: data.snapshot.employeeEntitlement,
    y,
  });
  y = calculationRow(doc, {
    label: "Khoản cộng thêm",
    value: additionalAmount,
    y,
  });
  y = calculationRow(doc, {
    label: "Khấu trừ",
    value: deductionAmount,
    y,
  });
  y = calculationRow(doc, {
    label: data.isPreview ? "Dự kiến nhận" : "Thực nhận",
    value: data.amount,
    total: true,
    y,
  });
  return y;
}

function addNotesAndSignatures(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  const note = data.note?.trim();
  if (note) {
    doc
      .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 38, 8)
      .fill("#f8fbfa")
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text("Ghi chú", PAGE_MARGIN + 12, y + 9, {
        width: 48,
        lineBreak: false,
      })
      .fillColor(INK_COLOR)
      .text(note, PAGE_MARGIN + 68, y + 9, {
        width: CONTENT_WIDTH - 80,
        height: 22,
        ellipsis: true,
      });
    y += 50;
  }

  y += 20;
  const signatureWidth = CONTENT_WIDTH / 2;
  ["Người lập phiếu", "Người nhận tiền"].forEach((label, index) => {
    const x = PAGE_MARGIN + signatureWidth * index;
    doc
      .fillColor(INK_COLOR)
      .fontSize(8.5)
      .text(label, x, y, { width: signatureWidth, align: "center" })
      .fillColor(MUTED_COLOR)
      .fontSize(7.5)
      .text("(Ký và ghi rõ họ tên)", x, y + 15, {
        width: signatureWidth,
        align: "center",
      })
      .moveTo(x + 45, y + 66)
      .lineTo(x + signatureWidth - 45, y + 66)
      .strokeColor(LINE_COLOR)
      .lineWidth(0.7)
      .stroke();
  });
}

export async function createPayrollPayslipPdf(
  data: PayrollPayslipPdfData,
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
      info: {
        Title: `${data.isPreview ? "Bản xem trước phiếu lương" : "Phiếu lương"} ${periodLabel(data.period)} - ${data.employeeName}`,
        Author: "Phiếu lương",
        Subject: "Diễn giải nguồn tiền và cách tính lương",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Geist", pdfFontPath()).font("Geist");
    addHeader(doc, data);
    let y = addEmployeeSummary(doc, data, 108);
    y = addExplanation(doc, data, y);
    y = addReconciliation(doc, data, y);
    addNotesAndSignatures(doc, data, y + 7);

    doc
      .fillColor(MUTED_COLOR)
      .fontSize(7.5)
      .text(
        data.isPreview
          ? "Bản xem trước - Chưa ghi nhận chi lương"
          : "Phiếu được tạo từ dữ liệu lương đã chốt",
        PAGE_MARGIN,
        doc.page.height - 18,
        {
          width: CONTENT_WIDTH,
          align: "center",
          lineBreak: false,
        },
      );
    doc.end();
  });
}
