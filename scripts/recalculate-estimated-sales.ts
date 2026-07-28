import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import {
  calculateDailySaleEstimateFromRevenue,
  type DailySaleAssumption,
} from "@/lib/calculations/daily-sales";
import { connectMongo } from "@/lib/mongodb";
import { Sale } from "@/models/Sale";

loadEnvConfig(process.cwd());

const applyChanges = process.argv.includes("--apply");

await connectMongo();

const estimatedSales = await Sale.find({
  entryMode: "daily-summary",
}).sort({ saleDate: 1 });
const changes: {
  id: string;
  saleDate: Date;
  previousTotalCups: number;
  nextTotalCups: number;
}[] = [];

for (const sale of estimatedSales) {
  const assumptions = sale.sizeSummaries.map(
    (summary: DailySaleAssumption): DailySaleAssumption => ({
      sizeCode: summary.sizeCode,
      sizeName: summary.sizeName,
      milkMl: Number(summary.milkMl ?? 0),
      referenceSellingPrice: Number(summary.referenceSellingPrice ?? 0),
      milkCostPerCup: Number(summary.milkCostPerCup ?? 0),
      packagingCostPerCup: Number(summary.packagingCostPerCup ?? 0),
      toppingCostPerCup: Number(summary.toppingCostPerCup ?? 0),
      toppingCostLowPerCup: Number(summary.toppingCostLowPerCup ?? 0),
      toppingCostHighPerCup: Number(summary.toppingCostHighPerCup ?? 0),
      overheadRate: Number(summary.overheadRate ?? 0),
      fixedCostPerCup: Number(summary.fixedCostPerCup ?? 0),
      sampleCount: Number(summary.sampleCount ?? 0),
    }),
  );
  const totals = calculateDailySaleEstimateFromRevenue(
    Number(sale.netRevenue ?? 0),
    assumptions,
  );

  changes.push({
    id: String(sale._id),
    saleDate: sale.saleDate,
    previousTotalCups: Number(sale.totalCups ?? 0),
    nextTotalCups: totals.totalCups,
  });

  if (applyChanges) {
    sale.set({
      ...totals,
      cupCountSource: "estimated",
      estimationMethod:
        "Số ly Size M/L và lượng sữa nền đều được ước tính chỉ từ doanh thu thực nhận, giá tham chiếu và giả định M/L cân bằng.",
    });
    await sale.save();
  }
}

console.log(
  JSON.stringify(
    {
      mode: applyChanges ? "applied" : "dry-run",
      changes,
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
process.exit(0);
