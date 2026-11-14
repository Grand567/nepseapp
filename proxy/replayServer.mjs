/**
 * ============================================================================
 * DRABYASHREE NEPSE — REPLAY SERVER & VIRTUAL CLOCK ENGINE (PHASE 2)
 * ============================================================================
 * Provides a mock time-travel backend and fake clock to replay recorded or
 * synthetic trading sessions across all market scenarios:
 *  1. Before open (10:45)
 *  2. Early mid-session (11:15)
 *  3. Noon mid-session (13:00)
 *  4. Late mid-session (14:45)
 *  5. At close (15:00)
 *  6. After close (16:30)
 *  7. The next day before open (09:00)
 *  8. Weekend (Saturday)
 *  9. Holiday (Chhath Parva)
 * ============================================================================
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

export function createReplayApp(recordingDir) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Load manifest and frames
  const manifestPath = path.join(recordingDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Replay manifest not found at: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const frames = [];

  const files = fs.readdirSync(recordingDir).filter(f => f.endsWith('.json') && f !== 'manifest.json');
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(recordingDir, file), 'utf8'));
      frames.push(content);
    } catch (_) {}
  }

  // Sort frames by virtualTimeIso or step
  const stepOrder = [
    'before_open_1045',
    'mid_session_1115',
    'mid_session_1300',
    'mid_session_1445',
    'at_close_1500',
    'after_close_1630',
    'the_next_day_0900',
    'weekend_saturday_1200',
    'holiday_chhath'
  ];

  frames.sort((a, b) => {
    const idxA = stepOrder.indexOf(a.stepId);
    const idxB = stepOrder.indexOf(b.stepId);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return new Date(a.virtualTimeIso || 0) - new Date(b.virtualTimeIso || 0);
  });

  let currentFrameIndex = 0;
  let activeFrame = frames[0] || null;

  // Middleware to apply realistic HTTP cache headers and ETags
  function applyReplayHeaders(res, isLive = false, payload = null) {
    if (isLive) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60');
    }

    if (payload) {
      const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
      res.setHeader('ETag', `W/"replay-${activeFrame?.stepId || 'frame'}-${hash}"`);
    }
  }

  // ── Clock & Replay Control APIs ───────────────────────────────────────────
  app.get('/api/replay/clock', (req, res) => {
    res.json({
      success: true,
      currentFrameIndex,
      totalFrames: frames.length,
      stepId: activeFrame?.stepId,
      title: activeFrame?.title,
      virtualTimeIso: activeFrame?.virtualTimeIso,
      nptTime: activeFrame?.nptTime,
      isMarketOpen: Boolean(activeFrame?.marketStatus?.isOpen),
      marketStatus: activeFrame?.marketStatus
    });
  });

  app.post('/api/replay/set-step', (req, res) => {
    const { stepId, index } = req.body || {};
    let targetIdx = -1;

    if (typeof index === 'number' && index >= 0 && index < frames.length) {
      targetIdx = index;
    } else if (stepId) {
      targetIdx = frames.findIndex(f => f.stepId === stepId);
    }

    if (targetIdx === -1) {
      return res.status(404).json({ success: false, error: 'Target step not found' });
    }

    currentFrameIndex = targetIdx;
    activeFrame = frames[currentFrameIndex];
    res.json({
      success: true,
      message: `Virtual clock advanced to step: ${activeFrame.stepId} (${activeFrame.title})`,
      virtualTimeIso: activeFrame.virtualTimeIso,
      isMarketOpen: Boolean(activeFrame.marketStatus?.isOpen)
    });
  });

  app.post('/api/replay/step-next', (req, res) => {
    if (currentFrameIndex < frames.length - 1) {
      currentFrameIndex++;
      activeFrame = frames[currentFrameIndex];
    }
    res.json({
      success: true,
      stepId: activeFrame.stepId,
      title: activeFrame.title,
      virtualTimeIso: activeFrame.virtualTimeIso,
      currentFrameIndex,
      isMarketOpen: Boolean(activeFrame.marketStatus?.isOpen)
    });
  });

  // ── Application Endpoints in Replay Mode ───────────────────────────────────

  // Market Status
  app.get('/api/market-status', (req, res) => {
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);
    const payload = {
      success: true,
      data: activeFrame?.marketStatus,
      virtualTime: activeFrame?.virtualTimeIso,
      source: 'replay_engine'
    };
    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  // Indices
  app.get('/api/indices', (req, res) => {
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);
    const indexData = activeFrame?.index || { nepseIndex: 2648.89, pointChange: 0 };
    const payload = {
      success: true,
      data: {
        indices: [
          {
            symbol: 'NEPSE',
            currentValue: indexData.nepseIndex,
            change: indexData.pointChange,
            perChange: indexData.percentageChange,
            totalTurnover: indexData.totalTurnover || 0,
            totalVolume: indexData.totalVolume || 0,
            totalTrades: indexData.totalTrades || 0
          }
        ]
      },
      virtualTime: activeFrame?.virtualTimeIso,
      source: isLive ? 'replay_live_feed' : 'replay_closing'
    };
    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  // Market Summary (Live Stocks Table)
  app.get('/api/market-summary', (req, res) => {
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);
    const stockList = Object.values(activeFrame?.stocks || {}).map(s => ({
      symbol: s.symbol,
      name: `${s.symbol} Company Ltd`,
      ltp: s.ltp,
      change: s.change || 0,
      pChange: s.pChange || 0,
      open: s.open || s.ltp,
      high: s.high || s.ltp,
      low: s.low || s.ltp,
      prevClose: s.prevClose || s.ltp,
      volume: s.volumeToday || 0,
      turnover: s.turnoverToday || 0,
      trades: s.tradesToday || 0,
      date: activeFrame?.date,
      businessDate: activeFrame?.date,
      source: isLive ? 'replay_live_feed' : 'replay_settled'
    }));

    const payload = {
      success: true,
      data: stockList,
      source: isLive ? 'replay_live_feed' : 'replay_settled',
      asOfDate: activeFrame?.marketStatus?.asOfDate,
      isMarketOpen: isLive
    };
    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  // Today Prices
  app.get('/api/today-prices', (req, res) => {
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);
    const stockList = Object.values(activeFrame?.stocks || {}).map(s => ({
      symbol: s.symbol,
      ltp: s.ltp,
      pointChange: s.change || 0,
      percentageChange: s.pChange || 0,
      totalTradedQuantity: s.volumeToday || 0,
      totalTradedValue: s.turnoverToday || 0,
      highPrice: s.high || s.ltp,
      lowPrice: s.low || s.ltp,
      openPrice: s.open || s.ltp,
      previousClose: s.prevClose || s.ltp
    }));

    const payload = {
      success: true,
      data: stockList,
      source: isLive ? 'replay_live_prices' : 'replay_settled_prices'
    };
    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  // Market Depth for Symbol
  app.get(['/api/nepse/market-depth/:symbol', '/api/market-depth/:symbol'], (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);
    const depth = activeFrame?.depth?.[symbol] || {
      totalBuyQty: 10000,
      totalSellQty: 12000,
      bids: [{ price: 680, quantity: 2000, orders: 2 }],
      asks: [{ price: 681, quantity: 2500, orders: 3 }]
    };

    const payload = {
      success: true,
      symbol,
      data: depth,
      source: isLive ? 'replay_live_depth' : 'replay_snapshot_depth'
    };
    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  // Multi-Day Timeframe Diagnostics & Broker Analysis
  app.get('/api/diagnostics/:symbol', (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const daysParam = String(req.query.days || '5').toLowerCase();
    const isLive = Boolean(activeFrame?.marketStatus?.isOpen);

    const stock = activeFrame?.stocks?.[symbol] || {
      symbol,
      ltp: 676,
      volumeToday: 0,
      multiDay: {
        oneDay: { volume: 0, sessions: 0 },
        fiveDay: { volume: 762883, sessions: 5 },
        fifteenDay: { volume: 2618649, sessions: 15 },
        thirtyDay: { volume: 5945226, sessions: 30 },
        allTime: { volume: 9019555, sessions: 43 }
      }
    };

    let targetTimeframe = stock.multiDay?.fiveDay;
    let effectiveDays = 5;

    if (daysParam === '1' || daysParam === '1d') {
      targetTimeframe = stock.multiDay?.oneDay;
      effectiveDays = 1;
    } else if (daysParam === '15' || daysParam === '15d') {
      targetTimeframe = stock.multiDay?.fifteenDay;
      effectiveDays = 15;
    } else if (daysParam === '30' || daysParam === '30d') {
      targetTimeframe = stock.multiDay?.thirtyDay;
      effectiveDays = 30;
    } else if (daysParam === 'all' || daysParam === 'alltime') {
      targetTimeframe = stock.multiDay?.allTime;
      effectiveDays = 44;
    }

    const payload = {
      success: true,
      symbol,
      effectiveDays,
      daysRequested: daysParam,
      isLiveSessionIncluded: isLive,
      asOfDate: activeFrame?.marketStatus?.asOfDate,
      totalVolume: targetTimeframe?.volume || 0,
      sessionsAnalyzed: targetTimeframe?.sessions || effectiveDays,
      dateRange: targetTimeframe?.range || 'Range Computed',
      source: 'replay_multi_day_aggregator'
    };

    applyReplayHeaders(res, isLive, payload);
    res.json(payload);
  });

  return { app, manifest, frames, getActiveFrame: () => activeFrame };
}

// If run directly via node:
if (process.argv[1] && process.argv[1].endsWith('replayServer.mjs')) {
  const port = parseInt(process.env.REPLAY_PORT || '5005', 10);
  const defaultDir = path.join(PROJECT_ROOT, 'qa', 'recordings', 'synthetic-trading-day-2026-11-16');
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : defaultDir;

  const { app, getActiveFrame } = createReplayApp(dir);
  app.listen(port, () => {
    console.log(`[replayServer] Listening on http://localhost:${port}`);
    console.log(`[replayServer] Initial Frame: ${getActiveFrame()?.stepId}`);
  });
}
