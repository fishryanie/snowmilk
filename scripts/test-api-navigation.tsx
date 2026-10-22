/** Deterministic browser-DOM check; uses fake HTTP responses, never the app DB. */
import assert from "node:assert/strict";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost:3002" });
Object.assign(globalThis, {
  window, document: window.document,
  HTMLElement: window.HTMLElement, Node: window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useApiData } = await import("../hooks/use-api-data");
const { apiFetch, prefetchApiData } = await import("../lib/api-client");
const { mutate, SWRConfig } = await import("swr");
const queue = new Map<string, Array<(response: Response) => void>>();
const calls = new Map<string, number>();
const originalFetch = globalThis.fetch;
const fakeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input);
  if (init?.method === "POST") return Promise.resolve(Response.json({ success: true, data: {} }));
  calls.set(url, (calls.get(url) ?? 0) + 1);
  return new Promise((resolve) => queue.set(url, [...(queue.get(url) ?? []), resolve]));
};
globalThis.fetch = fakeFetch as typeof fetch;
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container as unknown as HTMLDivElement);
let query!: ReturnType<typeof useApiData<{ value: string }>>;
const seen: Array<{ loading: boolean; value: string }> = [];
function Page({ url }: { url: string }) {
  const result = useApiData(url, { value: "sample" }, { refreshIntervalMs: 0 });
  React.useLayoutEffect(() => {
    query = result;
    seen.push({ loading: result.loading, value: result.data.value });
  });
  return <div>{result.loading ? "loading" : result.data.value}</div>;
}
async function respond(url: string, value: string, status = 200) {
  const resolve = queue.get(url)?.shift();
  assert.ok(resolve, `No pending request for ${url}`);
  await act(async () => { resolve(Response.json({ success: status === 200, data: { value }, message: "offline" }, { status })); });
}
async function show(url: string) {
  await act(async () => root.render(<Page key={url} url={url} />));
}

try {
  await show("/api/check-a");
  assert.equal(container.textContent, "loading");
  await respond("/api/check-a", "real-a");
  assert.equal(container.textContent, "real-a");

  await act(async () => root.render(null));
  const before = seen.length;
  const started = performance.now();
  await show("/api/check-a");
  const cachedRenderMs = performance.now() - started;
  assert.deepEqual(seen[before], { loading: false, value: "real-a" });
  assert.equal(calls.get("/api/check-a"), 1);

  await act(async () => query.refresh());
  assert.equal(container.textContent, "real-a", "background refresh must keep real data visible");
  await respond("/api/check-a", "real-a-updated");
  assert.equal(container.textContent, "real-a-updated");

  await show("/api/check-b?date=2026-10-01");
  assert.equal(container.textContent, "loading", "a different filter cannot reuse A's data");
  await respond("/api/check-b?date=2026-10-01", "real-b");

  await act(async () => prefetchApiData("/api/check-prefetch"));
  await respond("/api/check-prefetch", "real-prefetch");
  const prefetchRender = seen.length;
  await show("/api/check-prefetch");
  assert.deepEqual(seen[prefetchRender], { loading: false, value: "real-prefetch" });
  // A background mount revalidation may still be pending; it cannot show shimmer.
  if (queue.get("/api/check-prefetch")?.length) await respond("/api/check-prefetch", "real-prefetch");

  await act(async () => apiFetch("/api/changes", { method: "POST" }));
  assert.equal(container.textContent, "real-prefetch", "saving cannot blank a mounted workspace");
  await respond("/api/check-prefetch", "saved");
  assert.equal(container.textContent, "saved");
  await show("/api/check-a");
  assert.equal(container.textContent, "loading", "opening an invalidated inactive page must request fresh data");
  await respond("/api/check-a", "post-write-a");
  assert.equal(container.textContent, "post-write-a");

  await show("/api/check-offline");
  await respond("/api/check-offline", "ignored", 503);
  assert.equal(query.usingFallback, true);
  assert.equal(SWRConfig.defaultValue.cache.get("/api/check-offline")?.data, undefined);
  console.log(JSON.stringify({ passed: 8, cachedRenderMs: Number(cachedRenderMs.toFixed(2)), duplicateRequestsOnRemount: 0 }));
} finally {
  await act(async () => root.unmount());
  await mutate((key) => typeof key === "string" && key.startsWith("/api/check"), undefined, { revalidate: false });
  globalThis.fetch = originalFetch;
  await window.happyDOM.abort();
}
