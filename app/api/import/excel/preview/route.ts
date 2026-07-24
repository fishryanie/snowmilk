import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { importSummary, mapWorkbook } from "@/lib/excel/mapper";
import { readWorkbook } from "@/lib/excel/reader";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return apiError("Chưa chọn file Excel", 422);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return apiError("Chỉ hỗ trợ file .xlsx", 422);
    }
    if (file.size > 10 * 1024 * 1024) return apiError("File vượt quá 10 MB", 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = mapWorkbook(await readWorkbook(bytes), bytes);
    return apiSuccess({
      fileName: file.name,
      fileHash: parsed.fileHash,
      summary: importSummary(parsed),
      metrics: parsed.metrics,
      issues: parsed.issues,
      preview: {
        products: parsed.products.slice(0, 5),
        ingredients: parsed.ingredients.slice(0, 5),
        purchases: parsed.purchases.slice(0, 5),
        equipment: parsed.equipment.slice(0, 5),
        batches: parsed.milkBatches.slice(0, 5),
        sales: parsed.sales.slice(0, 5),
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
