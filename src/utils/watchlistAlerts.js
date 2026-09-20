/**
 * Universal Watchlist Breakout Alert Engine
 * Evaluates real-time price & volume conditions for watched stocks during NEPSE market hours.
 * Enforces dual-condition simultaneous gate:
 *   1. Price Condition: LTP >= Breakout Target Price (e.g. Rs. 224.80)
 *   2. Volume Condition: RVOL >= RVOL Hurdle Multiplier (e.g. >= 1.50x during Festive Season)
 */

import { getAccurateFestivalSeasonality } from './quantEngine.js';

const ALERTS_STORAGE_KEY = 'nepse_watchlist_alerts_v1';
const ALERTS_HISTORY_KEY = 'nepse_watchlist_alerts_history_v1';

let _audioCtx = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new AudioContextClass();
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  } catch (_) {
    return null;
  }
}

/**
 * Trigger physical haptic vibration on mobile devices (Android / Capacitor)
 */
export function triggerBreakoutVibration(pattern = [250, 100, 250, 100, 400]) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch (_) {}
}

/**
 * Play an ascending 3-tone synthesizer breakout chime using Web Audio API
 */
export function playBreakoutChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Triangle waveform produces a crisp, audible tone on both phone speakers and desktop
    osc.type = 'triangle';
    // Ascending melodic progression: 880Hz (A5) -> 1320Hz (E6) -> 1760Hz (A6)
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.12);
    osc.frequency.setValueAtTime(1760, now + 0.24);

    // Gain envelope: fast attack, distinct sustain, smooth fadeout
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.8);
  } catch (err) {
    console.debug('[AudioChime] AudioContext blocked or unsupported:', err);
  }
}

/**
 * Get all saved watchlist alert configs
 * @returns {Record<string, { symbol: string, breakoutPrice: number, rvolThreshold: number, autoSyncFromPlan: boolean, alertEnabled: boolean, soundEnabled: boolean, pushEnabled: boolean, lastTriggeredAt: number|null }>}
 */
export function getAllWatchlistAlertConfigs() {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    let migrated = false;
    for (const k in parsed) {
      // If previously saved as 1.25, automatically upgrade to institutional 1.50x hurdle
      if (parsed[k]?.rvolThreshold === 1.25 || parsed[k]?.rvolThreshold == null) {
        parsed[k].rvolThreshold = 1.5;
        migrated = true;
      }
    }
    if (migrated) {
      try {
        localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(parsed));
      } catch (_) {}
    }
    return parsed;
  } catch (_) {
    return {};
  }
}

/**
 * Get alert configuration for a specific symbol
 */
export function getWatchlistAlertConfig(symbol) {
  if (!symbol) return null;
  const sym = String(symbol).trim().toUpperCase();
  const all = getAllWatchlistAlertConfigs();
  return all[sym] || null;
}

/**
 * Derive default breakout parameters directly from stock quantitative plan
 */
export function deriveDefaultBreakoutPlan(stock, entryExitPlan = null) {
  const ltp = Number(stock?.ltp || entryExitPlan?.ltp || 100);

  // 1. Breakout Price: Take from Entry/Exit Plan entry zone min / pivot, or 20-day high, or fallback +3%
  let breakoutPrice = 0;
  if (entryExitPlan?.levels?.entryZone?.min) {
    breakoutPrice = Number(entryExitPlan.levels.entryZone.min);
  } else if (entryExitPlan?.levels?.breakoutPivot) {
    breakoutPrice = Number(entryExitPlan.levels.breakoutPivot);
  } else if (entryExitPlan?.levels?.entryZone?.low) {
    breakoutPrice = Number(entryExitPlan.levels.entryZone.low);
  } else if (stock?.high20 && Number(stock.high20) > ltp) {
    breakoutPrice = Number(stock.high20);
  } else {
    breakoutPrice = +(ltp * 1.03).toFixed(1);
  }

  // 2. RVOL Hurdle: Institutional confirmation hurdle is strictly 1.50x (especially during Dashain festive lull)
  let rvolThreshold = 1.5;
  if (entryExitPlan?.festivalSeason?.rvolThreshold) {
    rvolThreshold = Number(entryExitPlan.festivalSeason.rvolThreshold);
  } else {
    const season = getAccurateFestivalSeasonality();
    rvolThreshold = Number(season?.rvolThreshold || 1.5);
  }

  // Ensure threshold is never below 1.50x
  if (rvolThreshold < 1.5) {
    rvolThreshold = 1.5;
  }

  return {
    breakoutPrice: +breakoutPrice.toFixed(1),
    rvolThreshold: +rvolThreshold.toFixed(2),
    autoSyncFromPlan: true,
    alertEnabled: true,
    soundEnabled: true,
    pushEnabled: true
  };
}

/**
 * Save alert configuration for a specific symbol
 */
export function saveWatchlistAlertConfig(symbol, config) {
  if (!symbol) return;
  const sym = String(symbol).trim().toUpperCase();
  const all = getAllWatchlistAlertConfigs();
  all[sym] = {
    ...(all[sym] || {}),
    ...config,
    symbol: sym,
    updatedAt: Date.now()
  };

  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('nepse_watchlist_alerts_updated', {
      detail: { symbol: sym, config: all[sym] }
    }));
  } catch (_) {}

  return all[sym];
}

/**
 * Delete alert config for a symbol
 */
export function deleteWatchlistAlertConfig(symbol) {
  if (!symbol) return;
  const sym = String(symbol).trim().toUpperCase();
  const all = getAllWatchlistAlertConfigs();
  if (all[sym]) {
    delete all[sym];
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('nepse_watchlist_alerts_updated', {
        detail: { symbol: sym, deleted: true }
      }));
    } catch (_) {}
  }
}

/**
 * Request notification permission if not yet granted
 */
export async function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      return await Notification.requestPermission();
    }
  } catch (_) {}
  return window.Notification?.permission || 'denied';
}

/**
 * Dispatch native system notification
 */
export function dispatchSystemNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'nepse-breakout-alert'
      });
    }
  } catch (_) {}
}

/**
 * Record a triggered alert in local history log
 */
export function recordAlertHistory(alertItem) {
  try {
    const raw = localStorage.getItem(ALERTS_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : [];
    history.unshift({
      ...alertItem,
      id: `${alertItem.symbol}_${Date.now()}`,
      timestamp: Date.now()
    });
    // Keep last 50 items
    localStorage.setItem(ALERTS_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
  } catch (_) {}
}

/**
 * Get triggered alert history
 */
export function getAlertHistory() {
  try {
    const raw = localStorage.getItem(ALERTS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Reset trigger state for a symbol (so it can trigger again in current session)
 */
export function resetAlertTrigger(symbol) {
  const cfg = getWatchlistAlertConfig(symbol);
  if (cfg) {
    saveWatchlistAlertConfig(symbol, {
      ...cfg,
      lastTriggeredAt: null,
      triggeredToday: false
    });
  }
}

/**
 * Calculate live RVOL (Relative Volume vs 20-Day Baseline) for a stock
 */
export function calculateStockRvol(stock, priceHistory = null) {
  if (!stock) return 1.0;

  const sym = String(stock.symbol || stock.scrip || '').toUpperCase().trim();
  let vol = Number(stock.volume || stock.totalTradedQuantity || 0);

  // Resolve price history from cache if not passed directly
  let hist = priceHistory;
  if (!hist && sym && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage?.getItem(`nepse_hist_prices_${sym}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) hist = parsed;
      }
    } catch (_) {}
  }

  // If vol is 0 (e.g. weekend, holiday, closed market), fallback to the latest traded session candle volume
  if (vol === 0 && Array.isArray(hist) && hist.length > 0) {
    vol = Number(hist[hist.length - 1]?.volume || 0);
  }

  // 1. Direct explicit avgVolume20D on stock if present and valid
  if (stock.avgVolume20D != null && Number(stock.avgVolume20D) > 0 && vol > 0) {
    return +(vol / Number(stock.avgVolume20D)).toFixed(2);
  }

  // 2. Direct RVOL if already attached by setupAnalyzer or backend pipeline
  if (stock.rvol != null && Number(stock.rvol) > 0 && stock.rvol !== 1.0) {
    return +Number(stock.rvol).toFixed(2);
  }

  // 3. If stock already has volume surge ratio calculated
  if (stock.volumeSurgeRatio != null && Number(stock.volumeSurgeRatio) > 0 && stock.volumeSurgeRatio !== 1.0) {
    return +Number(stock.volumeSurgeRatio).toFixed(2);
  }

  // 4. Calculate from priceHistory (excluding latest candle when comparing against baseline)
  if (Array.isArray(hist) && hist.length >= 5) {
    const baselineCandles = hist.slice(-21, -1).length >= 5 ? hist.slice(-21, -1) : hist.slice(-20);
    const sum = baselineCandles.reduce((acc, c) => acc + (Number(c.volume) || 0), 0);
    const avg = sum / baselineCandles.length;
    if (avg > 0 && vol > 0) return +(vol / avg).toFixed(2);
  }

  // 5. If volume is meaningful (> 50k shares in NEPSE) but no historical baseline yet, estimate standard participation
  if (vol > 100000) return 1.55;
  if (vol > 50000) return 1.25;

  return 1.0;
}

/**
 * Evaluate all watched stocks against active alert configs
 * @param {Array} stocks - List of all market stocks
 * @param {Array<string>} watchedSymbols - Array of user's watched symbols
 * @param {Function} onTrigger - Callback when an alert satisfies both conditions
 * @returns {Array<{ symbol: string, stock: any, config: any, ltp: number, rvol: number, isPriceMet: boolean, isVolumeMet: boolean, isTriggered: boolean }>}
 */
export function evaluateWatchlistAlerts(stocks = [], watchedSymbols = [], onTrigger = null) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return [];
  }

  const alertConfigs = getAllWatchlistAlertConfigs();
  const alertSyms = Object.keys(alertConfigs).filter(k => alertConfigs[k]?.alertEnabled !== false);
  const watchedSet = new Set([
    ...(Array.isArray(watchedSymbols) ? watchedSymbols : []).map(s => String(s).trim().toUpperCase()),
    ...alertSyms.map(s => String(s).trim().toUpperCase())
  ]);

  if (watchedSet.size === 0) {
    return [];
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const stock of stocks) {
    const sym = String(stock?.symbol || '').trim().toUpperCase();
    if (!watchedSet.has(sym)) continue;

    let config = alertConfigs[sym];
    // If user has not explicitly configured, initialize default from stock attributes
    if (!config) {
      config = deriveDefaultBreakoutPlan(stock);
      saveWatchlistAlertConfig(sym, config);
    }

    if (!config.alertEnabled) {
      results.push({
        symbol: sym,
        stock,
        config,
        ltp: Number(stock.ltp || 0),
        rvol: calculateStockRvol(stock),
        isPriceMet: false,
        isVolumeMet: false,
        isTriggered: false,
        disabled: true
      });
      continue;
    }

    const ltp = Number(stock.ltp || 0);
    const rvol = calculateStockRvol(stock);
    const targetPrice = Number(config.breakoutPrice || (ltp * 1.03));
    const targetRvol = Number(config.rvolThreshold || 1.5);

    const isPriceMet = ltp >= targetPrice;
    const isVolumeMet = rvol >= targetRvol;
    const isTriggered = isPriceMet && isVolumeMet;

    // Check if triggered today already
    const lastDate = config.lastTriggeredAt ? new Date(config.lastTriggeredAt).toISOString().slice(0, 10) : null;
    const alreadyTriggeredToday = config.triggeredToday && lastDate === todayStr;

    // Trigger Notification if newly triggered
    if (isTriggered && !alreadyTriggeredToday) {
      // Mark triggered in config
      saveWatchlistAlertConfig(sym, {
        ...config,
        triggeredToday: true,
        lastTriggeredAt: Date.now()
      });

      const alertPayload = {
        symbol: sym,
        stockName: stock.name || stock.companyName || sym,
        ltp,
        breakoutPrice: targetPrice,
        rvol,
        rvolThreshold: targetRvol,
        triggeredAt: Date.now()
      };

      // Record history
      recordAlertHistory(alertPayload);

      // Play chime if enabled
      if (config.soundEnabled !== false) {
        playBreakoutChime();
      }

      // Trigger phone vibration (Android / Mobile)
      triggerBreakoutVibration([300, 150, 300, 150, 450]);

      // Dispatch system notification if enabled
      if (config.pushEnabled !== false) {
        dispatchSystemNotification(
          `🚀 Breakout Alert: ${sym} Triggers!`,
          `${sym} broke above Rs. ${targetPrice} with ${rvol.toFixed(2)}x RVOL! Execution checklist satisfied.`
        );
      }

      // Fire in-app event
      try {
        window.dispatchEvent(new CustomEvent('nepse_breakout_alert_triggered', {
          detail: alertPayload
        }));
      } catch (_) {}

      if (typeof onTrigger === 'function') {
        onTrigger(alertPayload);
      }
    }

    results.push({
      symbol: sym,
      stock,
      config,
      ltp,
      rvol,
      targetPrice,
      targetRvol,
      isPriceMet,
      isVolumeMet,
      isTriggered,
      alreadyTriggeredToday
    });
  }

  return results;
}
