import { createHash } from "node:crypto";
import type {
  CartLine,
  Quote,
  QuotedLine,
  ShopProduct,
  ShopSettings,
} from "./types";
import { cartKey, getMaxToppings } from "./types";
export function quoteCart(
  cart: CartLine[],
  products: ShopProduct[],
  settings: ShopSettings,
): Quote {
  const amounts = new Map<string, number>();
  for (const line of cart)
    amounts.set(
      line.productId,
      (amounts.get(line.productId) || 0) + line.quantity,
    );
  const lines: QuotedLine[] = cart.map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const maxToppings = product ? getMaxToppings(product) : null;
    const toppings = line.toppingIds
      .map((id) => product?.toppings.find((t) => t.id === id))
      .filter((t) => t != null);
    const issue =
      !product || product.status === "hidden"
        ? "Món này đã ngừng bán."
        : product.status === "sold_out" || product.stock === 0
          ? "Món này vừa hết hàng."
          : product.stock != null &&
              product.stock < (amounts.get(line.productId) || 0)
            ? `Tiệm chỉ còn ${product.stock} phần.`
            : maxToppings !== null && line.toppingIds.length > maxToppings
              ? `Chỉ được chọn tối đa ${maxToppings} topping cho mỗi ${product.unit}.`
              : toppings.length !== line.toppingIds.length ||
                  toppings.some((t) => !t.available)
                ? "Topping đã thay đổi hoặc hết hàng. Vui lòng chọn lại."
                : undefined;
    const unitPrice =
      (product?.price || 0) + toppings.reduce((sum, t) => sum + t.price, 0);
    return {
      ...line,
      key: cartKey(line),
      name: product?.name || "Món đã ngừng bán",
      imageUrl: product?.imageUrl || "",
      toppings,
      unitPrice,
      total: unitPrice * line.quantity,
      available: !issue,
      ...(issue ? { issue } : {}),
    };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const deliveryFee =
    settings.freeDeliveryFrom > 0 && subtotal >= settings.freeDeliveryFrom
      ? 0
      : settings.deliveryFee;
  const valid =
    settings.isOpen && lines.length > 0 && lines.every((l) => l.available);
  const digest = createHash("sha256")
    .update(
      JSON.stringify({ lines, deliveryFee, valid, qrImage: settings.qrImage }),
    )
    .digest("hex");
  return {
    lines,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    valid,
    digest,
  };
}
export { orderTransitions as transitions } from "./types";
