import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { toV2Context } from "@/services/v2/context";
import { listPurchaseItems } from "@/services/v2/purchase-receipt.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    assertV2OperationsEnabled();
    const access = await requirePermission(await headers(), "purchases:read");
    return apiSuccess(await listPurchaseItems(toV2Context(access)));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
