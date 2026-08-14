import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { createStockCountSchema } from "@/lib/validators/v2/stock-counts";
import { toV2Context } from "@/services/v2/context";
import { v2ErrorResponse } from "@/services/v2/route";
import {
  createStockCount,
  isOpeningStockCount,
} from "@/services/v2/stock-count.service";

export async function POST(request: Request) {
  try {
    assertV2OperationsEnabled();
    const requestHeaders = await headers();
    const access = await requirePermission(requestHeaders, "inventory:count");
    const payload = await request.json();
    const input = createStockCountSchema.parse(payload);
    const context = toV2Context(access);
    if (await isOpeningStockCount(context)) {
      await requirePermission(requestHeaders, "inventory:adjust");
    }
    return apiSuccess(
      await createStockCount(context, input),
      "Đã ghi kiểm kho và điều chỉnh sổ kho trong cùng transaction.",
      201,
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
