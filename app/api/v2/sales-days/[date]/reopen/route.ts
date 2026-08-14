import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { reopenSalesDaySchema } from "@/lib/validators/v2/sales-days";
import { toV2Context } from "@/services/v2/context";
import { reopenSalesDay } from "@/services/v2/sales-day.service";
import { v2ErrorResponse } from "@/services/v2/route";

type RouteContext = { params: Promise<{ date: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertV2OperationsEnabled();
    const [{ date }, access, payload] = await Promise.all([
      params,
      requirePermission(await headers(), "sales:reopen"),
      request.json(),
    ]);
    return apiSuccess(
      await reopenSalesDay(
        toV2Context(access),
        date,
        reopenSalesDaySchema.parse(payload),
      ),
      "Đã mở lại ngày và đảo các bút toán kho/doanh thu.",
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
