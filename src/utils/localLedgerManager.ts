// src/utils/localLedgerManager.ts
/**
 * Dravyashree NEPSE — Client-Side Local Ledger Manager
 * 
 * Provides instant (< 5ms) offline and low-latency access to the 5-day rolling market ledger:
 * 1. File B (Historical 4 Days): Loaded from local IndexedDB (or proxy cache) for instant rendering
 *    of all 92 Service Hub tools and 13 Stock Detail tabs.
 * 2. File A (Live Today): Live intraday workspace overlaid dynamically during market hours (11 AM - 3 PM NPT).
 * 3. Deep Cloud Fallback (> 5 Days): Transparently streams multi-month/1-year data on demand from cloud endpoints.
 */

import { useState, useEffect, useMemo } from 'react';
import { idbGet, idbSet } from './indexedDb.js';
import { fetchFromBackend } from './liveData.js';

export interface ScripTacticalLevels {
  limit_buy_min: number;
  limit_buy_max: number;
  chase_cap: number;
  hard_stop: number;
  target_1: number;
  target_2: number;
}

export interface ScripLeadBroker {
  id: number;
  net_volume: number;
  buy_volume: number;
  sell_volume: number;
  retention_pct: number;
  vwap: number;
  vwap_diff_pct: number;
}

export interface ScripTrapAudit {
  is_trap: boolean;
  verdict: string;
  reason: string;
  total_5d_net: number;
  retention_pct: number;
}

export interface ScripHistorySession {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

export interface ScripLedgerRecord {
  symbol: string;
  company_name: string;
  sector: string;
  ltp: number;
  p_change_4d: number;
  total_volume_4d: number;
  total_turnover_4d: number;
  history_4d: ScripHistorySession[];
  lead_broker: ScripLeadBroker | null;
  top_accumulators: Array<{ broker_id: number; net_kitta: number; buy_kitta: number; vwap: number }>;
  top_distributors: Array<{ broker_id: number; net_dump_kitta: number; sell_kitta: number }>;
  trap_audit: ScripTrapAudit;
  tactical_levels: ScripTacticalLevels;
  is_live_overlay?: boolean;
}

export interface ServiceHubData {
  top_accumulated: any[];
  top_turnover: any[];
  top_gainers: any[];
  top_losers: any[];
  dangerous_traps: any[];
  broker_rankings: any[];
  sector_rotation: any[];
  tactical_slate: any[];
}

export interface Historical4DayLedger {
  version: string;
  compiled_at: string;
  trading_sessions: string[];
  session_count: number;
  total_scrips: number;
  stocks: Record<string, ScripLedgerRecord>;
  service_hub: ServiceHubData;
}

const STORAGE_KEY_4D = 'drabyashree_historical_4days_ledger';
const STORAGE_KEY_LIVE = 'drabyashree_live_today_session';

// In-memory hot cache for sub-millisecond synchronous reads
let _hotHistoricalLedger: Historical4DayLedger | null = null;
let _hotLiveSession: any = null;
let _isInitializing = false;
const _initListeners: Array<(ledger: Historical4DayLedger | null) => void> = [];

/**
 * Initializes the client-side local ledger.
 * Reads from IndexedDB first, then validates in background against the server.
 */
export async function initLocalLedger(): Promise<Historical4DayLedger | null> {
  if (_hotHistoricalLedger) return _hotHistoricalLedger;
  if (_isInitializing) {
    return new Promise(resolve => _initListeners.push(resolve));
  }
  _isInitializing = true;

  try {
    // 1. Instant load from IndexedDB (persisted on user device)
    const cached = await idbGet(STORAGE_KEY_4D, true);
    if (cached && cached.stocks) {
      _hotHistoricalLedger = cached as Historical4DayLedger;
      console.log(`[LocalLedger] ⚡ Instant boot from IndexedDB (${_hotHistoricalLedger.total_scrips} scrips, sessions: ${_hotHistoricalLedger.trading_sessions.join(', ')})`);
    }

    // 2. Refresh / validate from server in background
    syncLedgerFromServer().catch(() => {});

    // 3. Pre-warm 4-subfiles in background idle time for 0ms day-switching
    prewarmHistoricalSubfiles().catch(() => {});

    // Notify any waiting callers
    _initListeners.forEach(cb => cb(_hotHistoricalLedger));
    _initListeners.length = 0;
    return _hotHistoricalLedger;
  } catch (err) {
    console.warn('[LocalLedger] Initialization notice:', err);
    _initListeners.forEach(cb => cb(null));
    _initListeners.length = 0;
    return null;
  } finally {
    _isInitializing = false;
  }
}

/**
 * Syncs the 4-day ledger from server API
 */
export async function syncLedgerFromServer(): Promise<Historical4DayLedger | null> {
  try {
    let data: any = await fetchFromBackend('/api/ledger/4day-history', 15000);
    if (!data && typeof fetch !== 'undefined') {
      const res = await fetch('/api/ledger/4day-history');
      if (res.ok) data = await res.json();
    }

    if (data && data.stocks) {
      _hotHistoricalLedger = data;
      // Persist to IndexedDB with 7-day safety TTL
      await idbSet(STORAGE_KEY_4D, data, 7 * 24 * 60 * 60 * 1000);
      console.log(`[LocalLedger] 🔄 Refreshed 4-day ledger from server (Compiled: ${data.compiled_at})`);
      return data;
    }
  } catch (err) {
    console.warn('[LocalLedger] Background server sync warning:', (err as Error).message);
  }
  return _hotHistoricalLedger;
}

/**
 * Synchronous local retrieval of any scrip's 4-day ledger record (< 1ms)
 */
export function getScripFromLedger(symbol: string): ScripLedgerRecord | null {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!_hotHistoricalLedger) return null;
  return _hotHistoricalLedger.stocks?.[sym] || null;
}

/**
 * Synchronous local retrieval of Service Hub precomputed datasets (< 1ms)
 */
export function getServiceHubData(): ServiceHubData | null {
  if (!_hotHistoricalLedger) return null;
  return _hotHistoricalLedger.service_hub || null;
}

/**
 * Returns all active trading dates currently held in the 4-day local ledger
 */
export function getLocalLedgerSessions(): string[] {
  return _hotHistoricalLedger?.trading_sessions || [];
}

/**
 * React Hook: useScrip5DayData(symbol)
 * Provides instant 0ms local rendering for any stock across all 13 stock tabs,
 * combining the 4-day historical ledger with today's live ticks during market hours.
 */
export function useScrip5DayData(symbol: string) {
  const cleanSym = useMemo(() => String(symbol || '').toUpperCase().trim(), [symbol]);
  const [scripData, setScripData] = useState<ScripLedgerRecord | null>(() => getScripFromLedger(cleanSym));
  const [isLoading, setIsLoading] = useState<boolean>(!scripData);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. If not yet in hot memory, initialize ledger
      if (!_hotHistoricalLedger) {
        setIsLoading(true);
        await initLocalLedger();
      }

      const local = getScripFromLedger(cleanSym);
      if (isMounted) {
        setScripData(local);
        setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [cleanSym]);

  return {
    scripData,
    isLoading,
    isTrap: scripData?.trap_audit?.is_trap ?? false,
    trapReason: scripData?.trap_audit?.reason ?? '',
    leadBroker: scripData?.lead_broker ?? null,
    tacticalLevels: scripData?.tactical_levels ?? null,
    history4D: scripData?.history_4d ?? []
  };
}

/**
 * React Hook: useServiceHubData()
 * Instant local hook powering all 92 Service Hub tools
 */
export function useServiceHubData() {
  const [hubData, setHubData] = useState<ServiceHubData | null>(() => getServiceHubData());
  const [isLoading, setIsLoading] = useState<boolean>(!hubData);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!_hotHistoricalLedger) {
        setIsLoading(true);
        const ledger = await initLocalLedger();
        if (isMounted && ledger) {
          setHubData(ledger.service_hub);
          setIsLoading(false);
        }
      } else {
        setHubData(_hotHistoricalLedger.service_hub);
        setIsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, []);

  return { hubData, isLoading };
}

/**
 * Cloud Historical Query Fallback (> 5 Days)
 * When the user requests multi-month or 1-year historical analysis (e.g. 1M, 6M, 1Y chart),
 * this streams from the cloud API on demand without cluttering local device memory.
 */
export async function fetchCloudHistoricalData(symbol: string, days: number = 365) {
  const sym = String(symbol || '').toUpperCase().trim();
  try {
    const data = await fetchFromBackend(`/api/history/${sym}?days=${days}`, 10000);
    if (data) return data;
    if (typeof fetch !== 'undefined') {
      const res = await fetch(`/api/history/${sym}?days=${days}`);
      if (res.ok) return await res.json();
    }
    return null;
  } catch (err) {
    console.warn(`[LocalLedger] Cloud historical stream notice for ${sym}:`, (err as Error).message);
    return null;
  }
}

// ── TWO-FILE SUB-PIPELINE CLIENT HOOKS ──────────────────────────────────────

const _staticAnalyticsCache = new Map<string, any>();

/**
 * React Hook: useTodayStaticAnalytics(symbol)
 * Reads Sub-File A1 (short-term & long-term static analytics) with 0ms in-memory and IndexedDB caching.
 */
export function useTodayStaticAnalytics(symbol?: string | null) {
  const cleanSym = String(symbol || '').toUpperCase().trim();
  const [data, setData] = useState<any>(() => _staticAnalyticsCache.get(cleanSym) || null);
  const [isLoading, setIsLoading] = useState<boolean>(!_staticAnalyticsCache.has(cleanSym));

  useEffect(() => {
    if (!cleanSym) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function loadStatic() {
      // 1. Check in-memory cache
      if (_staticAnalyticsCache.has(cleanSym)) {
        setData(_staticAnalyticsCache.get(cleanSym));
        setIsLoading(false);
        return;
      }

      // 2. Check IndexedDB
      try {
        const idbKey = `today_static_${cleanSym}`;
        const cachedIdb = await idbGet(idbKey);
        if (cachedIdb && isMounted) {
          _staticAnalyticsCache.set(cleanSym, cachedIdb);
          setData(cachedIdb);
          setIsLoading(false);
        }
      } catch (_) {}

      // 3. Network fetch (with ETag & 304 support)
      try {
        const res = await fetch(`/api/today/static-analytics?symbol=${cleanSym}`);
        if (res.ok && res.status !== 304) {
          const json = await res.json();
          const scripData = json.data || json;
          if (scripData && isMounted) {
            _staticAnalyticsCache.set(cleanSym, scripData);
            setData(scripData);
            idbSet(`today_static_${cleanSym}`, scripData).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[LocalLedger] Static analytics load notice for ${cleanSym}:`, (err as Error).message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadStatic();
    return () => { isMounted = false; };
  }, [cleanSym]);

  return {
    staticData: data,
    shortTerm: data?.short_term_static || null,
    longTerm: data?.long_term_static || null,
    pivots: data?.short_term_static?.pivot_points || null,
    oscillators: data?.short_term_static?.daily_oscillators || null,
    smartMoney: data?.short_term_static?.smart_money_5d_flow || null,
    fundamentals: data?.long_term_static?.audited_quarterly_fundamentals || null,
    valuation: data?.long_term_static?.valuation_models || null,
    seasonality: data?.long_term_static?.macro_10y_seasonality || null,
    isLoading
  };
}

/**
 * React Hook: useTodayLiveTickStream(symbol)
 * Subscribes to Sub-File A2 via Server-Sent Events (SSE) for 0ms latency tick updates without polling.
 */
export function useTodayLiveTickStream(symbol?: string | null) {
  const cleanSym = String(symbol || '').toUpperCase().trim();
  const [liveTick, setLiveTick] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    if (!cleanSym || typeof EventSource === 'undefined') {
      setLiveTick(null);
      setIsConnected(false);
      return;
    }

    const sseUrl = `/api/today/ticks/stream?symbol=${cleanSym}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const tick = payload.ticks?.[cleanSym];
        if (tick) setLiveTick(tick);
      } catch (_) {}
    });

    eventSource.addEventListener('tick', (e: MessageEvent) => {
      try {
        const tick = JSON.parse(e.data);
        if (tick.symbol === cleanSym) {
          setLiveTick(tick);
        }
      } catch (_) {}
    });

    eventSource.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [cleanSym]);

  return {
    liveTick,
    quote: liveTick?.quote || null,
    depth: liveTick?.level2_depth || null,
    recentTrades: liveTick?.recent_contract_stream || [],
    signals: liveTick?.live_signals || null,
    isConnected
  };
}

// ── 4 HISTORICAL SUB-FILES CLIENT ENGINE ────────────────────────────────────

export interface SubfileCard1Quote {
  ltp: number;
  open: number;
  high: number;
  low: number;
  prev_close: number;
  p_change: number;
  volume: number;
  turnover: number;
  vwap: number;
  vwap_diff_pct: number;
  statistical_calculation: string;
  interpretation: string;
}

export interface SubfileCard2Pivots {
  classic: { pp: number; r1: number; s1: number; r2: number; s2: number; r3: number; s3: number };
  camarilla: { h4: number; h3: number; l3: number; l4: number };
  statistical_calculation: string;
  interpretation: string;
}

export interface SubfileCard3Oscillators {
  rsi_14: number;
  ema_20: number;
  ema_50: number;
  atr_14: number;
  min_stop_loss_distance: number;
  statistical_calculation: string;
  interpretation: string;
}

export interface SubfileCard4BrokerFlow {
  lead_accumulator: {
    broker_id: number;
    buy_kitta: number;
    sell_kitta: number;
    net_kitta: number;
    buy_vwap: number;
    retention_pct: number;
  } | null;
  top_5_buyers: Array<{ broker_id: number; net_kitta: number; buy_kitta: number; buy_vwap: number }>;
  top_5_sellers: Array<{ broker_id: number; net_dump_kitta: number; sell_kitta: number; sell_vwap: number }>;
  concentration: { bcr3_buy_pct: number; scr3_sell_pct: number; nbar: number; ad_ratio: number };
  statistical_calculation: string;
  interpretation: string;
}

export interface SubfileCard5WyckoffDump {
  wyckoff_phase: string;
  dump_guard_status: string;
  is_trap: boolean;
  trap_reason: string;
  multi_day_retention_pct: number;
  statistical_calculation: string;
  interpretation: string;
}

export interface SubfileCard6Tactical {
  limit_buy_min: number;
  limit_buy_max: number;
  chase_cap: number;
  hard_stop: number;
  target_1: number;
  target_2: number;
  operator_cost_floor: number;
  statistical_calculation: string;
  interpretation: string;
}

export interface HistoricalScripRecord {
  symbol: string;
  company_name: string;
  sector: string;
  card_1_quote: SubfileCard1Quote;
  card_2_pivot_points: SubfileCard2Pivots;
  card_3_oscillators_risk: SubfileCard3Oscillators;
  card_4_broker_smart_flow: SubfileCard4BrokerFlow;
  card_5_wyckoff_and_dump_guard: SubfileCard5WyckoffDump;
  card_6_tactical_execution: SubfileCard6Tactical;
  rolling_cumulative_to_day: {
    sessions_count: number;
    cumulative_volume: number;
    cumulative_turnover: number;
    cumulative_p_change: number;
    operator_cost_floor: number;
    bcr5_net_pct: number;
    interpretation: string;
  };
}

export interface HistoricalDaySubfile {
  file_type: string;
  version: string;
  day_offset: number;
  session_date: string;
  bs_date: string;
  bs_formatted: string;
  day_of_week: string;
  is_trading_day: boolean;
  compiled_at: string;
  total_scrips: number;
  market_summary_card: {
    session_date: string;
    bs_date: string;
    total_turnover: number;
    total_volume: number;
    advances: number;
    declines: number;
    unchanged: number;
    interpretation: string;
  };
  service_hub_precomputed: {
    top_gainers: any[];
    top_losers: any[];
    volume_leaders: any[];
    turnover_leaders: any[];
    whale_archive_top10: any[];
    broker_leaderboard: any[];
    sector_rotation: any[];
  };
  scrips: Record<string, HistoricalScripRecord>;
}

const _subfileMemoryCache = new Map<string | number, HistoricalDaySubfile>();

/**
 * React Hook: useHistoricalSubfile({ dayOffset, date, symbol })
 * Instantly loads any of the 4 historical sub-files from IndexedDB/Memory (< 1ms).
 */
export function useHistoricalSubfile({
  dayOffset = 1,
  date = null,
  symbol = null
}: {
  dayOffset?: number;
  date?: string | null;
  symbol?: string | null;
} = {}) {
  const cacheKey = date || dayOffset || 1;
  const [subfile, setSubfile] = useState<HistoricalDaySubfile | null>(() => _subfileMemoryCache.get(cacheKey) || null);
  const [isLoading, setIsLoading] = useState<boolean>(!_subfileMemoryCache.has(cacheKey));

  const cleanSym = useMemo(() => (symbol ? String(symbol).toUpperCase().trim() : null), [symbol]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      // 1. Hot memory check
      if (_subfileMemoryCache.has(cacheKey)) {
        if (isMounted) {
          setSubfile(_subfileMemoryCache.get(cacheKey)!);
          setIsLoading(false);
        }
        return;
      }

      // 2. IndexedDB check
      const idbKey = `drabyashree_subfile_${cacheKey}`;
      try {
        const cached = await idbGet(idbKey);
        if (cached && isMounted) {
          _subfileMemoryCache.set(cacheKey, cached);
          setSubfile(cached);
          setIsLoading(false);
          return;
        }
      } catch (_) {}

      // 3. Network fetch
      try {
        setIsLoading(true);
        const url = date ? `/api/ledger/subfiles/date/${date}` : `/api/ledger/subfiles/day/${dayOffset}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json && json.scrips) {
            _subfileMemoryCache.set(cacheKey, json);
            if (json.session_date) _subfileMemoryCache.set(json.session_date, json);
            if (json.day_offset) _subfileMemoryCache.set(json.day_offset, json);
            setSubfile(json);
            idbSet(idbKey, json).catch(() => {});
          }
        }
      } catch (err) {
        console.warn(`[LocalLedger] Failed to fetch subfile ${cacheKey}:`, (err as Error).message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [cacheKey, date, dayOffset]);

  const scripData = useMemo(() => {
    if (!subfile || !cleanSym) return null;
    return subfile.scrips?.[cleanSym] || null;
  }, [subfile, cleanSym]);

  return {
    subfileData: subfile,
    marketSummary: subfile?.market_summary_card || null,
    serviceHub: subfile?.service_hub_precomputed || null,
    scripData,
    quote: scripData?.card_1_quote || null,
    pivots: scripData?.card_2_pivot_points || null,
    oscillators: scripData?.card_3_oscillators_risk || null,
    smartMoney: scripData?.card_4_broker_smart_flow || null,
    wyckoff: scripData?.card_5_wyckoff_and_dump_guard || null,
    tactical: scripData?.card_6_tactical_execution || null,
    rolling5D: scripData?.rolling_cumulative_to_day || null,
    isLoading
  };
}

/**
 * React Hook: useScrip4DayTrajectory(symbol)
 * Provides 4-session trajectory (T-4 to T-1) for any stock across all cards and sub-tabs.
 */
export function useScrip4DayTrajectory(symbol: string | null) {
  const cleanSym = useMemo(() => (symbol ? String(symbol).toUpperCase().trim() : null), [symbol]);
  const [trajectory, setTrajectory] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(cleanSym));

  useEffect(() => {
    if (!cleanSym) {
      setTrajectory(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function load() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/ledger/subfiles/trajectory/${cleanSym}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted) setTrajectory(json);
        }
      } catch (err) {
        console.warn(`[LocalLedger] Failed to load trajectory for ${cleanSym}:`, (err as Error).message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    load();
    return () => { isMounted = false; };
  }, [cleanSym]);

  return { trajectory, isLoading };
}

/**
 * Pre-warms the 4 historical sub-files in the background during idle time.
 * Populates memory cache and IndexedDB so Day 1..4 switching is instant (<1ms).
 */
export async function prewarmHistoricalSubfiles(): Promise<void> {
  if (typeof window === 'undefined') return;

  const runWarmup = async () => {
    try {
      // 1. Fetch manifest index
      const manifestRes = await fetch('/api/ledger/subfiles/index');
      if (!manifestRes.ok) return;
      const manifest = await manifestRes.json();
      if (!manifest?.available_sessions || !Array.isArray(manifest.available_sessions)) return;

      // 2. Prewarm Day 1 (Yesterday's settled close)
      const day1Key = 1;
      if (!_subfileMemoryCache.has(day1Key)) {
        const idbKey = `drabyashree_subfile_${day1Key}`;
        const cached = await idbGet(idbKey);
        if (cached && cached.scrips) {
          _subfileMemoryCache.set(day1Key, cached);
          if (cached.session_date) _subfileMemoryCache.set(cached.session_date, cached);
        } else {
          const res = await fetch('/api/ledger/subfiles/day/1');
          if (res.ok) {
            const json = await res.json();
            if (json && json.scrips) {
              _subfileMemoryCache.set(day1Key, json);
              if (json.session_date) _subfileMemoryCache.set(json.session_date, json);
              idbSet(idbKey, json).catch(() => {});
            }
          }
        }
      }

      // 3. Prewarm Day 2 during idle if available
      const day2Key = 2;
      if (!_subfileMemoryCache.has(day2Key)) {
        const idbKey = `drabyashree_subfile_${day2Key}`;
        const cached = await idbGet(idbKey);
        if (cached && cached.scrips) {
          _subfileMemoryCache.set(day2Key, cached);
          if (cached.session_date) _subfileMemoryCache.set(cached.session_date, cached);
        } else {
          const res = await fetch('/api/ledger/subfiles/day/2');
          if (res.ok) {
            const json = await res.json();
            if (json && json.scrips) {
              _subfileMemoryCache.set(day2Key, json);
              if (json.session_date) _subfileMemoryCache.set(json.session_date, json);
              idbSet(idbKey, json).catch(() => {});
            }
          }
        }
      }
    } catch (_) {}
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => runWarmup(), { timeout: 3000 });
  } else {
    setTimeout(runWarmup, 1000);
  }
}

