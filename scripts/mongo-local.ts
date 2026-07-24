import { spawnSync } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const mongoDir = path.join(root, ".mongodb");
const dataDir = path.join(mongoDir, "data");
const logDir = path.join(mongoDir, "log");
const logPath = path.join(logDir, "mongod.log");
const pidPath = path.join(mongoDir, "mongod.pid");

async function readPid() {
  try {
    const pid = Number((await readFile(pidPath, "utf8")).trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isRunning(pid: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    const result = spawnSync(
      "lsof",
      ["-nP", "-a", "-p", String(pid), "-iTCP:27017", "-sTCP:LISTEN"],
      { stdio: "ignore" },
    );
    return result.status === 0;
  }
}

async function start() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(logDir, { recursive: true });

  const currentPid = await readPid();
  if (isRunning(currentPid)) {
    console.log(`MongoDB đang chạy (PID ${currentPid}) tại 127.0.0.1:27017.`);
    return;
  }
  if (currentPid) await unlink(pidPath).catch(() => undefined);

  const result = spawnSync(
    "mongod",
    [
      "--dbpath",
      dataDir,
      "--logpath",
      logPath,
      "--pidfilepath",
      pidPath,
      "--bind_ip",
      "127.0.0.1",
      "--port",
      "27017",
      "--fork",
    ],
    { stdio: "inherit" },
  );

  if (result.error) {
    throw new Error(
      `Không thể chạy mongod. Hãy kiểm tra MongoDB Community đã được cài: ${result.error.message}`,
    );
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log("MongoDB đã sẵn sàng tại mongodb://127.0.0.1:27017/snowmilk.");
}

async function status() {
  const pid = await readPid();
  if (isRunning(pid)) {
    console.log(`MongoDB đang chạy (PID ${pid}) tại 127.0.0.1:27017.`);
    return;
  }
  console.log("MongoDB chưa chạy. Dùng: bun run db:start");
  process.exitCode = 1;
}

async function stop() {
  const pid = await readPid();
  if (!isRunning(pid)) {
    console.log("MongoDB hiện không chạy.");
    await unlink(pidPath).catch(() => undefined);
    return;
  }

  const result = spawnSync("kill", ["-TERM", String(pid)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  for (let attempt = 0; attempt < 50 && isRunning(pid); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await unlink(pidPath).catch(() => undefined);
  console.log("Đã dừng MongoDB local.");
}

const command = process.argv[2] ?? "status";

if (command === "start") await start();
else if (command === "status") await status();
else if (command === "stop") await stop();
else {
  console.error("Lệnh hợp lệ: start | status | stop");
  process.exitCode = 1;
}
