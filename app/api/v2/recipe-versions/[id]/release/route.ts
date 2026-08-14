import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { releaseRecipeVersionSchema } from "@/lib/validators/v2/recipes";
import { toV2Context } from "@/services/v2/context";
import { releaseRecipeVersion } from "@/services/v2/recipe.service";
import { v2ErrorResponse } from "@/services/v2/route";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertV2OperationsEnabled();
    const [{ id }, access, payload] = await Promise.all([
      params,
      requirePermission(await headers(), "catalog:write"),
      request.json(),
    ]);
    return apiSuccess(
      await releaseRecipeVersion(
        toV2Context(access),
        id,
        releaseRecipeVersionSchema.parse(payload),
      ),
      "Đã phát hành công thức.",
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
