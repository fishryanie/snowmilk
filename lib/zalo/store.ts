import "server-only";
import { createHash } from "node:crypto";
import type { Db, Document } from "mongodb";
import { z } from "zod";
import { botSettingsSchema, decideAutoReply, defaultBotSettings, type AutoDecision, type BotSettings } from "./automation";
import { ZaloSendError, type SendPhoto, type SendText } from "./client";
import { messagePreview, type ChatMessage, type ConversationSummary, type DeliveryStatus } from "./types";
import type { ZaloInboundMessage } from "./webhook";

export class BotError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
type MessageDoc = Omit<ZaloInboundMessage, "direction"> & {
  direction: "inbound" | "outbound";
  decisionMade?: boolean; autoDecision?: AutoDecision;
  source?: string; ruleLabel?: string; actorName?: string;
  deliveryStatus?: DeliveryStatus; error?: string; updatedAt?: Date;
};
type StateDoc = { _id: string; botId: string; chatId: string; botPaused: boolean; updatedAt: Date; lastHandoffId?: string };
type SettingsDoc = BotSettings & { _id: string; updatedAt: Date; updatedBy: string };
const cursorSchema = z.object({ at: z.iso.datetime(), id: z.string().min(1).max(256) });
const identity = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
function encodeCursor(at: Date, id: string) { return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString("base64url"); }
function decodeCursor(value?: string | null) {
  if (!value) return null;
  try {
    if (value.length > 1500) throw new Error();
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch { throw new BotError("Trang dữ liệu không hợp lệ. Hãy tải lại danh sách."); }
}
function beforeMatch(field: string, idField: string, value?: string | null) {
  const cursor = decodeCursor(value);
  return cursor ? { $or: [
    { [field]: { $lt: new Date(cursor.at) } },
    { [field]: new Date(cursor.at), [idField]: { $lt: cursor.id } },
  ] } : {};
}
function messageDto(doc: MessageDoc): ChatMessage {
  const stale = doc.deliveryStatus === "sending" && Date.now() - (doc.updatedAt ?? doc.receivedAt).getTime() > 120_000;
  return {
    id: doc._id, chatId: doc.chatId, direction: doc.direction,
    text: doc.message.text, photo: doc.message.photo, caption: doc.message.caption,
    voiceUrl: doc.message.voice_url, stickerUrl: doc.message.url,
    senderName: doc.direction === "inbound" ? doc.message.from.display_name || "Khách hàng" : doc.actorName || "Bot Cái Tiệm Sữa",
    sentAt: doc.sentAt.toISOString(), source: doc.source, ruleLabel: doc.ruleLabel,
    deliveryStatus: stale ? "uncertain" : doc.deliveryStatus,
    error: stale ? "Chưa xác định được kết quả gửi. Kiểm tra Zalo trước khi gửi lại." : doc.error,
  };
}

export class ZaloStore {
  private indexes: Promise<unknown> | undefined;
  constructor(readonly db: Db, readonly botId: string, private readonly sendText: SendText, private readonly sendPhoto?: SendPhoto) {}
  get messages() { return this.db.collection<MessageDoc>("zalo_bot_messages"); }
  get states() { return this.db.collection<StateDoc>("zalo_bot_conversations"); }
  get settings() { return this.db.collection<SettingsDoc>("zalo_bot_settings"); }
  async ensureIndexes() {
    this.indexes ??= Promise.all([
      this.messages.createIndex({ botId: 1, chatId: 1, sentAt: -1, _id: -1 }),
      this.messages.createIndex({ botId: 1, sentAt: -1, _id: -1 }),
      this.states.createIndex({ botId: 1, chatId: 1 }, { unique: true }),
    ]).catch(error => { this.indexes = undefined; throw error; });
    await this.indexes;
  }
  async getSettings(): Promise<BotSettings> {
    const doc = await this.settings.findOne({ _id: this.botId });
    return doc ? botSettingsSchema.parse(doc) : defaultBotSettings();
  }
  async saveSettings(input: unknown, userName: string): Promise<BotSettings> {
    const settings = botSettingsSchema.parse(input);
    const saved = { ...settings, revision: settings.revision + 1 };
    const fields = { ...saved, updatedAt: new Date(), updatedBy: userName };
    if (settings.revision === 0) {
      try { await this.settings.insertOne({ _id: this.botId, ...fields }); }
      catch (error) {
        if ((error as { code?: number }).code === 11000) throw new BotError("Cấu hình đã thay đổi. Tải lại trang trước khi lưu.", 409);
        throw error;
      }
    } else {
      const updated = await this.settings.updateOne({ _id: this.botId, revision: settings.revision }, { $set: fields });
      if (!updated.matchedCount) throw new BotError("Cấu hình đã thay đổi. Tải lại trang trước khi lưu.", 409);
    }
    return saved;
  }
  private summaryPipeline(chatId?: string): Document[] {
    return [
      { $match: { botId: this.botId, ...(chatId ? { chatId } : {}) } },
      { $sort: { sentAt: -1, _id: -1 } },
      { $group: {
        _id: "$chatId", latest: { $first: "$$ROOT" }, messageCount: { $sum: 1 },
      } },
      { $lookup: { from: "zalo_bot_messages", let: { chat: "$_id" }, pipeline: [
        { $match: { botId: this.botId, direction: "inbound", $expr: { $eq: ["$chatId", "$$chat"] } } },
        { $sort: { sentAt: -1, _id: -1 } }, { $limit: 1 },
        { $project: { displayName: "$message.from.display_name" } },
      ], as: "customer" } },
      { $lookup: { from: "zalo_bot_conversations", let: { chat: "$_id" }, pipeline: [
        { $match: { botId: this.botId, $expr: { $eq: ["$chatId", "$$chat"] } } },
        { $project: { botPaused: 1 } },
      ], as: "state" } },
      { $set: { lastMessageAt: "$latest.sentAt", displayName: { $arrayElemAt: ["$customer.displayName", 0] }, botPaused: { $ifNull: [{ $arrayElemAt: ["$state.botPaused", 0] }, false] } } },
    ];
  }
  private summaryDto(doc: Document): ConversationSummary {
    return {
      chatId: doc._id, displayName: doc.displayName || doc._id,
      chatType: doc.latest.message.chat.chat_type,
      preview: messagePreview(doc.latest.message).slice(0, 160),
      lastMessageAt: doc.lastMessageAt.toISOString(), messageCount: doc.messageCount,
      botPaused: doc.botPaused,
    };
  }
  async listConversations(q: string, before?: string | null, pausedOnly = false) {
    await this.ensureIndexes();
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rows = await this.messages.aggregate([
      ...this.summaryPipeline(),
      { $match: { $and: [
        beforeMatch("lastMessageAt", "_id", before),
        escaped ? { $or: [{ displayName: { $regex: escaped, $options: "i" } }, { _id: { $regex: escaped, $options: "i" } }] } : {},
        pausedOnly ? { botPaused: true } : {},
      ] } },
      { $sort: { lastMessageAt: -1, _id: -1 } }, { $limit: 31 },
      { $project: { "latest.message": 1, displayName: 1, messageCount: 1, lastMessageAt: 1, botPaused: 1 } },
    ]).toArray();
    const page = rows.slice(0, 30);
    return { conversations: page.map(row => this.summaryDto(row)), nextCursor: rows.length > 30 ? encodeCursor(page[29].lastMessageAt, page[29]._id) : null };
  }
  async conversation(chatId: string, before?: string | null) {
    await this.ensureIndexes();
    const [summary, rows] = await Promise.all([
      this.messages.aggregate(this.summaryPipeline(chatId)).next(),
      this.messages.find({ botId: this.botId, chatId, ...beforeMatch("sentAt", "_id", before) })
        .sort({ sentAt: -1, _id: -1 }).limit(51).toArray(),
    ]);
    if (!summary) throw new BotError("Không tìm thấy hội thoại.", 404);
    const page = rows.slice(0, 50);
    return { conversation: this.summaryDto(summary), messages: page.reverse().map(messageDto), nextCursor: rows.length > 50 ? encodeCursor(rows[49].sentAt, rows[49]._id) : null };
  }
  private async requireConversation(chatId: string) {
    const conversation = await this.messages.findOne({ botId: this.botId, chatId, direction: "inbound" }, { projection: { _id: 1, "message.chat.chat_type": 1 } });
    if (!conversation) {
      throw new BotError("Chỉ có thể gửi tin trong hội thoại khách đã nhắn cho bot.", 404);
    }
    return conversation;
  }
  async setPaused(chatId: string, paused: boolean) {
    await this.requireConversation(chatId);
    await this.states.updateOne({ _id: identity(this.botId, chatId) }, {
      $set: { botId: this.botId, chatId, botPaused: paused, updatedAt: new Date() },
    }, { upsert: true });
    return { botPaused: paused };
  }
  private async queue(chatId: string, id: string, text: string, source: string, ruleLabel?: string, actorName?: string, photoUrl?: string) {
    const now = new Date();
    const doc: MessageDoc = {
      _id: id, botId: this.botId, chatId, messageId: id, direction: "outbound",
      eventName: photoUrl ? "message.image.sent" : "message.text.sent", sentAt: now, receivedAt: now, updatedAt: now,
      source, ruleLabel, actorName, deliveryStatus: "pending",
      message: { from: { id: this.botId, display_name: "Bot Cái Tiệm Sữa", is_bot: true }, chat: { id: chatId, chat_type: "PRIVATE" },
        ...(photoUrl ? { photo: photoUrl, ...(text ? { caption: text } : {}) } : { text }),
        message_id: id, date: now.getTime() },
    };
    const { _id, ...fields } = doc;
    await this.messages.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    return doc;
  }
  private async dispatch(id: string, retryFailed = false): Promise<ChatMessage> {
    // A unique outbox record plus atomic claim prevents duplicate webhook/manual retries.
    const claimed = await this.messages.findOneAndUpdate({ _id: id, botId: this.botId,
      deliveryStatus: { $in: retryFailed ? ["pending", "failed"] : ["pending"] },
    }, { $set: { deliveryStatus: "sending", updatedAt: new Date() }, $unset: { error: "" } }, { returnDocument: "after" });
    if (claimed) {
      try {
        let receipt;
        if (claimed.message.photo) {
          if (!this.sendPhoto) throw new ZaloSendError("Chưa cấu hình chức năng gửi ảnh.", "failed");
          receipt = await this.sendPhoto(claimed.chatId, claimed.message.photo, claimed.message.caption);
        } else receipt = await this.sendText(claimed.chatId, claimed.message.text!);
        await this.messages.updateOne({ _id: id }, { $set: {
          deliveryStatus: "sent", messageId: receipt.messageId, "message.message_id": receipt.messageId,
          "message.date": receipt.date, sentAt: new Date(receipt.date), updatedAt: new Date(),
        }, $unset: { error: "" } });
      } catch (error) {
        const known = error instanceof ZaloSendError;
        await this.messages.updateOne({ _id: id }, { $set: {
          deliveryStatus: known ? error.deliveryStatus : "uncertain",
          error: known ? error.message : "Chưa xác định được kết quả gửi. Kiểm tra Zalo trước khi gửi lại.",
          updatedAt: new Date(),
        } });
      }
    }
    const saved = await this.messages.findOne({ _id: id, botId: this.botId });
    if (!saved) throw new BotError("Không tìm thấy kết quả gửi.", 503);
    return messageDto(saved);
  }
  async sendManual(chatId: string, text: string, requestId: string, userName: string) {
    await this.ensureIndexes();
    const conversation = await this.requireConversation(chatId);
    if (conversation.message.chat.chat_type !== "PRIVATE") throw new BotError("Tính năng trả lời thủ công hiện dùng cho hội thoại cá nhân.");
    const id = identity("manual", this.botId, chatId, requestId);
    const existing = await this.messages.findOne({ _id: id });
    if (existing && existing.message.text !== text) throw new BotError("Mã gửi đã dùng cho nội dung khác. Hãy soạn tin mới.", 409);
    await this.setPaused(chatId, true);
    await this.queue(chatId, id, text, "manual", undefined, userName);
    return this.dispatch(id, true);
  }
  async ingest(message: ZaloInboundMessage) {
    await this.ensureIndexes();
    const { _id, ...fields } = message;
    await this.messages.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
    let stored = await this.messages.findOne({ _id });
    if (!stored) throw new Error("Inbound message was not stored");
    if (!stored.decisionMade) {
      const [settings, state, firstTwo] = await Promise.all([
        this.getSettings(), this.states.findOne({ _id: identity(this.botId, message.chatId) }),
        this.messages.find({ botId: this.botId, chatId: message.chatId, direction: "inbound" }, { projection: { _id: 1 } }).limit(2).toArray(),
      ]);
      const decision = Date.now() - message.sentAt.getTime() > 15 * 60_000 ? null : decideAutoReply(settings, message.message.text ?? message.message.caption, {
        firstMessage: firstTwo.length === 1, name: message.message.from.display_name,
        chatType: message.message.chat.chat_type, isBot: message.message.from.is_bot || message.message.from.id === this.botId, paused: state?.botPaused,
      });
      await this.messages.updateOne({ _id, decisionMade: { $ne: true } }, { $set: { decisionMade: true, autoDecision: decision } });
      stored = (await this.messages.findOne({ _id }))!;
    }
    const decision = stored.autoDecision;
    if (!decision) return;
    const id = identity("auto", this.botId, _id);
    await this.queue(message.chatId, id, decision.text, decision.source, decision.ruleLabel, undefined, decision.photoUrl);
    if (decision.handoff) {
      const stateId = identity(this.botId, message.chatId);
      const fields = { botId: this.botId, chatId: message.chatId, botPaused: true, updatedAt: new Date(), lastHandoffId: _id };
      await this.states.updateOne({ _id: stateId }, { $setOnInsert: fields }, { upsert: true });
      // A duplicate handoff event must not pause a conversation staff resumed later.
      await this.states.updateOne({ _id: stateId, lastHandoffId: { $ne: _id } }, { $set: fields });
    }
    await this.dispatch(id);
  }
}
