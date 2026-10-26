import { getAuthMongo } from "@/lib/auth/mongo";
import { ZaloMenuImages } from "@/lib/zalo/media";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const image = await new ZaloMenuImages(getAuthMongo().db).read(id);
    if (!image) return new Response(null, { status: 404 });
    const headers = {
      "Content-Type": image.mime, "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `inline; filename="menu-${id.slice(0, 12)}.jpg"`, ETag: `"${id}"`,
    };
    if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(image.data), { headers });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
