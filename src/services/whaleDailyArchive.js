// src/services/whaleDailyArchive.js
/**
 * Daily Top 5 Whale Archive & Consecutive Alert Tracker
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatically records, timestamps, and preserves daily Top 5 Slow Unusual
 * Accumulation and Top 5 Unusual Distribution stocks across NEPSE trading sessions.
 *
 * Provides:
 * 1. Persistent multi-day storage in localStorage ('drabyashree_whale_daily_archive')
 * 2. Multi-session consecutive accumulation counters (Day 1, Day 2 Prime Entry, Pause Day)
 * 3. Pre-dump exit countdowns (Day 1 Distribution: 2-3 Day Exit Window)
 * 4. Outcome & return tracking (LTP at signal vs current LTP)
 */

import { calculateBrokerConcentration, calculateQuietAccumulationIndex, estimateTradablePublicFloat } from '../utils/accumulationDistributionEngine.ts';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse.js';

const STORAGE_KEY = 'drabyashree_whale_daily_archive';
const MAX_ARCHIVE_DAYS = 30; // Keep up to 30 trading sessions

// Module-level cumulative trade vault across multi-scan session queries (prevents morning trade eviction)
// Maps: marketDate (YYYY-MM-DD) -> Map<tradeKey, tradeObject>
const SESSION_FLOORSHEET_REGISTRY = new Map();

// Fast static lookup map for sharesOut and sector
const UNIVERSE_MAP = new Map();
if (Array.isArray(NEPSE_UNIVERSE)) {
  NEPSE_UNIVERSE.forEach(u => {
    if (u?.symbol) UNIVERSE_MAP.set(String(u.symbol).toUpperCase().trim(), u);
  });
}

export const SEED_WHALE_ARCHIVE = [
  {
    date: '2026-10-05',
    timestamp: 1791206400000,
    totalStocksScanned: 242,
    topAccumulation: [
      {
        symbol: 'SHIVM',
        companyName: 'Shivam Cements Ltd.',
        sector: 'Manufacturing And Processing',
        ltp: 542,
        prevClose: 538,
        pChange: 0.74,
        turnover: 42300000,
        volume: 78500,
        bcr3Buy: 48.2,
        topBuyers: '#58 (24.1%), #45 (14.2%), #34 (9.9%)',
        topSellers: '#12 (8.5%), #38 (6.2%), #28 (5.1%)',
        smartMoneyBias: 'Institutional Cornering',
        top3NetAbsorptionRatio: 0.82,
        consecutiveDays: 2,
        signalBadge: '🔥 Day 2 Multi-Session Absorption (Prime Entry)',
        alertType: 'DAY_2_PRIME',
        entryLtp: 538,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'CHCL',
        companyName: 'Chilime Hydro power Co.',
        sector: 'Hydro Power',
        ltp: 488,
        prevClose: 485,
        pChange: 0.62,
        turnover: 28400000,
        volume: 58200,
        bcr3Buy: 44.5,
        topBuyers: '#58 (22.5%), #38 (12.0%), #14 (10.0%)',
        topSellers: '#34 (9.0%), #21 (7.4%), #49 (6.1%)',
        smartMoneyBias: 'Institutional Cornering',
        top3NetAbsorptionRatio: 0.78,
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 485,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'CIT',
        companyName: 'Citizen Investment Trust',
        sector: 'Investment',
        ltp: 2180,
        prevClose: 2175,
        pChange: 0.23,
        turnover: 35100000,
        volume: 16100,
        bcr3Buy: 39.4,
        topBuyers: '#58 (20.1%), #49 (11.3%), #28 (8.0%)',
        topSellers: '#45 (7.5%), #16 (6.8%), #32 (5.9%)',
        smartMoneyBias: 'Retail Absorption',
        top3NetAbsorptionRatio: 0.74,
        consecutiveDays: 3,
        signalBadge: '🚀 Day 3 Cornering (Ready for Markup)',
        alertType: 'MULTI_DAY_CORNER',
        entryLtp: 2160,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'NABIL',
        companyName: 'Nabil Bank Limited',
        sector: 'Commercial Banks',
        ltp: 525,
        prevClose: 523,
        pChange: 0.38,
        turnover: 68400000,
        volume: 130500,
        bcr3Buy: 41.8,
        topBuyers: '#45 (21.0%), #28 (12.8%), #58 (8.0%)',
        topSellers: '#34 (10.2%), #17 (7.5%), #49 (6.3%)',
        smartMoneyBias: 'Institutional Cornering',
        top3NetAbsorptionRatio: 0.79,
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 523,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'HDL',
        companyName: 'Himalayan Distillery Ltd.',
        sector: 'Manufacturing And Processing',
        ltp: 1420,
        prevClose: 1412,
        pChange: 0.57,
        turnover: 31200000,
        volume: 22000,
        bcr3Buy: 37.6,
        topBuyers: '#34 (18.5%), #45 (11.1%), #17 (8.0%)',
        topSellers: '#58 (9.1%), #14 (7.0%), #28 (5.5%)',
        smartMoneyBias: 'Institutional Cornering',
        top3NetAbsorptionRatio: 0.72,
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 1412,
        flaggedDate: '2026-10-05'
      }
    ],
    topDistribution: [
      {
        symbol: 'GBIME',
        companyName: 'Global IME Bank Limited',
        sector: 'Commercial Banks',
        ltp: 214,
        prevClose: 216.5,
        pChange: -1.15,
        turnover: 41500000,
        volume: 194000,
        bcr3Sell: 46.5,
        topSellers: '#45 (22.0%), #58 (14.5%), #34 (10.0%)',
        topBuyers: '#14 (8.1%), #28 (6.5%), #17 (5.0%)',
        distributionDay: 2,
        signalBadge: '🚨 Day 2 Aggressive Distribution (Urgent Exit)',
        exitWindowNote: 'Day 2 consecutive selling by top desks. High T+2 trap risk! Stand down or liquidate.',
        alertType: 'DIST_CONSECUTIVE',
        flaggedLtp: 216.5,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'NICA',
        companyName: 'NIC Asia Bank Ltd.',
        sector: 'Commercial Banks',
        ltp: 410,
        prevClose: 413,
        pChange: -0.73,
        turnover: 52100000,
        volume: 127000,
        bcr3Sell: 43.8,
        topSellers: '#34 (20.5%), #49 (13.3%), #14 (10.0%)',
        topBuyers: '#45 (7.8%), #58 (6.2%), #21 (5.1%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 413,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'AHPC',
        companyName: 'Arun Valley Hydropower',
        sector: 'Hydro Power',
        ltp: 285,
        prevClose: 289,
        pChange: -1.38,
        turnover: 24300000,
        volume: 85200,
        bcr3Sell: 41.2,
        topSellers: '#58 (18.2%), #28 (13.0%), #45 (10.0%)',
        topBuyers: '#34 (8.0%), #12 (6.1%), #16 (5.2%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 289,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'API',
        companyName: 'Api Power Company Ltd.',
        sector: 'Hydro Power',
        ltp: 248,
        prevClose: 249,
        pChange: -0.40,
        turnover: 21500000,
        volume: 86700,
        bcr3Sell: 39.5,
        topSellers: '#14 (17.5%), #38 (12.0%), #21 (10.0%)',
        topBuyers: '#45 (8.2%), #58 (6.7%), #28 (5.0%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 249,
        flaggedDate: '2026-10-05'
      },
      {
        symbol: 'PRVU',
        companyName: 'Prabhu Bank Limited',
        sector: 'Commercial Banks',
        ltp: 178,
        prevClose: 180,
        pChange: -1.11,
        turnover: 29800000,
        volume: 167400,
        bcr3Sell: 38.0,
        topSellers: '#45 (16.0%), #49 (12.0%), #32 (10.0%)',
        topBuyers: '#58 (7.5%), #34 (6.3%), #14 (5.5%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 180,
        flaggedDate: '2026-10-05'
      }
    ]
  },
  {
    date: '2026-10-02',
    timestamp: 1790947200000,
    totalStocksScanned: 240,
    topAccumulation: [
      {
        symbol: 'SHIVM',
        companyName: 'Shivam Cements Ltd.',
        sector: 'Manufacturing And Processing',
        ltp: 538,
        prevClose: 535,
        pChange: 0.56,
        turnover: 38200000,
        volume: 71200,
        bcr3Buy: 45.1,
        topBuyers: '#58 (23.0%), #45 (13.1%), #34 (9.0%)',
        topSellers: '#12 (8.0%), #28 (6.5%), #38 (5.0%)',
        smartMoneyBias: 'Institutional Cornering',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 535,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'CIT',
        companyName: 'Citizen Investment Trust',
        sector: 'Investment',
        ltp: 2175,
        prevClose: 2160,
        pChange: 0.69,
        turnover: 32100000,
        volume: 14800,
        bcr3Buy: 41.2,
        topBuyers: '#58 (21.5%), #49 (11.0%), #28 (8.7%)',
        topSellers: '#45 (7.0%), #34 (6.5%), #16 (5.2%)',
        smartMoneyBias: 'Institutional Cornering',
        consecutiveDays: 2,
        signalBadge: '🔥 Day 2 Multi-Session Absorption (Prime Entry)',
        alertType: 'DAY_2_PRIME',
        entryLtp: 2160,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'BARUN',
        companyName: 'Barun Hydropower Co.',
        sector: 'Hydro Power',
        ltp: 312,
        prevClose: 310,
        pChange: 0.65,
        turnover: 18400000,
        volume: 59000,
        bcr3Buy: 38.6,
        topBuyers: '#34 (19.0%), #58 (11.6%), #14 (8.0%)',
        topSellers: '#45 (8.0%), #28 (6.5%), #49 (5.0%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 310,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'HATHY',
        companyName: 'Hathway Investment Nepal',
        sector: 'Investment',
        ltp: 980,
        prevClose: 975,
        pChange: 0.51,
        turnover: 22100000,
        volume: 22600,
        bcr3Buy: 36.8,
        topBuyers: '#58 (18.2%), #45 (10.6%), #49 (8.0%)',
        topSellers: '#34 (7.5%), #14 (6.0%), #28 (5.5%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 975,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'NMB',
        companyName: 'NMB Bank Limited',
        sector: 'Commercial Banks',
        ltp: 265,
        prevClose: 264,
        pChange: 0.38,
        turnover: 41000000,
        volume: 155000,
        bcr3Buy: 36.2,
        topBuyers: '#45 (17.5%), #28 (10.7%), #34 (8.0%)',
        topSellers: '#58 (8.0%), #17 (6.5%), #49 (5.0%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 264,
        flaggedDate: '2026-10-02'
      }
    ],
    topDistribution: [
      {
        symbol: 'GBIME',
        companyName: 'Global IME Bank Limited',
        sector: 'Commercial Banks',
        ltp: 216.5,
        prevClose: 218,
        pChange: -0.69,
        turnover: 39800000,
        volume: 184000,
        bcr3Sell: 44.0,
        topSellers: '#45 (20.5%), #58 (14.0%), #34 (9.5%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 218,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'NLIC',
        companyName: 'Nepal Life Insurance Co.',
        sector: 'Life Insurance',
        ltp: 720,
        prevClose: 728,
        pChange: -1.10,
        turnover: 48500000,
        volume: 67300,
        bcr3Sell: 41.5,
        topSellers: '#34 (19.0%), #49 (12.5%), #14 (10.0%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 728,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'UPPER',
        companyName: 'Upper Tamakoshi Hydropower',
        sector: 'Hydro Power',
        ltp: 232,
        prevClose: 235,
        pChange: -1.28,
        turnover: 31200000,
        volume: 134500,
        bcr3Sell: 39.8,
        topSellers: '#58 (17.5%), #28 (12.3%), #45 (10.0%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 235,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'RADHI',
        companyName: 'Radhi Bidyut Company',
        sector: 'Hydro Power',
        ltp: 298,
        prevClose: 301,
        pChange: -1.00,
        turnover: 19800000,
        volume: 66400,
        bcr3Sell: 38.2,
        topSellers: '#14 (17.0%), #38 (11.5%), #21 (9.7%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 301,
        flaggedDate: '2026-10-02'
      },
      {
        symbol: 'PCBL',
        companyName: 'Prime Commercial Bank',
        sector: 'Commercial Banks',
        ltp: 238,
        prevClose: 240,
        pChange: -0.83,
        turnover: 34500000,
        volume: 145000,
        bcr3Sell: 37.5,
        topSellers: '#45 (15.5%), #49 (12.0%), #32 (10.0%)',
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 240,
        flaggedDate: '2026-10-02'
      }
    ]
  },
  {
    date: '2026-10-01',
    timestamp: 1790860800000,
    totalStocksScanned: 238,
    topAccumulation: [
      {
        symbol: 'CIT',
        companyName: 'Citizen Investment Trust',
        sector: 'Investment',
        ltp: 2160,
        prevClose: 2150,
        pChange: 0.47,
        turnover: 28900000,
        volume: 13400,
        bcr3Buy: 42.0,
        topBuyers: '#58 (22.0%), #49 (11.5%), #28 (8.5%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 2150,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'BARUN',
        companyName: 'Barun Hydropower Co.',
        sector: 'Hydro Power',
        ltp: 310,
        prevClose: 308,
        pChange: 0.65,
        turnover: 15400000,
        volume: 50000,
        bcr3Buy: 37.2,
        topBuyers: '#34 (18.5%), #58 (11.0%), #14 (7.7%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 308,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'NTC',
        companyName: 'Nepal Telecom',
        sector: 'Others',
        ltp: 915,
        prevClose: 912,
        pChange: 0.33,
        turnover: 42500000,
        volume: 46500,
        bcr3Buy: 38.5,
        topBuyers: '#58 (20.0%), #45 (10.5%), #28 (8.0%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 912,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'SCB',
        companyName: 'Standard Chartered Bank',
        sector: 'Commercial Banks',
        ltp: 618,
        prevClose: 615,
        pChange: 0.49,
        turnover: 36200000,
        volume: 58600,
        bcr3Buy: 36.8,
        topBuyers: '#45 (19.0%), #58 (10.0%), #34 (7.8%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 615,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'UNL',
        companyName: 'Unilever Nepal Limited',
        sector: 'Manufacturing And Processing',
        ltp: 48500,
        prevClose: 48200,
        pChange: 0.62,
        turnover: 24250000,
        volume: 500,
        bcr3Buy: 45.0,
        topBuyers: '#58 (25.0%), #45 (12.0%), #34 (8.0%)',
        consecutiveDays: 1,
        signalBadge: '🟢 Day 1 Early Detection',
        alertType: 'DAY_1',
        entryLtp: 48200,
        flaggedDate: '2026-10-01'
      }
    ],
    topDistribution: [
      {
        symbol: 'NLIC',
        companyName: 'Nepal Life Insurance Co.',
        sector: 'Life Insurance',
        ltp: 728,
        prevClose: 735,
        pChange: -0.95,
        turnover: 42100000,
        volume: 57800,
        bcr3Sell: 40.2,
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 735,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'UPPER',
        companyName: 'Upper Tamakoshi Hydropower',
        sector: 'Hydro Power',
        ltp: 235,
        prevClose: 238,
        pChange: -1.26,
        turnover: 28900000,
        volume: 123000,
        bcr3Sell: 38.5,
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 238,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'SANIMA',
        companyName: 'Sanima Bank Limited',
        sector: 'Commercial Banks',
        ltp: 285,
        prevClose: 287,
        pChange: -0.70,
        turnover: 31500000,
        volume: 110500,
        bcr3Sell: 37.2,
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 287,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'KBL',
        companyName: 'Kumari Bank Limited',
        sector: 'Commercial Banks',
        ltp: 226,
        prevClose: 228,
        pChange: -0.88,
        turnover: 35400000,
        volume: 156600,
        bcr3Sell: 36.8,
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 228,
        flaggedDate: '2026-10-01'
      },
      {
        symbol: 'MBL',
        companyName: 'Machhapuchhre Bank',
        sector: 'Commercial Banks',
        ltp: 215,
        prevClose: 217,
        pChange: -0.92,
        turnover: 26800000,
        volume: 124600,
        bcr3Sell: 36.0,
        distributionDay: 1,
        signalBadge: '⚠️ Pre-Dump Window: 2–3 Days to Exit',
        exitWindowNote: 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.',
        alertType: 'DIST_DAY_1',
        flaggedLtp: 217,
        flaggedDate: '2026-10-01'
      }
    ]
  }
];

export function getStoredWhaleArchive() {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[WhaleArchive] Failed to parse stored archive:', e);
    return [];
  }
}

export function initWhaleArchiveWithSeeds() {
  const current = getStoredWhaleArchive();
  if (current.length === 0) {
    saveStoredWhaleArchive(SEED_WHALE_ARCHIVE);
    return SEED_WHALE_ARCHIVE;
  }
  return current;
}

export function saveStoredWhaleArchive(archive) {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    return;
  }
  try {
    const trimmed = (archive || []).slice(0, MAX_ARCHIVE_DAYS);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('[WhaleArchive] Failed to save archive:', e);
  }
}

/**
 * Exports current whale archive as formatted JSON string for mobile/cloud backup.
 */
export function exportWhaleArchiveJSON() {
  const archive = getStoredWhaleArchive();
  return JSON.stringify(archive, null, 2);
}

/**
 * Imports and validates an external whale archive JSON backup.
 */
export function importWhaleArchiveJSON(jsonString) {
  try {
    if (!jsonString || typeof jsonString !== 'string') {
      return { success: false, error: 'Empty or invalid JSON data.' };
    }
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'Archive data must be an array of daily snapshots.' };
    }
    const valid = parsed.filter(s => s && s.date && Array.isArray(s.topAccumulation) && Array.isArray(s.topDistribution));
    if (valid.length === 0) {
      return { success: false, error: 'No valid daily snapshots found in backup.' };
    }
    saveStoredWhaleArchive(valid);
    return { success: true, count: valid.length };
  } catch (err) {
    return { success: false, error: err?.message || 'JSON parse error.' };
  }
}

/**
 * Builds or updates the Daily Whale Snapshot from live market stocks and floorsheet trades.
 */
export function captureDailyWhaleSnapshot(stocks = [], floorsheet = [], customDate = null) {
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return null;
  }

  // Determine market business date from floorsheet or fallback to today's date
  let marketDate = customDate;
  if (!marketDate && Array.isArray(floorsheet) && floorsheet.length > 0) {
    const firstWithDate = floorsheet.find(t => t.businessDate || t.date || t.tradeDate);
    if (firstWithDate) {
      marketDate = String(firstWithDate.businessDate || firstWithDate.date || firstWithDate.tradeDate).split('T')[0];
    }
  }
  if (!marketDate) {
    marketDate = new Date().toISOString().split('T')[0];
  }

  const existingArchive = getStoredWhaleArchive();
  const previousSnapshot = existingArchive.find(s => s.date !== marketDate);

  // Merge incoming floorsheet into cumulative session registry to prevent morning trade eviction (Loophole 1 Fix)
  if (!SESSION_FLOORSHEET_REGISTRY.has(marketDate)) {
    SESSION_FLOORSHEET_REGISTRY.set(marketDate, new Map());
  }
  const sessionTradesMap = SESSION_FLOORSHEET_REGISTRY.get(marketDate);
  if (Array.isArray(floorsheet) && floorsheet.length > 0) {
    floorsheet.forEach((t, idx) => {
      const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
      if (!sym) return;
      const bBroker = String(t.buyerMemberId || t.buyerBroker || t.buyer || '').replace(/^0+/, '').trim();
      const sBroker = String(t.sellerMemberId || t.sellerBroker || t.seller || '').replace(/^0+/, '').trim();
      const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);
      const rate = Number(t.contractRate || t.rate || t.price || 0);
      const key = t.contractId ? String(t.contractId) : `${sym}_${bBroker}_${sBroker}_${qty}_${rate}_${t.tradeTime || idx}`;
      sessionTradesMap.set(key, t);
    });
  }

  // Group all cumulative session trades by symbol (guarantees morning trades are never evicted!)
  const fsMap = new Map();
  sessionTradesMap.forEach(t => {
    const sym = String(t.stockSymbol || t.symbol || '').toUpperCase().trim();
    if (!sym) return;
    if (!fsMap.has(sym)) fsMap.set(sym, []);
    fsMap.get(sym).push(t);
  });

  // Find existing snapshot today to preserve morning peak metrics and entry prices
  const existingToday = existingArchive.find(s => s.date === marketDate);

  // Analyze all liquid stocks
  const evaluated = [];
  for (const s of stocks) {
    const sym = String(s.symbol || '').toUpperCase().trim();
    if (!sym || !s.ltp) continue;
    // Skip mutual funds and debentures for whale equity tracking
    const rawSecLower = String(s.sector || '').toLowerCase();
    if (sym.includes('D8') || sym.includes('D9') || sym.endsWith('MF') || sym.endsWith('BS') || sym.endsWith('SF') || sym.endsWith('EF') || sym.endsWith('GF') || sym.endsWith('FF') || rawSecLower.includes('mutual')) continue;

    const trades = fsMap.get(sym) || [];
    const conc = calculateBrokerConcentration(trades, sym, s);

    // 1. Single Top Buyer Net Absorption & 2. Aggregate Top 3 Syndicate Net Absorption Guard
    const topBuyer = conc.topBuyerBrokers?.[0];
    let netAbsorptionRatio = 1.0;
    if (topBuyer && topBuyer.volume > 0) {
      const buyerNetQty = Number(topBuyer.netQty !== undefined ? topBuyer.netQty : (conc.topNetAccumulators?.[0]?.netQty ?? topBuyer.volume));
      netAbsorptionRatio = Number((Math.max(0, buyerNetQty) / topBuyer.volume).toFixed(2));
    }

    const top3Buyers = (conc.topBuyerBrokers || []).slice(0, 3);
    const top3GrossBuy = top3Buyers.reduce((acc, b) => acc + (b.volume || 0), 0);
    const top3NetBuy = top3Buyers.reduce((acc, b) => {
      const net = b.netQty !== undefined ? b.netQty : b.volume;
      return acc + Math.max(0, net);
    }, 0);
    const top3NetAbsorptionRatio = top3GrossBuy > 0 ? Number((top3NetBuy / top3GrossBuy).toFixed(2)) : 1.0;

    // Churn detected when:
    // A) Single top broker has high gross volume but low net absorption (< 35%)
    // B) Top 3 syndicate desks have substantial gross volume (>= 1,500) but low collective net absorption (< 40%)
    const isSingleDeskChurn = Boolean(topBuyer && topBuyer.volume >= 500 && netAbsorptionRatio < 0.35);
    const isSyndicateChurn = Boolean(top3GrossBuy >= 1500 && top3NetAbsorptionRatio < 0.40);
    const isWashChurn = isSingleDeskChurn || isSyndicateChurn;

    // 3. Execution Dispersion & Block Trade Anomaly Check
    let maxSingleTradeQty = 0;
    let totalFloorsheetQty = 0;
    trades.forEach(t => {
      const q = Number(t.contractQuantity || t.quantity || t.qty || 0);
      totalFloorsheetQty += q;
      if (q > maxSingleTradeQty) maxSingleTradeQty = q;
    });
    const singleTradeConcentrationPct = totalFloorsheetQty > 0 ? Number(((maxSingleTradeQty / totalFloorsheetQty) * 100).toFixed(1)) : 0;
    // Anomaly: 1-2 huge lump transactions dominating the entire volume (e.g. negotiated promoter block deal)
    const isBlockTradeAnomaly = Boolean(
      (maxSingleTradeQty >= 50000 && trades.length <= 2) ||
      (totalFloorsheetQty >= 25000 && singleTradeConcentrationPct >= 80.0 && trades.length >= 2) ||
      (s.isBlockTrade === true)
    );

    // Upper circuit (+15%) ceiling proximity guard (SEBON Fourth Amendment 15% rule)
    const prevClose = Number(s.previousClose || s.prevClose || (s.ltp ? s.ltp / (1 + (s.pChange || 0) / 100) : 0));
    const upperCeiling = prevClose > 0 ? +(prevClose * 1.15).toFixed(1) : 0;
    const isNearUpperCircuit = upperCeiling > 0 && s.ltp >= upperCeiling * 0.985; // within 1.5% of +15% limit

    // 4. Intraday High/Low/Open/Close Range and Upper Shadow Rejection Check
    const highPrice = Number(s.high || s.highPrice || s.maxPrice || s.ltp || 0);
    const lowPrice = Number(s.low || s.lowPrice || s.minPrice || s.ltp || 0);
    const openPrice = Number(s.open || s.openPrice || prevClose || s.ltp || 0);
    const ltpPrice = Number(s.ltp || 0);

    const intradayRange = highPrice - lowPrice;
    const intradayRangePct = lowPrice > 0 ? Number(((intradayRange / lowPrice) * 100).toFixed(2)) : 0;
    const upperShadow = highPrice > 0 ? Math.max(0, highPrice - Math.max(openPrice, ltpPrice)) : 0;
    const upperShadowPct = intradayRange > 0 ? Number(((upperShadow / intradayRange) * 100).toFixed(1)) : 0;

    // Severe supply rejection: Intraday range was wide (>= 2.5%) and upper shadow >= 55%
    // (Stock pumped intraday, met heavy seller dump, and fell back near session lows)
    const isUpperShadowDump = Boolean(intradayRangePct >= 2.5 && upperShadowPct >= 55.0);

    // ── Float Normalization & Dynamic Sector Turnover Calibration (Loophole 3 Fix) ──
    const uInfo = UNIVERSE_MAP.get(sym) || {};
    const listedShares = Number(s.listedShares || s.totalListedShares || (uInfo.sharesOut ? uInfo.sharesOut * 1000000 : 0)) || 10000000;
    const sector = s.sector || uInfo.sector || 'Equities';
    const secLower = sector.toLowerCase();

    let publicFloatFraction = 0.35;
    if (secLower.includes('commercial')) publicFloatFraction = 0.40;
    else if (secLower.includes('development') || secLower.includes('finance')) publicFloatFraction = 0.40;
    else if (secLower.includes('hydro')) publicFloatFraction = 0.35;
    else if (secLower.includes('microfinance')) publicFloatFraction = 0.35;
    else if (secLower.includes('insurance')) publicFloatFraction = 0.30;
    else if (secLower.includes('manufacturing')) publicFloatFraction = 0.25;
    else if (secLower.includes('hotel')) publicFloatFraction = 0.30;

    const estFloatShares = Math.max(500000, Math.round(listedShares * publicFloatFraction));
    const floatTurnoverPct = estFloatShares > 0 ? Number(((Number(s.volume || 0) / estFloatShares) * 100).toFixed(3)) : 0;

    // Dynamic sector-calibrated turnover floor (Rs.)
    let dynamicTurnoverFloor = 3000000; // Rs. 30 Lakh default
    if (secLower.includes('commercial bank') || secLower.includes('commercial')) {
      dynamicTurnoverFloor = 15000000; // Rs. 1.5 Crore minimum for commercial bank giants
    } else if (secLower.includes('development bank') || secLower.includes('insurance')) {
      dynamicTurnoverFloor = 6000000;  // Rs. 60 Lakhs
    } else if (secLower.includes('hydro') || secLower.includes('microfinance')) {
      dynamicTurnoverFloor = 2500000;  // Rs. 25 Lakhs
    }
    // For micro-caps (< 20 Lakh float shares, e.g. ANLB, small hydros):
    if (estFloatShares < 2000000) {
      dynamicTurnoverFloor = Math.min(dynamicTurnoverFloor, 1500000); // Rs. 15 Lakhs for micro-caps
    }

    // Preserve morning peak concentration if logged earlier today
    const todayPrevAcc = existingToday?.topAccumulation?.find(p => p.symbol === sym);
    const bcr3Buy = Math.max(conc.bcr3BuyPct || 0, todayPrevAcc?.bcr3Buy || 0);
    const tradesCount = Math.max(trades.length, todayPrevAcc?.tradesCount || 0);

    const qaiResult = calculateQuietAccumulationIndex(
      { ...s, floatTurnoverPct, estFloatShares, pChange: s.pChange, ltp: s.ltp, volume: s.volume },
      conc
    );

    evaluated.push({
      symbol: sym,
      companyName: s.companyName || s.name || sym,
      sector,
      ltp: Number(s.ltp || 0),
      prevClose,
      pChange: Number(s.pChange || 0),
      turnover: Number(s.turnover || 0),
      volume: Number(s.volume || 0),
      estFloatShares,
      floatTurnoverPct,
      dynamicTurnoverFloor,
      tradesCount,
      bcr3Buy,
      bcr5Buy: conc.bcr5BuyPct || 0,
      bcr3Sell: conc.bcr3SellPct || 0,
      topBuyers: conc.topBuyerBrokers?.slice(0, 3).map(b => `#${b.broker} (${b.pct.toFixed(1)}%)`).join(', ') || 'Floor pending',
      topSellers: conc.topSellerBrokers?.slice(0, 3).map(b => `#${b.broker} (${b.pct.toFixed(1)}%)`).join(', ') || 'Floor pending',
      topNetAccumulators: conc.topNetAccumulators?.slice(0, 2).map(b => `#${b.broker} (+${b.netQty.toLocaleString()} sh)`).join(', ') || '',
      topNetDistributors: conc.topNetDistributors?.slice(0, 2).map(b => `#${b.broker} (${b.netQty.toLocaleString()} sh)`).join(', ') || '',
      smartMoneyBias: conc.smartMoneyBias || 'Neutral',
      tradeSizeRatio: conc.tradeSizeRatio || 1.0,
      netAbsorptionRatio,
      top3NetAbsorptionRatio,
      isWashChurn,
      isBlockTradeAnomaly,
      singleTradeConcentrationPct,
      isNearUpperCircuit,
      isUpperShadowDump,
      upperShadowPct,
      intradayRangePct,
      avgTicketSize: Number(s.transactions || s.totalTrades || 0) > 0 ? Math.round(Number(s.turnover || 0) / Number(s.transactions || s.totalTrades || 1)) : 0,
      volumeSurgeRatio: Number(s.volumeSurgeRatio || s.rvol || 1.0),
      stealthScore: Number(s.wyckoff?.stealthScore ?? s.stealthScore ?? s.stealthAccumulation ?? 50),
      dumpRiskScore: Number(s.wyckoff?.pumpDumpRiskScore ?? s.dumpRiskScore ?? s.pumpDumpRiskScore ?? 40),
      wyckoffStage: String(s.wyckoff?.stage || s.stage || ''),
      qaiScore: qaiResult.qaiScore,
      isDay1StealthCandidate: qaiResult.isDay1StealthCandidate,
      asymmetryRatio: qaiResult.asymmetryRatio,
      qaiResult
    });
  }

  // Check trading session continuity across weekends (e.g. Fri -> Mon is 3 calendar days)
  let isPreviousSessionContinuous = true;
  if (previousSnapshot && previousSnapshot.date) {
    const diffMs = Math.abs(new Date(marketDate).getTime() - new Date(previousSnapshot.date).getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      isPreviousSessionContinuous = false;
    }
  }

  // A floorsheet is only considered active with broker tracking if trades contain identifiable broker numbers
  let hasBrokerDetails = false;
  for (const t of sessionTradesMap.values()) {
    const b = String(t.buyerMemberId || t.buyerBroker || t.buyer || '').trim();
    const sel = String(t.sellerMemberId || t.sellerBroker || t.seller || '').trim();
    if (b || sel) {
      hasBrokerDetails = true;
      break;
    }
  }
  const isFloorsheetActive = hasBrokerDetails;

  // 1. FILTER TOP 5 SLOW UNUSUAL ACCUMULATION
  // Criteria:
  // - Tight price action: -2.0% to +3.0% (stealth accumulation before markup)
  // - Wyckoff stealth stage OR high stealth score OR verified broker concentration (BCR3 >= 36%)
  // - Institutional turnover or significant float turnover
  // - Shielded against: +15% upper circuit traps, wash churn, block trade anomalies, and upper shadow dumps
  const accPool = evaluated
    .filter(s => {
      const tightPrice = s.pChange >= -2.0 && s.pChange <= 3.0;

      let hasWhaleConcentration = false;
      let isInstitutionalTurnover = false;

      const isWyckoffStealth = s.wyckoffStage.includes('STEALTH');

      if (isFloorsheetActive) {
        hasWhaleConcentration = isWyckoffStealth || s.bcr3Buy >= 36 || (s.bcr3Buy >= 32 && s.floatTurnoverPct >= 0.60);
        isInstitutionalTurnover = s.turnover >= s.dynamicTurnoverFloor || s.floatTurnoverPct >= 0.30;
      } else {
        hasWhaleConcentration = isWyckoffStealth || s.stealthScore >= 55 || (s.floatTurnoverPct >= 0.35 && tightPrice) || (s.volumeSurgeRatio >= 1.25 && s.floatTurnoverPct >= 0.15) || (s.avgTicketSize >= 35000 && s.turnover >= 1000000);
        isInstitutionalTurnover = s.turnover >= Math.min(s.dynamicTurnoverFloor, 800000) || s.floatTurnoverPct >= 0.15;
      }

      const highInterest = hasWhaleConcentration && isInstitutionalTurnover;
      const notCircuitTrap = !s.isNearUpperCircuit;
      const notWashChurn = !s.isWashChurn;
      const notBlockAnomaly = !s.isBlockTradeAnomaly;
      const notIntradayDump = !s.isUpperShadowDump;

      return tightPrice && highInterest && notCircuitTrap && notWashChurn && notBlockAnomaly && notIntradayDump;
    })
    .sort((a, b) => {
      // Prioritize Day 1 Stealth Candidate
      const aD1 = a.isDay1StealthCandidate ? 1 : 0;
      const bD1 = b.isDay1StealthCandidate ? 1 : 0;
      if (bD1 !== aD1) return bD1 - aD1;

      // Prioritize Wyckoff Stealth stage first
      const aStealth = a.wyckoffStage.includes('STEALTH') ? 1 : 0;
      const bStealth = b.wyckoffStage.includes('STEALTH') ? 1 : 0;
      if (bStealth !== aStealth) return bStealth - aStealth;

      if (isFloorsheetActive) {
        if (b.bcr3Buy >= 40 && a.bcr3Buy < 40) return 1;
        if (a.bcr3Buy >= 40 && b.bcr3Buy < 40) return -1;
        if (b.bcr3Buy !== a.bcr3Buy && (b.bcr3Buy > 0 || a.bcr3Buy > 0)) return b.bcr3Buy - a.bcr3Buy;
      }

      if (b.qaiScore !== a.qaiScore) return b.qaiScore - a.qaiScore;
      if (b.stealthScore !== a.stealthScore) return b.stealthScore - a.stealthScore;
      if (b.floatTurnoverPct !== a.floatTurnoverPct) return b.floatTurnoverPct - a.floatTurnoverPct;
      return b.turnover - a.turnover;
    });

  // Safety net: in production environments with full universe (> 20 stocks), ensure Top 5 Accumulation is populated
  if (evaluated.length >= 20 && accPool.length < 5) {
    const backupCandidates = evaluated
      .filter(s =>
        !accPool.some(p => p.symbol === s.symbol) &&
        !s.isWashChurn &&
        !s.isBlockTradeAnomaly &&
        !s.isNearUpperCircuit &&
        !s.isUpperShadowDump &&
        s.pChange >= -2.0 && s.pChange <= 3.0 &&
        (s.wyckoffStage.includes('STEALTH') || s.isDay1StealthCandidate || s.qaiScore >= 60 || s.stealthScore >= 55 || s.floatTurnoverPct >= 0.25) &&
        (s.turnover >= s.dynamicTurnoverFloor || s.floatTurnoverPct >= 0.20)
      )
      .sort((a, b) => {
        if (b.qaiScore !== a.qaiScore) return b.qaiScore - a.qaiScore;
        if (b.stealthScore !== a.stealthScore) return b.stealthScore - a.stealthScore;
        if (b.floatTurnoverPct !== a.floatTurnoverPct) return b.floatTurnoverPct - a.floatTurnoverPct;
        return b.turnover - a.turnover;
      });
    accPool.push(...backupCandidates.slice(0, 5 - accPool.length));
  }

  const topAccumulation = accPool.slice(0, 5).map(stock => {
    // Check if appeared in previous session (with weekend continuity)
    const prevEntry = isPreviousSessionContinuous ? previousSnapshot?.topAccumulation?.find(p => p.symbol === stock.symbol) : null;
    let consecutiveDays = 1;
    let signalBadge = '🟢 Day 1 Early Detection';
    let alertType = 'DAY_1';

    if (prevEntry) {
      consecutiveDays = (prevEntry.consecutiveDays || 1) + 1;
      if (consecutiveDays === 2) {
        signalBadge = '🔥 Day 2 Multi-Session Absorption (Prime Entry)';
        alertType = 'DAY_2_PRIME';
      } else if (consecutiveDays >= 3) {
        signalBadge = `🚀 Day ${consecutiveDays} Cornering (Ready for Markup)`;
        alertType = 'MULTI_DAY_CORNER';
      }
    } else if (previousSnapshot && isPreviousSessionContinuous) {
      // Check if it appeared in recent sessions and today is a Wyckoff volume dry-up pause
      const olderSnapshots = existingArchive.slice(1, 4);
      let priorEntry = null;
      for (const snap of olderSnapshots) {
        const found = snap.topAccumulation?.find(p => p.symbol === stock.symbol);
        if (found) {
          priorEntry = found;
          break;
        }
      }
      if (priorEntry && (stock.volume <= (priorEntry.volume * 0.75) || priorEntry.volume === 0)) {
        signalBadge = '⏳ Pause Day Supply Test (Dip Entry)';
        alertType = 'PAUSE_DAY_DIP';
      }
    } else if (stock.isDay1StealthCandidate || stock.qaiScore >= 72) {
      signalBadge = `🎯 Day 1 Stealth Detection (QAI ${stock.qaiScore})`;
      alertType = 'DAY_1_STEALTH';
    }

    // Preserve morning entry LTP if already logged today
    const loggedToday = existingToday?.topAccumulation?.find(p => p.symbol === stock.symbol);
    const entryLtp = loggedToday?.entryLtp || stock.ltp;

    return {
      ...stock,
      consecutiveDays,
      signalBadge,
      alertType,
      entryLtp,
      qaiScore: stock.qaiScore,
      asymmetryRatio: stock.asymmetryRatio,
      floatAbsorptionPct: stock.floatTurnoverPct,
      isDay1StealthCandidate: stock.isDay1StealthCandidate,
      flaggedDate: marketDate
    };
  });

  // 2. FILTER TOP 5 UNUSUAL DISTRIBUTION
  // Criteria: Stalling/falling price, high seller concentration (BCR3 >= 36%), and heavy distribution turnover
  const distPool = evaluated
    .filter(s => {
      let isHeavyDistTurnover = false;
      let hasDistConcentration = false;

      if (isFloorsheetActive) {
        isHeavyDistTurnover = s.turnover >= s.dynamicTurnoverFloor * 1.2 || s.floatTurnoverPct >= 0.45;
        hasDistConcentration = s.bcr3Sell >= 36 || (s.bcr3Sell >= 32 && s.floatTurnoverPct >= 0.60);
      } else {
        isHeavyDistTurnover = s.turnover >= 1500000 || s.floatTurnoverPct >= 0.30;
        hasDistConcentration = s.dumpRiskScore >= 60 || s.isUpperShadowDump || (s.pChange < -0.8 && s.turnover >= 2000000);
      }

      const isDumpStructure = s.tradeSizeRatio <= 1.15 || s.bcr3Sell > s.bcr3Buy || s.pChange < 0 || s.isUpperShadowDump || s.dumpRiskScore >= 60;
      const meetsDistCriteria = hasDistConcentration && isHeavyDistTurnover && isDumpStructure;
      return meetsDistCriteria;
    })
    .sort((a, b) => {
      if (b.bcr3Sell >= 40 && a.bcr3Sell < 40) return 1;
      if (a.bcr3Sell >= 40 && b.bcr3Sell < 40) return -1;
      if (b.bcr3Sell !== a.bcr3Sell && (b.bcr3Sell > 0 || a.bcr3Sell > 0)) return b.bcr3Sell - a.bcr3Sell;
      if (b.dumpRiskScore !== a.dumpRiskScore) return b.dumpRiskScore - a.dumpRiskScore;
      if (b.floatTurnoverPct !== a.floatTurnoverPct) return b.floatTurnoverPct - a.floatTurnoverPct;
      return b.turnover - a.turnover;
    });

  const topDistribution = distPool.slice(0, 5).map(stock => {
    const prevEntry = isPreviousSessionContinuous ? previousSnapshot?.topDistribution?.find(p => p.symbol === stock.symbol) : null;
    let distributionDay = 1;
    let signalBadge = '⚠️ Pre-Dump Window: 2–3 Days to Exit';
    let exitWindowNote = 'Smart money initiated distribution. Recommended exit window: 2 to 3 sessions before markdown.';
    let alertType = 'DIST_DAY_1';

    if (prevEntry) {
      distributionDay = (prevEntry.distributionDay || 1) + 1;
      signalBadge = `🚨 Day ${distributionDay} Aggressive Distribution (Urgent Exit)`;
      exitWindowNote = `Day ${distributionDay} consecutive selling by top desks. High T+2 trap risk! Stand down or liquidate.`;
      alertType = 'DIST_CONSECUTIVE';
    }

    // Preserve morning flagged LTP if already logged today
    const loggedToday = existingToday?.topDistribution?.find(p => p.symbol === stock.symbol);
    const flaggedLtp = loggedToday?.flaggedLtp || stock.ltp;

    return {
      ...stock,
      distributionDay,
      signalBadge,
      exitWindowNote,
      alertType,
      flaggedLtp,
      flaggedDate: marketDate
    };
  });

  const finalTopAccumulation = topAccumulation.length > 0
    ? topAccumulation
    : (existingToday?.topAccumulation?.length > 0 ? existingToday.topAccumulation : []);

  const finalTopDistribution = topDistribution.length > 0
    ? topDistribution
    : (existingToday?.topDistribution?.length > 0 ? existingToday.topDistribution : []);

  const newSnapshot = {
    date: marketDate,
    timestamp: Date.now(),
    totalStocksScanned: evaluated.length,
    topAccumulation: finalTopAccumulation,
    topDistribution: finalTopDistribution
  };

  // Upsert into archive
  const updatedArchive = [
    newSnapshot,
    ...existingArchive.filter(s => s.date !== marketDate)
  ].sort((a, b) => b.date.localeCompare(a.date));

  saveStoredWhaleArchive(updatedArchive);
  return newSnapshot;
}

/**
 * Calculates real-time performance tracking for all past archived signals
 * by comparing the flagged price against current live LTPs.
 */
export function calculateArchivePerformance(snapshot, liveStocksMap = {}) {
  if (!snapshot) return { accumulationTrack: [], distributionTrack: [] };

  const accumulationTrack = (snapshot.topAccumulation || []).map(item => {
    const live = liveStocksMap[item.symbol];
    const currentLtp = live ? Number(live.ltp || live.closePrice || item.ltp) : item.ltp;
    const entryPrice = item.entryLtp || item.ltp;
    const returnPct = entryPrice > 0 ? Number((((currentLtp - entryPrice) / entryPrice) * 100).toFixed(2)) : 0;

    return {
      ...item,
      currentLtp,
      entryPrice,
      returnPct,
      isProfitable: returnPct > 0,
      isFlat: returnPct === 0
    };
  });

  const distributionTrack = (snapshot.topDistribution || []).map(item => {
    const live = liveStocksMap[item.symbol];
    const currentLtp = live ? Number(live.ltp || live.closePrice || item.ltp) : item.ltp;
    const flaggedPrice = item.flaggedLtp || item.ltp;
    const dropPct = flaggedPrice > 0 ? Number((((flaggedPrice - currentLtp) / flaggedPrice) * 100).toFixed(2)) : 0;

    return {
      ...item,
      currentLtp,
      flaggedPrice,
      dropPct, // Positive dropPct means price fell (dump confirmed, loss avoided!)
      dumpConfirmed: dropPct > 0
    };
  });

  return {
    date: snapshot.date,
    accumulationTrack,
    distributionTrack
  };
}
