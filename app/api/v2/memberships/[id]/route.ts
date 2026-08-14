import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { updateMembershipSchema } from "@/lib/validators/v2/memberships";
import { toV2Context } from "@/services/v2/context";
import { updateMembership } from "@/services/v2/membership.service";
import { v2ErrorResponse } from "@/services/v2/route";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const [{ id }, access, payload] = await Promise.all([
      params,
      requirePermission(await headers(), "team:manage"),
      request.json(),
    ]);
    return apiSuccess(
      await updateMembership(
        toV2Context(access),
        id,
        updateMembershipSchema.parse(payload),
      ),
      "Đã cập nhật quyền nhân viên.",
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
