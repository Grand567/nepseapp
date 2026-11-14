#!/usr/bin/env node
/**
 * ============================================================================
 * SYNTHETIC TRADING SESSION GENERATOR (PHASE 2)
 * ============================================================================
 * Creates realistic, mathematically verifiable synthetic recording frames
 * for Monday, 2026-11-16 covering:
 *  - 10:45 Pre-Open
 *  - 11:15 Early Live Trading
 *  - 13:00 Mid-Day Continuous Trading
 *  - 14:45 Late Continuous Trading
 *  - 15:00 Closing Bell
 *  - 16:30 Post-Market Settlement
 *  - Next Day 09:00 Pre-Open (2026-11-17)
 *  - Weekend Saturday (2026-11-21)
 *  - Holiday (2026-11-15 Chhath Parva)
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const targetDir = path.join(PROJECT_ROOT, 'qa', 'recordings', 'synthetic-trading-day-2026-11-16');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Fixed hand-computed mathematical anchors for SHIVM:
// Prior settled sessions in ledger:
// [2026-11-13: 138,712], [2026-11-06: 145,210], [2026-11-05: 158,940], [2026-11-04: 160,021], [2026-11-03: 160,000]
// Sum of 4 prior days (excluding 2026-11-03 when today counts as day 5): 138,712 + 145,210 + 158,940 + 160,021 = 602,883
// Sum of 14 prior days: 2,455,937
// Sum of 29 prior days: 5,782,514
// Sum of 43 prior days: 9,019,555

const frames = [
  {
    stepId: 'before_open_1045',
    title: 'Pre-Open Order Session',
    virtualTimeIso: '2026-11-16T10:45:00+05:45',
    nptTime: '10:45:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: false,
      isTradingDay: true,
      isPreOpen: true,
      isWeekend: false,
      isHoliday: false,
      session: 'PRE_OPEN',
      sessionLabel: 'Pre-Open Order Session (±5% limit)',
      statusLabel: 'Pre-Open',
      asOfDate: '2026-11-13',
      asOfDisplay: 'Market Closed / Pre-Open, showing 2026-11-13'
    },
    index: {
      nepseIndex: 2648.89,
      pointChange: 0,
      percentageChange: 0,
      totalTurnover: 0,
      totalVolume: 0,
      totalTrades: 0
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 676.0,
        prevClose: 676.0,
        change: 0.0,
        pChange: 0.0,
        open: 676.0,
        high: 676.0,
        low: 676.0,
        volumeToday: 0,
        turnoverToday: 0,
        tradesToday: 0,
        // Hand-computed multi-day fixtures before market open (strictly 5 previous closed sessions):
        multiDay: {
          oneDay: { volume: 0, sessions: 0, label: 'No live ticks today yet' },
          fiveDay: { volume: 762883, sessions: 5, range: '2026-11-03 → 2026-11-13' },
          fifteenDay: { volume: 2618649, sessions: 15, range: '2026-10-13 → 2026-11-13' },
          thirtyDay: { volume: 5945226, sessions: 30, range: '2026-09-18 → 2026-11-13' },
          allTime: { volume: 9019555, sessions: 43, range: '2026-08-27 → 2026-11-13' }
        }
      },
      NABIL: {
        symbol: 'NABIL',
        ltp: 549.0,
        prevClose: 549.0,
        change: 0.0,
        pChange: 0.0,
        volumeToday: 0,
        turnoverToday: 0,
        multiDay: {
          fiveDay: { volume: 312940, sessions: 5 }
        }
      }
    },
    depth: {
      SHIVM: {
        totalBuyQty: 12500,
        totalSellQty: 18400,
        bids: [{ price: 675, quantity: 4200, orders: 4 }],
        asks: [{ price: 677, quantity: 3800, orders: 3 }]
      }
    }
  },
  {
    stepId: 'mid_session_1115',
    title: 'Early Continuous Trading',
    virtualTimeIso: '2026-11-16T11:15:00+05:45',
    nptTime: '11:15:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: true,
      isTradingDay: true,
      isPreOpen: false,
      isWeekend: false,
      isHoliday: false,
      session: 'CONTINUOUS',
      sessionLabel: 'Continuous Live Trading (NEPSE NOTS)',
      statusLabel: 'Market Open',
      asOfDate: '2026-11-16',
      asOfDisplay: 'LIVE • 11:15 AM NPT'
    },
    index: {
      nepseIndex: 2655.40,
      pointChange: +6.51,
      percentageChange: +0.25,
      totalTurnover: 352400000,
      totalVolume: 820000,
      totalTrades: 3150
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 682.0,
        prevClose: 676.0,
        change: +6.0,
        pChange: +0.89,
        open: 677.0,
        high: 683.0,
        low: 675.0,
        volumeToday: 25000,
        turnoverToday: 17050000,
        tradesToday: 120,
        // Hand-computed multi-day: includes today's live partial 25,000 + previous sessions:
        multiDay: {
          oneDay: { volume: 25000, sessions: 1, range: '2026-11-16 (Live)' },
          fiveDay: { volume: 627883, sessions: 5, range: '2026-11-04 → 2026-11-16 (Live)' },
          fifteenDay: { volume: 2480937, sessions: 15, range: '2026-10-14 → 2026-11-16 (Live)' },
          thirtyDay: { volume: 5807514, sessions: 30, range: '2026-09-19 → 2026-11-16 (Live)' },
          allTime: { volume: 9044555, sessions: 44, range: '2026-08-27 → 2026-11-16 (Live)' }
        }
      },
      NABIL: {
        symbol: 'NABIL',
        ltp: 552.0,
        prevClose: 549.0,
        change: +3.0,
        pChange: +0.55,
        volumeToday: 8000,
        turnoverToday: 4416000,
        multiDay: {
          fiveDay: { volume: 284000, sessions: 5 }
        }
      }
    },
    depth: {
      SHIVM: {
        totalBuyQty: 45000,
        totalSellQty: 31000,
        bids: [{ price: 681, quantity: 8500, orders: 12 }],
        asks: [{ price: 682, quantity: 4100, orders: 6 }]
      }
    }
  },
  {
    stepId: 'mid_session_1300',
    title: 'Mid-Day Continuous Trading',
    virtualTimeIso: '2026-11-16T13:00:00+05:45',
    nptTime: '13:00:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: true,
      isTradingDay: true,
      isPreOpen: false,
      isWeekend: false,
      isHoliday: false,
      session: 'CONTINUOUS',
      sessionLabel: 'Continuous Live Trading (NEPSE NOTS)',
      statusLabel: 'Market Open',
      asOfDate: '2026-11-16',
      asOfDisplay: 'LIVE • 01:00 PM NPT'
    },
    index: {
      nepseIndex: 2668.20,
      pointChange: +19.31,
      percentageChange: +0.73,
      totalTurnover: 1285000000,
      totalVolume: 2980000,
      totalTrades: 11400
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 690.0,
        prevClose: 676.0,
        change: +14.0,
        pChange: +2.07,
        open: 677.0,
        high: 692.0,
        low: 675.0,
        volumeToday: 85000,
        turnoverToday: 58450000,
        tradesToday: 380,
        multiDay: {
          oneDay: { volume: 85000, sessions: 1, range: '2026-11-16 (Live)' },
          fiveDay: { volume: 687883, sessions: 5, range: '2026-11-04 → 2026-11-16 (Live)' },
          fifteenDay: { volume: 2540937, sessions: 15, range: '2026-10-14 → 2026-11-16 (Live)' },
          thirtyDay: { volume: 5867514, sessions: 30, range: '2026-09-19 → 2026-11-16 (Live)' },
          allTime: { volume: 9104555, sessions: 44, range: '2026-08-27 → 2026-11-16 (Live)' }
        }
      },
      NABIL: {
        symbol: 'NABIL',
        ltp: 555.0,
        prevClose: 549.0,
        change: +6.0,
        pChange: +1.09,
        volumeToday: 22000,
        turnoverToday: 12180000,
        multiDay: {
          fiveDay: { volume: 298000, sessions: 5 }
        }
      }
    },
    depth: {
      SHIVM: {
        totalBuyQty: 62000,
        totalSellQty: 48000,
        bids: [{ price: 689, quantity: 14000, orders: 19 }],
        asks: [{ price: 690, quantity: 6500, orders: 8 }]
      }
    }
  },
  {
    stepId: 'mid_session_1445',
    title: 'Late Continuous Trading',
    virtualTimeIso: '2026-11-16T14:45:00+05:45',
    nptTime: '14:45:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: true,
      isTradingDay: true,
      isPreOpen: false,
      isWeekend: false,
      isHoliday: false,
      session: 'CONTINUOUS',
      sessionLabel: 'Continuous Live Trading (NEPSE NOTS)',
      statusLabel: 'Market Open',
      asOfDate: '2026-11-16',
      asOfDisplay: 'LIVE • 02:45 PM NPT'
    },
    index: {
      nepseIndex: 2674.15,
      pointChange: +25.26,
      percentageChange: +0.95,
      totalTurnover: 2104000000,
      totalVolume: 4950000,
      totalTrades: 18900
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 695.0,
        prevClose: 676.0,
        change: +19.0,
        pChange: +2.81,
        open: 677.0,
        high: 696.0,
        low: 675.0,
        volumeToday: 142000,
        turnoverToday: 98340000,
        tradesToday: 590,
        multiDay: {
          oneDay: { volume: 142000, sessions: 1, range: '2026-11-16 (Live)' },
          fiveDay: { volume: 744883, sessions: 5, range: '2026-11-04 → 2026-11-16 (Live)' },
          fifteenDay: { volume: 2597937, sessions: 15, range: '2026-10-14 → 2026-11-16 (Live)' },
          thirtyDay: { volume: 5924514, sessions: 30, range: '2026-09-19 → 2026-11-16 (Live)' },
          allTime: { volume: 9161555, sessions: 44, range: '2026-08-27 → 2026-11-16 (Live)' }
        }
      }
    },
    depth: {
      SHIVM: {
        totalBuyQty: 78000,
        totalSellQty: 62000,
        bids: [{ price: 694, quantity: 18500, orders: 24 }],
        asks: [{ price: 695, quantity: 9200, orders: 11 }]
      }
    }
  },
  {
    stepId: 'at_close_1500',
    title: 'Closing Session Bell',
    virtualTimeIso: '2026-11-16T15:00:00+05:45',
    nptTime: '15:00:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: false,
      isTradingDay: true,
      isClosingSession: true,
      session: 'CLOSING_SESSION',
      sessionLabel: 'Closing Price Session (3:00 - 3:05 PM)',
      statusLabel: 'Market Closed (Closing Session)',
      asOfDate: '2026-11-16',
      asOfDisplay: 'Market Closed • Finalizing Session 2026-11-16'
    },
    index: {
      nepseIndex: 2672.80,
      pointChange: +23.91,
      percentageChange: +0.90,
      totalTurnover: 2248000000,
      totalVolume: 5310000,
      totalTrades: 20150
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 694.0,
        closePrice: 694.0,
        prevClose: 676.0,
        change: +18.0,
        pChange: +2.66,
        open: 677.0,
        high: 696.0,
        low: 675.0,
        volumeToday: 151200,
        turnoverToday: 104782800,
        tradesToday: 620,
        multiDay: {
          oneDay: { volume: 151200, sessions: 1, range: '2026-11-16' },
          fiveDay: { volume: 754083, sessions: 5, range: '2026-11-04 → 2026-11-16' },
          fifteenDay: { volume: 2607137, sessions: 15, range: '2026-10-14 → 2026-11-16' },
          thirtyDay: { volume: 5933714, sessions: 30, range: '2026-09-19 → 2026-11-16' },
          allTime: { volume: 9170755, sessions: 44, range: '2026-08-27 → 2026-11-16' }
        }
      }
    }
  },
  {
    stepId: 'after_close_1630',
    title: 'Post-Market Settlement',
    virtualTimeIso: '2026-11-16T16:30:00+05:45',
    nptTime: '16:30:00',
    date: '2026-11-16',
    marketStatus: {
      isOpen: false,
      isTradingDay: true,
      session: 'POST_MARKET',
      sessionLabel: 'Post-Market Analysis Session',
      statusLabel: 'Market Closed',
      asOfDate: '2026-11-16',
      asOfDisplay: 'Market Closed, showing 2026-11-16'
    },
    index: {
      nepseIndex: 2672.80,
      pointChange: +23.91,
      percentageChange: +0.90,
      totalTurnover: 2248000000,
      totalVolume: 5310000,
      totalTrades: 20150
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 694.0,
        volumeToday: 151200,
        multiDay: {
          oneDay: { volume: 151200, sessions: 1 },
          fiveDay: { volume: 754083, sessions: 5 }
        }
      }
    }
  },
  {
    stepId: 'the_next_day_0900',
    title: 'Next Day Morning (Before Open)',
    virtualTimeIso: '2026-11-17T09:00:00+05:45',
    nptTime: '09:00:00',
    date: '2026-11-17',
    marketStatus: {
      isOpen: false,
      isTradingDay: true,
      session: 'PRE_OPEN',
      sessionLabel: 'Pre-Open / Closed',
      statusLabel: 'Market Closed',
      asOfDate: '2026-11-16',
      asOfDisplay: 'Market Closed, showing 2026-11-16'
    },
    index: {
      nepseIndex: 2672.80,
      pointChange: 0,
      percentageChange: 0
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 694.0,
        volumeToday: 0,
        multiDay: {
          oneDay: { volume: 151200, sessions: 1, range: 'Showing 2026-11-16' }
        }
      }
    }
  },
  {
    stepId: 'weekend_saturday_1200',
    title: 'Weekend Saturday (Market Closed)',
    virtualTimeIso: '2026-11-21T12:00:00+05:45',
    nptTime: '12:00:00',
    date: '2026-11-21',
    marketStatus: {
      isOpen: false,
      isTradingDay: false,
      isWeekend: true,
      session: 'WEEKEND',
      sessionLabel: 'Weekly Holiday (Saturday)',
      statusLabel: 'Market Closed (Weekend)',
      asOfDate: '2026-11-20',
      asOfDisplay: 'Market Closed (Weekend), showing 2026-11-20'
    },
    index: {
      nepseIndex: 2672.80
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 694.0
      }
    }
  },
  {
    stepId: 'holiday_chhath',
    title: 'Public Holiday (Chhath Parva)',
    virtualTimeIso: '2026-11-15T12:00:00+05:45',
    nptTime: '12:00:00',
    date: '2026-11-15',
    marketStatus: {
      isOpen: false,
      isTradingDay: false,
      isHoliday: true,
      holidayName: 'Chhath Parva (Kartik 29)',
      session: 'HOLIDAY',
      sessionLabel: 'Market Holiday (Chhath Parva)',
      statusLabel: 'Holiday: Chhath Parva',
      asOfDate: '2026-11-13',
      asOfDisplay: 'Market Closed (Holiday: Chhath Parva), showing 2026-11-13'
    },
    index: {
      nepseIndex: 2648.89
    },
    stocks: {
      SHIVM: {
        symbol: 'SHIVM',
        ltp: 676.0
      }
    }
  }
];

// Write individual frame files and manifest
const manifest = {
  recordingType: 'SYNTHETIC_HIGH_PRECISION_FIXTURES',
  sessionDate: '2026-11-16',
  createdDate: new Date().toISOString(),
  targetScenarios: frames.map(f => ({ stepId: f.stepId, title: f.title, virtualTime: f.virtualTimeIso })),
  zeroSecretsCertified: true,
  handComputedAnchors: {
    symbol: 'SHIVM',
    priorSessionsVolumeSum: {
      fourSessions: 602883,
      fiveSessions: 762883,
      fourteenSessions: 2455937,
      twentyNineSessions: 5782514,
      fortyThreeSessions: 9019555
    }
  }
};

fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

for (const frame of frames) {
  const filePath = path.join(targetDir, `${frame.stepId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(frame, null, 2), 'utf8');
  console.log(`✓ Generated fixture: ${frame.stepId}.json (${frame.title})`);
}

console.log(`\nSynthetic fixtures successfully generated in ${targetDir}`);
