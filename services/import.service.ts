import { connectMongo } from "@/lib/mongodb";
import type { ParsedWorkbook } from "@/lib/excel/mapper";
import { importSummary } from "@/lib/excel/mapper";
import { Equipment } from "@/models/Equipment";
import { ImportLog } from "@/models/ImportLog";
import { Ingredient } from "@/models/Ingredient";
import { MilkBatch } from "@/models/MilkBatch";
import { Product } from "@/models/Product";
import { Purchase } from "@/models/Purchase";
import { Sale } from "@/models/Sale";
import { Setting } from "@/models/Setting";
import { ProductSize } from "@/models/Size";
import { recalculateProductCosts } from "@/services/resource.service";

const upserts = (
  records: Record<string, unknown>[],
  key: "code" | "legacyId" | "key",
) =>
  records.map((record) => ({
    updateOne: {
      filter: { [key]: record[key] },
      update: { $set: record },
      upsert: true,
    },
  }));

export async function persistWorkbook(
  parsed: ParsedWorkbook,
  fileName: string,
) {
  await connectMongo();

  await Promise.all([
    parsed.settings.length
      ? Setting.bulkWrite(upserts(parsed.settings, "key"), { ordered: false })
      : null,
    parsed.equipment.length
      ? Equipment.bulkWrite(upserts(parsed.equipment, "code"), { ordered: false })
      : null,
    parsed.sizes.length
      ? ProductSize.bulkWrite(upserts(parsed.sizes, "code"), { ordered: false })
      : null,
    parsed.ingredients.length
      ? Ingredient.bulkWrite(upserts(parsed.ingredients, "code"), { ordered: false })
      : null,
    parsed.products.length
      ? Product.bulkWrite(upserts(parsed.products, "code"), { ordered: false })
      : null,
    parsed.purchases.length
      ? Purchase.bulkWrite(upserts(parsed.purchases, "legacyId"), { ordered: false })
      : null,
    parsed.milkBatches.length
      ? MilkBatch.bulkWrite(upserts(parsed.milkBatches, "code"), { ordered: false })
      : null,
    parsed.sales.length
      ? Sale.bulkWrite(upserts(parsed.sales, "legacyId"), { ordered: false })
      : null,
  ]);

  const [ingredients, sizes, products, batches] = await Promise.all([
    Ingredient.find().select("_id code name").lean(),
    ProductSize.find().select("_id name").lean(),
    Product.find().select("_id code").lean(),
    MilkBatch.find().select("_id code name").lean(),
  ]);
  const ingredientsByCode = new Map(
    ingredients.map((ingredient) => [ingredient.code, ingredient]),
  );
  const ingredientsByName = new Map(
    ingredients.map((ingredient) => [ingredient.name, ingredient]),
  );
  const sizesByName = new Map(sizes.map((size) => [size.name, size]));
  const productsByCode = new Map(
    products.map((product) => [product.code, product]),
  );
  const batchesByName = new Map(
    batches.map((batch) => [batch.name, batch]),
  );

  await Promise.all([
    parsed.purchases.length
      ? Purchase.bulkWrite(
          parsed.purchases.flatMap((purchase) => {
            const ingredient = ingredientsByCode.get(
              String(purchase.itemCode ?? ""),
            );
            return ingredient
              ? [{
                  updateOne: {
                    filter: { legacyId: purchase.legacyId },
                    update: { $set: { ingredientId: ingredient._id } },
                  },
                }]
              : [];
          }),
          { ordered: false },
        )
      : null,
    parsed.products.length
      ? Product.bulkWrite(
          parsed.products.flatMap((product) => {
            const ingredient = ingredientsByName.get(
              String(product.toppingName ?? ""),
            );
            const size = sizesByName.get(String(product.sizeName ?? ""));
            return ingredient && size
              ? [{
                  updateOne: {
                    filter: { code: product.code },
                    update: {
                      $set: {
                        toppingIngredientId: ingredient._id,
                        sizeId: size._id,
                        hasCostWarning:
                          Number(product.fullCost ?? 0) >
                          Number(product.sellingPrice ?? 0) * 2,
                      },
                    },
                  },
                }]
              : [];
          }),
          { ordered: false },
        )
      : null,
    parsed.sales.length
      ? Sale.bulkWrite(
          parsed.sales.map((sale) => ({
            updateOne: {
              filter: { legacyId: sale.legacyId },
              update: {
                $set: {
                  batchId: batchesByName.get(String(sale.batchName ?? ""))?._id,
                  items: (
                    sale.items as Array<Record<string, unknown>>
                  ).map((item) => ({
                    ...item,
                    productId: productsByCode.get(
                      String(item.productCode ?? ""),
                    )?._id,
                  })),
                },
              },
            },
          })),
          { ordered: false },
        )
      : null,
  ]);
  await recalculateProductCosts();

  const summary = importSummary(parsed);
  await ImportLog.create({
    fileName,
    fileHash: parsed.fileHash,
    dryRun: false,
    sheets: summary.sheets.map(({ errors, ...sheet }) => ({
      ...sheet,
      rowErrors: errors,
    })),
    totals: summary.totals,
  });
  return summary;
}
