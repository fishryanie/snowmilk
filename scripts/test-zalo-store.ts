/** Isolated local MongoDB plus a fake Zalo sender. Never uses the application DB. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { MongoClient } from "mongodb";
import { ZaloStore } from "../lib/zalo/store";
import { ZaloSendError, zaloPhotoSender } from "../lib/zalo/client";
import { ZaloMenuImages } from "../lib/zalo/media";
import sharp from "sharp";
import { handleZaloWebhook, type ZaloInboundMessage } from "../lib/zalo/webhook";

const directory = await mkdtemp(join(tmpdir(), "snowmilk-zalo-test-"));
const reserve = createServer();
await new Promise<void>(resolve => reserve.listen(0, "127.0.0.1", resolve));
const port = (reserve.address() as { port: number }).port;
await new Promise<void>(resolve => reserve.close(() => resolve()));
const mongod = spawn("mongod", ["--dbpath", directory, "--port", String(port), "--bind_ip", "127.0.0.1", "--quiet", "--logpath", join(directory, "mongo.log")], { stdio: "ignore" });
const uri = `mongodb://127.0.0.1:${port}`;
assert.ok(uri.startsWith("mongodb://127.0.0.1:"));
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 400 });
let calls = 0;
let sendMode = "success";
let checked = 0;
const send = async () => {
  calls++;
  await new Promise(resolve => setTimeout(resolve, 15));
  if (sendMode === "failed") throw new ZaloSendError("Zalo từ chối thử nghiệm.", "failed");
  if (sendMode === "uncertain") throw new ZaloSendError("Mất phản hồi thử nghiệm.", "uncertain");
  return { messageId: `zalo-${calls}`, date: Date.now() };
};
function incoming(id: string, text = "1", chatId = "customer-1", overrides: Partial<ZaloInboundMessage> = {}): ZaloInboundMessage {
  const now = new Date();
  return {
    _id: createHash("sha256").update(JSON.stringify(["test-bot", chatId, id])).digest("hex"),
    botId: "test-bot", chatId, messageId: id, direction: "inbound", eventName: "message.text.received",
    message: { from: { id: chatId, display_name: chatId === "customer-1" ? "Khách Có Dấu" : chatId }, chat: { id: chatId, chat_type: "PRIVATE" }, message_id: id, date: now.getTime(), text },
    sentAt: now, receivedAt: now, ...overrides,
  };
}
try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await client.connect(); connected = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
  }
  assert.ok(connected, "Local test MongoDB must start");
  const db = client.db(`snowmilk_zalo_test_${randomUUID().replaceAll("-", "")}`);
  const store = new ZaloStore(db, "test-bot", send, send);
  let settings = await store.getSettings();
  assert.equal(settings.mode, "hybrid");
  settings = await store.saveSettings({ ...settings, enabled: false }, "Tester");
  await assert.rejects(() => store.saveSettings({ ...settings, revision: 0 }, "Stale"), /đã thay đổi/);
  checked++;

  await store.ingest(incoming("initial", "xin chào"));
  assert.equal(calls, 0);
  assert.equal((await store.listConversations("Có")).conversations[0].displayName, "Khách Có Dấu");
  settings = await store.saveSettings({ ...settings, enabled: true }, "Tester");
  const order = incoming("order");
  await Promise.all([store.ingest(order), store.ingest(order), store.ingest(order)]);
  assert.equal(calls, 1, "Concurrent duplicate webhooks may send only one reply");
  assert.equal((await store.conversation("customer-1")).messages.filter(message => message.direction === "outbound").length, 1);
  checked++;

  const requestId = randomUUID();
  await Promise.all([store.sendManual("customer-1", "Nhân viên hỗ trợ nhé", requestId, "Staff"), store.sendManual("customer-1", "Nhân viên hỗ trợ nhé", requestId, "Staff")]);
  assert.equal(calls, 2);
  assert.equal((await store.conversation("customer-1")).conversation.botPaused, true);
  await store.ingest(incoming("while-paused")); assert.equal(calls, 2);
  await assert.rejects(() => store.sendManual("customer-1", "Changed text", requestId, "Staff"), /nội dung khác/);
  await assert.rejects(() => store.sendManual("unknown-customer", "No", randomUUID(), "Staff"), /khách đã nhắn/);
  checked++;

  await store.setPaused("customer-1", false);
  const handoff = incoming("handoff", "3");
  await store.ingest(handoff); assert.equal(calls, 3);
  assert.equal((await store.conversation("customer-1")).conversation.botPaused, true);
  await store.setPaused("customer-1", false);
  await store.ingest(handoff);
  assert.equal((await store.conversation("customer-1")).conversation.botPaused, false, "Duplicate handoff must not undo staff resume");
  checked++;

  await store.ingest(incoming("old", "1", "customer-old", { sentAt: new Date(Date.now() - 3600_000) }));
  const group = incoming("group", "1", "group"); group.message.chat.chat_type = "GROUP";
  await store.ingest(group);
  const bot = incoming("bot", "1", "bot"); bot.message.from.is_bot = true;
  await store.ingest(bot); assert.equal(calls, 3);
  checked++;

  sendMode = "failed";
  const failure = incoming("failure", "1", "failure-customer");
  await store.ingest(failure); await store.ingest(failure);
  assert.equal(calls, 4);
  assert.equal((await store.conversation("failure-customer")).messages.at(-1)?.deliveryStatus, "failed");
  sendMode = "uncertain";
  const uncertainId = randomUUID();
  const uncertain = await store.sendManual("customer-1", "Test mất phản hồi", uncertainId, "Staff");
  assert.equal(uncertain.deliveryStatus, "uncertain");
  await store.sendManual("customer-1", "Test mất phản hồi", uncertainId, "Staff");
  assert.equal(calls, 5, "Uncertain sends must never be retried automatically");
  checked++;

  sendMode = "failed";
  const failedId = randomUUID();
  assert.equal((await store.sendManual("customer-1", "Thử lại có chủ đích", failedId, "Staff")).deliveryStatus, "failed");
  sendMode = "success";
  assert.equal((await store.sendManual("customer-1", "Thử lại có chủ đích", failedId, "Staff")).deliveryStatus, "sent");
  assert.equal(calls, 7);
  checked++;

  settings = await store.saveSettings({ ...settings, enabled: false }, "Tester");
  for (let i = 0; i < 35; i++) await store.ingest(incoming(`page-${i}`, "xin chào", `Paging ${String(i).padStart(2, "0")}`));
  const first = await store.listConversations("Paging");
  assert.equal(first.conversations.length, 30); assert.ok(first.nextCursor);
  const second = await store.listConversations("Paging", first.nextCursor);
  assert.equal(second.conversations.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.conversations, ...second.conversations].map(chat => chat.chatId)).size, 35);
  await assert.rejects(() => store.listConversations("", "bad-cursor"), /Trang dữ liệu/);
  checked++;

  for (let i = 0; i < 56; i++) await store.ingest(incoming(`history-${i}`, `Tin ${i}`, "history"));
  const latest = await store.conversation("history"); assert.equal(latest.messages.length, 50); assert.ok(latest.nextCursor);
  const older = await store.conversation("history", latest.nextCursor); assert.equal(older.messages.length, 6);
  assert.equal(new Set([...latest.messages, ...older.messages].map(message => message.id)).size, 56);
  const other = new ZaloStore(db, "another-bot", send);
  assert.equal((await other.listConversations("")).conversations.length, 0);
  checked++;

  // Exercise the published live webhook contract through parsing, storage, reply
  // planning and the outbox. A health probe alone does not cover this path.
  let contractCalls = 0;
  const contractSend = async () => {
    contractCalls++;
    return { messageId: "contract-reply", date: Date.now() };
  };
  const contract = new ZaloStore(db, "contract-bot", contractSend, contractSend);
  const liveBody = { event_name: "message.text.received", message: {
    message_id: "live-contract-message", date: Date.now(), message_type: "CHAT_TEXT",
    from: { id: "contract-customer", display_name: "Khách hợp đồng API", is_bot: false },
    chat: { id: "contract-customer", chat_type: "PRIVATE" }, text: "1",
  } };
  for (const body of [liveBody, { ok: true, result: liveBody }]) {
    const response = await handleZaloWebhook(new Request("https://example.com/api/zalo/webhook", {
      method: "POST", headers: { "X-Bot-Api-Secret-Token": "contract-secret" }, body: JSON.stringify(body),
    }), { secret: "contract-secret", botId: "contract-bot", saveMessage: message => contract.ingest(message) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, received: true });
  }
  assert.equal(contractCalls, 1, "Direct and wrapped deliveries of the same event send only one reply");
  const contractHistory = await contract.conversation("contract-customer");
  assert.equal(contractHistory.messages.length, 2);
  assert.equal(contractHistory.messages[0].direction, "inbound");
  assert.equal(contractHistory.messages[1].deliveryStatus, "sent");
  checked++;

  const images = new ZaloMenuImages(db);
  const png = await sharp({ create: { width: 240, height: 120, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const id = await images.upload("photo-bot", png.toString("base64"));
  assert.equal(await images.upload("photo-bot", png.toString("base64")), id);
  const storedImage = await images.read(id); assert.ok(storedImage);
  const dimensions = await sharp(storedImage.data).metadata();
  assert.equal(dimensions.format, "jpeg"); assert.equal(dimensions.width, 240); assert.equal(dimensions.height, 120);
  await assert.rejects(() => images.upload("photo-bot", Buffer.from("<svg></svg>").toString("base64")), /Không đọc được ảnh/);
  await assert.rejects(() => images.upload("photo-bot", "A".repeat(3_000_000)), /tối đa 2 MB/);
  assert.equal(await images.read("not-an-id"), null);
  checked++;

  const photoCalls: Array<{ url: string; caption?: string }> = [];
  let photoTextCalls = 0;
  const photoStore = new ZaloStore(db, "photo-bot", async () => {
    photoTextCalls++; return { messageId: "unexpected-text", date: Date.now() };
  }, async (_chatId, url, caption) => {
    photoCalls.push({ url, caption }); return { messageId: `photo-${photoCalls.length}`, date: Date.now() };
  });
  const photoSettings = await photoStore.getSettings();
  photoSettings.rules[0].photoUrl = `https://cms.example.com/api/zalo/media/${id}`;
  photoSettings.rules[0].response = "Menu của tiệm đây nhé!";
  await photoStore.saveSettings(photoSettings, "Tester");
  const photoBody = { ...liveBody, message: { ...liveBody.message, message_id: "photo-request", date: Date.now() } };
  for (let repeat = 0; repeat < 2; repeat++) {
    assert.equal((await handleZaloWebhook(new Request("https://example.com/webhook", {
      method: "POST", headers: { "X-Bot-Api-Secret-Token": "contract-secret" }, body: JSON.stringify(photoBody),
    }), { secret: "contract-secret", botId: "photo-bot", saveMessage: message => photoStore.ingest(message) })).status, 200);
  }
  assert.equal(photoCalls.length, 1); assert.equal(photoTextCalls, 0);
  assert.equal(photoCalls[0].url, photoSettings.rules[0].photoUrl);
  assert.ok(photoCalls[0].caption?.includes("Menu của tiệm"));
  const imageHistory = await photoStore.conversation("contract-customer");
  assert.equal(imageHistory.messages.at(-1)?.photo, photoCalls[0].url);
  assert.equal(imageHistory.messages.at(-1)?.deliveryStatus, "sent");
  assert.equal(imageHistory.messages.at(-1)?.text, undefined);
  const nextPng = await sharp({ create: { width: 240, height: 120, channels: 3, background: "#0862c0" } }).png().toBuffer();
  const nextId = await images.upload("photo-bot", nextPng.toString("base64"));
  assert.notEqual(nextId, id);
  assert.deepEqual((await images.read(id))?.data, storedImage.data, "Updating a menu must preserve old chat image URLs");
  checked++;

  const originalFetch = globalThis.fetch;
  const photoRequests: Array<{ method: string; payload: Record<string, string> }> = [];
  try {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      photoRequests.push({ method: String(url).split("/").at(-1)!, payload: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: { message_id: "photo-contract", date: Date.now() } });
    }) as typeof fetch;
    const sender = zaloPhotoSender("test-only-token");
    await sender("customer", photoCalls[0].url, "Menu của tiệm");
    await sender("customer", photoCalls[0].url);
    assert.equal(photoRequests[0].method, "sendPhoto");
    assert.deepEqual(photoRequests[0].payload, { chat_id: "customer", photo: photoCalls[0].url, caption: "Menu của tiệm" });
    assert.equal(photoRequests[1].payload.caption, undefined);
    assert.equal("text" in photoRequests[0].payload, false);
  } finally { globalThis.fetch = originalFetch; }
  checked++;

  console.log(JSON.stringify({ passed: checked, realDatabase: "temporary localhost MongoDB", realZaloRequests: 0 }));
} finally {
  await client.close();
  mongod.kill("SIGTERM");
  await new Promise(resolve => { if (mongod.exitCode !== null) resolve(undefined); else mongod.once("exit", resolve); });
  await rm(directory, { recursive: true, force: true });
}
