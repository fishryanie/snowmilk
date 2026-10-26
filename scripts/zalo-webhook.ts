// Run with: bun --env-file=.env.local scripts/zalo-webhook.ts info|set|test
export {};

const action = process.argv[2] ?? "info";
if (!["info", "set", "test"].includes(action)) {
  throw new Error("Cách dùng: zalo-webhook.ts info|set|test");
}
const token = process.env.ZALO_BOT_TOKEN;
if (!token || !/^\d+:.+$/.test(token)) {
  throw new Error("Cần cấu hình ZALO_BOT_TOKEN trên server.");
}

async function zalo(method: string, body = {}) {
  let response: Response;
  try {
    response = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(`Không gọi được Zalo ${method}.`);
  }
  const data = await response.json();
  if (method === "getWebhookInfo" && response.ok && data.error_code === 404) {
    return { ok: true, result: { url: null } };
  }
  if (!response.ok || data.ok !== true) {
    throw new Error(`Zalo ${method} thất bại (HTTP ${response.status}, mã ${data.error_code ?? data.errorCode ?? "unknown"}).`);
  }
  return data;
}

try {
  let result;
  if (action === "set") {
    const secret = process.env.ZALO_WEBHOOK_SECRET;
    const rawUrl = process.env.ZALO_WEBHOOK_URL;
    if (!secret || secret.length < 8 || secret.length > 256 || !rawUrl) {
      throw new Error("Cần ZALO_WEBHOOK_URL và ZALO_WEBHOOK_SECRET (8–256 ký tự).");
    }
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("Webhook phải là URL HTTPS công khai không chứa thông tin đăng nhập hoặc fragment.");
    }
    // Prove the deployed receiver accepts the same secret before switching Zalo.
    const probe = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bot-Api-Secret-Token": secret },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const probeData = await probe.json();
    if (!probe.ok || probeData.ok !== true || probeData.received !== false) {
      throw new Error(`Endpoint chưa sẵn sàng hoặc secret chưa khớp (HTTP ${probe.status}).`);
    }
    result = await zalo("setWebhook", { url: url.href, secret_token: secret });
    if (result.result?.verification?.ok !== true) {
      throw new Error(`Zalo đã lưu URL nhưng chưa xác minh thành công: ${result.result?.verification?.outcome ?? "unknown"}.`);
    }
  } else {
    if (action === "info") await zalo("getMe");
    result = await zalo(action === "info" ? "getWebhookInfo" : "testWebhook");
    if (action === "test" && result.result?.ok !== true) {
      throw new Error(`Kiểm tra webhook thất bại: ${result.result?.outcome ?? "unknown"}.`);
    }
  }
  // Print only status metadata. Never print the Bot Token or webhook secret.
  console.log(JSON.stringify({
    ok: result.ok,
    url: result.result?.url,
    outcome: result.result?.outcome ?? result.result?.verification?.outcome,
    verified: result.result?.verification?.ok ?? (action === "test" ? result.result?.ok : undefined),
  }, null, 2));
} catch (error) {
  // Fetch errors can embed a request URL; do not expose credential-bearing URLs.
  const message = error instanceof Error ? error.message : "Không cấu hình được webhook.";
  console.error(message.replaceAll(token, "[redacted]").replaceAll(process.env.ZALO_WEBHOOK_SECRET ?? token, "[redacted]"));
  process.exitCode = 1;
}
