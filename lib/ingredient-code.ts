export const INGREDIENT_CATEGORIES = [
  "Nguyên liệu",
  "Topping",
  "Bao bì",
  "Khác",
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

const INGREDIENT_CODE_PREFIXES: Record<IngredientCategory, string> = {
  "Nguyên liệu": "NL",
  Topping: "TP",
  "Bao bì": "BB",
  Khác: "HH",
};

export function ingredientCodePrefix(category: IngredientCategory) {
  return INGREDIENT_CODE_PREFIXES[category];
}

export function nextIngredientCode(
  category: IngredientCategory,
  existingCodes: unknown[],
) {
  const prefix = ingredientCodePrefix(category);
  const pattern = new RegExp(`^${prefix}-?(\\d+)$`, "i");
  let highestNumber = 0;

  for (const code of existingCodes) {
    const match = String(code ?? "")
      .trim()
      .match(pattern);
    if (!match) continue;
    const sequence = Number(match[1]);
    if (Number.isFinite(sequence)) {
      highestNumber = Math.max(highestNumber, sequence);
    }
  }

  return `${prefix}${String(highestNumber + 1).padStart(3, "0")}`;
}
