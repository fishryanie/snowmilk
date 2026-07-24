import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { importSummary, mapWorkbook } from "@/lib/excel/mapper";
import { readWorkbook } from "@/lib/excel/reader";
import { persistWorkbook } from "@/services/import.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return apiError("Chưa chọn file Excel", 422);
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = mapWorkbook(await readWorkbook(bytes), bytes);
    const summary = importSummary(parsed);
    if (summary.totals.failedRows > 0) {
      return apiError("File còn dòng không hợp lệ; import đã được dừng.", 422, {
        summary,
        issues: parsed.issues,
      });
    }
    await persistWorkbook(parsed, file.name);
    return apiSuccess({ summary, metrics: parsed.metrics }, "Import Excel hoàn tất", 201);
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
