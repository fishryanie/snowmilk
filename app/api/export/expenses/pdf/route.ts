import mongoose from "mongoose";
import { z } from "zod";
import { apiError, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { createExpensePdf, type ExpensePdfRecord } from "@/lib/expense-pdf";
import { Expense } from "@/models/Expense";

export const runtime = "nodejs";

const requestSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Danh sách chi phí được chọn không hợp lệ", 422);
    }

    await connectMongo();
    const objectIds = parsed.data.ids.map((id) => new mongoose.Types.ObjectId(id));
    const records = (await Expense.find({ _id: { $in: objectIds } })
      .select(
        "expenseDate category description milkLiters milkUnitPrice amount",
      )
      .lean()) as Array<{
      _id: mongoose.Types.ObjectId;
      expenseDate: Date;
      category: string;
      description: string;
      milkLiters?: number;
      milkUnitPrice?: number;
      amount: number;
    }>;
    const recordById = new Map(records.map((record) => [String(record._id), record]));
    const orderedRecords = parsed.data.ids.flatMap((id) => {
      const record = recordById.get(id);
      return record
        ? [
            {
              id,
              expenseDate: record.expenseDate,
              category: record.category,
              description: record.description,
              milkLiters: record.milkLiters,
              milkUnitPrice: record.milkUnitPrice,
              amount: Number(record.amount ?? 0),
            } satisfies ExpensePdfRecord,
          ]
        : [];
    });
    if (orderedRecords.length === 0) {
      return apiError("Không tìm thấy chi phí đã chọn", 404);
    }

    const pdf = await createExpensePdf(orderedRecords);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="hoa-don-chi-phi.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
