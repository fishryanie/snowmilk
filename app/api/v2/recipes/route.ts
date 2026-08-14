import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { toV2Context } from "@/services/v2/context";
import { listRecipes } from "@/services/v2/recipe.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET(request: Request) {
  try {
    const access = await requirePermission(await headers(), "production:read");
    const skuCode = new URL(request.url).searchParams.get("skuCode") ?? undefined;
    return apiSuccess(await listRecipes(toV2Context(access), skuCode));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
