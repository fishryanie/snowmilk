import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { createProductionBatchSchema } from "@/lib/validators/v2/production-batches";
import { toV2Context } from "@/services/v2/context";
import {
  createProductionBatch,
  listProduction,
} from "@/services/v2/production.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    const access = await requirePermission(await headers(), "production:read");
    return apiSuccess(await listProduction(toV2Context(access)));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertV2OperationsEnabled();
    const [access, payload] = await Promise.all([
      requirePermission(await headers(), "production:write"),
      request.json(),
    ]);
    return apiSuccess(
      await createProductionBatch(
        toV2Context(access),
        createProductionBatchSchema.parse(payload),
      ),
      "Đã tạo mẻ sản xuất.",
      201,
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
