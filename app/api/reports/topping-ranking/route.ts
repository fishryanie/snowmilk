import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { getToppingRanking } from "@/services/topping-ranking.service";

export async function GET() {
  try {
    return apiSuccess(await getToppingRanking());
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
