import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { mapWorkbook, importSummary } from "@/lib/excel/mapper";
import { readWorkbook } from "@/lib/excel/reader";
import { persistWorkbook } from "@/services/import.service";

loadEnvConfig(process.cwd());

const dryRun = process.argv.includes("--dry-run");
const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const inputPath = path.resolve(fileArg?.slice(7) || "data/source.xlsx");
const bytes = await readFile(inputPath);
const workbook = await readWorkbook(bytes);
const parsed = mapWorkbook(workbook, bytes);
const summary = importSummary(parsed);

console.log(JSON.stringify({ dryRun, inputPath, summary, metrics: parsed.metrics }, null, 2));
if (parsed.issues.length) {
  console.log(JSON.stringify({ issues: parsed.issues }, null, 2));
}

if (!dryRun) {
  if (summary.totals.failedRows > 0) {
    throw new Error("Import bị dừng vì còn dòng dữ liệu không hợp lệ. Hãy chạy dry-run để xem chi tiết.");
  }
  await persistWorkbook(parsed, path.basename(inputPath));
  console.log("Import MongoDB hoàn tất.");
  await mongoose.disconnect();
}
