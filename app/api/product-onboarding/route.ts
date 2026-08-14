import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { productOnboardingSchema } from "@/lib/validators/product-onboarding";
import {
  createOnboardedProduct,
  loadProductOnboardingData,
} from "@/services/product-onboarding.service";

export async function GET() {
  try {
    return apiSuccess(await loadProductOnboardingData());
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = productOnboardingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu sản phẩm chưa hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    const product = await createOnboardedProduct(parsed.data);
    return apiSuccess(
      product,
      "Đã tạo sản phẩm và liên kết các mẻ chuẩn bị",
      201,
    );
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
