import { describe, expect, test } from "bun:test";
import { handleZaloWebhook, type ZaloInboundMessage } from "./webhook";

const secret = "test-webhook-secret";
const event = {
  ok: true,
  result: {
    event_name: "message.text.received",
    message: {
      from: { id: "customer-1", display_name: "Khách thử" },
      chat: { id: "chat-1", chat_type: "PRIVATE" },
      message_id: "message-1",
      date: 1750316131602,
      text: "Tiệm còn mở cửa không?",
    },
  },
};
function request(body = JSON.stringify(event), supplied = secret) {
  return new Request("https://cms.example.com/api/zalo/webhook", {
    method: "POST",
    headers: { "X-Bot-Api-Secret-Token": supplied },
    body,
  });
}
function receiver(overrides = {}) {
  const saved: ZaloInboundMessage[] = [];
  const dependencies = {
    secret,
    botId: "12345",
    saveMessage: async (message: ZaloInboundMessage) => { saved.push(message); },
    ...overrides,
  };
  return { saved, handle: (req: Request) => handleZaloWebhook(req, dependencies) };
}

describe("Zalo webhook receiver", () => {
  test("receives the direct event body used by real Zalo webhook requests", async () => {
    const { saved, handle } = receiver();
    const direct = { ...event.result, message: { ...event.result.message, message_type: "CHAT_TEXT" } };
    const response = await handle(request(JSON.stringify(direct)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, received: true });
    expect(saved[0].message.text).toBe(event.result.message.text);
    expect(saved[0].chatId).toBe(event.result.message.chat.id);
    await handle(request());
    expect(saved[0]._id).toBe(saved[1]._id);
  });
  test("normalizes photo_url from the live Zalo photo contract", async () => {
    const { saved, handle } = receiver();
    const direct = { event_name: "message.image.received", message: { ...event.result.message, text: undefined, message_type: "CHAT_PHOTO", photo_url: "https://example.com/live-photo.jpg", caption: "Ảnh từ Zalo" } };
    expect((await handle(request(JSON.stringify(direct)))).status).toBe(200);
    expect(saved[0].message.photo).toBe(direct.message.photo_url);
    expect(saved[0].message.caption).toBe(direct.message.caption);
  });
  test("does not silently acknowledge a message body missing its event name", async () => {
    const { saved, handle } = receiver();
    expect((await handle(request(JSON.stringify({ message: event.result.message })))).status).toBe(400);
    expect(saved).toHaveLength(0);
  });
  test("rejects absent or incorrect secret without reading or saving messages", async () => {
    const { saved, handle } = receiver();
    for (const value of ["", "wrong-webhook-secret", `${secret}x`]) {
      expect((await handle(request("invalid JSON", value))).status).toBe(403);
    }
    expect(saved).toHaveLength(0);
  });
  test("fails closed when production configuration is missing", async () => {
    expect((await receiver({ secret: undefined }).handle(request())).status).toBe(503);
    expect((await receiver({ botId: undefined }).handle(request())).status).toBe(503);
  });
  test("accepts authenticated verification probes without a database write", async () => {
    const { saved, handle } = receiver();
    for (const body of ["", "{}", '{"ok":true,"result":{"event_name":"webhook.test"}}']) {
      const response = await handle(request(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, received: false });
    }
    expect(saved).toHaveLength(0);
  });
  test("preserves customer, conversation, content and original timestamp", async () => {
    const { saved, handle } = receiver();
    expect((await handle(request())).status).toBe(200);
    expect(saved[0]).toMatchObject({
      botId: "12345", chatId: "chat-1", messageId: "message-1", direction: "inbound",
      eventName: "message.text.received", message: event.result.message,
    });
    expect(saved[0].sentAt.getTime()).toBe(event.result.message.date);
  });
  test("provides a stable storage identity for retries, scoped to bot and chat", async () => {
    const { saved, handle } = receiver();
    await handle(request());
    await handle(request());
    expect(saved[0]._id).toBe(saved[1]._id);
    const anotherBot = receiver({ botId: "67890" });
    await anotherBot.handle(request());
    expect(saved[0]._id).not.toBe(anotherBot.saved[0]._id);
    const anotherChat = structuredClone(event);
    anotherChat.result.message.chat.id = "chat-2";
    await handle(request(JSON.stringify(anotherChat)));
    expect(saved[0]._id).not.toBe(saved[2]._id);
  });
  test("stores group media messages and acknowledges unsupported empty events", async () => {
    const { saved, handle } = receiver();
    const media = { ...event.result.message, chat: { id: "group-1", chat_type: "GROUP" }, text: undefined, photo: "https://example.com/image.jpg", caption: "Ảnh" };
    expect((await handle(request(JSON.stringify({ ok: true, result: { event_name: "message.image.received", message: media } })))).status).toBe(200);
    expect(saved[0].message.photo).toBe(media.photo);
    expect(saved[0].message.chat.chat_type).toBe("GROUP");
    expect((await handle(request('{"ok":true,"result":{"event_name":"message.unsupported.received"}}'))).status).toBe(200);
    expect(saved).toHaveLength(1);
  });
  test("does not acknowledge storage failures or expose underlying errors", async () => {
    const { handle } = receiver({ saveMessage: async () => { throw new Error("private database credentials"); } });
    const response = await handle(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credentials");
  });
  test("rejects malformed events and caps streamed payloads without Content-Length", async () => {
    const { saved, handle } = receiver();
    for (const body of ["not JSON", "null", JSON.stringify({ ok: true, result: { event_name: "message.text.received", message: {} } })]) {
      expect((await handle(request(body))).status).toBe(400);
    }
    expect((await handle(request("x".repeat(65_537)))).status).toBe(413);
    expect(saved).toHaveLength(0);
  });
});
