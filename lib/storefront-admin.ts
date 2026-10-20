import "server-only";
import { getAuthMongo } from "@/lib/auth/mongo";
import { requirePermission } from "@/lib/auth/dal";
import type { Permission } from "@/lib/auth/permissions";
import { authUrlConfig } from "@/lib/auth/urls";
import { CommerceStore } from "@/lib/storefront-core/store";
import { CommerceError } from "@/lib/storefront-core/validation";
import { ZodError } from "zod";
export async function adminStore(request: Request, permission: Permission) {
  if (request.method === "POST") {
    const { trustedOrigins } = authUrlConfig();
    const allowed = trustedOrigins.length ? trustedOrigins : [new URL(request.url).origin];
    if (!allowed.includes(request.headers.get("origin") || ""))
      throw new CommerceError("Yêu cầu không đúng nguồn quản trị.", 403);
  }
  const access = await requirePermission(request.headers, permission);
  const organizationId = process.env.STOREFRONT_ORGANIZATION_ID;
  if (!organizationId)
    throw new CommerceError(
      "Chưa cấu hình STOREFRONT_ORGANIZATION_ID ở server Snowmilk.",
      503,
    );
  if (access.organizationId !== organizationId)
    throw new CommerceError("Bạn không có quyền quản lý cửa hàng này.", 403);
  const { db, client } = getAuthMongo();
  return new CommerceStore(
    db,
    client,
    process.env.STOREFRONT_STORE_ID || "milk-shop",
  );
}
export function adminOk(data: unknown) {
  return Response.json(
    { success: true, data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export function adminFail(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        success: false,
        message: error.issues[0]?.message || "Kiểm tra lại thông tin.",
      },
      { status: 400 },
    );
  const status =
    error instanceof CommerceError
      ? error.status
      : typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 503;
  return Response.json(
    {
      success: false,
      message:
        status < 500 && error instanceof Error
          ? error.message
          : "Chưa kết nối được cửa hàng online. Kiểm tra cấu hình server và thử lại.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function adminBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError("Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_500_000) {
        await reader.cancel();
        throw new CommerceError(
          "Ảnh hoặc dữ liệu quá lớn, hãy chọn ảnh nhỏ hơn.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CommerceError("Dữ liệu không hợp lệ.");
  }
}
