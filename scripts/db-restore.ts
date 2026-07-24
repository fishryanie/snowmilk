import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const uri = process.env.MONGODB_URI;
const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
if (!uri) throw new Error("Thiếu MONGODB_URI trong .env.local.");
if (!fromArg) {
  throw new Error("Cần chỉ định thư mục: bun run db:restore -- --from=backups/<timestamp>");
}

const inputDir = path.resolve(fromArg.slice("--from=".length));
const exitCode = await new Promise<number>((resolve, reject) => {
  const child = spawn(
    "mongorestore",
    ["--uri", uri, "--drop", inputDir],
    { stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) throw new Error(`mongorestore thất bại với mã ${exitCode}.`);
console.log(`Đã khôi phục MongoDB từ ${inputDir}`);
