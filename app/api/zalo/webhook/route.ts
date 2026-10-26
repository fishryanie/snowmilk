import { getZaloStore } from "@/lib/zalo/server";
import { handleZaloWebhook } from "@/lib/zalo/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleZaloWebhook(request, {
    secret: process.env.ZALO_WEBHOOK_SECRET,
    botId: process.env.ZALO_BOT_TOKEN?.split(":")[0],
    report(diagnostic) {
      // Shape/status only: never log message content, sender IDs or secret headers.
      console.info("zalo.webhook", JSON.stringify(diagnostic));
    },
    async saveMessage(message) {
      await getZaloStore().ingest(message);
    },
  });
}
