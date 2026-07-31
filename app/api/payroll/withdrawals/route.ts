import mongoose from "mongoose";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { vietnamDateKey } from "@/lib/vietnam-date";
import { payrollWithdrawalSchema } from "@/lib/validators/payroll";
import { PayrollEmployee } from "@/models/PayrollEmployee";
import { PayrollPeriodSettlement } from "@/models/PayrollPeriodSettlement";
import { PayrollWithdrawal } from "@/models/PayrollWithdrawal";

function withdrawalDto(withdrawal: Record<string, unknown>) {
  return {
    ...withdrawal,
    id: String(withdrawal._id),
    employeeId: String(withdrawal.employeeId),
    _id: undefined,
  };
}

export async function GET(request: Request) {
  try {
    const period = new URL(request.url).searchParams.get("period");
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return apiError("Tháng không hợp lệ", 422);
    }

    await connectMongo();
    const withdrawals = await PayrollWithdrawal.find(period ? { period } : {})
      .sort({ withdrawalDate: -1, createdAt: -1 })
      .lean();
    return apiSuccess(
      withdrawals.map((withdrawal) => withdrawalDto(withdrawal)),
    );
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = payrollWithdrawalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Thông tin rút tiền chưa hợp lệ", 422, parsed.error.flatten());
    }

    await connectMongo();
    const employeeId = new mongoose.Types.ObjectId(parsed.data.employeeId);
    const [employee, settlement, existing] = await Promise.all([
      PayrollEmployee.findById(employeeId).lean(),
      PayrollPeriodSettlement.findOne({
        period: parsed.data.period,
      }).lean(),
      PayrollWithdrawal.exists({
        employeeId,
        period: parsed.data.period,
      }),
    ]);
    if (!employee) {
      return apiError("Nhân sự không tồn tại", 404);
    }
    if (!settlement) {
      return apiError(
        "Tháng này chưa kết thúc nên số tiền chưa được chốt.",
        422,
      );
    }
    const withdrawalDay = vietnamDateKey(parsed.data.withdrawalDate);
    const today = vietnamDateKey(new Date());
    if (
      withdrawalDay > today ||
      withdrawalDay.slice(0, 7) <= parsed.data.period
    ) {
      return apiError(
        "Ngày rút phải nằm sau tháng đã chốt và không được ở tương lai.",
        422,
      );
    }
    if (existing) {
      return apiError("Nhân sự này đã có phiếu rút trong tháng đã chọn.", 409);
    }

    const allocation = settlement.allocations.find(
      (item: { employeeId: unknown }) =>
        String(item.employeeId) === parsed.data.employeeId,
    );
    if (!allocation || allocation.amount < 1) {
      return apiError("Tháng này nhân sự không có khoản được lãnh.", 422);
    }

    const amount = Math.round(allocation.amount);
    if (
      Math.round(parsed.data.amount) !== amount ||
      Math.round(parsed.data.entitlementSnapshot) !== amount
    ) {
      return apiError(
        "Số tiền đã thay đổi sau khi chốt. Hãy tải lại trang.",
        409,
      );
    }

    const withdrawal = await PayrollWithdrawal.create({
      employeeId,
      employeeName: allocation.employeeName,
      period: parsed.data.period,
      withdrawalDate: parsed.data.withdrawalDate,
      amount,
      entitlementSnapshot: amount,
      sharePercentSnapshot: allocation.sharePercent,
      note: parsed.data.note,
    });
    return apiSuccess(withdrawal.toJSON(), "Đã ghi nhận phiếu rút lương", 201);
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      return apiError("Nhân sự này đã có phiếu rút trong tháng đã chọn.", 409);
    }
    return apiError(errorMessage(error), 500);
  }
}
