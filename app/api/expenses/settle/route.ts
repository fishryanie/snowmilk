import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { MILK_STERILIZATION_EXPENSE_CATEGORY } from "@/lib/expense-categories";
import { connectMongo } from "@/lib/mongodb";
import { vietnamDateKey, vietnamDayBoundary } from "@/lib/vietnam-date";
import { Expense } from "@/models/Expense";
import { ExpensePayment } from "@/models/ExpensePayment";

const settleSchema = z
  .object({
    ids: z
      .array(z.string().regex(/^[a-f\d]{24}$/i, "Mã chi phí không hợp lệ"))
      .min(1),
    paidAt: z
      .string()
      .refine(
        (value) => /^\d{4}-\d{2}-\d{2}$/u.test(value),
        "Ngày thanh toán không hợp lệ",
      )
      .optional(),
  })
  .strict();

type SettlementExpense = {
  _id: unknown;
  sourcePurchaseId?: unknown;
  provider?: string;
  fundingSource?: string;
  milkLiters?: number;
  amount?: number;
};

function groupKey(expense: SettlementExpense) {
  return `${expense.provider ?? "Chưa ghi nhà cung cấp"}\u0000${expense.fundingSource ?? "other"}`;
}

export async function POST(request: Request) {
  try {
    const parsed = settleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu thanh toán không hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    await connectMongo();
    const paidAt = parsed.data.paidAt
      ? vietnamDayBoundary(parsed.data.paidAt, true)
      : vietnamDayBoundary(vietnamDateKey(new Date()), true);
    const expenses = (await Expense.find({
      _id: { $in: parsed.data.ids },
      category: MILK_STERILIZATION_EXPENSE_CATEGORY,
      paymentStatus: "unpaid",
    }).lean()) as SettlementExpense[];
    if (expenses.length !== parsed.data.ids.length) {
      return apiError(
        "Chỉ có thể thanh toán các khoản tiệt trùng đang ở trạng thái Chưa thanh toán.",
        409,
      );
    }

    const groups = new Map<string, SettlementExpense[]>();
    for (const expense of expenses) {
      const key = groupKey(expense);
      groups.set(key, [...(groups.get(key) ?? []), expense]);
    }

    const payments = [];
    for (const groupedExpenses of groups.values()) {
      const provider = groupedExpenses[0]?.provider || "Chưa ghi nhà cung cấp";
      const fundingSource = groupedExpenses[0]?.fundingSource || "other";
      const totalLiters = groupedExpenses.reduce(
        (sum, expense) => sum + Number(expense.milkLiters ?? 0),
        0,
      );
      const totalAmount = groupedExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount ?? 0),
        0,
      );
      const payment = await ExpensePayment.create({
        paidAt,
        provider,
        fundingSource,
        totalLiters,
        totalAmount,
        lines: groupedExpenses.map((expense) => ({
          expenseId: expense._id,
          sourcePurchaseId: expense.sourcePurchaseId,
          milkLiters: Number(expense.milkLiters ?? 0),
          amount: Number(expense.amount ?? 0),
        })),
      });
      await Expense.updateMany(
        { _id: { $in: groupedExpenses.map((expense) => expense._id) } },
        {
          $set: {
            paymentStatus: "paid",
            paidAt,
            paymentId: payment._id,
          },
        },
      );
      payments.push(payment);
    }

    const updatedExpenses = await Expense.find({
      _id: { $in: parsed.data.ids },
    }).lean();
    return apiSuccess(
      {
        expenses: updatedExpenses.map((expense) => ({
          ...expense,
          id: String(expense._id),
        })),
        payments: payments.map((payment) => payment.toJSON()),
      },
      `Đã thanh toán ${expenses.length} khoản tiệt trùng`,
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
