import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { createMembershipSchema } from "@/lib/validators/v2/memberships";
import { toV2Context } from "@/services/v2/context";
import {
  createMembership,
  listMemberships,
} from "@/services/v2/membership.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    const access = await requirePermission(await headers(), "team:manage");
    return apiSuccess(await listMemberships(toV2Context(access)));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const requestHeaders = await headers();
    const [access, payload] = await Promise.all([
      requirePermission(requestHeaders, "team:manage"),
      request.json(),
    ]);
    return apiSuccess(
      await createMembership(
        toV2Context(access),
        requestHeaders,
        createMembershipSchema.parse(payload),
      ),
      "Đã tạo tài khoản nhân viên.",
      201,
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
