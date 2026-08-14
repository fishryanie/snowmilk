import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { completeProductionBatchSchema } from "@/lib/validators/v2/production-batches";
import { toV2Context } from "@/services/v2/context";
import { completeProductionBatch } from "@/services/v2/production.service";
import { v2ErrorResponse } from "@/services/v2/route";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertV2OperationsEnabled();
    const [{ id }, access, payload] = await Promise.all([
      params,
      requirePermission(await headers(), "production:write"),
      request.json(),
    ]);
    return apiSuccess(
      await completeProductionBatch(
        toV2Context(access),
        id,
        completeProductionBatchSchema.parse(payload),
      ),
      "Đã hoàn tất mẻ, xuất nguyên liệu và nhập thành phẩm trong cùng transaction.",
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
