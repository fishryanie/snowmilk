import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { payrollEmployeeSchema } from "@/lib/validators/payroll";
import { PayrollEmployee } from "@/models/PayrollEmployee";

function employeeDto(employee: Record<string, unknown>) {
  return {
    ...employee,
    id: String(employee._id),
    _id: undefined,
  };
}

export async function GET() {
  try {
    await connectMongo();
    const employees = await PayrollEmployee.find()
      .sort({ isActive: -1, createdAt: 1 })
      .lean();
    return apiSuccess(employees.map((employee) => employeeDto(employee)));
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = payrollEmployeeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Thông tin nhân sự chưa hợp lệ", 422, parsed.error.flatten());
    }

    await connectMongo();
    const activeShare = parsed.data.isActive ? parsed.data.sharePercent : 0;
    const allocated = await PayrollEmployee.aggregate<{ total: number }>([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: "$sharePercent" } } },
    ]);
    if (Number(allocated[0]?.total ?? 0) + activeShare > 100) {
      return apiError("Tổng tỷ lệ của nhân sự đang hoạt động không được vượt quá 100%.", 422);
    }

    const employee = await PayrollEmployee.create(parsed.data);
    return apiSuccess(employee.toJSON(), "Đã thêm nhân sự", 201);
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
