import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { revenueReportFiltersSchema } from "@/lib/validators/v2/reports";
import { toV2Context } from "@/services/v2/context";
import { revenueReport } from "@/services/v2/revenue-report.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET(request: Request) {
  try {
    const access = await requirePermission(await headers(), "reports:read");
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return apiSuccess(
      await revenueReport(
        toV2Context(access),
        revenueReportFiltersSchema.parse(query),
      ),
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
