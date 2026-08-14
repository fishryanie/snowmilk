import { z } from "zod";
import { apiError, errorMessage } from "@/lib/api-response";
import { loadBusinessProfile } from "@/lib/business-profile.server";
import { createPurchasePdf } from "@/lib/purchase-pdf";

export const runtime = "nodejs";

const fundingSourceSchema = z.enum([
  "sales_revenue",
  "owner_capital",
  "loan",
  "other",
]);

const purchaseSchema = z.object({
  purchaseDate: z.string().trim().min(1).max(80),
  itemCode: z.string().trim().min(1).max(80),
  itemName: z.string().trim().min(1).max(240),
  category: z.string().trim().max(160),
  packageCount: z.number().finite().nonnegative(),
  packageQuantity: z.number().finite().nonnegative(),
  costUnit: z.string().trim().max(60),
  actualPackagePrice: z.number().finite().nonnegative(),
  convertedQuantity: z.number().finite().nonnegative(),
  totalAmount: z.number().finite().nonnegative(),
  fundingSource: fundingSourceSchema.optional(),
  supplier: z.string().trim().max(240).optional(),
});

const requestSchema = z.object({
  purchases: z.array(purchaseSchema).min(1).max(500),
  filters: z
    .object({
      query: z.string().trim().max(240).optional(),
      dateFrom: z.iso.date().optional(),
      dateTo: z.iso.date().optional(),
      category: z.string().trim().max(160).optional(),
      fundingSource: fundingSourceSchema.optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Danh sách nhập hàng xuất PDF không hợp lệ", 422);
    }

    const businessProfile = await loadBusinessProfile();
    const pdf = await createPurchasePdf(parsed.data.purchases, {
      filters: parsed.data.filters,
      businessProfile,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="danh-sach-nhap-hang.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
