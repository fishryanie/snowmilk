import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { permissionsForRole } from "@/lib/auth/permissions";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    const access = await requirePermission(await headers(), "catalog:read");
    return apiSuccess({
      userId: access.userId,
      userName: access.userName,
      organizationId: access.organizationId,
      locationId: access.locationId,
      role: access.role,
      permissions: permissionsForRole(access.role),
      authMode: access.authMode,
    });
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
