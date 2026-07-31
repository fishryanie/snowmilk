import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { getPayrollPeriodSummaries } from "@/services/payroll-period.service";

export async function GET() {
  try {
    await connectMongo();
    const periods = await getPayrollPeriodSummaries();
    return apiSuccess(periods);
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
