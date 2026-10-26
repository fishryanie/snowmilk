import { z, ZodError } from "zod";
import { AuthorizationError, requirePermission } from "@/lib/auth/dal";
import { authUrlConfig } from "@/lib/auth/urls";
import { getZaloStore } from "@/lib/zalo/server";
import { BotError } from "@/lib/zalo/store";
import { ZaloMenuImages } from "@/lib/zalo/media";

export const runtime = "nodejs";
type Context = { params: Promise<{ path?: string[] }> };
const replySchema = z.object({ text: z.string().trim().min(1).max(2000), requestId: z.uuid() });
function success(data: unknown) { return Response.json({ success: true, data }, { headers: { "Cache-Control": "private, no-store" } }); }

async function handle(request: Request, context: Context) {
  try {
    const { path = [] } = await context.params;
    const method = request.method;
    const read = method === "GET";
    const settingsWrite = ["settings", "images"].includes(path[0]) && !read;
    const access = await requirePermission(request.headers, read ? "sales:read" : settingsWrite ? "settings:manage" : "sales:write");
    if (!process.env.STOREFRONT_ORGANIZATION_ID || access.organizationId !== process.env.STOREFRONT_ORGANIZATION_ID) {
      throw new AuthorizationError("Bạn không có quyền quản lý bot của cửa hàng này.", 403);
    }
    if (!read) {
      const allowed = authUrlConfig().trustedOrigins;
      if (!(allowed.length ? allowed : [new URL(request.url).origin]).includes(request.headers.get("origin") ?? "")) {
        throw new AuthorizationError("Yêu cầu không đúng nguồn quản trị.", 403);
      }
    }
    const store = getZaloStore();
    const url = new URL(request.url);
    if (path.length === 1 && path[0] === "images" && method === "POST") {
      const input = z.object({ base64: z.string().min(1).max(2_800_000) }).parse(await readBody(request, 3 * 1024 * 1024));
      const origin = new URL(process.env.ZALO_WEBHOOK_URL || request.url).origin;
      if (!origin.startsWith("https://")) throw new BotError("Cần cấu hình domain HTTPS công khai để gửi ảnh Zalo.", 503);
      const id = await new ZaloMenuImages(store.db).upload(store.botId, input.base64);
      return success({ photoUrl: `${origin}/api/zalo/media/${id}` });
    }
    if (path.length === 1 && path[0] === "settings") {
      if (read) return success({ settings: await store.getSettings(), configured: true });
      if (method === "PUT") return success({ settings: await store.saveSettings(await readBody(request), access.userName), configured: true });
    }
    if (path[0] === "conversations") {
      if (read && path.length === 1) {
        const query = z.string().max(80).parse(url.searchParams.get("q") ?? "");
        return success(await store.listConversations(query, url.searchParams.get("before"), url.searchParams.get("paused") === "1"));
      }
      const chatId = z.string().min(1).max(256).parse(path[1]);
      if (read && path.length === 2) return success(await store.conversation(chatId, url.searchParams.get("before")));
      if (method === "POST" && path.length === 3 && path[2] === "reply") {
        const input = replySchema.parse(await readBody(request));
        return success(await store.sendManual(chatId, input.text, input.requestId, access.userName));
      }
      if (method === "PATCH" && path.length === 3 && path[2] === "state") {
        const input = z.object({ botPaused: z.boolean() }).parse(await readBody(request));
        return success(await store.setPaused(chatId, input.botPaused));
      }
    }
    throw new BotError("Không tìm thấy chức năng.", 404);
  } catch (error) {
    const status = error instanceof AuthorizationError || error instanceof BotError ? error.status : error instanceof ZodError ? 422 : 503;
    const message = error instanceof AuthorizationError || error instanceof BotError ? error.message : error instanceof ZodError ? error.issues[0]?.message ?? "Dữ liệu không hợp lệ." : "Chưa kết nối được hộp thư. Vui lòng thử lại.";
    return Response.json({ success: false, message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
async function readBody(request: Request, limit = 64 * 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new BotError("Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new BotError("Dữ liệu quá lớn.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new BotError("Dữ liệu phải là JSON hợp lệ."); }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
