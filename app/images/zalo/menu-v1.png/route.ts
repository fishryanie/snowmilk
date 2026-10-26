import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const image = await readFile(path.join(process.cwd(), "src/assets/zalo/menu-v1.png"));
  return new Response(new Uint8Array(image), { headers: {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  } });
}
