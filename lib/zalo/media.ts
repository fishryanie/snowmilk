import "server-only";
import { createHash } from "node:crypto";
import { Binary, type Db } from "mongodb";
import sharp from "sharp";
import { BotError } from "./store";
import { MAX_MENU_IMAGE_BYTES } from "./types";

type MenuImage = { _id: string; botId: string; data: Binary; mime: "image/jpeg"; createdAt: Date };
export class ZaloMenuImages {
  constructor(private readonly db: Db) {}
  async upload(botId: string, base64: string) {
    if (!base64 || base64.length > Math.ceil(MAX_MENU_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new BotError("Chọn ảnh JPG, PNG hoặc WebP tối đa 2 MB.");
    }
    const raw = Buffer.from(base64, "base64");
    if (raw.length > MAX_MENU_IMAGE_BYTES) throw new BotError("Ảnh tối đa 2 MB.", 413);
    const jpeg = raw.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff;
    const png = raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = raw.length >= 12 && raw.toString("ascii", 0, 4) === "RIFF" && raw.toString("ascii", 8, 12) === "WEBP";
    if (!jpeg && !png && !webp) throw new BotError("Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP tĩnh.");
    let data: Buffer;
    try {
      const image = sharp(raw, { limitInputPixels: 20_000_000 });
      const meta = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) {
        throw new Error("Unsupported image");
      }
      // Preserve menu resolution, apply phone orientation and remove EXIF metadata.
      data = await image.rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
    } catch { throw new BotError("Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP tĩnh."); }
    if (data.length > 3 * 1024 * 1024) throw new BotError("Ảnh sau xử lý quá lớn. Hãy chọn ảnh nhỏ hơn.", 413);
    const id = createHash("sha256").update(botId).update("\0").update(data).digest("hex");
    await this.db.collection<MenuImage>("zalo_bot_media").updateOne({ _id: id }, {
      $setOnInsert: { botId, data: new Binary(data), mime: "image/jpeg", createdAt: new Date() },
    }, { upsert: true });
    return id;
  }
  async read(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) return null;
    const doc = await this.db.collection<MenuImage>("zalo_bot_media").findOne({ _id: id });
    return doc ? { data: Buffer.from(doc.data.buffer), mime: doc.mime } : null;
  }
}
