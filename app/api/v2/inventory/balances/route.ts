import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { toV2Context } from "@/services/v2/context";
import { listInventoryBalances } from "@/services/v2/inventory.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    const access = await requirePermission(await headers(), "inventory:read");
    return apiSuccess(await listInventoryBalances(toV2Context(access)));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
