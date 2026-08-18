"use client";

import { useCallback, useEffect, useState } from "react";

type Envelope<T> = {
  success: boolean;
  data?: T;
  message: string;
};

type UseApiDataOptions = {
  refreshIntervalMs?: number;
};

export function useApiData<T>(
  url: string,
  fallback: T,
  options: UseApiDataOptions = {},
) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => {
    setRefreshVersion((current) => current + 1);
  }, []);
  const refreshIntervalMs = options.refreshIntervalMs;

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;

    async function load() {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as Envelope<T>;
        if (!response.ok || !body.success || !body.data) {
          throw new Error(body.message);
        }
        if (!disposed) {
          setData(body.data);
          setUsingFallback(false);
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!disposed) setUsingFallback(true);
      } finally {
        if (!disposed && activeController === controller) {
          setLoading(false);
        }
      }
    }

    const reloadFromApi = () => void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") reloadFromApi();
    };

    reloadFromApi();
    window.addEventListener("focus", reloadFromApi);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refreshTimer =
      refreshIntervalMs && refreshIntervalMs > 0
        ? window.setInterval(refreshWhenVisible, refreshIntervalMs)
        : null;

    return () => {
      disposed = true;
      activeController?.abort();
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      window.removeEventListener("focus", reloadFromApi);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshIntervalMs, refreshVersion, url]);

  return { data, loading, usingFallback, setData, refresh };
}
