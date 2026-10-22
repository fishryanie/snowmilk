"use client";

import { mutate } from "swr";

const queryKeys = new Set<string>();
const subscribers = new Map<string, number>();
const pending = new Map<string, Promise<unknown>>();
const prefetchedAt = new Map<string, number>();

export function trackApiQuery(url: string) {
  queryKeys.add(url);
  subscribers.set(url, (subscribers.get(url) ?? 0) + 1);
  return () => {
    const count = (subscribers.get(url) ?? 1) - 1;
    if (count > 0) subscribers.set(url, count);
    else subscribers.delete(url);
  };
}

/** Also clears inactive queries, so opening another page after a write is fresh. */
export function invalidateApiData(clear = false) {
  pending.clear();
  prefetchedAt.clear();
  return Promise.all([...queryKeys].map((key) => mutate(
    key,
    (current: unknown) => !clear && subscribers.has(key) ? current : undefined,
    { revalidate: !clear },
  )));
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (response.status === 401 || response.status === 403) {
    // Do not leave another user's/role's protected data in the browser cache.
    void invalidateApiData(true);
  } else if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    void invalidateApiData();
  }
  return response;
}

async function readApiData<T>(url: string): Promise<T> {
  queryKeys.add(url);
  const response = await apiFetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok || body?.success === false) {
    throw new Error(body?.message ?? `Yêu cầu thất bại (${response.status})`);
  }
  if (body === null) throw new Error("Máy chủ không trả về dữ liệu hợp lệ.");
  return (typeof body === "object" && "data" in body ? body.data : body) as T;
}

export function fetchApiData<T>(url: string): Promise<T> {
  const existing = pending.get(url);
  if (existing) return existing as Promise<T>;
  const request = readApiData<T>(url).finally(() => {
    if (pending.get(url) === request) pending.delete(url);
  });
  pending.set(url, request);
  return request;
}

export function prefetchApiData(url: string) {
  if (Date.now() - (prefetchedAt.get(url) ?? 0) < 10_000) return;
  prefetchedAt.set(url, Date.now());
  queryKeys.add(url);
  // Populate before the route mounts; SWR shares the promise with the new page.
  void mutate(url, fetchApiData(url), { revalidate: false }).catch(() => {});
}
