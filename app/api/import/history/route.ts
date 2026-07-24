import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { connectMongo } from "@/lib/mongodb";
import { ImportLog } from "@/models/ImportLog";

export async function GET() {
  try {
    await connectMongo();
    return apiSuccess(await ImportLog.find().sort({ importedAt: -1 }).limit(50).lean());
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
