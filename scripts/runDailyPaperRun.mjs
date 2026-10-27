/**
 * scripts/runDailyPaperRun.mjs
 * Live Daily Stock Selection & Autonomous Paper Trading Execution Runner
 *
 * Runs the complete quantitative stock-selection engine on the latest stored NEPSE session:
 * 1. Loads all equities from SQLite daily_stock_summary for the target date.
 * 2. Assembles multi-day candle history and calculates technical confluence (trend, momentum, ATR).
 * 3. Pulls granular broker buy/sell volume and calculates broker confluence (CR5, absorption, imbalance).
 * 4. Merges fundamental metrics and macro market context.
 * 5. Runs evaluateStockSelection across the entire universe.
 * 6. Logs BUY recommendations into the Paper Trading Journal with exact entry/stops/targets.
 * 7. Synchronizes existing open positions and updates signal attribution.
 * 8. Persists state to proxy/data/paper_trading_state.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, getStoredDates, getLedgerStatusInfo } from '../proxy/db/ledgerStore.js';
import { evaluateStockSelection } from '../src/utils/signals/stockScoringEngine.js';
import { evaluateBrokerFloorsheetConfluence } from '../src/utils/signals/brokerFloorsheetSignals.js';
import { evaluateTechnicalConfluence } from '../src/utils/signals/technicalSignals.js';
import { evaluateFundamentalConfluence } from '../src/utils/signals/fundamentalSignals.js';
import { evaluateMarketContextConfluence } from '../src/utils/signals/marketContextSignals.js';
import {
  recordPaperPick,
  processDailyPaperOutcomes,
  calculateSignalAttribution,
  getPaperTrackerState,
  savePaperTrackerState
} from '../src/utils/signals/paperTradingTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, '../proxy/data/paper_trading_state.json');

// Load stockmap for sector & fundamentals
let stockMap = {};
try {
  const stockmapRaw = fs.readFileSync(path.resolve(__dirname, '../src/utils/stockmap.json'), 'utf8');
  stockMap = JSON.parse(stockmapRaw);
} catch (_) {}

export async function runDailyPaperRun(targetDate = null) {
  console.log('========================================================================');
  console.log('  DRABYASHREE NEPSE: LIVE QUANTITATIVE STOCK SELECTION & PAPER RUN      ');
  console.log('========================================================================\n');

  // 1. Identify Target Session Date
  const storedDates = getStoredDates(35);
  const selectedDate = targetDate || storedDates[0] || '2026-10-26';
  console.log(`[1/6] Target Market Session: ${selectedDate}`);
  console.log(`      Historical Context: ${storedDates.length} trading dates stored in SQLite.\n`);

  // 2. Fetch all daily stock summaries for selected date
  const stockRows = db.prepare(`
    SELECT symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE trade_date = ?
    ORDER BY total_turnover DESC
  `).all(selectedDate);

  if (!stockRows || stockRows.length === 0) {
    console.error(`[ERROR] No stock summary records found for ${selectedDate}. Run floorsheet ingestion first.`);
    return { success: false, error: 'No data for date' };
  }

  console.log(`[2/6] Loaded ${stockRows.length} active equities from daily summary.\n`);

  // Calculate Market Breadth for market context
  const gainers = stockRows.filter(s => s.close_price > s.open_price).length;
  const losers = stockRows.filter(s => s.close_price < s.open_price).length;
  const unchanged = stockRows.length - gainers - losers;
  const totalMarketTurnover = stockRows.reduce((sum, s) => sum + s.total_turnover, 0);

  // Load prior paper state from file if available
  let currentState = getPaperTrackerState();
  if (fs.existsSync(STATE_FILE)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (fileData && fileData.capital !== undefined) {
        currentState = savePaperTrackerState(fileData);
      }
    } catch (_) {}
  }

  // 3. Process Selection for each stock
  console.log('[3/6] Running 4-Pillar Quantitative Confluence Analysis across Universe...');
  const evaluatedUniverse = [];
  const hardFilterRejections = [];

  for (const row of stockRows) {
    const symbol = row.symbol;
    const meta = stockMap[symbol] || {};
    const sector = meta.sector || 'Others';

    // A. Historical Candles for Technicals
    const historyRows = db.prepare(`
      SELECT trade_date as date, open_price as open, high_price as high, low_price as low, close_price as close, total_volume as volume
      FROM daily_stock_summary
      WHERE symbol = ? AND trade_date <= ?
      ORDER BY trade_date ASC
      LIMIT 30
    `).all(symbol, selectedDate);

    const candles = historyRows.map(r => ({
      date: r.date,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume)
    }));

    const volumeHistory20 = candles.slice(-20).map(c => c.volume);
    const techSignals = evaluateTechnicalConfluence({
      symbol,
      candles,
      currentVolume: row.total_volume,
      volumeHistory20
    });

    // B. Granular Broker Ledgers for Floorsheet Flow
    const brokerRows = db.prepare(`
      SELECT broker_id as broker, buy_vol as buyQty, sell_vol as sellQty, buy_amt as buyAmount, sell_amt as sellAmount
      FROM daily_broker_ledger
      WHERE symbol = ? AND trade_date = ?
    `).all(symbol, selectedDate);

    const brokerSignals = evaluateBrokerFloorsheetConfluence({
      symbol,
      brokers: brokerRows,
      currentVolume: row.total_volume,
      volumeHistory20
    });

    // C. Fundamental Signals
    const eps = Number(meta.eps || (sector === 'Commercial Banks' ? 22 : 18));
    const bookValue = Number(meta.bookValue || (sector === 'Commercial Banks' ? 190 : 160));
    const npl = sector === 'Commercial Banks' ? Number(meta.npl ?? 2.8) : null;
    const listedShares = Number(meta.sharesOut || 20) * 1000000;
    const publicPercentage = Number(meta.publicPercentage || 45);

    const fundSignals = evaluateFundamentalConfluence({
      symbol,
      sector,
      ltp: row.close_price,
      eps,
      bookValue,
      roe: eps > 0 && bookValue > 0 ? (eps / bookValue) * 100 : 12,
      npl,
      car: 12.5,
      listedShares,
      publicPercentage
    });

    // D. Market Context Signals
    const marketSignals = evaluateMarketContextConfluence({
      symbol,
      sector,
      nepseLtp: 2450,
      totalTurnover: totalMarketTurnover,
      advances: gainers,
      declines: losers,
      unchanged
    });

    // E. Master Stock Selection & Execution Plan
    const stockPayload = {
      symbol,
      sector,
      ltp: row.close_price,
      marketPrice: row.close_price,
      prevClose: candles[candles.length - 2]?.close || row.open_price,
      volume: row.total_volume,
      turnover: row.total_turnover,
      eps,
      bookValue,
      npl,
      listedShares,
      publicPercentage
    };

    const selectionResult = evaluateStockSelection({
      stock: stockPayload,
      brokerSignals,
      technicalSignals: techSignals,
      fundamentalSignals: fundSignals,
      marketSignals,
      portfolioContext: {
        capital: currentState.capital || 1000000,
        currentHoldings: currentState.openPositions || []
      }
    });

    if (selectionResult.action === 'BUY' || selectionResult.action === 'WATCH') {
      evaluatedUniverse.push({
        stock: stockPayload,
        result: selectionResult
      });
    } else {
      if (selectionResult.hardFilters && !selectionResult.hardFilters.passedAll) {
        hardFilterRejections.push({
          symbol,
          score: selectionResult.compositeScore,
          reasons: selectionResult.rejectionReasons
        });
      }
    }
  }

  // Sort by composite score descending
  evaluatedUniverse.sort((a, b) => b.result.compositeScore - a.result.compositeScore);

  console.log(`      ✓ Analysis Complete: ${evaluatedUniverse.length} candidate scrips scored >= 50.`);
  console.log(`      ✓ Filtered Out: ${hardFilterRejections.length} scrips failed zero-tolerance hard filters.\n`);

  // 4. Log Qualified BUY recommendations into Paper Trading Journal
  console.log('[4/6] Logging Qualified BUY Setups into Paper Trading Engine...');
  const buyPicks = evaluatedUniverse.filter(item => item.result.action === 'BUY');
  const watchPicks = evaluatedUniverse.filter(item => item.result.action === 'WATCH');

  const newlyLoggedTrades = [];
  for (const item of buyPicks) {
    // Only open position if not already in openPositions
    const alreadyOpen = (currentState.openPositions || []).some(p => p.symbol === item.stock.symbol);
    if (!alreadyOpen) {
      const pick = recordPaperPick({
        date: selectedDate,
        stock: item.stock,
        scoringResult: item.result
      });
      newlyLoggedTrades.push(pick);
    }
  }

  console.log(`      ✓ Newly Opened Paper Positions: ${newlyLoggedTrades.length}`);
  console.log(`      ✓ Top Watchlist Candidates: ${watchPicks.length}\n`);

  // 5. Sync Existing Open Positions with Today's Closing Prices
  console.log('[5/6] Synchronizing Active Positions & T+2 Demat Settlement Schedule...');
  const currentQuotes = {};
  for (const row of stockRows) {
    currentQuotes[row.symbol] = Number(row.close_price);
  }

  const updatedState = processDailyPaperOutcomes(currentQuotes, selectedDate);

  // 6. Calculate Signal Attribution
  const attribution = calculateSignalAttribution();

  // Save updated state to file
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(updatedState, null, 2), 'utf8');
    console.log(`[6/6] Saved persistent state to ${STATE_FILE}\n`);
  } catch (err) {
    console.warn('[WARN] Could not persist state to file:', err.message);
  }

  // ── EXECUTIVE REPORT PRINT ──────────────────────────────────────────────
  console.log('========================================================================');
  console.log(`  EXECUTIVE SELECTION & PAPER TRADING REPORT — SESSION: ${selectedDate} `);
  console.log('========================================================================\n');

  console.log('📊 QUALIFIED BUY SETUPS (High Confluence Score >= 70):');
  if (buyPicks.length === 0) {
    console.log('  (No stocks met strict >=70 Buy threshold today. Capital protected.)');
  } else {
    buyPicks.slice(0, 5).forEach((p, idx) => {
      const res = p.result;
      const plan = res.executionPlan;
      console.log(`  #${idx + 1} [${res.symbol}] (${p.stock.sector})`);
      console.log(`      Score: ${res.compositeScore}/100 | Confidence: ${res.confidence}%`);
      console.log(`      Breakdown: Broker ${res.scoreBreakdown.brokerFloorsheet} | Tech ${res.scoreBreakdown.technical} | Fund ${res.scoreBreakdown.fundamental} | Market ${res.scoreBreakdown.marketContext}`);
      console.log(`      Entry Zone: Rs. ${plan.entryZone[0]} – ${plan.entryZone[1]} (LTP: Rs. ${plan.entryLtp})`);
      console.log(`      Stop-Loss: Rs. ${plan.stopLoss} (-${plan.riskPct}% risk) | Target 1: Rs. ${plan.target1} | Target 2: Rs. ${plan.target2}`);
      console.log(`      Position Size: ${plan.positionSizing.sharesKitta} kitta (Rs. ${plan.positionSizing.capitalRequiredNpr.toLocaleString()} capital | Max Risk: Rs. ${plan.positionSizing.maxRiskNpr.toLocaleString()})`);
      console.log('');
    });
  }

  console.log('👀 TOP WATCHLIST SCRIPS (Score 50–69):');
  watchPicks.slice(0, 5).forEach((p, idx) => {
    const res = p.result;
    console.log(`  • ${res.symbol} (${p.stock.sector}) — Score: ${res.compositeScore}/100 | Confidence: ${res.confidence}% (LTP: Rs. ${p.stock.ltp})`);
  });
  console.log('');

  console.log('💼 PAPER PORTFOLIO TELEMETRY:');
  console.log(`  • Virtual Liquid Capital: Rs. ${Math.round(updatedState.capital).toLocaleString()}`);
  console.log(`  • Active Open Positions: ${updatedState.openPositions.length}`);
  updatedState.openPositions.forEach(pos => {
    const pnlStr = pos.unrealizedPnl != null && !isNaN(pos.unrealizedPnl) 
      ? (pos.unrealizedPnl >= 0 ? '+' : '') + Math.round(pos.unrealizedPnl) 
      : '0';
    console.log(`      → ${pos.symbol}: ${pos.shares} kitta @ Rs. ${pos.entryPrice} (Hold Day: T+${pos.holdSessions ?? 0}, Settled: ${pos.isSettled ? 'YES' : 'NO (T+2 Lock)'}, PnL: ${pnlStr} NPR)`);
  });
  console.log(`  • Completed Journal Trades: ${updatedState.closedJournal.length}`);
  console.log(`  • Overall Realized PnL: Rs. ${Math.round(attribution.overall.realizedPnl).toLocaleString()} (${attribution.overall.winRatePct}% Win Rate)\n`);

  console.log('========================================================================');
  console.log('  PAPER RUN COMPLETE: FULL FORWARD PROGRESSION RECORDED                 ');
  console.log('========================================================================\n');

  return {
    success: true,
    sessionDate: selectedDate,
    evaluatedCount: stockRows.length,
    buyPicks: buyPicks.map(b => b.result),
    watchPicks: watchPicks.map(w => w.result),
    openPositionsCount: updatedState.openPositions.length,
    closedJournalCount: updatedState.closedJournal.length,
    portfolioState: updatedState
  };
}

// Direct CLI Invocation
if (process.argv[1] && process.argv[1].endsWith('runDailyPaperRun.mjs')) {
  runDailyPaperRun().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
