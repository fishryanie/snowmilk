import {
  ObjectId,
  type Db,
  type MongoClient,
  type ClientSession,
  type Binary,
} from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import {
  defaultSettings,
  getMaxToppings,
  type ShopProduct,
  type ShopSettings,
  type ShopOrder,
  type OrderStatus,
  type PaymentMethod,
  type CartLine,
  type Customer,
} from "./types";
import {
  CommerceError,
  checkoutSchema,
  productUpdateSchema,
  productDeleteSchema,
  settingsSchema,
} from "./validation";
import { quoteCart, transitions } from "./quote";

type ProductDoc = Omit<ShopProduct, "id"> & {
  _id: ObjectId;
  storeId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};
type SettingsDoc = ShopSettings & { _id: string; updatedAt: Date };
type OrderDoc = Omit<
  ShopOrder,
  "id" | "createdAt" | "updatedAt" | "expiresAt" | "hasReceipt" | "paymentMethod"
> & {
  _id: ObjectId;
  storeId: string;
  ownerHash: string;
  idempotencyKey: string;
  requestHash: string;
  paymentMethod?: PaymentMethod;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  receipt?: { data: Binary | Buffer; mime: string; uploadedAt: Date };
};
const productDto = ({
  _id,
  name,
  category,
  description,
  price,
  imageUrl,
  imagePosition,
  badge,
  unit,
  status,
  stock,
  toppings,
  toppingSelection,
  maxToppings,
  sortOrder,
  revision,
}: ProductDoc): ShopProduct => ({
  id: String(_id),
  name,
  category,
  description,
  price,
  imageUrl,
  imagePosition,
  badge,
  unit,
  status,
  stock,
  toppings,
  maxToppings: getMaxToppings({ maxToppings, toppingSelection }),
  sortOrder,
  revision,
});
const orderDto = (o: OrderDoc): ShopOrder => ({
  id: String(o._id),
  code: o.code,
  status: o.status,
  paymentMethod: o.paymentMethod || (o.payment?.qrImage || o.events.some((event) => event.status === "awaiting_payment" || event.status === "payment_review") ? "bank_transfer" : "cod"),
  quote: o.quote,
  customer: o.customer,
  createdAt: o.createdAt.toISOString(),
  updatedAt: o.updatedAt.toISOString(),
  expiresAt: o.expiresAt.toISOString(),
  events: o.events,
  hasReceipt: Boolean(o.receipt),
  payment: o.payment,
});
export const ownerHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class CommerceStore {
  constructor(
    readonly db: Db,
    readonly client: MongoClient,
    readonly storeId: string,
  ) {}
  get products() {
    return this.db.collection<ProductDoc>("storefront_products");
  }
  get orders() {
    return this.db.collection<OrderDoc>("storefront_orders");
  }
  async settings(session?: ClientSession): Promise<ShopSettings> {
    const doc = await this.db
      .collection<SettingsDoc>("storefront_settings")
      .findOne({ _id: this.storeId }, { session });
    if (!doc) return { ...defaultSettings };
    const { _id: _id, updatedAt: _updated, ...settings } = doc;
    return settings;
  }
  async catalog(admin = false, session?: ClientSession) {
    const products = await this.products
      .find(
        {
          storeId: this.storeId,
          ...(admin ? {} : { status: { $ne: "hidden" } }),
        },
        { session },
      )
      .sort({ sortOrder: 1, createdAt: 1 })
      .limit(500)
      .toArray();
    return {
      products: products.map(productDto),
      settings: await this.settings(session),
    };
  }
  async quote(cart: CartLine[], session?: ClientSession) {
    const products = await this.products
      .find(
        {
          storeId: this.storeId,
          _id: { $in: cart.map((l) => new ObjectId(l.productId)) },
        },
        { session },
      )
      .toArray();
    return quoteCart(
      cart,
      products.map(productDto),
      await this.settings(session),
    );
  }
  async saveProduct(input: unknown, id?: string) {
    const { expectedRevision, ...product } = productUpdateSchema.parse(input);
    const now = new Date();
    if (id) {
      if (!ObjectId.isValid(id))
        throw new CommerceError("Mã sản phẩm không hợp lệ.");
      if (expectedRevision === undefined)
        throw new CommerceError("Tải lại sản phẩm trước khi lưu.", 409);
      const result = await this.products.updateOne(
        {
          _id: new ObjectId(id),
          storeId: this.storeId,
          revision: expectedRevision,
        },
        { $set: { ...product, updatedAt: now }, $inc: { revision: 1 } },
      );
      if (!result.matchedCount)
        throw new CommerceError(
          "Món vừa có đơn mới hoặc đã được sửa. Giữ bản nháp, tải lại menu và kiểm tra số lượng trước khi lưu.",
          409,
        );
      return { id };
    }
    if ((await this.products.countDocuments({ storeId: this.storeId })) >= 500)
      throw new CommerceError("Menu tối đa 500 sản phẩm.");
    const result = await this.products.insertOne({
      ...product,
      _id: new ObjectId(),
      storeId: this.storeId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { id: String(result.insertedId) };
  }
  async deleteProduct(input: unknown, id: string) {
    const { expectedRevision } = productDeleteSchema.parse(input);
    if (!ObjectId.isValid(id))
      throw new CommerceError("Mã sản phẩm không hợp lệ.");
    const result = await this.products.deleteOne({
      _id: new ObjectId(id),
      storeId: this.storeId,
      revision: expectedRevision,
    });
    if (!result.deletedCount)
      throw new CommerceError(
        "Món vừa có đơn mới, đã được sửa hoặc đã bị xóa. Tải lại menu trước khi xóa.",
        409,
      );
    return { deleted: true };
  }
  async saveSettings(input: unknown) {
    const settings = settingsSchema.parse(input);
    await this.db
      .collection<SettingsDoc>("storefront_settings")
      .updateOne(
        { _id: this.storeId },
        { $set: { ...settings, updatedAt: new Date() } },
        { upsert: true },
      );
    return settings;
  }
  async transaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      const result = await session.withTransaction(() => fn(session), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
  async release(o: OrderDoc, session: ClientSession) {
    for (const line of o.quote.lines) {
      await this.products.updateOne(
        {
          _id: new ObjectId(line.productId),
          storeId: this.storeId,
          stock: { $gte: 0 },
        },
        {
          $inc: { stock: line.quantity, revision: 1 },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    }
  }
  async expire() {
    const stale = await this.orders
      .find(
        {
          storeId: this.storeId,
          status: "awaiting_payment",
          expiresAt: { $lte: new Date() },
        },
        { projection: { _id: 1 } },
      )
      .limit(100)
      .toArray();
    for (const item of stale) {
      await this.transaction(async (session) => {
        const o = await this.orders.findOne(
          {
            _id: item._id,
            storeId: this.storeId,
            status: "awaiting_payment",
            expiresAt: { $lte: new Date() },
          },
          { session },
        );
        if (!o) return;
        await this.orders.updateOne(
          { _id: o._id, status: "awaiting_payment" },
          {
            $set: { status: "expired", updatedAt: new Date() },
            $push: {
              events: {
                status: "expired",
                at: new Date().toISOString(),
                note: "Quá 30 phút chưa gửi bill. Tiệm đã trả lại số lượng.",
              },
            },
          },
          { session },
        );
        await this.release(o, session);
      });
    }
  }
  async checkout(raw: unknown, owner: string) {
    const input = checkoutSchema.parse(raw);
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          cart: input.cart,
          customer: input.customer,
          paymentMethod: input.paymentMethod,
        }),
      )
      .digest("hex");
    await this.expire();
    return this.transaction(async (session) => {
      const existing = await this.orders.findOne(
        {
          storeId: this.storeId,
          ownerHash: owner,
          idempotencyKey: input.idempotencyKey,
        },
        { session },
      );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new CommerceError(
            "Mã gửi đơn đã dùng cho nội dung khác. Hãy mở lại thanh toán.",
            409,
          );
        return orderDto(existing);
      }
      const settings = await this.settings(session);
      if (!settings.isOpen)
        throw new CommerceError(
          "Tiệm đang tạm nghỉ. Bạn ghé lại sau nhé.",
          409,
        );
      if (input.paymentMethod === "bank_transfer" && !settings.qrImage)
        throw new CommerceError(
          "Tiệm chưa cập nhật QR thanh toán. Vui lòng quay lại sau hoặc chọn thanh toán khi nhận hàng.",
          409,
          "PAYMENT_NOT_CONFIGURED",
        );
      const quote = await this.quote(input.cart, session);
      if (!quote.valid || quote.digest !== input.digest)
        throw new CommerceError(
          "Giá, topping hoặc tồn hàng vừa thay đổi. Vui lòng kiểm tra lại giỏ hàng.",
          409,
          "CART_CHANGED",
        );
      const quantities = new Map<string, number>();
      for (const l of input.cart)
        quantities.set(
          l.productId,
          (quantities.get(l.productId) || 0) + l.quantity,
        );
      for (const [id, quantity] of quantities) {
        const result = await this.products.updateOne(
          {
            _id: new ObjectId(id),
            storeId: this.storeId,
            status: "available",
            $or: [{ stock: null }, { stock: { $gte: quantity } }],
          },
          [
            {
              $set: {
                stock: {
                  $cond: [
                    { $isNumber: "$stock" },
                    { $subtract: ["$stock", quantity] },
                    null,
                  ],
                },
                revision: { $add: ["$revision", 1] },
                updatedAt: new Date(),
              },
            },
          ],
          { session },
        );
        if (!result.matchedCount)
          throw new CommerceError(
            "Món vừa hết hàng. Vui lòng kiểm tra lại giỏ.",
            409,
            "CART_CHANGED",
          );
      }
      const now = new Date();
      const isCod = input.paymentMethod === "cod";
      const o: OrderDoc = {
        _id: new ObjectId(),
        storeId: this.storeId,
        code: `SUA${now.toISOString().slice(2, 10).replaceAll("-", "")}${randomBytes(4).toString("hex").toUpperCase()}`,
        ownerHash: owner,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        customer: input.customer as Customer,
        paymentMethod: input.paymentMethod,
        payment: isCod
          ? undefined
          : { qrImage: settings.qrImage, note: settings.paymentNote },
        status: isCod ? "preparing" : "awaiting_payment",
        quote,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(+now + (isCod ? 24 * 3600_000 : 30 * 60_000)),
        events: [
          {
            status: isCod ? "preparing" : "awaiting_payment",
            at: now.toISOString(),
            note: isCod
              ? "Đã nhận đơn (thanh toán khi nhận hàng). Tiệm đang chuẩn bị món."
              : "Đã nhận đơn. Tiệm giữ món 30 phút để bạn chuyển khoản và gửi bill.",
          },
        ],
      };
      await this.orders.insertOne(o, { session });
      return orderDto(o);
    });
  }
  async listOrders(owner?: string, phone?: string, before?: string, status?: OrderStatus) {
    await this.expire();
    const rows = await this.orders
      .find(
        {
          storeId: this.storeId,
          ...(owner ? { ownerHash: owner } : {}),
          ...(phone ? { "customer.phone": phone } : {}),
          ...(status ? { status } : {}),
          ...(before && ObjectId.isValid(before)
            ? { _id: { $lt: new ObjectId(before) } }
            : {}),
        },
        { projection: { receipt: 0, payment: 0 } },
      )
      .sort({ _id: -1 })
      .limit(51)
      .toArray();
    return {
      orders: rows
        .slice(0, 50)
        .map((o) => ({
          ...orderDto(o),
          hasReceipt:
            o.status !== "awaiting_payment" &&
            o.events.some((e) => e.status === "payment_review"),
        })),
      nextCursor: rows.length > 50 ? String(rows[49]._id) : null,
    };
  }
  async getOrder(id: string, owner?: string) {
    if (!ObjectId.isValid(id))
      throw new CommerceError("Không tìm thấy đơn hàng.", 404);
    const order = await this.orders.findOne({
      _id: new ObjectId(id),
      storeId: this.storeId,
      ...(owner ? { ownerHash: owner } : {}),
    });
    if (!order) throw new CommerceError("Không tìm thấy đơn hàng.", 404);
    return order;
  }
  async order(id: string, owner?: string) {
    await this.expire();
    return orderDto(await this.getOrder(id, owner));
  }
  async uploadReceipt(id: string, owner: string, data: Buffer, mime: string) {
    if (!ObjectId.isValid(id))
      throw new CommerceError("Không tìm thấy đơn hàng.", 404);
    const now = new Date();
    const result = await this.orders.updateOne(
      {
        _id: new ObjectId(id),
        storeId: this.storeId,
        ownerHash: owner,
        status: "awaiting_payment",
        expiresAt: { $gt: now },
      },
      {
        $set: {
          receipt: { data, mime, uploadedAt: now },
          status: "payment_review",
          updatedAt: now,
        },
        $push: {
          events: {
            status: "payment_review",
            at: now.toISOString(),
            note: "Tiệm đã nhận bill, đang kiểm tra chuyển khoản.",
          },
        },
      },
    );
    if (!result.matchedCount)
      throw new CommerceError(
        "Đơn đã hết hạn hoặc đã gửi bill. Vui lòng tải lại đơn.",
        409,
      );
    return { saved: true };
  }
  async changeStatus(id: string, status: OrderStatus, note: string) {
    return this.transaction(async (session) => {
      if (!ObjectId.isValid(id))
        throw new CommerceError("Không tìm thấy đơn.", 404);
      const o = await this.orders.findOne(
        { _id: new ObjectId(id), storeId: this.storeId },
        { session },
      );
      if (!o) throw new CommerceError("Không tìm thấy đơn.", 404);
      if (!transitions[o.status].includes(status))
        throw new CommerceError(
          "Không thể chuyển trạng thái này. Hãy tải lại đơn.",
          409,
        );
      if (status === "cancelled" && !note.trim())
        throw new CommerceError("Nhập lý do hủy để khách biết.");
      const now = new Date();
      await this.orders.updateOne(
        { _id: o._id, status: o.status },
        {
          $set: { status, updatedAt: now },
          $push: { events: { status, at: now.toISOString(), note } },
        },
        { session },
      );
      if (status === "cancelled") await this.release(o, session);
      return { saved: true };
    });
  }
}
