/**
 * Stage 3 — Analyzer Validation & Calibration
 * ─────────────────────────────────────────────────────────────
 * src/utils/analyzerValidation.js
 *
 * PURPOSE
 * -------
 * This module contains:
 *
 *   1. DETERMINISTIC TEST SUITE  (runDeterministicTests)
 *      Six concrete test cases with known ground-truth answers to
 *      verify the backtest and analog engine behave correctly before
 *      any real stock data is involved.
 *
 *   2. LOOK-AHEAD BIAS AUDIT  (auditLookAheadBias)
 *      Given a complete candle array, verifies that no fingerprint
 *      built at index i actually used data from indices > i.
 *
 *   3. DOUBLE-COUNTING AUDIT  (auditDoubleCountingRisk)
 *      Examines which raw inputs are shared across scoring groups and
 *      returns a human-readable report of any information that appears
 *      in more than one group.
 *
 *   4. SCORE DISTRIBUTION CHECK  (auditScoreDistribution)
 *      Runs the scorer over a set of candle histories and checks
 *      whether the combined score distribution is meaningfully spread,
 *      i.e. not clustering too tightly in the middle.
 *
 *   5. CORPORATE ACTION VALIDATION  (auditCorporateActions)
 *      Verifies that the adjuster correctly handles bonus/right-share
 *      events on synthetic histories where the exact event dates and
 *      sizes are known.
 *
 *   6. CIRCUIT-BREAKER AWARE TARGET CHECK  (auditCircuitBreakers)
 *      Verifies that ATR-based targets don't imply moves impossible
 *      under NEPSE's ±5%/±10% intraday circuit-breaker rules within
 *      the stated holding period.
 *
 * HOW TO RUN
 * ----------
 * From an ESM environment (Node with --experimental-vm-modules, or
 * a Vite/Vitest test file):
 *
 *   import { runAllValidations } from './analyzerValidation';
 *   const report = await runAllValidations(generateEntryExitPlan);
 *   console.log(JSON.stringify(report, null, 2));
 *
 * Or call individual audits:
 *   import { runDeterministicTests } from './analyzerValidation';
 *   const r = runDeterministicTests();
 *   r.forEach(t => console.log(t.name, t.pass ? 'PASS' : 'FAIL', t.notes));
 *
 * IMPORTANT
 * ---------
 * This module never modifies production code.
 * It only reads and tests.
 * It is safe to ship — in production the tests simply never run unless
 * you call them explicitly.
 */

// ─────────────────────────── helpers ────────────────────────────

/** Build a perfectly deterministic price series using a seeded LCG. */
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Builds a synthetic ascending OHLCV candle array with known properties.
 * @param {object} opts
 *   seed        - RNG seed (reproducible)
 *   days        - total candles
 *   startPrice  - initial close price
 *   drift       - daily drift fraction (e.g. +0.002 = mild uptrend)
 *   volatility  - daily std dev fraction (e.g. 0.02 = 2%)
 *   bonusEvents - [{dayIndex, bonusPct}] — inserts known bonus-share drops
 */
export function buildSyntheticCandles({
  seed = 42,
  days = 400,
  startPrice = 300,
  drift = 0.001,
  volatility = 0.02,
  bonusEvents = [],
}) {
  const rng = seededRng(seed);
  const candles = [];
  let px = startPrice;
  const start = new Date('2023-01-01');

  for (let i = 0; i < days; i++) {
    const r = rng() - 0.5;
    px = Math.max(5, px * (1 + drift + r * volatility * 2));

    // Insert known corporate action on the specified day
    const bonus = bonusEvents.find((e) => e.dayIndex === i);
    if (bonus) {
      // NEPSE price adjustment formula: P_adj = P / (1 + bonus_ratio)
      px = px / (1 + bonus.bonusPct / 100);
    }

    const o = px * (1 + (rng() - 0.5) * 0.01);
    const h = Math.max(o, px) * (1 + rng() * 0.01);
    const l = Math.min(o, px) * (1 - rng() * 0.01);
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    candles.push({
      date: d.toISOString().slice(0, 10),
      open: +o.toFixed(2),
      high: +h.toFixed(2),
      low: +l.toFixed(2),
      close: +px.toFixed(2),
      volume: Math.floor(50000 + rng() * 300000),
    });
  }
  return candles;
}

// ─────────────────── Test A: next-day-open entry ─────────────────

/**
 * Test A: Analog signal day = index i. Entry must use day i+1's open,
 * NOT day i's close. If next-day open is unavailable, use next-day close.
 * Never silently use the signal-day close.
 */
function testA_nextDayOpenEntry(simulateForwardOutcome, candles) {
  const signalIdx = 100;
  const entryCandle = candles[signalIdx + 1]; // the actual entry day
  const expectedEntry = entryCandle?.open ?? entryCandle?.close;

  const result = simulateForwardOutcome(candles, signalIdx, {
    atrStopMult: 1.5,
    atrT1Mult: 2.5,
    atrT2Mult: 4.0,
    maxHoldDays: 20,
  });

  const actualEntry = result.entryPrice;
  const entryMethod = result.entryMethod;
  const signalClose = candles[signalIdx].close;

  const usedSignalClose = Math.abs(actualEntry - signalClose) < 0.01;
  const usedNextDayOpen = Math.abs(actualEntry - expectedEntry) < 0.01;

  return {
    name: 'Test A — Next-day open entry (not signal-day close)',
    pass: !usedSignalClose && (usedNextDayOpen || entryMethod === 'next_day_close_fallback'),
    notes: usedSignalClose
      ? `FAIL: Used signal-day close ${signalClose} as entry — look-ahead bias!`
      : usedNextDayOpen
      ? `PASS: Correctly used next-day open ${actualEntry} (entryMethod: ${entryMethod})`
      : `PASS: Used fallback entry ${actualEntry} (entryMethod: ${entryMethod})`,
    actual: { actualEntry, entryMethod, signalClose, expectedNextDayOpen: expectedEntry },
  };
}

// ─────────────── Test B: target reached only → win ───────────────

function testB_targetOnlyWin(simulateForwardOutcome) {
  // Craft a candle array where price steadily rises past T1 but never
  // touches the stop — outcome must be target1_hit, returnPct > 0.
  const rng = seededRng(99);
  const entry = 300;
  const stop = entry * 0.95;    // -5%
  const t1   = entry * 1.10;    // +10%

  const candles = [{ date: '2024-01-01', open: entry, high: entry * 1.02, low: entry * 0.99, close: entry, volume: 100000 }];
  for (let i = 1; i <= 25; i++) {
    const prev = candles[i - 1].close;
    const c = prev * (1 + 0.003 + (rng() - 0.48) * 0.005); // mild uptrend, never drops to stop
    const h = c * (1 + rng() * 0.005);
    const l = Math.max(stop + 5, c * (1 - rng() * 0.003));
    candles.push({ date: `2024-01-${String(i + 1).padStart(2,'0')}`, open: prev, high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2), volume: 100000 });
  }

  const result = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.5, atrT2Mult: 4.0, maxHoldDays: 25 });

  const isWin = result.returnPct > 0;
  const noStop = result.outcome !== 'stop_hit';

  return {
    name: 'Test B — Target reached only → winning trade',
    pass: isWin && noStop,
    notes: isWin && noStop
      ? `PASS: returnPct=${result.returnPct}%, outcome=${result.outcome}`
      : `FAIL: returnPct=${result.returnPct}%, outcome=${result.outcome}`,
    actual: result,
  };
}

// ─────────────── Test C: stop reached only → loss ────────────────

function testC_stopOnlyLoss(simulateForwardOutcome) {
  const entry = 300;

  const candles = [{ date: '2024-01-01', open: entry, high: entry * 1.005, low: entry * 0.998, close: entry, volume: 100000 }];
  // Price falls steadily — stop will be hit, target won't
  const rng = seededRng(77);
  for (let i = 1; i <= 20; i++) {
    const prev = candles[i - 1].close;
    const c = prev * (1 - 0.004 - rng() * 0.003); // consistent downtrend
    const h = prev * (1 + rng() * 0.002);
    const l = c * (1 - rng() * 0.005);
    candles.push({ date: `2024-01-${String(i + 1).padStart(2,'0')}`, open: prev, high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2), volume: 100000 });
  }

  const result = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.5, atrT2Mult: 4.0, maxHoldDays: 20 });

  const isLoss = result.returnPct < 0;
  const isStop = result.outcome === 'stop_hit' || result.outcomeType === 'stop_hit';

  return {
    name: 'Test C — Stop reached only → losing trade',
    pass: isLoss && isStop,
    notes: isLoss && isStop
      ? `PASS: returnPct=${result.returnPct}%, outcome=${result.outcome}`
      : `FAIL: returnPct=${result.returnPct}%, outcome=${result.outcome}`,
    actual: result,
  };
}

// ───────── Test D: same-candle ambiguity → conservative handling ──

function testD_sameCandelAmbiguity(simulateForwardOutcome) {
  // Day 0: entry candle
  // Day 1: single candle whose high >= T1 AND low <= stop in same day
  const entry = 300;

  const day0 = { date: '2024-01-01', open: entry, high: entry * 1.005, low: entry * 0.998, close: entry, volume: 100000 };

  // We need to know what the atrT1Mult and atrStopMult would produce.
  // Use a tiny ATR so T1 and stop are predictable.
  // Let's place T1 at +10% and stop at -5%.
  // Day 1 candle: low = stop - 1%, high = T1 + 1% (both hit)
  const day1High = entry * 1.11;  // above T1
  const day1Low  = entry * 0.944; // below stop (assuming ~5% stop)
  const day1 = { date: '2024-01-02', open: entry * 1.001, high: +day1High.toFixed(2), low: +day1Low.toFixed(2), close: entry * 1.02, volume: 100000 };

  const candles = [day0, day1];

  const result = simulateForwardOutcome(candles, 0, { atrStopMult: 1.5, atrT1Mult: 2.5, atrT2Mult: 4.0, maxHoldDays: 10 });

  // The correct conservative rule: when both hit in the same candle, treat stop as first (loss)
  const isConservative =
    result.outcomeType === 'ambiguous_intraday' ||
    result.outcome === 'stop_hit' ||
    result.returnPct < 0;

  const hasAmbiguityFlag =
    result.outcomeType === 'ambiguous_intraday' ||
    result.ambiguous === true;

  return {
    name: 'Test D — Same-candle stop+target ambiguity → conservative / flagged',
    pass: isConservative,
    notes: isConservative
      ? `PASS: conservative handling applied. outcomeType=${result.outcomeType}, returnPct=${result.returnPct}%`
      : `FAIL: should have applied conservative stop-first rule. outcomeType=${result.outcomeType}, returnPct=${result.returnPct}%`,
    ambiguityFlagged: hasAmbiguityFlag,
    actual: result,
  };
}

// ──────────── Test E: insufficient history → supported:false ──────

function testE_insufficientHistory(generateEntryExitPlan) {
  const shortCandles = buildSyntheticCandles({ days: 40, seed: 55 }); // well below 80-day minimum
  const stock = { symbol: 'SHORT', ltp: shortCandles[shortCandles.length - 1].close };
  const result = generateEntryExitPlan(stock, shortCandles);

  return {
    name: 'Test E — Insufficient history → supported:false',
    pass: result.supported === false,
    notes: result.supported === false
      ? `PASS: correctly returned supported:false. reason="${result.reason}"`
      : `FAIL: should have returned supported:false, got supported:${result.supported}`,
    actual: { supported: result.supported, reason: result.reason },
  };
}

// ───── Test F: future data must not influence historical fingerprint ─

/**
 * Test F: Take a complete 300-day series.
 * Build fingerprint at day 150.
 * Then append 50 more candles with deliberately extreme prices.
 * Rebuild fingerprint at day 150 on the extended series.
 * Both fingerprints MUST be identical — if extra future candles change
 * the day-150 snapshot, there is look-ahead bias.
 */
function testF_noLookAheadInFingerprint(buildIndicatorSeries) {
  const candles300 = buildSyntheticCandles({ days: 300, seed: 11 });
  const series300 = buildIndicatorSeries(candles300);
  const snap150_short = series300[150];

  // Append 50 extreme candles (price suddenly 10x)
  const extension = buildSyntheticCandles({ days: 50, seed: 22, startPrice: candles300[299].close * 10 });
  const combined = [...candles300, ...extension];
  const series350 = buildIndicatorSeries(combined);
  const snap150_long = series350[150];

  if (!snap150_short || !snap150_long) {
    return { name: 'Test F — No look-ahead bias in fingerprint', pass: false, notes: 'FAIL: snapshots unavailable at index 150' };
  }

  const fields = ['rsi14', 'pricePos52w', 'rvol', 'ret5', 'ret20', 'bbWidthPct'];
  const diffs = fields.map((f) => ({ field: f, short: snap150_short[f], long: snap150_long[f], diff: Math.abs((snap150_short[f] || 0) - (snap150_long[f] || 0)) }));
  const maxDiff = Math.max(...diffs.map((d) => d.diff));
  const pass = maxDiff < 0.001;

  return {
    name: 'Test F — No look-ahead bias in fingerprint',
    pass,
    notes: pass
      ? `PASS: fingerprint at index 150 unchanged after appending 50 future candles (maxDiff=${maxDiff.toFixed(6)})`
      : `FAIL: fingerprint at index 150 changed when future candles were added (maxDiff=${maxDiff.toFixed(4)}). Look-ahead bias detected!`,
    fieldDiffs: diffs,
  };
}

// ─────────────── Look-ahead audit (broader scan) ─────────────────

/**
 * For each snapshot at index i, verifies that every price/volume value
 * used is actually from candles[0..i]. Uses injection of a "sentinel"
 * future price to detect leakage.
 */
export function auditLookAheadBias(buildIndicatorSeries, candles) {
  const SENTINEL = 999999.99;
  const results = [];

  // Test 20 randomly chosen indices
  const testIndices = [70, 100, 130, 160, 200, 250].filter((i) => i < candles.length - 5);

  for (const testIdx of testIndices) {
    // Baseline snapshot at testIdx
    const baseline = buildIndicatorSeries(candles);
    const baseSnap = baseline[testIdx];

    // Inject sentinel into the day AFTER testIdx (future data)
    const tampered = candles.map((c, j) =>
      j === testIdx + 1 ? { ...c, close: SENTINEL, high: SENTINEL, low: SENTINEL, open: SENTINEL } : c
    );
    const tamperedSeries = buildIndicatorSeries(tampered);
    const tamperedSnap = tamperedSeries[testIdx];

    if (!baseSnap || !tamperedSnap) continue;

    const fields = ['rsi14', 'pricePos52w', 'ret5', 'ret20', 'bbWidthPct', 'atrPct'];
    const leaked = fields.filter((f) => {
      const base = baseSnap[f] || 0;
      const tampered_v = tamperedSnap[f] || 0;
      return Math.abs(base - tampered_v) > 0.01;
    });

    results.push({
      testIdx,
      pass: leaked.length === 0,
      leakedFields: leaked,
      notes: leaked.length === 0
        ? `Index ${testIdx}: PASS — no future data leaked`
        : `Index ${testIdx}: FAIL — future sentinel value affected: ${leaked.join(', ')}`,
    });
  }

  const allPass = results.every((r) => r.pass);
  return {
    auditName: 'Look-Ahead Bias Audit',
    pass: allPass,
    summary: allPass ? 'No look-ahead bias detected' : 'LOOK-AHEAD BIAS DETECTED — see leakedFields',
    details: results,
  };
}

// ────────────────── Double-counting audit ────────────────────────

/**
 * Examines the scoring group definitions and flags any raw inputs
 * shared across multiple groups. Returns a readability report
 * without changing any code.
 */
export function auditDoubleCountingRisk() {
  // Each scoring group and the raw indicator inputs it uses
  const groups = {
    'Trend/EMA Structure': ['ema20', 'ema50', 'ema200', 'sma20', 'sma50', 'sma200', 'price_vs_ema20', 'price_vs_ema50', 'price_vs_ema200'],
    'Momentum': ['rsi14', 'macd_line', 'macd_histogram', 'ret5', 'ret20', 'rsi_slope'],
    'Price Action': ['hh_hl_structure', 'swing_highs', 'swing_lows', 'consolidation', 'trend_direction'],
    'Support/Resistance': ['swing_highs_sr', 'swing_lows_sr', '52w_high', '52w_low', 'pivot_points'],
    'Breakout/Pattern': ['price_vs_resistance', 'volume_on_breakout', 'candlestick_pattern', 'bb_breakout'],
    'Volume': ['rvol', 'volume_trend', 'ad_index', 'volume_z_score'],
    'Historical Analogs': ['rsi14', 'pricePos52w', 'rvol', 'ret5', 'ret20', 'bbWidthPct', 'price_vs_ema50'],
    'Strategy Track Record': ['backtest_win_rate', 'backtest_return', 'backtest_drawdown'],
    'NEPSE Market Context': ['nepse_trend', 'nepse_momentum', 'market_breadth'],
    'Sector Context': ['sector_trend', 'sector_rs'],
  };

  // Find inputs shared across groups
  const inputToGroups = {};
  for (const [group, inputs] of Object.entries(groups)) {
    for (const input of inputs) {
      if (!inputToGroups[input]) inputToGroups[input] = [];
      inputToGroups[input].push(group);
    }
  }

  const sharedInputs = Object.entries(inputToGroups)
    .filter(([, grps]) => grps.length > 1)
    .map(([input, grps]) => ({ input, appearsIn: grps, riskLevel: grps.length >= 3 ? 'HIGH' : 'MEDIUM' }));

  const highRisk = sharedInputs.filter((s) => s.riskLevel === 'HIGH');

  return {
    auditName: 'Double-Counting Risk Audit',
    sharedInputs,
    highRiskCount: highRisk.length,
    summary: sharedInputs.length === 0
      ? 'No double-counting detected'
      : `${sharedInputs.length} shared input(s) found. ${highRisk.length} HIGH-risk (used in 3+ groups).`,
    recommendation: sharedInputs.length > 0
      ? 'Review each shared input. The most common: rsi14, rvol, ret5, ret20 appear in both Momentum and Historical Analogs groups. Consider using rsi14 only in Momentum and using a composite trend flag (not raw rsi) in Analog fingerprinting.'
      : 'Groups appear well-isolated.',
  };
}

// ────────────────── Score distribution check ─────────────────────

/**
 * Runs generateEntryExitPlan over a set of candle histories and
 * checks that the combined score is meaningfully spread (not all
 * clustering between 45-65, which would make the thresholds useless).
 */
export function auditScoreDistribution(generateEntryExitPlan, testHistories) {
  const scores = [];
  const results = [];

  for (const { label, candles, stock } of testHistories) {
    try {
      const plan = generateEntryExitPlan(stock, candles);
      if (plan.supported) {
        const score = plan.setupScore ?? plan.combinedScore ?? null;
        if (score !== null && Number.isFinite(score)) {
          scores.push(score);
          results.push({ label, score, verdict: plan.verdict });
        } else {
          results.push({ label, score: null, verdict: plan.verdict, note: 'setupScore/combinedScore not a finite number' });
        }
      } else {
        results.push({ label, supported: false, reason: plan.reason });
      }
    } catch (err) {
      results.push({ label, error: err.message });
    }
  }

  if (scores.length === 0) {
    return { auditName: 'Score Distribution Audit', pass: false, summary: 'No valid scores produced', results };
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const spread = max - min;

  // Check: if all scores cluster tightly (spread < 20) the thresholds are meaningless
  const tightClustering = spread < 20;

  // Check: no NaN, Infinity, or values outside [0,100]
  const invalidScores = scores.filter((s) => !Number.isFinite(s) || s < 0 || s > 100);

  const pass = !tightClustering && invalidScores.length === 0;

  return {
    auditName: 'Score Distribution Audit',
    pass,
    summary: pass
      ? `PASS: Scores spread across ${spread.toFixed(1)} points (${min.toFixed(1)} – ${max.toFixed(1)}). Mean: ${mean.toFixed(1)}.`
      : `WARN: ${tightClustering ? `Tight clustering — spread only ${spread.toFixed(1)} points` : ''} ${invalidScores.length > 0 ? `${invalidScores.length} invalid score(s): ${invalidScores.join(',')}` : ''}`,
    stats: { min: +min.toFixed(1), max: +max.toFixed(1), mean: +mean.toFixed(1), spread: +spread.toFixed(1), count: scores.length },
    results,
  };
}

// ──────────────── Corporate action validation ─────────────────────

/**
 * Builds synthetic candles with KNOWN bonus events and verifies that
 * the adjuster (normalizeCorporateActionPrices or adjustForCorporateActions)
 * correctly identifies and adjusts them.
 */
export function auditCorporateActions(adjustFn, dividendHistory = []) {
  // Known bonus: 30% on day 200 → price should drop by 30/130 ≈ 23.1%
  const bonusPct = 30;
  const bonusDayIdx = 200;
  const candles = buildSyntheticCandles({
    seed: 17,
    days: 300,
    startPrice: 400,
    drift: 0.001,
    volatility: 0.015,
    bonusEvents: [{ dayIndex: bonusDayIdx, bonusPct }],
  });

  // Raw price drop on bonus day
  const rawDrop = ((candles[bonusDayIdx - 1].close - candles[bonusDayIdx].close) / candles[bonusDayIdx - 1].close) * 100;
  const expectedDrop = (bonusPct / (100 + bonusPct)) * 100;

  const { adjustedCandles, events } = typeof adjustFn === 'function'
    ? adjustFn(candles, dividendHistory)
    : { adjustedCandles: candles, events: [] };

  // After adjustment, prices before the event should be adjusted so the
  // series looks continuous. The adjusted close BEFORE the bonus day
  // should be proportionally lower than the raw close.
  const adjClose_beforeEvent = adjustedCandles[bonusDayIdx - 1].close;
  const rawClose_beforeEvent = candles[bonusDayIdx - 1].close;
  const adjClose_afterEvent  = adjustedCandles[bonusDayIdx].close;

  const continuityGap = Math.abs(adjClose_beforeEvent - adjClose_afterEvent) / adjClose_afterEvent;

  // A perfectly adjusted series has continuity_gap ≈ 0 at the event boundary
  const wellAdjusted = continuityGap < 0.02; // within 2%

  const eventDetected = events.some((e) => {
    const d = e.date;
    return d === candles[bonusDayIdx].date;
  });

  return {
    auditName: 'Corporate Action Adjustment Audit',
    pass: wellAdjusted,
    rawDropPct: +rawDrop.toFixed(2),
    expectedDropPct: +expectedDrop.toFixed(2),
    dropSizeCorrect: Math.abs(rawDrop - expectedDrop) < 2,
    eventDetected,
    continuityGap: +continuityGap.toFixed(4),
    summary: wellAdjusted
      ? `PASS: Adjusted series is continuous across bonus event (gap=${(continuityGap * 100).toFixed(2)}%)`
      : `FAIL: Adjusted series still has ${(continuityGap * 100).toFixed(2)}% gap at bonus event boundary`,
    events,
  };
}

// ──────────────── Circuit-breaker-aware target check ─────────────

/**
 * NEPSE circuit rules:
 *   ±5%  for most stocks, with special ±10% in some sessions.
 * This audit checks that ATR-based T1 and T2 levels don't imply
 * daily moves beyond circuit limits within the target holding period.
 *
 * i.e. if T1 is +12% above entry and holding is 5 days, the implied
 * daily gain needed is 12%/5 = 2.4% — well within ±5% circuit.
 * But if T2 is +18% in 3 days → 6%/day → beyond ±5% → flag it.
 */
export function auditCircuitBreakers(levels, expectedHoldingDays = 20, circuitLimitPct = 5) {
  const issues = [];

  if (!levels) return { auditName: 'Circuit-Breaker Audit', pass: false, summary: 'No levels provided' };

  const ltp = levels.ltp || levels.entryZone?.min || 0;
  const t1 = levels.target1?.price ?? null;
  const t2 = levels.target2?.price ?? null;

  if (t1 && ltp > 0) {
    const pct = ((t1 - ltp) / ltp) * 100;
    const impliedDailyPct = pct / expectedHoldingDays;
    if (impliedDailyPct > circuitLimitPct) {
      issues.push({
        target: 'T1',
        totalPct: +pct.toFixed(1),
        impliedDailyPct: +impliedDailyPct.toFixed(2),
        circuitLimitPct,
        note: `T1 (+${pct.toFixed(1)}%) over ${expectedHoldingDays} days implies ${impliedDailyPct.toFixed(2)}%/day — exceeds ±${circuitLimitPct}% circuit limit`,
      });
    }
  }

  if (t2 && ltp > 0) {
    const pct = ((t2 - ltp) / ltp) * 100;
    const impliedDailyPct = pct / expectedHoldingDays;
    if (impliedDailyPct > circuitLimitPct) {
      issues.push({
        target: 'T2',
        totalPct: +pct.toFixed(1),
        impliedDailyPct: +impliedDailyPct.toFixed(2),
        circuitLimitPct,
        note: `T2 (+${pct.toFixed(1)}%) over ${expectedHoldingDays} days implies ${impliedDailyPct.toFixed(2)}%/day — exceeds ±${circuitLimitPct}% circuit limit`,
      });
    }
  }

  return {
    auditName: 'Circuit-Breaker Audit',
    pass: issues.length === 0,
    issues,
    summary: issues.length === 0
      ? `PASS: T1/T2 targets are reachable within ±${circuitLimitPct}% daily circuit constraints`
      : `WARN: ${issues.length} target(s) imply daily moves exceeding circuit limits — may be unreachable in practice`,
  };
}

// ─────────────────── Deterministic test runner ───────────────────

/**
 * Runs all 6 deterministic tests (A–F).
 * Pass in the functions from setupAnalyzer.js.
 */
export function runDeterministicTests({ generateEntryExitPlan, simulateForwardOutcome, buildIndicatorSeries }) {
  const candles400 = buildSyntheticCandles({ seed: 42, days: 400 });

  return [
    testA_nextDayOpenEntry(simulateForwardOutcome, candles400),
    testB_targetOnlyWin(simulateForwardOutcome),
    testC_stopOnlyLoss(simulateForwardOutcome),
    testD_sameCandelAmbiguity(simulateForwardOutcome),
    testE_insufficientHistory(generateEntryExitPlan),
    testF_noLookAheadInFingerprint(buildIndicatorSeries),
  ];
}

// ──────────────────── Master runner ──────────────────────────────

/**
 * Runs ALL validations and returns a consolidated report.
 * @param {object} fns  — { generateEntryExitPlan, simulateForwardOutcome, buildIndicatorSeries, adjustForCorporateActions }
 * @param {object} opts — { candles?: OHLCV[], dividendHistory?: any[] }
 */
export async function runAllValidations(fns, opts = {}) {
  const candles = opts.candles || buildSyntheticCandles({ seed: 42, days: 400 });
  const dividendHistory = opts.dividendHistory || [];

  const deterministicTests = runDeterministicTests(fns);
  const lookAhead = auditLookAheadBias(fns.buildIndicatorSeries, candles);
  const doubleCounting = auditDoubleCountingRisk();
  const corporateActions = auditCorporateActions(fns.adjustForCorporateActions, dividendHistory);

  // Score distribution across 6 synthetic scenarios
  const scenarios = [
    { label: 'Uptrend stock',     candles: buildSyntheticCandles({ seed: 1, days: 400, drift: +0.003, volatility: 0.015 }), stock: { symbol: 'UP', ltp: 0, pChange: 1.5 } },
    { label: 'Downtrend stock',   candles: buildSyntheticCandles({ seed: 2, days: 400, drift: -0.003, volatility: 0.018 }), stock: { symbol: 'DN', ltp: 0, pChange: -1.8 } },
    { label: 'Sideways stock',    candles: buildSyntheticCandles({ seed: 3, days: 400, drift:  0.000, volatility: 0.010 }), stock: { symbol: 'SW', ltp: 0, pChange: 0.2 } },
    { label: 'High-vol stock',    candles: buildSyntheticCandles({ seed: 4, days: 400, drift: +0.001, volatility: 0.040 }), stock: { symbol: 'HV', ltp: 0, pChange: 2.1 } },
    { label: 'Thin-history stock',candles: buildSyntheticCandles({ seed: 5, days: 120, drift: +0.001, volatility: 0.020 }), stock: { symbol: 'TH', ltp: 0, pChange: 0.5 } },
    { label: 'Bear bounce stock', candles: buildSyntheticCandles({ seed: 6, days: 400, drift: -0.001, volatility: 0.025 }), stock: { symbol: 'BB', ltp: 0, pChange: 3.0 } },
  ].map((s) => {
    // Patch in ltp from last candle
    s.stock.ltp = s.candles[s.candles.length - 1].close;
    return s;
  });

  const scoreDistribution = auditScoreDistribution(fns.generateEntryExitPlan, scenarios);

  const allPassed = [
    ...deterministicTests.map((t) => t.pass),
    lookAhead.pass,
    corporateActions.pass,
    scoreDistribution.pass,
  ].every(Boolean);

  return {
    timestamp: new Date().toISOString(),
    overallPass: allPassed,
    summary: allPassed ? 'All validations PASSED' : 'Some validations FAILED — see details',
    deterministicTests,
    lookAheadAudit: lookAhead,
    doubleCountingAudit: doubleCounting,
    corporateActionAudit: corporateActions,
    scoreDistributionAudit: scoreDistribution,
  };
}
