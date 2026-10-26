import type { BotSettings } from "./automation";

export const MAX_MENU_IMAGE_BYTES = 2 * 1024 * 1024;

export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "uncertain";
export type ChatMessage = {
  id: string; chatId: string; direction: "inbound" | "outbound";
  text?: string; photo?: string; caption?: string; voiceUrl?: string; stickerUrl?: string;
  senderName: string; sentAt: string; source?: string; ruleLabel?: string;
  deliveryStatus?: DeliveryStatus; error?: string;
};
export type ConversationSummary = {
  chatId: string; displayName: string; chatType: string; preview: string;
  lastMessageAt: string; messageCount: number; botPaused: boolean;
};
export type ConversationList = { conversations: ConversationSummary[]; nextCursor: string | null };
export type ConversationPage = {
  conversation: ConversationSummary; messages: ChatMessage[]; nextCursor: string | null;
};
export type SettingsResponse = { settings: BotSettings; configured: boolean };

export function messagePreview(message: { text?: string; photo?: string; voice_url?: string; caption?: string; url?: string }) {
  return message.text || message.caption || (message.photo ? "Hình ảnh" : message.voice_url ? "Tin nhắn thoại" : message.url ? "Nhãn dán" : "Tin nhắn chưa hỗ trợ");
}
export function safeMediaUrl(value: string | undefined) {
  if (!value) return undefined;
  try { return new URL(value).protocol === "https:" ? value : undefined; } catch { return undefined; }
}
