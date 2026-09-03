import { z } from "zod";
import { apiError, errorMessage } from "@/lib/api-response";
import { loadBusinessProfile } from "@/lib/business-profile.server";
import { createDivestmentClaimPdf } from "@/lib/divestment-claim-pdf";

export const runtime = "nodejs";

const claimRecordSchema = z.object({
  sourceType: z.enum(["equipment", "purchase"]),
  code: z.string().trim().max(80),
  name: z.string().trim().min(1).max(240),
  category: z.string().trim().max(160),
  purchaseDate: z.string().trim().min(1).max(80),
  quantity: z.number().finite().nonnegative(),
  unit: z.string().trim().max(60),
  unitPrice: z.number().finite().nonnegative(),
  amount: z.number().finite().nonnegative(),
});

const requestSchema = z.object({
  claimDate: z.string().trim().min(1).max(80),
  records: z.array(claimRecordSchema).min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("Danh sách khoản claim xuất PDF không hợp lệ", 422);
    }

    const businessProfile = await loadBusinessProfile();
    const pdf = await createDivestmentClaimPdf(parsed.data.records, {
      claimDate: parsed.data.claimDate,
      businessProfile,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="bao-cao-khoan-claim-da-chon.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(errorMessage(error), 503);
  }
}
