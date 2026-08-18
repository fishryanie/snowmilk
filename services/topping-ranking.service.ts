import "server-only";

import { calculateToppingRanking } from "@/lib/calculations/topping-ranking";
import { connectMongo } from "@/lib/mongodb";
import { vietnamDateKey, vietnamDayBoundary } from "@/lib/vietnam-date";
import { Ingredient } from "@/models/Ingredient";
import { Purchase } from "@/models/Purchase";

export async function getToppingRanking(now = new Date()) {
  await connectMongo();
  const asOfDate = vietnamDateKey(now);
  const cutoff = vietnamDayBoundary(asOfDate, true);
  const [ingredients, purchases] = await Promise.all([
    Ingredient.find({ category: "Topping" })
      .select("code name category")
      .lean(),
    Purchase.find({
      category: "Topping",
      purchaseDate: { $lte: cutoff },
    })
      .select(
        "itemCode itemName category costUnit convertedQuantity purchaseDate",
      )
      .lean(),
  ]);

  return calculateToppingRanking({
    ingredients,
    purchases,
    asOfDate,
    updatedAt: now,
  });
}
