// src/hooks/useUnifiedStockTelemetry.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveValidNepseSymbol } from "@/services/aiGuru/runAiQuantitativeAssessment";
import { getProxyBase } from "@/utils/proxyBase.js";
import type { AtomicStockTelemetryApiResponse } from "@/types/stockTelemetry";

export function useUnifiedStockTelemetry(rawSymbol?: string | null) {
  const validSymbol = resolveValidNepseSymbol(rawSymbol);
  const [data, setData] = useState<AtomicStockTelemetryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const { signal } = controller;

      if (!validSymbol) {
        setData(null);
        setError("Select a valid NEPSE scrip symbol to load telemetry.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setData((prev) => (prev && prev.symbol === validSymbol ? prev : null));

      try {
        const baseUrl = getProxyBase();
        const res = await fetch(
          `${baseUrl}/api/stocks/${encodeURIComponent(validSymbol)}/telemetry`,
          {
            signal,
            cache: "no-store",
          }
        );
        const rawText = await res.text();
        let json: (AtomicStockTelemetryApiResponse & { error?: string }) | null = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          throw new Error(`Invalid telemetry response (HTTP ${res.status})`);
        }

        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Failed to load telemetry for ${validSymbol} (HTTP ${res.status})`);
        }
        if (!signal.aborted) {
          setData(json);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError" && !signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Telemetry synchronization failed"
          );
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [validSymbol]
  );

  useEffect(() => {
    refresh();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [refresh]);

  const parsedLastUpdatedMs = data?.asOfTimestamp ? new Date(data.asOfTimestamp).getTime() : null;
  const isLive = Boolean(data?.quoteData && Number(data.quoteData.ltp || data.quoteData.close || 0) > 0);

  return {
    symbol: validSymbol,
    data,
    loading,
    error,
    refresh: () => refresh(),
    asOfTimestamp: data?.asOfTimestamp || null,
    lastUpdatedMs: Number.isFinite(parsedLastUpdatedMs) ? parsedLastUpdatedMs : null,
    isLive,
  };
}

export default useUnifiedStockTelemetry;
