"use client";

import { useEffect, useState } from "react";

type Envelope<T> = {
  success: boolean;
  data?: T;
  message: string;
};

export function useApiData<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

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

    const refresh = () => void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      activeController?.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [url]);

  return { data, loading, usingFallback, setData };
}
