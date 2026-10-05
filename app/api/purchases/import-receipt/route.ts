import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { receiptImportSchema } from "@/lib/validators/receipt";
import { importReceipt, ReceiptImportError } from "@/services/receipt-import.service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const parsed = receiptImportSchema.safeParse(await request.json());
    if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Dữ liệu bill chưa hợp lệ.", 422);
    return apiSuccess(await importReceipt(parsed.data), "Đã nhập các mặt hàng trên bill.", 201);
  } catch (error) {
    if (error instanceof ReceiptImportError) return apiError(error.message, error.status);
    if (error instanceof SyntaxError) return apiError("Dữ liệu bill không hợp lệ.", 422);
    return apiError(errorMessage(error), 503);
  }
}
