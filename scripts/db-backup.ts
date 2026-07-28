import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { getMongoConfig } from "@/lib/mongodb-config";

loadEnvConfig(process.cwd());

const { uri, dbName } = getMongoConfig();

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve("backups", stamp);
await mkdir(outputDir, { recursive: true });

const exitCode = await new Promise<number>((resolve, reject) => {
  const child = spawn(
    "mongodump",
    ["--uri", uri, "--db", dbName, "--out", outputDir],
    {
      stdio: "inherit",
    },
  );
  child.on("error", reject);
  child.on("close", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) throw new Error(`mongodump thất bại với mã ${exitCode}.`);
console.log(`Đã sao lưu MongoDB vào ${outputDir}`);
