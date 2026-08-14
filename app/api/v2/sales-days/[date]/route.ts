import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { saveSalesDayDraftSchema } from "@/lib/validators/v2/sales-days";
import { toV2Context } from "@/services/v2/context";
import {
  getSalesDay,
  saveSalesDayDraft,
} from "@/services/v2/sales-day.service";
import { v2ErrorResponse } from "@/services/v2/route";

type RouteContext = { params: Promise<{ date: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const [{ date }, access] = await Promise.all([
      params,
      requirePermission(await headers(), "sales:read"),
    ]);
    return apiSuccess(await getSalesDay(toV2Context(access), date));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertV2OperationsEnabled();
    const [{ date }, access, payload] = await Promise.all([
      params,
      requirePermission(await headers(), "sales:write"),
      request.json(),
    ]);
    const input = saveSalesDayDraftSchema.parse(payload);
    return apiSuccess(
      await saveSalesDayDraft(toV2Context(access), date, input),
      "Đã lưu bản nháp cuối ngày.",
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
