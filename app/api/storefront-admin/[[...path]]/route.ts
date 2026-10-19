import { z } from "zod";
import sharp from "sharp";
import {
  adminStore,
  adminOk,
  adminFail,
  adminBody,
} from "@/lib/storefront-admin";
import {
  CommerceError,
  normalizePhone,
} from "@/lib/storefront-core/validation";
import { orderStatuses } from "@/lib/storefront-core/types";
export const runtime = "nodejs";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const path = (await params).path || [];
    const db = await adminStore(
      request,
      path[0] === "orders" || path[0] === "receipt"
        ? "sales:read"
        : "catalog:read",
    );
    if (path.join("/") === "catalog") return adminOk(await db.catalog(true));
    if (path.join("/") === "settings") return adminOk(await db.settings());
    if (path.join("/") === "orders") {
      const url = new URL(request.url);
      return adminOk(
        await db.listOrders(
          undefined,
          url.searchParams.get("phone")
            ? normalizePhone(url.searchParams.get("phone")!)
            : undefined,
          url.searchParams.get("before") || undefined,
          z.enum(orderStatuses).optional().parse(url.searchParams.get("status") || undefined),
        ),
      );
    }
    if (path[0] === "orders" && path.length === 2)
      return adminOk(await db.order(path[1]));
    if (path[0] === "receipt" && path.length === 2) {
      const o = await db.getOrder(path[1]);
      const receipt = o.receipt;
      if (!receipt) throw new CommerceError("Chưa có bill.", 404);
      const buffer = Buffer.isBuffer(receipt.data)
        ? receipt.data
        : Buffer.from(receipt.data.buffer);
      return adminOk({
        image: `data:${receipt.mime};base64,${buffer.toString("base64")}`,
      });
    }
    throw new CommerceError("Không tìm thấy API.", 404);
  } catch (error) {
    return adminFail(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const path = (await params).path || [];
    const db = await adminStore(
      request,
      path[0] === "orders"
        ? "sales:write"
        : path[0] === "settings"
          ? "settings:manage"
          : "catalog:write",
    );
    const body = await adminBody(request);
    if (path.join("/") === "products")
      return adminOk(await db.saveProduct(body));
    if (path[0] === "products" && path.length === 2)
      return adminOk(await db.saveProduct(body, path[1]));
    if (path[0] === "products" && path.length === 3 && path[2] === "delete")
      return adminOk(await db.deleteProduct(body, path[1]));
    if (path.join("/") === "settings")
      return adminOk(await db.saveSettings(body));
    if (path[0] === "orders" && path.length === 2) {
      const input = z
        .strictObject({
          status: z.enum(orderStatuses),
          note: z.string().trim().max(500),
        })
        .parse(body);
      return adminOk(await db.changeStatus(path[1], input.status, input.note));
    }
    if (path.join("/") === "image") {
      const input = z
        .strictObject({
          base64: z.string().min(1).max(2_000_000),
          kind: z.enum(["qr", "product"]),
        })
        .parse(body);
      const raw = Buffer.from(input.base64, "base64");
      const image = sharp(raw, { limitInputPixels: 20_000_000 });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format || ""))
        throw new CommerceError("Chỉ dùng ảnh JPG, PNG hoặc WebP.");
      const data = await image
        .rotate()
        .resize({
          width: input.kind === "qr" ? 800 : 1000,
          height: input.kind === "qr" ? 1000 : 1000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: input.kind === "qr" ? 100 : 85,
          lossless: input.kind === "qr",
        })
        .toBuffer();
      if (data.length > 900_000)
        throw new CommerceError("Ảnh quá lớn, hãy chọn ảnh nhỏ hơn.");
      return adminOk({
        image: `data:image/webp;base64,${data.toString("base64")}`,
      });
    }
    throw new CommerceError("Không tìm thấy API.", 404);
  } catch (error) {
    return adminFail(error);
  }
}
