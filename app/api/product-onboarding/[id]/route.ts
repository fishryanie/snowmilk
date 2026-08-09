import { apiError, apiSuccess, errorMessage } from "@/lib/api-response";
import { productOnboardingSchema } from "@/lib/validators/product-onboarding";
import { updateOnboardedProduct } from "@/services/product-onboarding.service";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const parsed = productOnboardingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(
        "Dữ liệu sản phẩm chưa hợp lệ",
        422,
        parsed.error.flatten(),
      );
    }
    const { id } = await context.params;
    const product = await updateOnboardedProduct(id, parsed.data);
    if (!product) return apiError("Không tìm thấy sản phẩm", 404);
    return apiSuccess(product, "Đã cập nhật sản phẩm và giá vốn");
  } catch (error) {
    return apiError(errorMessage(error), 500);
  }
}
