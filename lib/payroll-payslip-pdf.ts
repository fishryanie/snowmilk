import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDate, formatNumber } from "@/lib/formatters";
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

const BRAND_COLOR = "#16645a";
const INK_COLOR = "#17343b";
const MUTED_COLOR = "#60767b";
const LINE_COLOR = "#d9e4e1";
const LIGHT_COLOR = "#eef6f4";
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = 511;
const BUSINESS_NAME = "SỮA TUYẾT VÂN NAM";

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
  number: string,
  title: string,
  y: number,
) {
  doc
    .roundedRect(PAGE_MARGIN, y, 22, 22, 6)
    .fill(BRAND_COLOR)
    .fillColor("#ffffff")
    .fontSize(9)
    .text(number, PAGE_MARGIN, y + 6, {
      width: 22,
      align: "center",
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(11)
    .text(title, PAGE_MARGIN + 32, y + 5, {
      width: CONTENT_WIDTH - 32,
      lineBreak: false,
    });
  return y + 31;
}

function calculationRow(
  doc: PDFKit.PDFDocument,
  {
    label,
    value,
    y,
    operator = "",
    total = false,
  }: {
    label: string;
    value: number;
    y: number;
    operator?: string;
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
    .fillColor(total ? BRAND_COLOR : MUTED_COLOR)
    .fontSize(total ? 10 : 9)
    .text(operator, PAGE_MARGIN, y + 1, {
      width: 18,
      align: "center",
      lineBreak: false,
    })
    .fillColor(total ? INK_COLOR : MUTED_COLOR)
    .text(label, PAGE_MARGIN + 24, y + 1, {
      width: 300,
      lineBreak: false,
    })
    .fillColor(total ? BRAND_COLOR : INK_COLOR)
    .fontSize(total ? 11 : 9.5)
    .text(currency(value), PAGE_MARGIN + 326, y, {
      width: CONTENT_WIDTH - 326,
      align: "right",
      lineBreak: false,
    });

  return y + (total ? 22 : 19);
}

function addHeader(doc: PDFKit.PDFDocument, data: PayrollPayslipPdfData) {
  const reference = data.id.slice(-8).toUpperCase();
  const statusLabel = data.isPreview
    ? "BẢN XEM TRƯỚC - CHƯA CHI"
    : `Mã phiếu: PL-${reference}`;
  const dateLabel = data.isPreview ? "Ngày xem" : "Ngày lập";
  doc
    .fillColor(BRAND_COLOR)
    .fontSize(16)
    .text(BUSINESS_NAME, PAGE_MARGIN, 38, {
      width: 300,
      lineBreak: false,
    })
    .fillColor(INK_COLOR)
    .fontSize(9.5)
    .text("PHIẾU LƯƠNG / PAYSLIP", PAGE_MARGIN, 64, {
      width: 300,
      lineBreak: false,
    })
    .fillColor(data.isPreview ? "#b56b17" : MUTED_COLOR)
    .fontSize(8.5)
    .text(statusLabel, 320, 43, {
      width: 233,
      align: "right",
      lineBreak: false,
    })
    .fillColor(MUTED_COLOR)
    .text(`${dateLabel}: ${formatDate(new Date())}`, 340, 60, {
      width: 213,
      align: "right",
      lineBreak: false,
    })
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
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 76, 12)
    .fill(LIGHT_COLOR);

  const columns = [
    ["Nhân sự", data.employeeName],
    ["Vai trò", data.snapshot.employeeRole || "-"],
    ["Tháng lương", periodLabel(data.period)],
    [
      data.isPreview ? "Ngày dự kiến chi" : "Ngày chi",
      formatDate(data.withdrawalDate),
    ],
  ];
  const widths = [148, 148, 105, 110];
  let x = PAGE_MARGIN;
  columns.forEach(([label, value], index) => {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text(label, x + 12, y + 15, {
        width: widths[index] - 20,
        lineBreak: false,
      })
      .fillColor(INK_COLOR)
      .fontSize(9.5)
      .text(value, x + 12, y + 37, {
        width: widths[index] - 20,
        height: 28,
        ellipsis: true,
      });
    x += widths[index];
  });
  return y + 84;
}

function addNetPay(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 62, 12)
    .fill(BRAND_COLOR)
    .fillColor("#d9efea")
    .fontSize(8.5)
    .text(
      data.isPreview ? "SỐ TIỀN DỰ KIẾN NHẬN" : "SỐ TIỀN THỰC NHẬN",
      PAGE_MARGIN + 16,
      y + 14,
      {
        width: 200,
        lineBreak: false,
      },
    )
    .fillColor("#ffffff")
    .fontSize(20)
    .text(currency(data.amount), PAGE_MARGIN + 210, y + 20, {
      width: CONTENT_WIDTH - 226,
      align: "right",
      lineBreak: false,
    });
  return y + 70;
}

function addExplanation(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  const snapshot = data.snapshot;
  y = sectionTitle(doc, "1", "Nguồn hình thành tiền doanh nghiệp", y);
  y = calculationRow(doc, {
    label: "Doanh thu bán hàng lũy kế",
    value: snapshot.cumulativeRevenue,
    operator: "+",
    y,
  });
  y = calculationRow(doc, {
    label: "Các khoản đã chi từ tiền doanh nghiệp",
    value: snapshot.companyFundedOutflow,
    operator: "-",
    y,
  });
  y = calculationRow(doc, {
    label: "Số dư tiền doanh nghiệp",
    value: snapshot.businessCashBalance,
    total: true,
    y,
  });

  y += 5;
  y = sectionTitle(doc, "2", `Cách xác định quỹ có thể chia tháng ${periodLabel(data.period)}`, y);
  y = calculationRow(doc, {
    label: "Số dư tiền doanh nghiệp",
    value: snapshot.businessCashBalance,
    operator: "+",
    y,
  });
  y = calculationRow(doc, {
    label: "Vốn chủ chưa hoàn lại",
    value: snapshot.outstandingOwnerCapital,
    operator: "-",
    y,
  });
  y = calculationRow(doc, {
    label: "Quỹ lương đã chốt các tháng trước",
    value: snapshot.previouslySettledPools,
    operator: "-",
    y,
  });
  y = calculationRow(doc, {
    label: "Vốn xoay vòng doanh nghiệp giữ lại",
    value: snapshot.workingCapitalReserve,
    operator: "-",
    y,
  });
  y = calculationRow(doc, {
    label: "Quỹ có thể chia của tháng",
    value: snapshot.distributablePool,
    total: true,
    y,
  });

  y += 5;
  y = sectionTitle(doc, "3", "Cách tính phần được lãnh", y);
  doc
    .roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 48, 9)
    .fill("#f8fbfa")
    .strokeColor(LINE_COLOR)
    .lineWidth(0.7)
    .stroke()
    .fillColor(MUTED_COLOR)
    .fontSize(9)
    .text(
      `${currency(snapshot.distributablePool)} × ${formatNumber(data.sharePercentSnapshot)}%`,
      PAGE_MARGIN + 14,
      y + 17,
      { width: 290, lineBreak: false },
    )
    .fillColor(BRAND_COLOR)
    .fontSize(12)
    .text(`= ${currency(snapshot.employeeEntitlement)}`, PAGE_MARGIN + 310, y + 15, {
      width: CONTENT_WIDTH - 324,
      align: "right",
      lineBreak: false,
    });
  return y + 62;
}

function addReconciliation(
  doc: PDFKit.PDFDocument,
  data: PayrollPayslipPdfData,
  y: number,
) {
  y = sectionTitle(
    doc,
    "4",
    data.isPreview
      ? "Đối chiếu số dự kiến nhận"
      : "Đối chiếu số thực nhận",
    y,
  );
  y = calculationRow(doc, {
    label: "Phần được lãnh theo tỷ lệ",
    value: data.snapshot.employeeEntitlement,
    operator: "+",
    y,
  });
  y = calculationRow(doc, {
    label: "Khoản cộng thêm",
    value: 0,
    operator: "+",
    y,
  });
  y = calculationRow(doc, {
    label: "Khấu trừ",
    value: 0,
    operator: "-",
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
  doc
    .fillColor(MUTED_COLOR)
    .fontSize(7.8)
    .text(
      "Giải thích nguồn tiền: số dư doanh nghiệp chỉ trừ các khoản được ghi nhận chi từ nguồn doanh thu bán hàng và các khoản hoàn vốn chủ; vốn chủ chưa hoàn, quỹ tháng trước và vốn xoay vòng không được chia lại.",
      PAGE_MARGIN,
      y,
      { width: CONTENT_WIDTH, lineGap: 2 },
    );
  y += 29;

  if (note) {
    doc
      .fillColor(MUTED_COLOR)
      .fontSize(8)
      .text("Ghi chú:", PAGE_MARGIN, y, { width: 48, lineBreak: false })
      .fillColor(INK_COLOR)
      .text(note, PAGE_MARGIN + 50, y, {
        width: CONTENT_WIDTH - 50,
        height: 28,
        ellipsis: true,
      });
    y += 27;
  } else {
    y += 8;
  }

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
      });
  });
}

export async function createPayrollPayslipPdf(data: PayrollPayslipPdfData) {
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
        Author: BUSINESS_NAME,
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
    y = addNetPay(doc, data, y);
    y = addExplanation(doc, data, y);
    y = addReconciliation(doc, data, y);
    addNotesAndSignatures(doc, data, y + 7);

    doc
      .fillColor(MUTED_COLOR)
      .fontSize(7.5)
      .text(
        data.isPreview
          ? "Bản xem trước từ số liệu đã chốt - Chưa ghi nhận chi lương"
          : `Phiếu được tạo từ số liệu đã chốt tại thời điểm chi lương · PL-${data.id.slice(-8).toUpperCase()}`,
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
