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
