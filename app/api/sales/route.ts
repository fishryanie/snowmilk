import { apiError, apiSuccess } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { parseSalesHistoryQuery, SalesHistoryQueryError } from "@/lib/sales-history";
import { dailySaleSchema } from "@/lib/validators/sales";
import { vietnamDayBoundary } from "@/lib/vietnam-date";
import { Sale } from "@/models/Sale";

export async function GET(request: Request) {
  try {
    const { filter, limit } = parseSalesHistoryQuery(new URL(request.url).searchParams);
    await connectMongo();
    const rows = await Sale.find(filter)
      .select("saleDate cashReceived bankTransferReceived -_id")
      .sort({ saleDate: -1 })
      .limit(limit + 1)
      .lean();
    const history = rows.slice(0, limit);
    return apiSuccess({
      history,
      nextCursor: rows.length > limit ? history.at(-1)!.saleDate.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof SalesHistoryQueryError) return apiError(error.message, 400);
    return apiError("Không thể xử lý chốt doanh thu. Vui lòng thử lại.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = dailySaleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Dữ liệu chốt doanh thu không hợp lệ", 422, parsed.error.flatten());
    }
    await connectMongo();
    const { overwrite, ...input } = parsed.data;
    const record = { ...input, saleDate: vietnamDayBoundary(input.saleDate) };
    // A unique date makes concurrent creates atomic; never overwrite implicitly.
    const saved = overwrite
      ? await Sale.findOneAndReplace({ saleDate: record.saleDate }, record, {
          upsert: true, returnDocument: "after", runValidators: true,
        }).select("saleDate cashReceived bankTransferReceived -_id").lean()
      : (await Sale.create(record)).toObject();
    return apiSuccess({
      saleDate: saved!.saleDate,
      cashReceived: saved!.cashReceived,
      bankTransferReceived: saved!.bankTransferReceived,
    }, overwrite ? "Đã cập nhật chốt ngày" : "Đã lưu chốt ngày", 201);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return apiError("Ngày này đã được chốt. Xác nhận cập nhật số tiền của ngày này.", 409);
    }
    if (error instanceof SyntaxError) return apiError("Dữ liệu chốt doanh thu không hợp lệ", 422);
    return apiError("Không thể xử lý chốt doanh thu. Vui lòng thử lại.", 503);
  }
}
