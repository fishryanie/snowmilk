import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { toV2Context } from "@/services/v2/context";
import { listCatalogSkus } from "@/services/v2/catalog.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    const access = await requirePermission(await headers(), "catalog:read");
    const data = await listCatalogSkus(toV2Context(access));
    return apiSuccess(data);
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
