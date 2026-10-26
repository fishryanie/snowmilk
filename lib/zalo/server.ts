import "server-only";
import { getAuthMongo } from "@/lib/auth/mongo";
import { zaloPhotoSender, zaloTextSender } from "./client";
import { BotError, ZaloStore } from "./store";

let cached: { token: string; store: ZaloStore } | undefined;
export function getZaloStore() {
  const token = process.env.ZALO_BOT_TOKEN;
  if (!token || !/^\d+:.+$/.test(token)) throw new BotError("Chưa cấu hình Zalo Bot trên server.", 503);
  if (!cached || cached.token !== token) {
    cached = { token, store: new ZaloStore(getAuthMongo().db, token.split(":")[0], zaloTextSender(token), zaloPhotoSender(token)) };
  }
  return cached.store;
}
