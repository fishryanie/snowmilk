import { headers } from "next/headers";
import { apiSuccess } from "@/lib/api-response";
import { requirePermission } from "@/lib/auth/dal";
import { assertV2OperationsEnabled } from "@/lib/v2/feature-flag";
import { createPurchaseReceiptSchema } from "@/lib/validators/v2/purchase-receipts";
import { toV2Context } from "@/services/v2/context";
import {
  createPurchaseReceipt,
  listPurchaseReceipts,
} from "@/services/v2/purchase-receipt.service";
import { v2ErrorResponse } from "@/services/v2/route";

export async function GET() {
  try {
    assertV2OperationsEnabled();
    const access = await requirePermission(await headers(), "purchases:read");
    return apiSuccess(await listPurchaseReceipts(toV2Context(access)));
  } catch (error) {
    return v2ErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertV2OperationsEnabled();
    const [access, payload] = await Promise.all([
      requirePermission(await headers(), "purchases:write"),
      request.json(),
    ]);
    return apiSuccess(
      await createPurchaseReceipt(
        toV2Context(access),
        createPurchaseReceiptSchema.parse(payload),
      ),
      "Đã ghi phiếu nhập, lot, sổ kho và giá vốn trong cùng transaction.",
      201,
    );
  } catch (error) {
    return v2ErrorResponse(error);
  }
}
