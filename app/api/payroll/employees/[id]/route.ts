import mongoose from "mongoose";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { payrollEmployeeSchema } from "@/lib/validators/payroll";
import { PayrollEmployee } from "@/models/PayrollEmployee";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) {
      return apiError("Nhân sự không hợp lệ", 404);
    }
    const parsed = payrollEmployeeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Thông tin nhân sự chưa hợp lệ", 422, parsed.error.flatten());
    }

    await connectMongo();
    const activeShare = parsed.data.isActive ? parsed.data.sharePercent : 0;
    const allocated = await PayrollEmployee.aggregate<{ total: number }>([
      { $match: { _id: { $ne: new mongoose.Types.ObjectId(id) }, isActive: true } },
      { $group: { _id: null, total: { $sum: "$sharePercent" } } },
    ]);
    if (Number(allocated[0]?.total ?? 0) + activeShare > 100) {
      return apiError("Tổng tỷ lệ của nhân sự đang hoạt động không được vượt quá 100%.", 422);
    }

    const employee = await PayrollEmployee.findByIdAndUpdate(id, parsed.data, {
      new: true,
      runValidators: true,
    });
    if (!employee) return apiError("Không tìm thấy nhân sự", 404);
    return apiSuccess(employee.toJSON(), "Đã cập nhật nhân sự");
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
