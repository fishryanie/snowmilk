/** Browser/DOM fixtures only. No database connection and no real Zalo requests. */
import { defaultBotSettings } from "../lib/zalo/automation";
import type { ChatMessage, ConversationSummary } from "../lib/zalo/types";

export function installZaloTestFetch() {
  let writable = true;
  let identity = "fixture";
  let loseNextReply = false;
  let settings = defaultBotSettings();
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  const sent = new Map<string, ChatMessage>();
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 26, 7, minute)).toISOString();
  const conversations: ConversationSummary[] = [
    { chatId: "customer-an", displayName: "Khách thử · An", chatType: "PRIVATE", preview: "Tiệm đã chuyển cuộc trò chuyện sang nhân viên.", lastMessageAt: at(10), messageCount: 6, botPaused: true },
    { chatId: "customer-linh", displayName: "Khách thử · Linh", chatType: "PRIVATE", preview: "Mình xem menu ở đâu ạ?", lastMessageAt: at(2), messageCount: 2, botPaused: false },
  ];
  const messages: ChatMessage[] = [
    { id: "1", chatId: "customer-an", direction: "inbound", text: "Tin cũ của khách: Xin chào tiệm!", senderName: "Khách thử · An", sentAt: at(5) },
    { id: "2", chatId: "customer-an", direction: "outbound", text: "Chào An, Cái Tiệm Sữa có thể hỗ trợ bạn nhé!\n\nBạn nhập số tương ứng hoặc nhắn nội dung cần hỗ trợ:\n1. Xem menu & đặt món\n2. Giao hàng & thanh toán\n3. Gặp nhân viên", senderName: "Bot", sentAt: at(6), source: "menu", deliveryStatus: "sent" },
    { id: "3", chatId: "customer-an", direction: "inbound", text: "1", senderName: "Khách thử · An", sentAt: at(7) },
    { id: "4", chatId: "customer-an", direction: "outbound", text: "Bạn xem menu, giá món và đặt hàng tại https://caitiemsua.com nhé.", senderName: "Bot", sentAt: at(8), source: "rule", ruleLabel: "Xem menu & đặt món", deliveryStatus: "sent" },
    { id: "5", chatId: "customer-an", direction: "inbound", text: "Mình muốn gặp nhân viên tư vấn thêm", senderName: "Khách thử · An", sentAt: at(9) },
    { id: "6", chatId: "customer-an", direction: "outbound", text: "Tiệm đã ghi nhận yêu cầu của bạn. Cuộc trò chuyện đã chuyển sang chờ nhân viên hỗ trợ.", senderName: "Bot", sentAt: at(10), source: "rule", ruleLabel: "Gặp nhân viên", deliveryStatus: "sent" },
    { id: "7", chatId: "customer-linh", direction: "inbound", text: "Mình xem menu ở đâu ạ?", senderName: "Khách thử · Linh", sentAt: at(2) },
  ];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input);
    const url = new URL(raw, "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    requests.push({ url: raw, method, body });
    let data: unknown;
    if (url.pathname === "/api/v2/auth/me") {
      data = { userId: identity, userName: "Nhân viên thử", organizationId: identity === "outsider" ? "other-shop" : "fixture", role: writable ? "owner" : "viewer", permissions: writable ? ["sales:read", "sales:write", "settings:manage"] : ["sales:read"] };
    } else if (identity === "outsider") {
      return Response.json({ success: false, message: "Không có quyền xem hội thoại cửa hàng này." }, { status: 403 });
    } else if (url.pathname === "/api/zalo-admin/settings") {
      if (method === "PUT") settings = { ...body, revision: settings.revision + 1 };
      data = { settings, configured: true };
    } else if (url.pathname === "/api/zalo-admin/images" && method === "POST") {
      data = { photoUrl: "https://images.example.test/menu.jpg" };
    } else if (url.pathname === "/api/zalo-admin/conversations") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      data = { conversations: conversations.filter(chat => chat.displayName.toLowerCase().includes(q) && (url.searchParams.get("paused") !== "1" || chat.botPaused)), nextCursor: null };
    } else {
      const parts = url.pathname.split("/");
      const chatId = decodeURIComponent(parts[4]);
      const conversation = conversations.find(chat => chat.chatId === chatId);
      if (!conversation) return Response.json({ success: false, message: "Không tìm thấy hội thoại." }, { status: 404 });
      if (method === "PATCH") { conversation.botPaused = body.botPaused; data = { botPaused: conversation.botPaused }; }
      else if (method === "POST") {
        let message = sent.get(body.requestId);
        if (!message) {
          message = { id: `manual-${sent.size}`, chatId, direction: "outbound", text: body.text, senderName: "Nhân viên thử", sentAt: at(11), source: "manual", deliveryStatus: "sent" };
          sent.set(body.requestId, message); messages.push(message); conversation.botPaused = true;
        }
        if (loseNextReply) { loseNextReply = false; throw new Error("Mất phản hồi thử nghiệm"); }
        data = message;
      } else {
        const all = messages.filter(message => message.chatId === chatId);
        const older = url.searchParams.has("before");
        data = { conversation, messages: older ? all.slice(0, 4) : all.slice(4), nextCursor: !older && all.length > 4 ? "older" : null };
      }
    }
    return Response.json({ success: true, data });
  }) as typeof fetch;
  return { fetcher, requests, setWritable(value: boolean) { writable = value; }, setIdentity(value: string) { identity = value; }, loseNextReply() { loseNextReply = true; }, sent };
}
