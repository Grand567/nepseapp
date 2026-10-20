// proxy/routes/aiGuruRoutes.mjs
import express from 'express';
import { getScripLedgerTelemetry, getSmartMoneyAggregatedFlow } from '../db/ledgerStore.js';

const router = express.Router();

/**
 * Safe numeric parser
 */
export function safeNum(val, fallback = 0) {
  if (val === null || val === undefined || val === '') return fallback;
  const parsed = typeof val === 'number' ? val : Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Validates and normalizes NEPSE ticker symbols, eliminating "STOCK" placeholders
 */
export function resolveValidNepseSymbol(...candidates) {
  const INVALID_PLACEHOLDERS = new Set(['STOCK', 'SYMBOL', 'TICKER', 'UNDEFINED', 'NULL', 'N/A', '']);
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const cleaned = raw.trim().toUpperCase();
    if (cleaned.length >= 2 && cleaned.length <= 12 && !INVALID_PLACEHOLDERS.has(cleaned)) {
      return cleaned;
    }
  }
  return null;
}

/**
 * 4-Stage Verified Price Fallback Chain
 */
export function resolveVerifiedPrice(quote, candles = [], ledgerRow = null) {
  const sortedCandles = [...candles].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const latestCandle = sortedCandles[0];
  const prevCandle = sortedCandles[1];

  const liveLtp = safeNum(quote?.ltp ?? quote?.lastTradedPrice, 0);
  const todayClose = safeNum(quote?.todayClose ?? quote?.close, 0);
  const prevClose = safeNum(
    quote?.prevClose ?? quote?.previousClose ?? prevCandle?.close ?? latestCandle?.open,
    0
  );
  const candleClose = safeNum(latestCandle?.close, 0);
  const ledgerVwap = safeNum(ledgerRow?.entry_vwap, 0);

  if (liveLtp > 0 && !quote?.isHoliday) {
    return {
      price: liveLtp,
      source: 'LIVE_LTP',
      asOfLabel: 'Live Exchange Feed (LTP)',
      prevCloseRef: prevClose > 0 ? prevClose : liveLtp,
    };
  }

  if (todayClose > 0) {
    return {
      price: todayClose,
      source: 'TODAY_CLOSE',
      asOfLabel: quote?.isHoliday
        ? `Holiday Close (${quote.holidayName || 'NEPSE Closed'})`
        : "Today's Closing Price",
      prevCloseRef: prevClose > 0 ? prevClose : todayClose,
    };
  }

  if (prevClose > 0) {
    return {
      price: prevClose,
      source: 'PREV_CLOSE',
      asOfLabel: 'Previous Session Close (Exchange Feed Offline/Holiday)',
      prevCloseRef: safeNum(prevCandle?.close, prevClose),
    };
  }

  if (candleClose > 0) {
    return {
      price: candleClose,
      source: 'HISTORICAL_CANDLE',
      asOfLabel: `Last Historical Candle (${latestCandle?.date || 'Historical'})`,
      prevCloseRef: safeNum(prevCandle?.close, candleClose),
    };
  }

  if (ledgerVwap > 0) {
    return {
      price: ledgerVwap,
      source: 'LEDGER_VWAP',
      asOfLabel: 'SQLite Signal Ledger Entry VWAP',
      prevCloseRef: ledgerVwap,
    };
  }

  return {
    price: null,
    source: 'UNAVAILABLE',
    asOfLabel: 'No Verified Price Telemetry',
    prevCloseRef: 0,
  };
}

/**
 * 14-period Average True Range calculation
 */
export function computeAtr14(candles = [], fallbackPrice = 0) {
  if (!candles || candles.length < 2) {
    return Number((fallbackPrice * 0.025).toFixed(2));
  }
  const sorted = [...candles].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const trs = [];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    const highLow = safeNum(cur.high) - safeNum(cur.low);
    const highPrevClose = Math.abs(safeNum(cur.high) - safeNum(prev.close));
    const lowPrevClose = Math.abs(safeNum(cur.low) - safeNum(prev.close));
    trs.push(Math.max(highLow, highPrevClose, lowPrevClose));
  }
  const recent = trs.slice(-14);
  const avg = recent.reduce((acc, v) => acc + v, 0) / (recent.length || 1);
  return avg > 0 ? Number(avg.toFixed(2)) : Number((fallbackPrice * 0.025).toFixed(2));
}

/**
 * Normalizes multi-shape 5D Broker payloads into AI Guru summary format
 */
export function normalize5DBrokerPayloadForAi(rawPayload) {
  const empty = {
    netAccumulationRatio: 50,
    topAccumulators: [],
    topDistributors: [],
    dominantRegime: 'NEUTRAL',
  };

  if (!rawPayload || typeof rawPayload !== 'object') return empty;
  const obj = rawPayload;

  const candidateArray = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(obj['5D'])
    ? obj['5D']
    : Array.isArray(obj['5d'])
    ? obj['5d']
    : Array.isArray(obj.brokers)
    ? obj.brokers
    : Array.isArray(obj.data)
    ? obj.data
    : [];

  if (candidateArray.length === 0) return empty;

  const RETAIL_GIANT_BASELINE = {
    '58': 0.085,
    '45': 0.042,
    '49': 0.038,
    '34': 0.032,
  };

  let totalBuyKitta = 0;
  let totalSellKitta = 0;

  const normalizedRows = candidateArray.map((rawItem) => {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
    const brokerId = String(item.brokerId ?? item.broker_no ?? item.broker ?? item.broker_id ?? '0').replace(/^0+/, '');
    const buyKitta = safeNum(item.buyKitta ?? item.buy_kitta ?? item.buyVolume ?? item.buy_vol, 0);
    const sellKitta = safeNum(item.sellKitta ?? item.sell_kitta ?? item.sellVolume ?? item.sell_vol, 0);
    const netKitta = safeNum(item.netKitta ?? item.net_kitta, buyKitta - sellKitta);
    const tradeCount = Math.max(1, safeNum(item.trades ?? item.trade_count ?? item.totalTrades, 1));
    const avgTicketKitta = safeNum(
      item.avgTicketKitta ?? item.avg_ticket_kitta,
      (buyKitta + sellKitta) / tradeCount
    );

    totalBuyKitta += buyKitta;
    totalSellKitta += sellKitta;

    const baselineShare = RETAIL_GIANT_BASELINE[brokerId] ?? 0.018;
    const ticketMultiplier = avgTicketKitta >= 300 ? 1.35 : avgTicketKitta < 45 ? 0.65 : 1.0;
    const rawAnomaly = safeNum(
      item.anomalyScore ?? item.broker_anomaly_score,
      (1 / (baselineShare * 50)) * ticketMultiplier
    );

    return {
      brokerId,
      netKitta,
      anomalyScore: Number(Math.max(0.1, rawAnomaly).toFixed(2)),
      avgTicketKitta: Math.round(avgTicketKitta),
    };
  });

  const topAccumulators = normalizedRows
    .filter((r) => r.netKitta > 0)
    .sort((a, b) => b.netKitta * b.anomalyScore - a.netKitta * a.anomalyScore)
    .slice(0, 5);

  const topDistributors = normalizedRows
    .filter((r) => r.netKitta < 0)
    .sort((a, b) => Math.abs(b.netKitta) - Math.abs(a.netKitta))
    .slice(0, 5);

  const totalVolume = totalBuyKitta + totalSellKitta;
  const netAccumulationRatio =
    totalVolume > 0
      ? Number(((totalBuyKitta / totalVolume) * 100).toFixed(1))
      : 50;

  const topAcc = topAccumulators[0];
  let dominantRegime = 'NEUTRAL';
  if (topAcc && topAcc.anomalyScore >= 1.75 && topAcc.avgTicketKitta >= 300 && netAccumulationRatio >= 54) {
    dominantRegime = 'INSTITUTIONAL_ACCUMULATION';
  } else if (netAccumulationRatio <= 45) {
    dominantRegime = 'DISTRIBUTION';
  } else if (topAcc && topAcc.avgTicketKitta < 45) {
    dominantRegime = 'RETAIL_CHURN';
  }

  return {
    netAccumulationRatio,
    topAccumulators,
    topDistributors,
    dominantRegime,
  };
}

/**
 * Deterministic institutional narrative generator
 */
export function buildDeterministicInstitutionalAnalysis(assessment) {
  const m = assessment.metrics;
  if (!m) return assessment.errorMarkdown || 'Telemetry unavailable.';

  const regimeLabel = m.smartMoney5D.dominantRegime.replace(/_/g, ' ');
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
          .join(', ')
      : 'No single outlier accumulator in 5D window';

  return [
    `### 🏛️ Institutional Quantitative Verdict: **${assessment.symbol}**`,
    `- **Verified Price Discovery:** **Rs ${m.verifiedPrice.toLocaleString()}** via *${assessment.priceAsOfLabel}* (${m.dayChangePct >= 0 ? '+' : ''}${m.dayChangePct}% session delta | 14D ATR: Rs ${m.atr14} / ${m.atrPct}%).`,
    `- **5D Smart Money & Broker Anomaly (${m.brokerAnomalyScore.toFixed(2)}x):** Regime classified as **${regimeLabel}** (${m.smartMoney5D.netAccumulationRatio.toFixed(1)}% buy pressure). ${ticketVerdict}. Top 5D accumulators: ${topAccList}.`,
    `- **Walk-Forward Excursion & Fee Hurdle:** Historical MFE is **+${m.mfePct.toFixed(2)}%** vs. MAE of **${m.maePct.toFixed(2)}%** (NEPSE Alpha: **${m.nepseAlphaPct >= 0 ? '+' : ''}${m.nepseAlphaPct.toFixed(2)}%**). Round-trip NEPSE friction (brokerage, 0.015% SEBON, Rs 50 DP, and 7.5% CGT) requires clearing **+${m.roundTripFeePct}%** for net positive expectancy.`,
    `- **T+2 Settlement & 1.2R Ratchet Shield:** Settlement status is **${m.t2UnlockStatus}**. ${
      ratchetCleared
        ? `Price excursion has cleared the +1.2R ratchet threshold; protective stop is locked at **Rs ${m.ratchetStopPrice}** (Entry + 1.2%).`
        : `Requires expansion above **Rs ${m.ratchetTriggerPrice}** (+1.2R) post-T+2 unlock to arm the **Rs ${m.ratchetStopPrice}** fee-protected ratchet stop.`
    }`,
  ].join('\n');
}

/**
 * Generate AI narrative with LLM (Gemini / OpenAI) or deterministic fallback
 */
export async function generateAiGuruNarrative(assessment) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: assessment.aiPromptContext }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
          }),
          signal: AbortSignal.timeout(12000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && typeof text === 'string' && text.trim().length > 20) {
          return { markdown: text.trim(), engine: 'LLM' };
        }
      }
    } catch (_) {}
  }

  if (openAiKey) {
    try {
      const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are the Drabyashree NEPSE Institutional Quantitative Analyst. Use exact numbers from the provided telemetry.',
            },
            { role: 'user', content: assessment.aiPromptContext },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text && typeof text === 'string' && text.trim().length > 20) {
          return { markdown: text.trim(), engine: 'LLM' };
        }
      }
    } catch (_) {}
  }

  return {
    markdown: buildDeterministicInstitutionalAnalysis(assessment),
    engine: 'DETERMINISTIC_QUANT',
  };
}

/**
 * Complete assessment pipeline
 */
export async function runScripAssessment(params) {
  const validSymbol = resolveValidNepseSymbol(
    params.symbol,
    params.fallbackSymbol,
    params.quote?.symbol,
    params.ledgerTelemetry?.symbol
  );

  if (!validSymbol) {
    return {
      ok: false,
      symbol: 'UNSELECTED',
      verifiedPrice: null,
      priceSource: 'UNAVAILABLE',
      priceAsOfLabel: 'No Scrip Selected',
      errorMarkdown: [
        `### ⚠️ No Active Scrip Selected`,
        `- Please select a valid NEPSE scrip symbol from the dashboard or Signal Track Record before running AI Guru.`,
      ].join('\n'),
      aiPromptContext: '',
    };
  }

  // Load SQLite telemetry if not passed by caller
  let effectiveLedger = params.ledgerTelemetry || null;
  let effectiveCandles = Array.isArray(params.candles) ? params.candles : [];
  let effectiveBroker5D = params.broker5DPayload || null;

  if (!effectiveLedger || effectiveCandles.length === 0) {
    try {
      const dbTelemetry = getScripLedgerTelemetry(validSymbol);
      if (dbTelemetry) {
        if (!effectiveLedger) effectiveLedger = dbTelemetry.ledgerRow || null;
        if (effectiveCandles.length === 0 && Array.isArray(dbTelemetry.candles)) {
          effectiveCandles = dbTelemetry.candles;
        }
      }
    } catch (_) {}
  }

  if (!effectiveBroker5D) {
    try {
      effectiveBroker5D = getSmartMoneyAggregatedFlow(validSymbol, 5);
    } catch (_) {}
  }

  // Resolve 4-stage verified price
  const { price, source, asOfLabel, prevCloseRef } = resolveVerifiedPrice(
    params.quote,
    effectiveCandles,
    effectiveLedger
  );

  if (price === null || price <= 0) {
    return {
      ok: false,
      symbol: validSymbol,
      verifiedPrice: null,
      priceSource: 'UNAVAILABLE',
      priceAsOfLabel: asOfLabel,
      errorMarkdown: [
        `### ⚠️ Data Insufficient for **${validSymbol}**`,
        `- Verified price could not be resolved across Live LTP, Today's Close, Previous Close, or Historical OHLCV candles.`,
        `- Ensure historical backfill or floor-sheet sync has run for **${validSymbol}**.`,
      ].join('\n'),
      aiPromptContext: '',
    };
  }

  // Technical & NEPSE Institutional metrics
  const atr14 = computeAtr14(effectiveCandles, price);
  const atrPct = Number(((atr14 / price) * 100).toFixed(2));
  const dayChangePct =
    prevCloseRef > 0 ? Number((((price - prevCloseRef) / prevCloseRef) * 100).toFixed(2)) : 0;

  const roundTripFeePct = 1.12;
  const entryRef = safeNum(effectiveLedger?.entry_vwap, price);
  const oneR = Math.max(atr14 * 1.5, entryRef * 0.03);
  const ratchetTriggerPrice = Number((entryRef + 1.2 * oneR).toFixed(2));
  const ratchetStopPrice = Number((entryRef * 1.012).toFixed(2));

  const mfePct = safeNum(effectiveLedger?.mfe_pct, 0);
  const maePct = safeNum(effectiveLedger?.mae_pct, 0);
  const nepseAlphaPct = safeNum(effectiveLedger?.nepse_alpha_pct, 0);
  const brokerAnomalyScore = safeNum(effectiveLedger?.broker_anomaly_score, 1.0);
  const avgTicketKitta = safeNum(effectiveLedger?.avg_ticket_kitta, 0);
  const unlockDate = effectiveLedger?.settlement_unlock_date || 'Unlocked / No Active Lock';

  const smartMoney5D = normalize5DBrokerPayloadForAi(effectiveBroker5D);

  const topAccText =
    smartMoney5D.topAccumulators.length > 0
      ? smartMoney5D.topAccumulators
          .slice(0, 3)
          .map(
            (b) =>
              `Broker #${b.brokerId} (+${b.netKitta.toLocaleString()} kitta, Anomaly: ${b.anomalyScore.toFixed(
                2
              )}x, Avg Ticket: ${Math.round(b.avgTicketKitta)} kitta)`
          )
          .join('; ')
      : `Ledger Anomaly Score ${brokerAnomalyScore.toFixed(2)}x | Avg Ticket ${Math.round(
          avgTicketKitta
        )} kitta`;

  const topDistText =
    smartMoney5D.topDistributors.length > 0
      ? smartMoney5D.topDistributors
          .slice(0, 3)
          .map(
            (b) =>
              `Broker #${b.brokerId} (${b.netKitta.toLocaleString()} kitta, Anomaly: ${b.anomalyScore.toFixed(
                2
              )}x)`
          )
          .join('; ')
      : 'None flagged';

  const aiPromptContext = `
[DRABYASHREE NEPSE INSTITUTIONAL TELEMETRY — ${validSymbol}]
1. Price Discovery & Feed Status:
   - Verified Price: Rs ${price.toFixed(2)} (Source: ${asOfLabel})
   - Session Change: ${dayChangePct >= 0 ? '+' : ''}${dayChangePct}% | 14D ATR: Rs ${atr14} (${atrPct}%)
   - Post-Fee Breakeven Floor: +${roundTripFeePct}% (includes Broker Comm, SEBON 0.015%, Rs 50 DP, 7.5% CGT rules)

2. Walk-Forward T+2 Signal Ledger (drabyashree_ledger.db):
   - Reference Entry VWAP: Rs ${entryRef.toFixed(2)}
   - T+2 Demat Settlement Unlock: ${unlockDate}
   - Max Favorable Excursion (MFE): +${mfePct.toFixed(2)}% | Max Adverse Excursion (MAE): ${maePct.toFixed(2)}%
   - Benchmark Relative Strength (NEPSE Alpha): ${nepseAlphaPct >= 0 ? '+' : ''}${nepseAlphaPct.toFixed(2)}%
   - 2-Stage Ratchet Shield: Trigger at Rs ${ratchetTriggerPrice} (+1.2R) -> Locks Stop-Loss at Rs ${ratchetStopPrice} (Entry + 1.2%)

3. 5D Big Broker Smart Money & Floor-Sheet Anomaly:
   - Baseline-Adjusted Broker Anomaly Score: ${brokerAnomalyScore.toFixed(2)}x (Retail giants like #58 deflated by 30D market share)
   - Average Ticket Size: ${Math.round(avgTicketKitta)} kitta (HNI/Institutional threshold >= 300 kitta; Retail herd < 45 kitta)
   - 5D Accumulation Pressure: ${smartMoney5D.netAccumulationRatio.toFixed(1)}% (${smartMoney5D.dominantRegime})
   - Top 5D Accumulators: ${topAccText}
   - Top 5D Distributors: ${topDistText}

INSTRUCTIONS FOR AI GURU:
Provide a concise, institutional-grade NEPSE quantitative assessment for ${validSymbol}. Explicitly evaluate whether 5D broker accumulation reflects genuine HNI/institutional conviction (>= 300 kitta ticket & high anomaly score) or retail churn, verify if MFE/ATR supports clearing the 1.2R Ratchet Shield after T+2 settlement lock, and state clear invalidation levels.
`.trim();

  return {
    ok: true,
    symbol: validSymbol,
    verifiedPrice: price,
    priceSource: source,
    priceAsOfLabel: asOfLabel,
    metrics: {
      verifiedPrice: price,
      priceSource: source,
      dayChangePct,
      atr14,
      atrPct,
      roundTripFeePct,
      ratchetTriggerPrice,
      ratchetStopPrice,
      t2UnlockStatus: unlockDate,
      mfePct,
      maePct,
      nepseAlphaPct,
      brokerAnomalyScore,
      avgTicketKitta,
      smartMoney5D,
    },
    aiPromptContext,
  };
}

/**
 * Mounts GET /api/ai-guru/assess and POST /api/ai-guru/assess
 */
router.all('/assess', async (req, res) => {
  try {
    const isPost = req.method === 'POST';
    const body = isPost ? (req.body || {}) : {};
    const query = req.query || {};

    const symbol = body.symbol ?? body.ticker ?? query.symbol ?? query.ticker;
    const fallbackSymbol = body.fallbackSymbol ?? query.fallbackSymbol;
    const clientQuote = body.quote ?? body.quoteData ?? null;
    const clientCandles = Array.isArray(body.candles) ? body.candles : undefined;
    const clientLedger = body.ledgerTelemetry ?? null;
    const clientBroker5D = body.broker5DPayload ?? null;

    const assessment = await runScripAssessment({
      symbol,
      fallbackSymbol,
      quote: clientQuote,
      candles: clientCandles,
      ledgerTelemetry: clientLedger,
      broker5DPayload: clientBroker5D,
    });

    if (!assessment.ok) {
      return res.json({
        ...assessment,
        analysisMarkdown: assessment.errorMarkdown,
        engine: 'VALIDATOR',
      });
    }

    const { markdown, engine } = await generateAiGuruNarrative(assessment);

    return res.json({
      ...assessment,
      analysisMarkdown: markdown,
      engine,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[aiGuruRoutes] Assessment handler error:', err);
    return res.status(500).json({
      ok: false,
      symbol: 'ERROR',
      errorMarkdown: `### ⚠️ AI Guru Error\n- ${err.message}`,
      engine: 'ERROR',
    });
  }
});

export default router;
