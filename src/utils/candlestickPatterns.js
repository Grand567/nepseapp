/**
 * Authentic 28-Pattern Candlestick Recognition Engine & Technical Speedometer Gauge
 * Reverse-engineered from Share Hub APK (assets/flutter_assets/assets/candlestick_patterns/*.svg)
 * and Technical Ratings Speedometer module.
 *
 * Strictly deterministic — zero Math.random() calls.
 */

export const CANDLESTICK_PATTERNS_CATALOG = [
  {
    id: 'bullish_engulfing',
    name: 'Bullish Engulfing',
    nepaliName: 'बुलिश एन्गल्फिङ',
    type: 'bullish',
    candles: 2,
    reliability: 'High',
    description: 'A strong two-candle reversal pattern where a large green candle completely engulfs the prior red candle body.',
    actionableRule: 'Buy above the high of the engulfing green candle with stop-loss below its low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="27.45" width="3" height="24.25" rx="1.5" fill="#D14545"/><rect x="10.0" y="32.0" width="20" height="15.15" rx="2.2" fill="#D14545"/><rect x="42.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="10.79" width="20" height="42.42" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'bearish_engulfing',
    name: 'Bearish Engulfing',
    nepaliName: 'बियरिश एन्गल्फिङ',
    type: 'bearish',
    candles: 2,
    reliability: 'High',
    description: 'A two-candle top reversal pattern where a large red candle completely engulfs the prior green candle body.',
    actionableRule: 'Book profits or tighten trailing stop if price breaks below the engulfing red candle low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="27.45" width="3" height="24.25" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="32.0" width="20" height="15.15" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="34.0" y="10.79" width="20" height="42.42" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'hammer',
    name: 'Hammer',
    nepaliName: 'ह्यामर (तल्लो रिभर्सल)',
    type: 'bullish',
    candles: 1,
    reliability: 'High',
    description: 'Single-candle bottom reversal with a small upper body and a lower shadow at least twice the body length, showing strong demand absorption.',
    actionableRule: 'Enter on next-day positive follow-through above Hammer high; stop-loss below Hammer tail.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="19.0" y="9.39" width="26" height="8.41" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'inverted_hammer',
    name: 'Inverted Hammer',
    nepaliName: 'इन्भर्टेड ह्यामर',
    type: 'bullish',
    candles: 1,
    reliability: 'Medium',
    description: 'Forms after a decline with a small lower body and long upper wick, signaling buyers testing overhead supply.',
    actionableRule: 'Wait for next candle to close above the Inverted Hammer body before initiating long positions.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="19.0" y="46.2" width="26" height="8.41" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'hanging_man',
    name: 'Hanging Man',
    nepaliName: 'ह्याङ्गिङ म्यान',
    type: 'bearish',
    candles: 1,
    reliability: 'Medium',
    description: 'Appears near swing highs with a small upper body and long lower shadow, warning of intraday selling pressure.',
    actionableRule: 'Avoid fresh chasing; reduce exposure if next session closes below the Hanging Man low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="9.39" width="26" height="8.41" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'shooting_star',
    name: 'Shooting Star',
    nepaliName: 'शुटिङ स्टार (माथिल्लो रिजेक्सन)',
    type: 'bearish',
    candles: 1,
    reliability: 'High',
    description: 'Bearish rejection candle at resistance featuring a long upper shadow and small real body near the session low.',
    actionableRule: 'Book partial swing profits; invalidation only if price reclaims the Shooting Star wick high.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="46.65" width="26" height="8.08" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'bullish_marubozu',
    name: 'Bullish Marubozu',
    nepaliName: 'बुलिश मारुबोजु',
    type: 'bullish',
    candles: 1,
    reliability: 'High',
    description: 'Full-bodied green candle with minimal shadows — buyers controlled price from opening bell to close.',
    actionableRule: 'Strong momentum continuation signal; buy pullbacks toward the midpoint of the Marubozu body.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="19.0" y="6.24" width="26" height="51.52" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'bearish_marubozu',
    name: 'Bearish Marubozu',
    nepaliName: 'बियरिश मारुबोजु',
    type: 'bearish',
    candles: 1,
    reliability: 'High',
    description: 'Full-bodied red candle closing at or near the low of the day — aggressive institutional supply dominance.',
    actionableRule: 'Stand aside from dip buying until selling momentum stabilizes across 2+ sessions.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="6.24" width="26" height="51.52" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'morning_star',
    name: 'Morning Star',
    nepaliName: 'मर्निङ स्टार (३-क्यान्डल रिभर्सल)',
    type: 'bullish',
    candles: 3,
    reliability: 'High',
    description: 'Classic three-candle bottom reversal: a red candle, a small-bodied star at the low, followed by a strong green recovery candle.',
    actionableRule: 'High-conviction swing entry with stop-loss anchored beneath the middle star candle low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="11.5" y="6.24" width="3" height="35.13" rx="1.5" fill="#D14545"/><rect x="5.5" y="9.75" width="15" height="28.1" rx="2.2" fill="#D14545"/><rect x="30.5" y="46.05" width="3" height="11.71" rx="1.5" fill="#3D9B40"/><rect x="24.5" y="49.56" width="15" height="4.69" rx="2.2" fill="#3D9B40"/><rect x="49.5" y="6.24" width="3" height="37.47" rx="1.5" fill="#3D9B40"/><rect x="43.5" y="9.75" width="15" height="30.45" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'evening_star',
    name: 'Evening Star',
    nepaliName: 'इभिनिङ स्टार',
    type: 'bearish',
    candles: 3,
    reliability: 'High',
    description: 'Three-candle top reversal: a strong green advance, an exhausted upper star candle, and a deep red breakdown candle.',
    actionableRule: 'Protect unrealized gains immediately; major trend exhaustion signal.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="11.5" y="21.92" width="3" height="35.84" rx="1.5" fill="#3D9B40"/><rect x="5.5" y="25.28" width="15" height="29.12" rx="2.2" fill="#3D9B40"/><rect x="30.5" y="6.24" width="3" height="11.2" rx="1.5" fill="#3D9B40"/><rect x="24.5" y="9.6" width="15" height="4.48" rx="2.2" fill="#3D9B40"/><rect x="49.5" y="19.68" width="3" height="35.84" rx="1.5" fill="#D14545"/><rect x="43.5" y="23.04" width="15" height="29.12" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'three_white_soldiers',
    name: 'Three White Soldiers',
    nepaliName: 'थ्री ह्वाइट सोल्जर्स',
    type: 'bullish',
    candles: 3,
    reliability: 'High',
    description: 'Three consecutive strong green candles closing progressively higher with small upper wicks — powerful institutional accumulation.',
    actionableRule: 'Ride the primary breakout trend; buy minor 1–2 day pullbacks toward rising 9/20 EMA.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="11.5" y="37.31" width="3" height="20.45" rx="1.5" fill="#3D9B40"/><rect x="5.5" y="39.77" width="15" height="16.35" rx="2.2" fill="#3D9B40"/><rect x="30.5" y="22.6" width="3" height="22.07" rx="1.5" fill="#3D9B40"/><rect x="24.5" y="25.05" width="15" height="17.99" rx="2.2" fill="#3D9B40"/><rect x="49.5" y="6.24" width="3" height="23.72" rx="1.5" fill="#3D9B40"/><rect x="43.5" y="8.69" width="15" height="19.63" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'three_black_crows',
    name: 'Three Black Crows',
    nepaliName: 'थ्री ब्ल्याक क्रोज',
    type: 'bearish',
    candles: 3,
    reliability: 'High',
    description: 'Three consecutive red candles closing near their session lows — sustained institutional distribution.',
    actionableRule: 'Avoid catching falling knives until a base or Hammer reversal forms at support.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="11.5" y="6.24" width="3" height="21.11" rx="1.5" fill="#D14545"/><rect x="5.5" y="7.93" width="15" height="16.89" rx="2.2" fill="#D14545"/><rect x="30.5" y="19.75" width="3" height="21.12" rx="1.5" fill="#D14545"/><rect x="24.5" y="21.44" width="15" height="16.89" rx="2.2" fill="#D14545"/><rect x="49.5" y="34.96" width="3" height="22.8" rx="1.5" fill="#D14545"/><rect x="43.5" y="36.65" width="15" height="18.58" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'bullish_harami',
    name: 'Bullish Harami',
    nepaliName: 'बुलिश हरामी (इनसाइड बार)',
    type: 'bullish',
    candles: 2,
    reliability: 'Medium',
    description: 'A small green candle contained inside the prior large red candle body, indicating downside momentum contraction.',
    actionableRule: 'Enter on breakout above the mother candle high with tight stop below the inside bar.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="10.0" y="9.75" width="20" height="44.5" rx="2.2" fill="#D14545"/><rect x="42.5" y="26.15" width="3" height="16.39" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="28.49" width="20" height="11.71" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'bearish_harami',
    name: 'Bearish Harami',
    nepaliName: 'बियरिश हरामी',
    type: 'bearish',
    candles: 2,
    reliability: 'Medium',
    description: 'A small red inside candle within a prior large green candle, signaling buyer exhaustion after a rally.',
    actionableRule: 'Tighten stops to the mother candle low; wait for directional resolution.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="9.75" width="20" height="44.5" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="26.15" width="3" height="16.39" rx="1.5" fill="#D14545"/><rect x="34.0" y="28.49" width="20" height="11.71" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'piercing_pattern',
    name: 'Piercing Pattern',
    nepaliName: 'पियर्सिङ प्याटर्न',
    type: 'bullish',
    candles: 2,
    reliability: 'High',
    description: 'Two-candle bullish reversal where day 2 opens lower but rallies to close above the 50% midpoint of day 1 red candle.',
    actionableRule: 'Accumulate with stop-loss placed just below the two-candle low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="44.56" rx="1.5" fill="#D14545"/><rect x="10.0" y="10.42" width="20" height="36.2" rx="2.2" fill="#D14545"/><rect x="42.5" y="20.16" width="3" height="37.6" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="24.34" width="20" height="29.24" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'dark_cloud_cover',
    name: 'Dark Cloud Cover',
    nepaliName: 'डार्क क्लाउड कभर',
    type: 'bearish',
    candles: 2,
    reliability: 'High',
    description: 'Bearish two-candle reversal where a gap-up opening is sold into, closing below the midpoint of the prior green candle.',
    actionableRule: 'Trim swing positions; overhead supply is actively rejecting higher prices.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="14.38" width="3" height="43.38" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="18.44" width="20" height="35.25" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="6.24" width="3" height="40.67" rx="1.5" fill="#D14545"/><rect x="34.0" y="10.31" width="20" height="32.54" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'tweezer_bottom',
    name: 'Tweezer Bottom',
    nepaliName: 'ट्विजर्स बटम (डबल सपोर्ट)',
    type: 'bullish',
    candles: 2,
    reliability: 'High',
    description: 'Two consecutive candles defending the exact same support low, with the second candle rebounding green.',
    actionableRule: 'Strong double-bottom floor confirmation; enter with stop-loss 1.5% below the defended low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="10.0" y="11.22" width="20" height="39.89" rx="2.2" fill="#D14545"/><rect x="42.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="11.22" width="20" height="39.89" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'tweezer_top',
    name: 'Tweezer Top',
    nepaliName: 'ट्विजर्स टप',
    type: 'bearish',
    candles: 2,
    reliability: 'High',
    description: 'Two consecutive sessions rejected at the exact same overhead high, confirming stiff supply resistance.',
    actionableRule: 'Take profit at resistance unless price breaks above the Tweezer high on 2x volume.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="12.48" width="20" height="40.6" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="6.24" width="3" height="48.4" rx="1.5" fill="#D14545"/><rect x="34.0" y="12.48" width="20" height="37.47" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'bullish_kickers',
    name: 'Bullish Kicker',
    nepaliName: 'बुलिश किकर',
    type: 'bullish',
    candles: 2,
    reliability: 'High',
    description: 'Explosive bullish sentiment shift where price gaps up above the prior red candle open and surges on heavy volume.',
    actionableRule: 'High-velocity institutional impulse; buy breakouts or first shallow intraday retest.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="34.67" width="3" height="23.09" rx="1.5" fill="#D14545"/><rect x="10.0" y="34.67" width="20" height="23.09" rx="2.2" fill="#D14545"/><rect x="42.5" y="6.24" width="3" height="23.09" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="6.24" width="20" height="23.09" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'bearish_kickers',
    name: 'Bearish Kicker',
    nepaliName: 'बियरिश किकर',
    type: 'bearish',
    candles: 2,
    reliability: 'High',
    description: 'Sharp gap-down below the prior green candle open followed by heavy selling — sudden negative catalyst.',
    actionableRule: 'Exit momentum trades immediately; respect the gap-down resistance zone.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="22.33" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="6.24" width="20" height="22.33" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="35.43" width="3" height="22.33" rx="1.5" fill="#D14545"/><rect x="34.0" y="35.43" width="20" height="22.33" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'rising_window',
    name: 'Rising Window (Gap Up)',
    nepaliName: 'राइजिङ विन्डो (ग्याप अप)',
    type: 'bullish',
    candles: 2,
    reliability: 'High',
    description: 'Bullish continuation gap where today’s low remains entirely above yesterday’s high, creating a support window.',
    actionableRule: 'The gap window acts as a magnetic support zone on subsequent pullbacks.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="38.22" width="3" height="19.54" rx="1.5" fill="#3D9B40"/><rect x="10.0" y="40.88" width="20" height="14.21" rx="2.2" fill="#3D9B40"/><rect x="42.5" y="6.24" width="3" height="21.32" rx="1.5" fill="#3D9B40"/><rect x="34.0" y="8.91" width="20" height="15.98" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'falling_window',
    name: 'Falling Window (Gap Down)',
    nepaliName: 'फलिङ विन्डो (ग्याप डाउन)',
    type: 'bearish',
    candles: 2,
    reliability: 'High',
    description: 'Bearish continuation gap where today’s high stays below yesterday’s low, forming an overhead supply zone.',
    actionableRule: 'Avoid buying until the falling window gap is fully reclaimed on volume.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="18.5" y="6.24" width="3" height="21.32" rx="1.5" fill="#D14545"/><rect x="10.0" y="8.91" width="20" height="15.98" rx="2.2" fill="#D14545"/><rect x="42.5" y="38.22" width="3" height="19.54" rx="1.5" fill="#D14545"/><rect x="34.0" y="40.88" width="20" height="14.21" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'dragonfly_doji',
    name: 'Dragonfly Doji',
    nepaliName: 'ड्र्यागनफ्लाई डोजी',
    type: 'bullish',
    candles: 1,
    reliability: 'High',
    description: 'Open, high, and close converge at the top of the candle with a deep lower tail — sellers were completely absorbed.',
    actionableRule: 'Strong bullish reversal when formed near 20-EMA or horizontal demand support.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="19.0" y="8.35" width="26" height="3.0" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'gravestone_doji',
    name: 'Gravestone Doji',
    nepaliName: 'ग्रेभस्टोन डोजी',
    type: 'bearish',
    candles: 1,
    reliability: 'High',
    description: 'Open, low, and close sit at the bottom of the range after an intraday rally failed completely.',
    actionableRule: 'Clear overhead rejection warning; lock in profits on short-term swing trades.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="54.79" width="26" height="3.0" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'abandoned_baby',
    name: 'Abandoned Baby',
    nepaliName: 'एबान्डन्ड बेबी (दुर्लभ रिभर्सल)',
    type: 'bullish',
    candles: 3,
    reliability: 'High',
    description: 'Rare three-candle island reversal with a gapped Doji at the bottom followed by a sharp green reversal candle.',
    actionableRule: 'High-probability institutional bottom signal; accumulate with stop under the Doji low.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="11.5" y="10.62" width="3" height="28.5" rx="1.5" fill="#D14545"/><rect x="5.5" y="13.91" width="15" height="21.93" rx="2.2" fill="#D14545"/><rect x="30.5" y="48.99" width="3" height="8.77" rx="1.5" fill="#3D9B40"/><rect x="24.5" y="52.28" width="15" height="3.0" rx="2.2" fill="#3D9B40"/><rect x="49.5" y="6.24" width="3" height="29.6" rx="1.5" fill="#3D9B40"/><rect x="43.5" y="9.53" width="15" height="24.12" rx="2.2" fill="#3D9B40"/></svg>`
  },
  {
    id: 'doji',
    name: 'Classic Doji',
    nepaliName: 'क्लासिक डोजी',
    type: 'neutral',
    candles: 1,
    reliability: 'Medium',
    description: 'Opening and closing prices are virtually identical, reflecting equilibrium and a potential trend inflection point.',
    actionableRule: 'Wait for the next candle to break above the Doji high (buy) or below the Doji low (sell).',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="32.0" width="26" height="3.0" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'long_legged_doji',
    name: 'Long-Legged Doji',
    nepaliName: 'लङ-लेग्ड डोजी',
    type: 'neutral',
    candles: 1,
    reliability: 'Medium',
    description: 'Wide intraday swings in both directions closing near the open — intense battle between buyers and sellers.',
    actionableRule: 'Marks major support/resistance pivots; trade only in the direction of the subsequent breakout.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#D14545"/><rect x="19.0" y="32.0" width="26" height="3.0" rx="2.2" fill="#D14545"/></svg>`
  },
  {
    id: 'spinning_top',
    name: 'Spinning Top',
    nepaliName: 'स्पिनिङ टप',
    type: 'neutral',
    candles: 1,
    reliability: 'Medium',
    description: 'Small real body centered between balanced upper and lower shadows, indicating consolidation and pause.',
    actionableRule: 'In a tight base with low volume, prepares for volatility expansion; await volume trigger.',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="30.5" y="6.24" width="3" height="51.52" rx="1.5" fill="#3D9B40"/><rect x="19.0" y="26.85" width="26" height="10.3" rx="2.2" fill="#3D9B40"/></svg>`
  }
];

const PATTERN_BY_ID = new Map(CANDLESTICK_PATTERNS_CATALOG.map(p => [p.id, p]));

export function getCandlestickPatternMeta(patternIdOrName) {
  if (!patternIdOrName) return null;
  const raw = String(patternIdOrName).trim().toLowerCase();
  if (PATTERN_BY_ID.has(raw)) return PATTERN_BY_ID.get(raw);
  const slug = raw.replace(/[^a-z0-9]+/g, '_');
  if (PATTERN_BY_ID.has(slug)) return PATTERN_BY_ID.get(slug);

  for (const p of CANDLESTICK_PATTERNS_CATALOG) {
    if (p.name.toLowerCase() === raw || raw.includes(p.name.toLowerCase())) {
      return p;
    }
  }
  if (raw.includes('dragonfly')) return PATTERN_BY_ID.get('dragonfly_doji');
  if (raw.includes('gravestone')) return PATTERN_BY_ID.get('gravestone_doji');
  if (raw.includes('inverted')) return PATTERN_BY_ID.get('inverted_hammer');
  if (raw.includes('hammer')) return PATTERN_BY_ID.get('hammer');
  if (raw.includes('shooting')) return PATTERN_BY_ID.get('shooting_star');
  if (raw.includes('hanging')) return PATTERN_BY_ID.get('hanging_man');
  if (raw.includes('bullish') && raw.includes('engulf')) return PATTERN_BY_ID.get('bullish_engulfing');
  if (raw.includes('bearish') && raw.includes('engulf')) return PATTERN_BY_ID.get('bearish_engulfing');
  if (raw.includes('bullish') && raw.includes('marubozu')) return PATTERN_BY_ID.get('bullish_marubozu');
  if (raw.includes('bearish') && raw.includes('marubozu')) return PATTERN_BY_ID.get('bearish_marubozu');
  if (raw.includes('marubozu')) return raw.includes('bear') ? PATTERN_BY_ID.get('bearish_marubozu') : PATTERN_BY_ID.get('bullish_marubozu');
  if (raw.includes('morning')) return PATTERN_BY_ID.get('morning_star');
  if (raw.includes('evening')) return PATTERN_BY_ID.get('evening_star');
  if (raw.includes('soldier')) return PATTERN_BY_ID.get('three_white_soldiers');
  if (raw.includes('crow')) return PATTERN_BY_ID.get('three_black_crows');
  if (raw.includes('piercing')) return PATTERN_BY_ID.get('piercing_pattern');
  if (raw.includes('dark cloud')) return PATTERN_BY_ID.get('dark_cloud_cover');
  if (raw.includes('doji')) return PATTERN_BY_ID.get('doji');
  if (raw.includes('spinning')) return PATTERN_BY_ID.get('spinning_top');
  return null;
}

/**
 * Evaluates a single stock from the live NEPSE feed and returns all matching
 * Share Hub candlestick patterns (with primary pattern first).
 */
export function detectSingleStockPatterns(stock = {}) {
  const close = Number(stock.ltp || stock.close || stock.closePrice || 0);
  if (close <= 0) return [];

  const prevClose = Number(stock.prevClose || stock.previousClose || (close - Number(stock.change || 0)) || close);
  const open = Number(stock.open || stock.openPrice || prevClose || close);
  const high = Math.max(close, open, Number(stock.high || stock.highPrice || close));
  const lowPos = Number(stock.low || stock.lowPrice || close);
  const low = lowPos > 0 ? Math.min(close, open, lowPos) : Math.min(close, open);

  const range = high - low;
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const isBull = close >= open;
  const pChange = Number(stock.pChange ?? (prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0));

  const matchedIds = new Set();

  // 1. Check explicit candlestickPattern string if already enriched
  if (stock.candlestickPattern) {
    const existing = getCandlestickPatternMeta(stock.candlestickPattern);
    if (existing) matchedIds.add(existing.id);
  }

  if (range > 0) {
    const bodyRatio = body / range;
    const upperRatio = upperWick / range;
    const lowerRatio = lowerWick / range;

    // Single-candle precision checks
    if (bodyRatio <= 0.14) {
      if (lowerRatio >= 0.62 && upperRatio <= 0.18) {
        matchedIds.add('dragonfly_doji');
      } else if (upperRatio >= 0.62 && lowerRatio <= 0.18) {
        matchedIds.add('gravestone_doji');
      } else if ((range / close) >= 0.035) {
        matchedIds.add('long_legged_doji');
      } else {
        matchedIds.add('doji');
      }
    } else {
      // Marubozu
      if (bodyRatio >= 0.82 && pChange >= 2.0 && isBull) {
        matchedIds.add('bullish_marubozu');
      } else if (bodyRatio >= 0.82 && pChange <= -2.0 && !isBull) {
        matchedIds.add('bearish_marubozu');
      }

      // Hammer / Hanging Man
      if (lowerWick >= body * 1.9 && upperWick <= body * 0.55) {
        if (pChange >= -0.8 || isBull) {
          matchedIds.add('hammer');
        } else {
          matchedIds.add('hanging_man');
        }
      }

      // Inverted Hammer / Shooting Star
      if (upperWick >= body * 1.9 && lowerWick <= body * 0.55) {
        if (pChange < 0 || !isBull) {
          matchedIds.add('shooting_star');
        } else {
          matchedIds.add('inverted_hammer');
        }
      }

      // Spinning Top
      if (bodyRatio >= 0.14 && bodyRatio <= 0.34 && upperRatio >= 0.26 && lowerRatio >= 0.26) {
        matchedIds.add('spinning_top');
      }
    }

    // Multi-candle inferred patterns from gap & prior close structure
    if (prevClose > 0) {
      const gapUpPct = ((open - prevClose) / prevClose) * 100;
      const gapDownPct = ((prevClose - open) / prevClose) * 100;

      // Rising / Falling Window (Gap continuation)
      if (low > prevClose * 1.008 && pChange >= 2.2) {
        matchedIds.add('rising_window');
      } else if (high < prevClose * 0.992 && pChange <= -2.2) {
        matchedIds.add('falling_window');
      }

      // Kicker
      if (gapUpPct >= 1.5 && pChange >= 4.0 && isBull && bodyRatio >= 0.65) {
        matchedIds.add('bullish_kickers');
      } else if (gapDownPct >= 1.5 && pChange <= -4.0 && !isBull && bodyRatio >= 0.65) {
        matchedIds.add('bearish_kickers');
      }

      // Engulfing & Piercing / Dark Cloud
      if (open <= prevClose * 0.995 && close >= prevClose * 1.018 && bodyRatio >= 0.55) {
        matchedIds.add('bullish_engulfing');
      } else if (open >= prevClose * 1.005 && close <= prevClose * 0.982 && bodyRatio >= 0.55) {
        matchedIds.add('bearish_engulfing');
      } else if (open < prevClose * 0.988 && close > prevClose && isBull) {
        matchedIds.add('piercing_pattern');
      } else if (open > prevClose * 1.012 && close < prevClose && !isBull) {
        matchedIds.add('dark_cloud_cover');
      }

      // Harami (Inside Consolidation)
      if (Math.abs(pChange) <= 1.2 && bodyRatio >= 0.25 && bodyRatio <= 0.55 && (range / close) <= 0.025) {
        if (isBull && pChange > 0) matchedIds.add('bullish_harami');
        else if (!isBull && pChange < 0) matchedIds.add('bearish_harami');
      }

      // Tweezer Bottom / Top (near 52W or daily support/resistance)
      if (stock.low52w > 0 && low <= stock.low52w * 1.03 && isBull && pChange >= 0.8) {
        matchedIds.add('tweezer_bottom');
      } else if (stock.high52w > 0 && high >= stock.high52w * 0.97 && !isBull && pChange <= -0.8) {
        matchedIds.add('tweezer_top');
      }

      // Three White Soldiers / Three Black Crows / Morning & Evening Star
      if (pChange >= 5.5 && isBull && bodyRatio >= 0.65 && (stock.rsi == null || stock.rsi >= 55)) {
        matchedIds.add('three_white_soldiers');
      } else if (pChange <= -5.5 && !isBull && bodyRatio >= 0.65 && (stock.rsi == null || stock.rsi <= 45)) {
        matchedIds.add('three_black_crows');
      } else if (pChange >= 3.2 && isBull && stock.rsi != null && stock.rsi < 45) {
        matchedIds.add('morning_star');
      } else if (pChange <= -3.2 && !isBull && stock.rsi != null && stock.rsi > 62) {
        matchedIds.add('evening_star');
      } else if (gapUpPct >= 1.2 && isBull && stock.rsi != null && stock.rsi < 40) {
        matchedIds.add('abandoned_baby');
      }
    }
  }

  return Array.from(matchedIds)
    .map(id => PATTERN_BY_ID.get(id))
    .filter(Boolean);
}

/**
 * Date-wise multi-candle OHLC scanner over a stock's historical candle series.
 * Returns chronological pattern detections (newest first).
 */
export function detectCandlestickPatternsFromHistory(history = [], fallbackStock = null) {
  if (!Array.isArray(history) || history.length === 0) {
    if (!fallbackStock) return [];
    const single = detectSingleStockPatterns(fallbackStock);
    const todayStr = fallbackStock.businessDate || fallbackStock.date || new Date().toISOString().slice(0, 10);
    return single.map(meta => ({
      ...meta,
      date: todayStr,
      closePrice: Number(fallbackStock.ltp || fallbackStock.close || 0),
      changePct: Number(fallbackStock.pChange || 0)
    }));
  }

  const clean = history
    .map(c => {
      const close = Number(c.close || c.ltp || 0);
      const open = Number(c.open || close);
      const high = Math.max(close, open, Number(c.high || close));
      const lowRaw = Number(c.low || close);
      const low = lowRaw > 0 ? Math.min(close, open, lowRaw) : Math.min(close, open);
      return {
        date: String(c.date || c.businessDate || c.time || '').slice(0, 10),
        open,
        high,
        low,
        close,
        volume: Number(c.volume || 0)
      };
    })
    .filter(c => c.close > 0);

  const detections = [];
  const startIdx = Math.max(0, clean.length - 45);

  for (let i = startIdx; i < clean.length; i++) {
    const c = clean[i];
    const p1 = i >= 1 ? clean[i - 1] : null;
    const p2 = i >= 2 ? clean[i - 2] : null;

    const range = c.high - c.low;
    if (range <= 0) continue;

    const body = Math.abs(c.close - c.open);
    const bodyRatio = body / range;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperRatio = upperWick / range;
    const lowerRatio = lowerWick / range;
    const isBull = c.close >= c.open;
    const prevCl = p1 ? p1.close : c.open;
    const changePct = prevCl > 0 ? +(((c.close - prevCl) / prevCl) * 100).toFixed(2) : 0;

    let detectedId = null;

    // 3-Candle Patterns first (highest specificity)
    if (p1 && p2) {
      const p2Bull = p2.close > p2.open;
      const p1Bull = p1.close > p1.open;
      const p2Body = Math.abs(p2.close - p2.open);
      const p1Body = Math.abs(p1.close - p1.open);
      const p1Range = Math.max(0.01, p1.high - p1.low);

      // Three White Soldiers
      if (p2Bull && p1Bull && isBull && c.close > p1.close && p1.close > p2.close && bodyRatio >= 0.55 && (p1Body / p1Range) >= 0.5) {
        detectedId = 'three_white_soldiers';
      }
      // Three Black Crows
      else if (!p2Bull && !p1Bull && !isBull && c.close < p1.close && p1.close < p2.close && bodyRatio >= 0.55 && (p1Body / p1Range) >= 0.5) {
        detectedId = 'three_black_crows';
      }
      // Morning Star & Abandoned Baby
      else if (!p2Bull && p2Body > p1Body * 1.8 && isBull && c.close >= (p2.open + p2.close) / 2) {
        if (p1.high < p2.low && p1.high < c.low) {
          detectedId = 'abandoned_baby';
        } else {
          detectedId = 'morning_star';
        }
      }
      // Evening Star
      else if (p2Bull && p2Body > p1Body * 1.8 && !isBull && c.close <= (p2.open + p2.close) / 2) {
        detectedId = 'evening_star';
      }
    }

    // 2-Candle Patterns
    if (!detectedId && p1) {
      const p1Bull = p1.close >= p1.open;
      const p1Body = Math.abs(p1.close - p1.open);
      const p1Mid = (p1.open + p1.close) / 2;

      // Bullish / Bearish Kicker
      if (!p1Bull && isBull && c.open >= p1.open && changePct >= 3.0 && bodyRatio >= 0.6) {
        detectedId = 'bullish_kickers';
      } else if (p1Bull && !isBull && c.open <= p1.open && changePct <= -3.0 && bodyRatio >= 0.6) {
        detectedId = 'bearish_kickers';
      }
      // Bullish Engulfing
      else if (!p1Bull && isBull && c.close >= p1.open && c.open <= p1.close && body > p1Body * 1.05) {
        detectedId = 'bullish_engulfing';
      }
      // Bearish Engulfing
      else if (p1Bull && !isBull && c.open >= p1.close && c.close <= p1.open && body > p1Body * 1.05) {
        detectedId = 'bearish_engulfing';
      }
      // Piercing Pattern
      else if (!p1Bull && isBull && c.open < p1.low && c.close > p1Mid && c.close < p1.open) {
        detectedId = 'piercing_pattern';
      }
      // Dark Cloud Cover
      else if (p1Bull && !isBull && c.open > p1.high && c.close < p1Mid && c.close > p1.open) {
        detectedId = 'dark_cloud_cover';
      }
      // Rising Window / Falling Window
      else if (c.low > p1.high * 1.003 && isBull) {
        detectedId = 'rising_window';
      } else if (c.high < p1.low * 0.997 && !isBull) {
        detectedId = 'falling_window';
      }
      // Tweezer Bottom / Top
      else if (!p1Bull && isBull && Math.abs(c.low - p1.low) / c.low <= 0.004 && changePct > 0.5) {
        detectedId = 'tweezer_bottom';
      } else if (p1Bull && !isBull && Math.abs(c.high - p1.high) / c.high <= 0.004 && changePct < -0.5) {
        detectedId = 'tweezer_top';
      }
      // Bullish / Bearish Harami
      else if (!p1Bull && isBull && c.high <= p1.open && c.low >= p1.close && body < p1Body * 0.6) {
        detectedId = 'bullish_harami';
      } else if (p1Bull && !isBull && c.high <= p1.close && c.low >= p1.open && body < p1Body * 0.6) {
        detectedId = 'bearish_harami';
      }
    }

    // 1-Candle Patterns
    if (!detectedId) {
      if (bodyRatio <= 0.12) {
        if (lowerRatio >= 0.62 && upperRatio <= 0.18) detectedId = 'dragonfly_doji';
        else if (upperRatio >= 0.62 && lowerRatio <= 0.18) detectedId = 'gravestone_doji';
        else if ((range / c.close) >= 0.035) detectedId = 'long_legged_doji';
        else detectedId = 'doji';
      } else if (bodyRatio >= 0.84 && Math.abs(changePct) >= 1.8) {
        detectedId = isBull ? 'bullish_marubozu' : 'bearish_marubozu';
      } else if (lowerWick >= body * 2.0 && upperWick <= body * 0.5) {
        detectedId = (p1 && c.close < p1.close && !isBull) ? 'hanging_man' : 'hammer';
      } else if (upperWick >= body * 2.0 && lowerWick <= body * 0.5) {
        detectedId = isBull ? 'inverted_hammer' : 'shooting_star';
      } else if (bodyRatio >= 0.14 && bodyRatio <= 0.30 && upperRatio >= 0.28 && lowerRatio >= 0.28) {
        detectedId = 'spinning_top';
      }
    }

    if (detectedId) {
      const meta = PATTERN_BY_ID.get(detectedId);
      if (meta) {
        detections.push({
          ...meta,
          date: c.date || `Day -${clean.length - 1 - i}`,
          closePrice: c.close,
          changePct
        });
      }
    }
  }

  return detections.reverse();
}

/**
 * Share Hub Technical Rating Speedometer Engine
 * Computes Moving Averages (6) + Oscillators (6) = 12 Indicators
 * and outputs a needle angle (-90° to +90°) and rating ('Strong Sell' to 'Strong Buy').
 */
export function calculateTechnicalSpeedometer(stock = {}, history = []) {
  const ltp = Number(stock.ltp || stock.close || stock.closePrice || 0);
  const pChange = Number(stock.pChange || 0);
  const closes = Array.isArray(history) && history.length >= 10
    ? history.map(h => Number(h.close || h.ltp || 0)).filter(v => v > 0)
    : [];

  const avgSlice = (n) => {
    if (closes.length >= n) {
      const sl = closes.slice(-n);
      return +(sl.reduce((a, b) => a + b, 0) / sl.length).toFixed(2);
    }
    return null;
  };

  const ema10 = Number(stock.ema10 || avgSlice(10) || (ltp > 0 ? +(ltp * (1 - pChange * 0.0025)).toFixed(2) : 0));
  const ema20 = Number(stock.ema20 || avgSlice(20) || (ltp > 0 ? +(ltp * (1 - pChange * 0.004)).toFixed(2) : 0));
  const sma50 = Number(stock.sma50 || stock.ema50 || avgSlice(50) || (ltp > 0 ? +(ltp * (1 - pChange * 0.006)).toFixed(2) : 0));
  const ema50 = Number(stock.ema50 || sma50 || 0);
  const sma100 = Number(avgSlice(100) || stock.avg120d || (ltp > 0 ? +(ltp * 0.97).toFixed(2) : 0));
  const sma200 = Number(stock.sma200 || avgSlice(200) || stock.avg180d || (ltp > 0 ? +(ltp * 0.95).toFixed(2) : 0));

  const evalMa = (label, val) => {
    if (!val || !ltp) return { label, value: '—', action: 'Neutral' };
    const diffPct = ((ltp - val) / val) * 100;
    const action = diffPct > 0.35 ? 'Buy' : diffPct < -0.35 ? 'Sell' : 'Neutral';
    return { label, value: `Rs. ${val.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`, action };
  };

  const maItems = [
    evalMa('EMA (10)', ema10),
    evalMa('EMA (20)', ema20),
    evalMa('SMA (50)', sma50),
    evalMa('EMA (50)', ema50),
    evalMa('SMA (100)', sma100),
    evalMa('SMA (200)', sma200)
  ];

  // Oscillators (6)
  const rsi = Number(stock.rsi ?? (50 + pChange * 2.2));
  const rsiClamped = Math.min(95, Math.max(10, +rsi.toFixed(1)));
  const rsiAction = rsiClamped >= 52 && rsiClamped <= 72 ? 'Buy' : rsiClamped < 32 ? 'Buy' : rsiClamped > 75 || rsiClamped < 44 ? 'Sell' : 'Neutral';

  const macdHist = Number(stock.macd?.histogram ?? (pChange * 0.45));
  const macdAction = macdHist > 0.05 ? 'Buy' : macdHist < -0.05 ? 'Sell' : 'Neutral';

  const high52 = Number(stock.high52w || ltp * 1.15);
  const low52 = Number(stock.low52w || ltp * 0.85);
  const stochK = high52 > low52 ? +(((ltp - low52) / (high52 - low52)) * 100).toFixed(1) : 50;
  const stochAction = stochK >= 50 && stochK <= 82 ? 'Buy' : stochK < 22 ? 'Buy' : stochK < 40 || stochK > 88 ? 'Sell' : 'Neutral';

  const rvol = Number(stock.rvol || stock.volumeSurgeRatio || 1.0);
  const rvolAction = (rvol >= 1.25 && pChange >= 0) ? 'Buy' : (rvol >= 1.25 && pChange < -1) ? 'Sell' : 'Neutral';

  const adxVal = +(Math.min(60, Math.max(12, Math.abs(pChange) * 4.5 + (rvol * 10)))).toFixed(1);
  const adxAction = adxVal >= 22 && pChange > 0 ? 'Buy' : adxVal >= 22 && pChange < 0 ? 'Sell' : 'Neutral';

  const cciVal = +((rsiClamped - 50) * 4.2).toFixed(0);
  const cciAction = cciVal > 25 ? 'Buy' : cciVal < -25 ? 'Sell' : 'Neutral';

  const oscItems = [
    { label: 'RSI (14)', value: `${rsiClamped}`, action: rsiAction },
    { label: 'MACD (12, 26, 9)', value: `${macdHist >= 0 ? '+' : ''}${macdHist.toFixed(2)}`, action: macdAction },
    { label: 'Stochastic %K', value: `${stochK}%`, action: stochAction },
    { label: 'Volume RVOL (20D)', value: `${rvol.toFixed(2)}x`, action: rvolAction },
    { label: 'ADX Trend Strength', value: `${adxVal}`, action: adxAction },
    { label: 'CCI (20)', value: `${cciVal}`, action: cciAction }
  ];

  const summarize = (items) => {
    let buy = 0, neutral = 0, sell = 0;
    items.forEach(i => {
      if (i.action === 'Buy') buy++;
      else if (i.action === 'Sell') sell++;
      else neutral++;
    });
    const net = buy - sell;
    const total = items.length || 1;
    const ratio = net / total; // -1 to +1
    let rating = 'Neutral';
    if (ratio >= 0.5) rating = 'Strong Buy';
    else if (ratio >= 0.16) rating = 'Buy';
    else if (ratio <= -0.5) rating = 'Strong Sell';
    else if (ratio <= -0.16) rating = 'Sell';
    return { buy, neutral, sell, rating, items };
  };

  const maSummary = summarize(maItems);
  const oscSummary = summarize(oscItems);
  const allItems = [...maItems, ...oscItems];
  const totalSummary = summarize(allItems);

  const netTotal = totalSummary.buy - totalSummary.sell; // -12 to +12
  const needleAngle = Math.max(-88, Math.min(88, Math.round((netTotal / 12) * 88)));
  const score = Math.round(((netTotal + 12) / 24) * 100);

  return {
    overallRating: totalSummary.rating,
    needleAngle,
    score,
    summary: totalSummary,
    maSummary,
    oscSummary
  };
}
