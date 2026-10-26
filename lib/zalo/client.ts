import "server-only";

export class ZaloSendError extends Error {
  constructor(message: string, readonly deliveryStatus: "failed" | "uncertain") { super(message); }
}
export type SendText = (chatId: string, text: string) => Promise<{ messageId: string; date: number }>;
export type SendPhoto = (chatId: string, photoUrl: string, caption?: string) => Promise<{ messageId: string; date: number }>;

async function send(token: string, method: "sendMessage" | "sendPhoto", body: Record<string, string>) {
    let response: Response;
    try {
      response = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000), redirect: "error",
      });
    } catch {
      throw new ZaloSendError("Mất kết nối khi gửi. Cần kiểm tra trên Zalo trước khi gửi lại.", "uncertain");
    }
    let data;
    try { data = await response.json(); } catch {
      throw new ZaloSendError("Chưa xác định được kết quả gửi từ Zalo.", "uncertain");
    }
    if (data.ok !== true) {
      const code = Number(data.error_code ?? data.errorCode ?? response.status);
      throw new ZaloSendError(`Zalo từ chối gửi tin (mã ${Number.isFinite(code) ? code : "unknown"}).`, "failed");
    }
    if (!response.ok || typeof data.result?.message_id !== "string" || !Number.isFinite(data.result?.date)) {
      throw new ZaloSendError("Chưa xác định được kết quả gửi từ Zalo.", "uncertain");
    }
    return { messageId: data.result.message_id, date: data.result.date };
}

export function zaloTextSender(token: string): SendText {
  return (chatId, text) => send(token, "sendMessage", { chat_id: chatId, text });
}

export function zaloPhotoSender(token: string): SendPhoto {
  return (chatId, photoUrl, caption) => send(token, "sendPhoto", {
    chat_id: chatId, photo: photoUrl, ...(caption ? { caption } : {}),
  });
}
