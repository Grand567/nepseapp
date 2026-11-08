// src/app/api/ai-guru/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  runAiQuantitativeAssessment,
  resolveValidNepseSymbol,
  type AiQuantitativeAssessmentResult,
  type RawQuotePayload,
  type HistoricalCandle,
  type LedgerTelemetryRow,
} from "../../../../services/aiGuru/runAiQuantitativeAssessment";
import {
  loadScripBundleFromDb,
  normalize5DBrokerPayloadForAi,
} from "../../../../lib/db/drabyashreeDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generates an institutional-grade quantitative report directly from verified telemetry
 * when an external LLM key is absent or rate-limited.
 */
export function buildDeterministicInstitutionalAnalysis(
  assessment: AiQuantitativeAssessmentResult
): string {
  const m = assessment.metrics;
  if (!m) return assessment.errorMarkdown || "Telemetry unavailable.";

  const regimeLabel = m.smartMoney5D.dominantRegime.replace(/_/g, " ");
  const isHniTicket = m.avgTicketKitta >= 300;
  const isRetailHerd = m.avgTicketKitta > 0 && m.avgTicketKitta < 45;

  const ticketVerdict = isHniTicket
    ? `Institutional/HNI footprint confirmed (${Math.round(m.avgTicketKitta)} kitta avg ticket exceeds the 300-kitta institutional threshold)`
    : isRetailHerd
    ? `Retail herd churn detected (${Math.round(m.avgTicketKitta)} kitta avg ticket is below the 45-kitta noise floor)`
    : `Moderate blended participation (${Math.round(m.avgTicketKitta)} kitta avg ticket)`;

  const ratchetCleared = m.mfePct >= 1.2;
  const topAccList =
    m.smartMoney5D.topAccumulators.length > 0
      ? m.smartMoney5D.topAccumulators
          .slice(0, 3)
          .map(
            (b) =>
              `#${b.brokerId} (+${b.netKitta.toLocaleString()} kitta | ${b.anomalyScore.toFixed(2)}x anomaly)`
          )
          .join(", ")
      : "No single outlier accumulator in 5D window";

  return [
    `### 🏛️ Institutional Quantitative Verdict: **${assessment.symbol}**`,
    `- **Verified Price Discovery:** **Rs ${m.verifiedPrice.toLocaleString()}** via *${assessment.priceAsOfLabel}* (${m.dayChangePct >= 0 ? "+" : ""}${m.dayChangePct}% session delta | 14D ATR: Rs ${m.atr14} / ${m.atrPct}%).`,
    `- **5D Smart Money & Broker Anomaly (${m.brokerAnomalyScore.toFixed(2)}x):** Regime classified as **${regimeLabel}** (${m.smartMoney5D.netAccumulationRatio.toFixed(1)}% buy pressure). ${ticketVerdict}. Top 5D accumulators: ${topAccList}.`,
    `- **Walk-Forward Excursion & Fee Hurdle:** Historical MFE is **+${m.mfePct.toFixed(2)}%** vs. MAE of **${m.maePct.toFixed(2)}%** (NEPSE Alpha: **${m.nepseAlphaPct >= 0 ? "+" : ""}${m.nepseAlphaPct.toFixed(2)}%**). Round-trip NEPSE friction (brokerage, 0.015% SEBON, Rs 50 DP, and 7.5% CGT) requires clearing **+${m.roundTripFeePct}%** for net positive expectancy.`,
    `- **T+2 Settlement & 1.2R Ratchet Shield:** Settlement status is **${m.t2UnlockStatus}**. ${
      ratchetCleared
        ? `Price excursion has cleared the +1.2R ratchet threshold; protective stop is locked at **Rs ${m.ratchetStopPrice}** (Entry + 1.2%).`
        : `Requires expansion above **Rs ${m.ratchetTriggerPrice}** (+1.2R) post-T+2 unlock to arm the **Rs ${m.ratchetStopPrice}** fee-protected ratchet stop.`
    }`,
  ].join("\n");
}

/**
 * Calls configured LLM endpoint (Gemini or OpenAI-compatible) with the telemetry context,
 * falling back to buildDeterministicInstitutionalAnalysis() on error or missing key.
 */
export async function generateAiGuruNarrative(
  assessment: AiQuantitativeAssessmentResult
): Promise<{ markdown: string; engine: "LLM" | "DETERMINISTIC_QUANT" }> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  // 1. Try Gemini API if configured
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: assessment.aiPromptContext }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && typeof text === "string" && text.trim().length > 20) {
          return { markdown: text.trim(), engine: "LLM" };
        }
      }
    } catch {
      // Fall through to secondary provider or deterministic engine
    }
  }

  // 2. Try OpenAI-compatible API if configured
  if (openAiKey) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are the Drabyashree NEPSE Institutional Quantitative Analyst. Use exact numbers from the provided telemetry.",
            },
            { role: "user", content: assessment.aiPromptContext },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && typeof text === "string" && text.trim().length > 20) {
          return { markdown: text.trim(), engine: "LLM" };
        }
      }
    } catch {
      // Fall through to deterministic quant synthesis
    }
  }

  // 3. Guaranteed Institutional Fallback (zero-downtime on holidays/offline)
  return {
    markdown: buildDeterministicInstitutionalAnalysis(assessment),
    engine: "DETERMINISTIC_QUANT",
  };
}

/**
 * Shared handler logic for both GET and POST requests
 */
async function handleAssessmentRequest(params: {
  symbol?: string | null;
  fallbackSymbol?: string | null;
  clientQuote?: RawQuotePayload | null;
  clientCandles?: HistoricalCandle[];
  clientLedger?: LedgerTelemetryRow | null;
  clientBroker5D?: unknown;
  stream?: boolean;
}) {
  const validSymbol = resolveValidNepseSymbol(
    params.symbol,
    params.fallbackSymbol,
    params.clientQuote?.symbol,
    params.clientLedger?.symbol
  );

  if (!validSymbol) {
    return NextResponse.json(
      {
        ok: false,
        symbol: "UNSELECTED",
        error: "No valid NEPSE scrip symbol provided.",
        errorMarkdown:
          "### ⚠️ No Active Scrip Selected\n- Select a valid NEPSE ticker from the dashboard or Signal Track Record.",
      },
      { status: 400 }
    );
  }

  // 1. Load server-side SQLite telemetry from drabyashree_ledger.db
  const dbBundle = loadScripBundleFromDb(validSymbol);

  // 2. Merge client-passed state with SQLite state (client live quote takes priority if LTP > 0, SQLite fills gaps)
  const mergedQuote: RawQuotePayload = {
    ...dbBundle.quote,
    ...params.clientQuote,
    symbol: validSymbol,
    ltp: params.clientQuote?.ltp ?? dbBundle.quote?.ltp ?? null,
    todayClose: params.clientQuote?.todayClose ?? dbBundle.quote?.todayClose ?? null,
    prevClose: params.clientQuote?.prevClose ?? dbBundle.quote?.prevClose ?? null,
  };

  const mergedCandles =
    params.clientCandles && params.clientCandles.length > 0
      ? params.clientCandles
      : dbBundle.candles;

  const mergedLedger = params.clientLedger || dbBundle.ledgerTelemetry;
  const mergedBroker5D = params.clientBroker5D || dbBundle.broker5DRawPayload;

  // 3. Run the 4-stage verified price & institutional telemetry assessment
  const assessment = await runAiQuantitativeAssessment({
    symbol: validSymbol,
    quote: mergedQuote,
    candles: mergedCandles,
    ledgerTelemetry: mergedLedger,
    broker5DRawPayload: mergedBroker5D,
    normalizeBrokerFn: normalize5DBrokerPayloadForAi,
  });

  if (!assessment.ok) {
    return NextResponse.json(
      {
        ...assessment,
        analysisMarkdown: assessment.errorMarkdown,
        engine: "VALIDATOR",
      },
      { status: 200 }
    );
  }

  // 4. Generate AI Guru narrative (LLM or deterministic quant fallback)
  const { markdown, engine } = await generateAiGuruNarrative(assessment);

  // Optional streaming mode if client requested stream: true
  if (params.stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        const payload = JSON.stringify({
          ...assessment,
          analysisMarkdown: markdown,
          engine,
        });
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  return NextResponse.json(
    {
      ...assessment,
      analysisMarkdown: markdown,
      engine,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}

/**
 * GET /api/ai-guru/assess?symbol=NABIL
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") || searchParams.get("ticker");
  const fallbackSymbol = searchParams.get("fallbackSymbol");

  return handleAssessmentRequest({ symbol, fallbackSymbol });
}

/**
 * POST /api/ai-guru/assess
 * Body: { symbol, fallbackSymbol, quote, candles, ledgerTelemetry, broker5DPayload, stream }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    return handleAssessmentRequest({
      symbol: body.symbol ?? body.ticker,
      fallbackSymbol: body.fallbackSymbol ?? body.selectedScrip?.symbol,
      clientQuote: body.quote ?? body.quoteData ?? null,
      clientCandles: Array.isArray(body.candles) ? body.candles : undefined,
      clientLedger: body.ledgerTelemetry ?? null,
      clientBroker5D: body.broker5DPayload ?? null,
      stream: Boolean(body.stream),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        symbol: "ERROR",
        errorMarkdown: `### ⚠️ AI Guru Route Error\n- ${
          err instanceof Error ? err.message : "Unexpected server error"
        }`,
      },
      { status: 500 }
    );
  }
}
