import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mutate, SWRConfig } from "swr";
import {
  apiFetch, fetchApiData, invalidateApiData, prefetchApiData, trackApiQuery,
} from "./api-client";
import { routeDataUrls } from "./route-data";

const cache = SWRConfig.defaultValue.cache;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
type FetchCall = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const fetchTarget = globalThis as unknown as { fetch: FetchCall };
const mockFetch = () => spyOn(fetchTarget, "fetch");
let fetchSpy: ReturnType<typeof mockFetch> | undefined;
afterEach(async () => {
  await invalidateApiData(true);
  fetchSpy?.mockRestore();
});

function reply(data: unknown, status = 200) {
  return Response.json({ success: status === 200, data, message: "Test response" }, { status });
}

describe("shared API data", () => {
  test("concurrent consumers share one GET, including navigation prefetch", async () => {
    let finish!: (response: Response) => void;
    fetchSpy = mockFetch().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = fetchApiData("/api/test-shared");
    const second = fetchApiData("/api/test-shared");
    prefetchApiData("/api/test-shared");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finish(reply([1, 2]));
    expect(await first).toEqual([1, 2]);
    expect(await second).toEqual([1, 2]);
    await tick();
    expect(cache.get("/api/test-shared")?.data).toEqual([1, 2]);
  });

  test("unmounting a consumer does not abort a request needed by the next page", async () => {
    let finish!: (response: Response) => void;
    fetchSpy = mockFetch().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const release = trackApiQuery("/api/test-navigation");
    prefetchApiData("/api/test-navigation");
    release();
    finish(reply({ count: 4 }));
    await tick();
    expect(cache.get("/api/test-navigation")?.data).toEqual({ count: 4 });
  });

  test("writes preserve mounted data and clear inactive pages and report filters", async () => {
    const release = trackApiQuery("/api/test-active");
    trackApiQuery("/api/test-report?from=2026-09-01")();
    trackApiQuery("/api/test-report?from=2026-10-01")();
    await mutate("/api/test-active", [1], false);
    await mutate("/api/test-report?from=2026-09-01", [2], false);
    await mutate("/api/test-report?from=2026-10-01", [3], false);
    fetchSpy = mockFetch().mockResolvedValue(reply({ saved: true }));
    await apiFetch("/api/products/123", { method: "PUT" });
    await tick();
    expect(cache.get("/api/test-active")?.data).toEqual([1]);
    expect(cache.get("/api/test-report?from=2026-09-01")?.data).toBeUndefined();
    expect(cache.get("/api/test-report?from=2026-10-01")?.data).toBeUndefined();
    release();
  });

  test("a response started before a write cannot resurrect invalidated data", async () => {
    let finish!: (response: Response) => void;
    fetchSpy = mockFetch().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    prefetchApiData("/api/test-race");
    await invalidateApiData();
    finish(reply({ version: "old" }));
    await tick();
    expect(cache.get("/api/test-race")?.data).toBeUndefined();
  });

  test("an invalidated in-flight GET is not reused for the next read", async () => {
    let finish!: (response: Response) => void;
    fetchSpy = mockFetch()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValue(reply({ version: "new" }));
    const old = fetchApiData("/api/test-new-read");
    await invalidateApiData();
    const fresh = fetchApiData("/api/test-new-read");
    expect(await fresh).toEqual({ version: "new" });
    finish(reply({ version: "old" }));
    await old;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test("401/403 clear protected data even for a mounted query", async () => {
    const release = trackApiQuery("/api/test-private");
    await mutate("/api/test-private", { private: true }, false);
    fetchSpy = mockFetch().mockResolvedValue(reply(null, 403));
    await expect(fetchApiData("/api/test-forbidden")).rejects.toThrow("Test response");
    expect(cache.get("/api/test-private")?.data).toBeUndefined();
    release();
  });

  test("failed writes and read-only requests keep valid cached data", async () => {
    trackApiQuery("/api/test-keep")();
    await mutate("/api/test-keep", [1], false);
    fetchSpy = mockFetch().mockResolvedValue(reply(null, 409));
    await apiFetch("/api/test-keep", { method: "DELETE" });
    expect(cache.get("/api/test-keep")?.data).toEqual([1]);
    fetchSpy.mockResolvedValue(reply([2]));
    await apiFetch("/api/test-keep");
    expect(cache.get("/api/test-keep")?.data).toEqual([1]);
  });

  test("errors never populate workbook/sample data into the shared cache", async () => {
    fetchSpy = mockFetch().mockImplementation(() => Promise.resolve(reply(null, 503)));
    prefetchApiData("/api/test-failed-prefetch");
    await tick();
    expect(cache.get("/api/test-failed-prefetch")?.data).toBeUndefined();
    await expect(fetchApiData("/api/test-failed-read")).rejects.toThrow("Test response");
  });

  test("zero and null are valid API results", async () => {
    fetchSpy = mockFetch().mockResolvedValue(reply(0));
    expect(await fetchApiData<number>("/api/test-zero")).toBe(0);
    fetchSpy.mockResolvedValue(reply(null));
    expect(await fetchApiData("/api/test-null")).toBeNull();
  });
});

test("prefetch keys use Vietnam dates at the UTC date boundary", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  expect(routeDataUrls("/dashboard", false, now)).toEqual([
    "/api/reports/dashboard?from=2026-10-01&to=2026-10-01",
  ]);
  expect(routeDataUrls("/sales", true, now)).toEqual([
    "/api/sales?limit=50",
  ]);
  expect(routeDataUrls("/purchases", false, now)).toEqual([
    "/api/purchases?limit=500&from=2026-10-01&to=2026-10-01",
    "/api/ingredients?limit=500",
  ]);
  expect(routeDataUrls("/purchases", true, now)).toEqual([
    "/api/v2/catalog/purchase-items", "/api/v2/purchase-receipts",
  ]);
  expect(routeDataUrls("/storefront/orders")).toContain("/api/storefront-admin/orders?");
});
