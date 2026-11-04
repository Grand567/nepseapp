/**
 * Signal Arbitration & Confluence Resolution Engine
 * ─────────────────────────────────────────────────────────────────────
 * Resolves contradictions between Technical Indicators (RSI, EMA, MACD)
 * and Broker Smart Money Order Flow (BCR3, SCR3, Wyckoff phases).
 *
 * Prevents contradictory UI signals like displaying both:
 * "🟢 Strong Bullish Uptrend (+82/100)" AND "🔴 Distribution Danger"
 * by synthesizing them into coherent, actionable market verdicts.
 */

export function reconcileTechnicalAndBrokerSignals({
  technical = {},
  broker = {},
  symbol = '',
  ltp = 0
}) {
  const techScore = Number(technical?.score || 50);
  const trendDir = technical?.trend?.direction || 'NEUTRAL';
  const momentumState = technical?.momentum?.state || 'neutral';

  const bcr3 = Number(broker?.bcr3BuyPct || broker?.bcr3 || 0);
  const scr3 = Number(broker?.scr3SellPct || broker?.scr3 || 0);
  const adSignal = String(broker?.adSignal || 'Neutral').toLowerCase();
  const isVetoed = Boolean(broker?.orderFlowVeto?.isVetoed);
  const brokerPhase = String(broker?.phase || '');

  const isTechBullish = techScore >= 65 || (trendDir === 'BULLISH' && techScore >= 55);
  const isTechBearish = techScore <= 38 || (trendDir === 'BEARISH' && techScore <= 45);

  const isBrokerAccumulation = adSignal === 'accumulation' || (bcr3 >= 48 && scr3 < 35);
  const isBrokerDistribution = isVetoed || adSignal === 'distribution' || scr3 >= 48 || brokerPhase === 'BULL_TRAP' || brokerPhase === 'DISTRIBUTION_DANGER';

  // ── Arbitration Matrix ──
  if (isTechBullish && isBrokerDistribution) {
    return {
      symbol,
      verdict: 'BULL_TRAP_DIVERGENCE',
      verdictLabel: '⚠️ Bull Trap Warning: Technical Uptrend with Heavy Smart Money Distribution',
      verdictLabelNp: '⚠️ बुल ट्रयाप चेतावनी: प्राविधिक वृद्धि भए पनि ठूला ब्रोकरहरूको भारी बिक्री',
      severity: 'WARNING',
      compositeBias: 'BEARISH_DIVERGENCE',
      recommendation: 'DO_NOT_CHASE',
      actionEn: 'Do not chase new highs. Major brokers are dumping into retail liquidity.',
      actionNp: 'नयाँ उच्च मूल्यमा शेयर खरिद नगर्नुहोस्। प्रमुख ब्रोकरहरूले साधारण लगानीकर्ताहरूलाई शेयर बेचिरहेका छन्।',
      techScore,
      bcr3,
      scr3,
      smartMoneyBias: 'Operator Offloading',
      reconciledScore: Math.min(45, techScore - 35)
    };
  }

  if (isTechBearish && isBrokerAccumulation) {
    return {
      symbol,
      verdict: 'WYCKOFF_SPRING_ABSORPTION',
      verdictLabel: '🛡️ Wyckoff Spring: Price Depressed but Smart Money Absorbing Supply',
      verdictLabelNp: '🛡️ वाइकफ स्प्रिङ: मूल्य घटे पनि ठूला ब्रोकरहरूबाट गोप्य संकलन',
      severity: 'OPPORTUNITY',
      compositeBias: 'ACCUMULATION_SPRING',
      recommendation: 'ACCUMULATE_ON_PULLBACK',
      actionEn: 'Institutional accumulation detected at support. High-probability reversal setup.',
      actionNp: 'समर्थन स्तरमा संस्थागत ब्रोकरहरूको गोप्य खरिद भेटिएको छ। बजार उल्टिने उच्च सम्भावना।',
      techScore,
      bcr3,
      scr3,
      smartMoneyBias: 'Institutional Absorption',
      reconciledScore: Math.max(68, techScore + 32)
    };
  }

  if (isTechBullish && isBrokerAccumulation) {
    return {
      symbol,
      verdict: 'STRONG_CONFLUENCE_BULLISH',
      verdictLabel: '🟢 High-Conviction Confluence: Technical Uptrend Backed by Smart Money',
      verdictLabelNp: '🟢 बलियो बुलिश पुष्टि: प्राविधिक सूचक र ठूला ब्रोकर दुवैको खरिद',
      severity: 'BULLISH',
      compositeBias: 'STRONG_BULLISH',
      recommendation: 'RIDE_TREND',
      actionEn: 'Strong upward momentum confirmed by institutional order flow.',
      actionNp: 'प्राविधिक सूचक र ठूला ब्रोकर दुवैको खरिद बलियो पुष्टि। ट्रेन्ड जारी रहनेछ।',
      techScore,
      bcr3,
      scr3,
      smartMoneyBias: 'Smart Money Buying',
      reconciledScore: Math.min(95, Math.max(techScore, 75))
    };
  }

  if (isTechBearish && isBrokerDistribution) {
    return {
      symbol,
      verdict: 'STRONG_CONFLUENCE_BEARISH',
      verdictLabel: '🔴 Heavy Downside Pressure: Technical Breakdown with Active Offloading',
      verdictLabelNp: '🔴 भारी मन्दी दबाब: प्राविधिक गिरावट र ब्रोकरहरूको सक्रिय बिक्री',
      severity: 'BEARISH',
      compositeBias: 'STRONG_BEARISH',
      recommendation: 'CAPITAL_PROTECTION_EXIT',
      actionEn: 'Both chart and order flow confirm aggressive selling. Respect stop-loss.',
      actionNp: 'चार्ट र ब्रोकर दुवैतर्फ भारी बिक्री। पूँजी संरक्षणका लागि स्टप-लस पालना गर्नुहोस्।',
      techScore,
      bcr3,
      scr3,
      smartMoneyBias: 'Heavy Distribution',
      reconciledScore: Math.min(25, techScore)
    };
  }

  return {
    symbol,
    verdict: 'BALANCED_CONSOLIDATION',
    verdictLabel: '⚖️ Balanced Consolidation: Waiting for Directional Breakout',
    verdictLabelNp: '⚖️ सन्तुलित कारोबार: दिशात्मक ब्रेकआउटको पर्खाइ',
    severity: 'NEUTRAL',
    compositeBias: 'NEUTRAL',
    recommendation: 'WATCH_KEY_LEVELS',
    actionEn: 'Balanced two-way flow; wait for a confirmed breakout above resistance.',
    actionNp: 'दुईतर्फी कारोबार सन्तुलित छ; स्पष्ट ब्रेकआउटको पर्खाइ गर्नुहोस्।',
    techScore,
    bcr3,
    scr3,
    smartMoneyBias: 'Balanced Flow',
    reconciledScore: techScore
  };
}
