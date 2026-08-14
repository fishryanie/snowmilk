import { z } from "zod";
import { apiError, errorMessage } from "@/lib/api-response";
import { loadBusinessProfile } from "@/lib/business-profile.server";
import { createProductPdf } from "@/lib/product-pdf";

export const runtime = "nodejs";

const productSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(240),
  productMode: z.enum(["legacy", "recipe"]).optional(),
  recipeCode: z.string().trim().max(120).optional(),
  recipeName: z.string().trim().max(240).optional(),
  milkMl: z.number().finite().nonnegative().optional(),
  sellingPrice: z.number().finite().nonnegative(),
  fullCost: z.number().finite().nonnegative().optional(),
});

const requestSchema = z.object({
  products: z.array(productSchema).min(1).max(500),
  includeSterilizationCost: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Danh sách sản phẩm xuất PDF không hợp lệ", 422);
    }

    const businessProfile = await loadBusinessProfile();
    const pdf = await createProductPdf(parsed.data.products, {
      includeSterilizationCost: parsed.data.includeSterilizationCost,
      businessProfile,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="danh-sach-san-pham.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
