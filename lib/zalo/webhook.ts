import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const MAX_BODY_BYTES = 64 * 1024;
const messageSchema = z.object({
  from: z.object({
    id: z.string().min(1).max(256),
    display_name: z.string().max(512).optional(),
    is_bot: z.boolean().optional(),
  }),
  chat: z.object({
    id: z.string().min(1).max(256),
    chat_type: z.string().min(1).max(32),
  }),
  message_id: z.string().min(1).max(256),
  date: z.number().int().nonnegative().max(8.64e15),
  message_type: z.string().max(64).optional(),
  text: z.string().max(32_000).optional(),
  photo: z.string().max(8_000).optional(),
  photo_url: z.string().max(8_000).optional(),
  caption: z.string().max(8_000).optional(),
  sticker: z.string().max(8_000).optional(),
  url: z.string().max(8_000).optional(),
  voice_url: z.string().max(8_000).optional(),
});
const envelopeSchema = z.object({
  ok: z.literal(true).optional(),
  // Real webhook requests contain the event directly. getUpdates wraps it in result.
  event_name: z.string().max(128).optional(),
  message: z.unknown().optional(),
  result: z.object({
    event_name: z.string().max(128).optional(),
    message: z.unknown().optional(),
  }).optional(),
});

export type ZaloInboundMessage = {
  _id: string;
  botId: string;
  chatId: string;
  messageId: string;
  direction: "inbound";
  eventName: string;
  message: z.infer<typeof messageSchema>;
  sentAt: Date;
  receivedAt: Date;
};

type WebhookDependencies = {
  secret: string | undefined;
  botId: string | undefined;
  saveMessage: (message: ZaloInboundMessage) => Promise<void>;
  report?: (diagnostic: WebhookDiagnostic) => void;
};

export type WebhookDiagnostic = {
  outcome: "stored" | "ignored" | "rejected" | "storage_error";
  envelope: "direct" | "result";
  eventName?: string;
  reason?: string;
  fields?: string[];
};

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleZaloWebhook(
  request: Request,
  { secret, botId, saveMessage, report }: WebhookDependencies,
): Promise<Response> {
  if (!secret || secret.length < 8 || secret.length > 256 || !botId) {
    return reply(503, { ok: false, message: "Webhook chưa được cấu hình." });
  }
  const supplied = request.headers.get("x-bot-api-secret-token") ?? "";
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length ||
      !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return reply(403, { ok: false, message: "Webhook secret không hợp lệ." });
  }

  // Bound the bytes actually read, including requests without Content-Length.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel();
          return reply(413, { ok: false, message: "Dữ liệu webhook quá lớn." });
        }
        chunks.push(chunk.value);
      }
    }
  } catch {
    return reply(400, { ok: false, message: "Không đọc được dữ liệu webhook." });
  } finally {
    reader?.releaseLock();
  }

  let payload: unknown;
  try {
    const body = Buffer.concat(chunks).toString("utf8");
    payload = body.trim() ? JSON.parse(body) : {};
  } catch {
    return reply(400, { ok: false, message: "Webhook phải là JSON hợp lệ." });
  }
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) {
    return reply(400, { ok: false, message: "Dữ liệu webhook không hợp lệ." });
  }
  const event = envelope.data.result ?? envelope.data;
  const shape = envelope.data.result ? "result" as const : "direct" as const;
  if (!event.event_name && event.message !== undefined) {
    report?.({ outcome: "rejected", envelope: shape, reason: "missing_event_name" });
    return reply(400, { ok: false, message: "Webhook tin nhắn thiếu tên sự kiện." });
  }
  // Authenticated verification probes and future non-message events need no DB.
  if (!event?.event_name?.startsWith("message.") ||
      !event.event_name.endsWith(".received")) {
    report?.({ outcome: "ignored", envelope: shape, reason: "verification_or_non_message_event" });
    return reply(200, { ok: true, received: false });
  }
  // Zalo may suppress message content for unsupported senders.
  if (event.event_name === "message.unsupported.received" && !event.message) {
    report?.({ outcome: "ignored", envelope: shape, eventName: event.event_name, reason: "unsupported_sender" });
    return reply(200, { ok: true, received: false });
  }
  const parsed = messageSchema.safeParse(event.message);
  if (!parsed.success) {
    report?.({ outcome: "rejected", envelope: shape, eventName: event.event_name, reason: "invalid_message", fields: parsed.error.issues.slice(0, 6).map(issue => issue.path.join(".")) });
    return reply(400, { ok: false, message: "Thông tin tin nhắn không hợp lệ." });
  }
  const message = parsed.data;
  // The live Zalo contract names this field photo_url; preserve the internal alias.
  message.photo ??= message.photo_url;
  const id = createHash("sha256")
    .update(JSON.stringify([botId, message.chat.id, message.message_id]))
    .digest("hex");
  try {
    await saveMessage({
      _id: id,
      botId,
      chatId: message.chat.id,
      messageId: message.message_id,
      direction: "inbound",
      eventName: event.event_name,
      message,
      sentAt: new Date(message.date),
      receivedAt: new Date(),
    });
  } catch {
    report?.({ outcome: "storage_error", envelope: shape, eventName: event.event_name });
    // Acknowledge only after durable storage so a DB failure is not a silent loss.
    return reply(503, { ok: false, message: "Chưa lưu được tin nhắn. Vui lòng thử lại." });
  }
  report?.({ outcome: "stored", envelope: shape, eventName: event.event_name });
  return reply(200, { ok: true, received: true });
}
