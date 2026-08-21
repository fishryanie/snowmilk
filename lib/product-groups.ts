export const DEFAULT_PRODUCT_GROUP = "Đồ ăn sáng / Healthy";

export function normalizeProductGroupName(value: unknown) {
  if (typeof value !== "string") return DEFAULT_PRODUCT_GROUP;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || DEFAULT_PRODUCT_GROUP;
}

export function productGroupBusinessLineCode(value: unknown) {
  const groupName = normalizeProductGroupName(value);
  const slug = groupName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  if (slug === "DO_AN_SANG_HEALTHY") return "BREAKFAST";

  return `BREAKFAST_${slug || "OTHER"}`;
}
