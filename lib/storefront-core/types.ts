export type Availability = "available" | "sold_out" | "hidden";
export type Topping = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};
export type ShopProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  imagePosition?: string;
  badge: string;
  unit: string;
  status: Availability;
  stock: number | null;
  toppings: Topping[];
  sortOrder: number;
  revision?: number;
};
export type ShopSettings = {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  address: string;
  isOpen: boolean;
  deliveryFee: number;
  freeDeliveryFrom: number;
  deliveryNote: string;
  qrImage: string;
  paymentNote: string;
};
export const defaultSettings: ShopSettings = {
  name: "Cái Tiệm Sữa",
  tagline: "Tươi ngon mỗi ngày, giao tận tay bạn.",
  description:
    "Một chút béo thơm, một chút ngọt lành. Chọn món bạn thích, tiệm chuẩn bị cho bạn.",
  phone: "",
  address: "",
  isOpen: true,
  deliveryFee: 0,
  freeDeliveryFrom: 0,
  deliveryNote: "Tiệm sẽ liên hệ xác nhận thời gian giao với bạn.",
  qrImage: "",
  paymentNote: "Chuyển đúng số tiền và ghi mã đơn trong nội dung chuyển khoản.",
};
export type CartLine = {
  productId: string;
  quantity: number;
  toppingIds: string[];
};
export type QuotedLine = CartLine & {
  key: string;
  name: string;
  imageUrl: string;
  toppings: Topping[];
  unitPrice: number;
  total: number;
  available: boolean;
  issue?: string;
};
export type Quote = {
  lines: QuotedLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  valid: boolean;
  digest: string;
};
export const orderStatuses = [
  "awaiting_payment",
  "payment_review",
  "paid",
  "preparing",
  "delivering",
  "completed",
  "cancelled",
  "expired",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderTransitions: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["cancelled"],
  payment_review: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["delivering", "cancelled"],
  delivering: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};
export const statusLabels: Record<OrderStatus, string> = {
  awaiting_payment: "Chờ chuyển khoản",
  payment_review: "Đang kiểm tra bill",
  paid: "Đã thanh toán",
  preparing: "Tiệm đang chuẩn bị",
  delivering: "Đang giao cho bạn",
  completed: "Đã giao thành công",
  cancelled: "Đã hủy",
  expired: "Đã hết thời gian thanh toán",
};
export type PaymentMethod = "cod" | "bank_transfer";
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank_transfer: "Chuyển khoản ngân hàng (QR)",
};
export type Customer = {
  name: string;
  phone: string;
  address: string;
  note: string;
  location: { lat: number; lng: number; accuracy: number } | null;
};
export type ShopOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  quote: Quote;
  customer: Customer;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  events: { status: OrderStatus; at: string; note: string }[];
  hasReceipt: boolean;
  payment?: { qrImage: string; note: string };
};
const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
export const money = (value: number) => currencyFormatter.format(value);
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
});
const clockFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatDate = (value: string) =>
  dateFormatter.format(new Date(value));
export const formatClock = (value: string) =>
  clockFormatter.format(new Date(value));
export const formatStamp = (value: string) =>
  `${formatDate(value)} ${formatClock(value)}`;
export const cartKey = (line: CartLine) =>
  `${line.productId}:${[...line.toppingIds].sort().join(",")}`;
