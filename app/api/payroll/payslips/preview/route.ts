import mongoose from "mongoose";
import { apiError, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { createPayrollPayslipSnapshot } from "@/lib/payroll-payslip";
import { createPayrollPayslipPdf } from "@/lib/payroll-payslip-pdf";
import { vietnamDateKey } from "@/lib/vietnam-date";
import { payrollPayslipPreviewSchema } from "@/lib/validators/payroll";
import { PayrollEmployee } from "@/models/PayrollEmployee";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { PayrollWithdrawal } from "@/models/PayrollWithdrawal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const parsed = payrollPayslipPreviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Thông tin xem trước phiếu lương chưa hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }

    await connectMongo();
    const employeeId = new mongoose.Types.ObjectId(parsed.data.employeeId);
    const [employee, settlement, existing, previousSettlements] =
      await Promise.all([
        PayrollEmployee.findById(employeeId).lean<{
          _id: mongoose.Types.ObjectId;
          name: string;
        }>(),
        PayrollPeriodSettlement.findOne({
          period: parsed.data.period,
        }).lean(),
        PayrollWithdrawal.exists({
          employeeId,
          period: parsed.data.period,
        }),
        PayrollPeriodSettlement.find({
          period: { $lt: parsed.data.period },
        })
          .select("distributablePool")
          .lean<Array<{ distributablePool?: number }>>(),
      ]);

    if (!employee) {
      return apiError("Nhân sự không tồn tại", 404);
    }
    if (!settlement) {
      return apiError(
        "Tháng này chưa kết thúc nên chưa có số tiền để xem trước.",
        422,
      );
    }
    if (existing) {
      return apiError(
        "Khoản lương này đã được chi. Hãy tải phiếu trong lịch sử rút lương.",
        409,
      );
    }

    const withdrawalDay = vietnamDateKey(parsed.data.withdrawalDate);
    const today = vietnamDateKey(new Date());
    if (
      withdrawalDay > today ||
      withdrawalDay.slice(0, 7) <= parsed.data.period
    ) {
      return apiError(
        "Ngày dự kiến chi phải nằm sau tháng đã chốt và không được ở tương lai.",
        422,
      );
    }

    const allocation = settlement.allocations.find(
      (item: { employeeId: unknown }) =>
        String(item.employeeId) === parsed.data.employeeId,
    );
    if (!allocation || allocation.amount < 1) {
      return apiError("Tháng này nhân sự không có khoản được lãnh.", 422);
    }

    const snapshot = createPayrollPayslipSnapshot({
      settlement,
      allocation,
      previouslySettledPools: previousSettlements.reduce(
        (total, item) => total + Number(item.distributablePool ?? 0),
        0,
      ),
    });
    const pdf = await createPayrollPayslipPdf({
      id: `preview-${parsed.data.employeeId}`,
      employeeName: allocation.employeeName || employee.name,
      period: parsed.data.period,
      withdrawalDate: parsed.data.withdrawalDate,
      amount: Math.round(allocation.amount),
      sharePercentSnapshot: Number(allocation.sharePercent),
      note: parsed.data.note,
      snapshot,
      isPreview: true,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="xem-truoc-phieu-luong.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
