// src/hooks/useUnifiedStockTelemetry.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveValidNepseSymbol } from "@/services/aiGuru/runAiQuantitativeAssessment";
import type { AtomicStockTelemetryApiResponse } from "@/app/api/stocks/[symbol]/telemetry/route";

export function useUnifiedStockTelemetry(rawSymbol?: string | null) {
  const validSymbol = resolveValidNepseSymbol(rawSymbol);
  const [data, setData] = useState<AtomicStockTelemetryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!validSymbol) {
        setData(null);
        setError("Select a valid NEPSE scrip symbol to load telemetry.");
        return;
      }

      setLoading(true);
      setError(null);
      setData((prev) => (prev && prev.symbol === validSymbol ? prev : null));

      try {
        const res = await fetch(
          `/api/stocks/${encodeURIComponent(validSymbol)}/telemetry`,
          {
            signal,
            cache: "no-store",
          }
        );
        const json = (await res.json()) as AtomicStockTelemetryApiResponse & {
          error?: string;
        };

        if (!res.ok || !json.ok) {
          throw new Error(json.error || `Failed to load telemetry for ${validSymbol}`);
        }
        if (!signal?.aborted) {
          setData(json);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError" && !signal?.aborted) {
          setError(
            err instanceof Error ? err.message : "Telemetry synchronization failed"
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [validSymbol]
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return {
    symbol: validSymbol,
    data,
    loading,
    error,
    refresh: () => refresh(),
  };
}

export default useUnifiedStockTelemetry;
