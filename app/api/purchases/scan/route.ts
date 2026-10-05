import { apiError, apiSuccess } from "@/lib/api-response";
import { MAX_RECEIPT_BASE64, receiptScanSchema } from "@/lib/validators/receipt";
import { ReceiptScanError, scanReceipt } from "@/services/receipt-scan.service";
import { ReceiptBudgetError } from "@/services/receipt-scan-budget";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > MAX_RECEIPT_BASE64 + 1000) {
      return apiError("Ảnh bill quá lớn. Hãy chọn ảnh nhỏ hơn.", 413);
    }
    const input = receiptScanSchema.safeParse(await request.json());
    if (!input.success) return apiError("Ảnh bill không hợp lệ hoặc quá lớn.", 422);
    return apiSuccess(await scanReceipt(input.data.imageBase64, request.signal), "Đã đọc bill. Kiểm tra trước khi nhập kho.");
  } catch (error) {
    if (error instanceof ReceiptScanError || error instanceof ReceiptBudgetError) return apiError(error.message, error.status);
    if (error instanceof SyntaxError) return apiError("Ảnh bill không hợp lệ.", 422);
    return apiError("Không thể đọc bill. Hãy kiểm tra kết nối rồi thử lại.", 503);
  }
}
