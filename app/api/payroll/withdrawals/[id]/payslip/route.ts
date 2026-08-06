import mongoose from "mongoose";
import { apiError, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import {
  createPayrollPayslipSnapshot,
  type PayrollPayslipSnapshot,
} from "@/lib/payroll-payslip";
import { createPayrollPayslipPdf } from "@/lib/payroll-payslip-pdf";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { PayrollWithdrawal } from "@/models/PayrollWithdrawal";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

type WithdrawalRecord = {
  _id: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  period: string;
  withdrawalDate: Date;
  amount: number;
  entitlementSnapshot: number;
  sharePercentSnapshot: number;
  note?: string;
  payslipSnapshot?: PayrollPayslipSnapshot;
};

type SettlementRecord = {
  periodRevenue: number;
  periodPurchaseTotal: number;
  periodExpenseTotal: number;
  periodEquipmentTotal: number;
  cumulativeRevenue: number;
  businessCashBalance?: number;
  outstandingOwnerCapital?: number;
  workingCapitalReserve: number;
  distributablePool: number;
  allocatedTotal: number;
  unallocatedPool: number;
  allocations: Array<{
    employeeId: mongoose.Types.ObjectId;
    role: string;
    amount: number;
  }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) {
      return apiError("Phiếu chi lương không hợp lệ", 404);
    }

    await connectMongo();
    const withdrawal =
      await PayrollWithdrawal.findById(id).lean<WithdrawalRecord>();
    if (!withdrawal) {
      return apiError("Không tìm thấy phiếu chi lương", 404);
    }

    let snapshot = withdrawal.payslipSnapshot;
    if (!snapshot) {
      const [settlement, previousSettlements] = await Promise.all([
        PayrollPeriodSettlement.findOne({
          period: withdrawal.period,
        }).lean<SettlementRecord>(),
        PayrollPeriodSettlement.find({
          period: { $lt: withdrawal.period },
        })
          .select("distributablePool")
          .lean<Array<{ distributablePool?: number }>>(),
      ]);
      if (!settlement) {
        return apiError(
          "Không còn dữ liệu chốt tháng để dựng phiếu lương này",
          422,
        );
      }
      const allocation = settlement.allocations.find(
        (item) => String(item.employeeId) === String(withdrawal.employeeId),
      );
      if (!allocation) {
        return apiError(
          "Không còn dữ liệu phân bổ để dựng phiếu lương này",
          422,
        );
      }
      snapshot = createPayrollPayslipSnapshot({
        settlement,
        allocation,
        previouslySettledPools: previousSettlements.reduce(
          (total, item) => total + Number(item.distributablePool ?? 0),
          0,
        ),
      });
    }

    const pdf = await createPayrollPayslipPdf({
      id: String(withdrawal._id),
      employeeName: withdrawal.employeeName,
      period: withdrawal.period,
      withdrawalDate: withdrawal.withdrawalDate,
      amount: Number(withdrawal.amount),
      sharePercentSnapshot: Number(withdrawal.sharePercentSnapshot),
      note: withdrawal.note,
      snapshot,
    });
    const filename = `phieu-luong-${withdrawal.period}-${String(withdrawal._id).slice(-8)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
