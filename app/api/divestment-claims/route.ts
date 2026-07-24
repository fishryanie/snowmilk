import { z } from "zod";
import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import {
  createDivestmentClaim,
  getDivestmentClaimContext,
} from "@/services/divestment.service";

const createClaimSchema = z
  .object({
    withdrawalDate: z.coerce.date(),
    sourceKeys: z
      .array(
        z
          .string()
          .regex(
            /^purchase:[a-f\d]{24}$/i,
            "Phiếu nhập hàng không hợp lệ",
          ),
      )
      .min(1, "Vui lòng chọn ít nhất một khoản")
      .max(100, "Mỗi lần chỉ được chọn tối đa 100 khoản"),
    note: z.string().trim().optional().default(""),
  })
  .strict();

export async function GET() {
  try {
    return apiSuccess(await getDivestmentClaimContext());
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createClaimSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu claim không hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    const data = await createDivestmentClaim(parsed.data);
    return apiSuccess(
      data,
      "Đã claim và đổi nguồn tiền sang Tiền bán hàng",
      201,
    );
  } catch (error) {
    return apiError(errorMessage(error), 409);
  }
}
