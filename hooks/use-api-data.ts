"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import useSWR from "swr";
import { fetchApiData, trackApiQuery } from "@/lib/api-client";

type UseApiDataOptions = {
  refreshIntervalMs?: number;
};

/** Shared, memory-only data across routes; never cache workbook fallback data. */
export function useApiQuery<T>(url: string | null, options: UseApiDataOptions = {}) {
  const query = useSWR<T>(url, fetchApiData<T>, {
    dedupingInterval: 2_000,
    focusThrottleInterval: 10_000,
    refreshInterval: options.refreshIntervalMs ?? 30_000,
    shouldRetryOnError: false,
    // A changed filter/date must never display the previous query's records.
    keepPreviousData: false,
  });

  useEffect(() => url ? trackApiQuery(url) : undefined, [url]);
  const mutate = query.mutate;
  const refresh = useCallback(() => { void mutate(); }, [mutate]);

  return {
    ...query,
    loading: Boolean(url) && query.data === undefined && !query.error,
    refreshing: query.isValidating,
    refresh,
  };
}

export function useApiData<T>(
  url: string,
  fallback: T,
  options: UseApiDataOptions = {},
) {
  const query = useApiQuery<T>(url, options);
  const mutate = query.mutate;
  const setData: Dispatch<SetStateAction<T>> = useCallback((value) => {
    void mutate(
      (current) => typeof value === "function"
        ? (value as (previous: T) => T)(current ?? fallback)
        : value,
      { revalidate: false },
    );
  }, [fallback, mutate]);

  return {
    data: query.data ?? fallback,
    loading: query.loading,
    usingFallback: Boolean(query.error),
    error: query.error instanceof Error ? query.error.message : null,
    refreshing: query.refreshing,
    setData,
    refresh: query.refresh,
  };
}
