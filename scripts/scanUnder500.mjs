// scripts/scanUnder500.mjs
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  evaluatePillar1_WyckoffVduVcp,
  evaluatePillar2_SmartMoneyAbsorption,
  evaluatePillar3_VolumePriceValidation,
  evaluatePillar4_TrendAndSectorRS,
  evaluateVetoFilters,
  calculateNetExpectancyAndSizing,
  evaluateSectorFundamentalAndLockinTraps,
  evaluateTurnoverToFloatRotation,
  DEFAULT_FRICTION_CONSTANTS
} from '../proxy/institutionalAlertEngine.mjs';
import { formatDualModeExecutionTicket } from '../src/utils/dynamicCapitalEngine.js';

const marketFile = path.resolve('proxy/data/last_known_market.json');
const dbFile = path.resolve('proxy/data/drabyashree_ledger.db');
const stockmapFile = path.resolve('src/utils/stockmap.json');

const market = JSON.parse(fs.readFileSync(marketFile, 'utf8'));
const todayPrices = market.todayPrices || [];
const db = new Database(dbFile);
const stockmap = JSON.parse(fs.readFileSync(stockmapFile, 'utf8'));

console.log(`Loaded ${todayPrices.length} stocks from last known market.`);

// Map stockmap sector to todayPrices
todayPrices.forEach(s => {
  const meta = stockmap[s.symbol];
  if (meta) {
    s.sector = meta.sector || 'Others';
    s.name = meta.name || s.securityName || s.symbol;
  } else {
    s.sector = 'Others';
  }
});

// Compute Sector Relative Strength
const sectorMap = {};
for (const s of todayPrices) {
  const sec = s.sector || 'Others';
  if (!sectorMap[sec]) sectorMap[sec] = { count: 0, totalPChange: 0, totalTurnover: 0, stocks: [] };
  const pChg = Number(s.pChange || s.percentageChange || 0);
  const to = Number(s.turnover || s.totalTradedValue || 0);
  sectorMap[sec].count++;
  sectorMap[sec].totalPChange += pChg;
  sectorMap[sec].totalTurnover += to;
  sectorMap[sec].stocks.push(s);
}

const sectorRanks = Object.entries(sectorMap).map(([sector, data]) => {
  const avgPChange = data.count > 0 ? data.totalPChange / data.count : 0;
  return { sector, avgPChange, totalTurnover: data.totalTurnover, count: data.count };
}).sort((a, b) => b.avgPChange - a.avgPChange);

console.log('\n--- TOP SECTOR RELATIVE STRENGTH RANKINGS ---');
const sectorRankLookup = {};
sectorRanks.forEach((r, idx) => {
  sectorRankLookup[r.sector] = idx + 1;
  console.log(`Rank #${idx + 1}: ${r.sector.padEnd(28)} | Avg Return: ${r.avgPChange >= 0 ? '+' : ''}${r.avgPChange.toFixed(2)}% | Turnover: Rs. ${(r.totalTurnover / 1e7).toFixed(1)} Cr | Scrips: ${r.count}`);
});

// Filter equity stocks under Rs. 500
const candidatesUnder500 = todayPrices.filter(s => {
  const ltp = Number(s.ltp || s.closePrice || 0);
  const sym = String(s.symbol || '').toUpperCase().trim();
  if (sym.endsWith('D85') || sym.endsWith('D86') || sym.endsWith('D87') || sym.endsWith('D88') || sym.endsWith('D89') || sym.endsWith('D90')) return false;
  if (sym.includes('MF') || sym.endsWith('10') || sym.endsWith('12')) return false;
  if (s.securityName && (s.securityName.includes('Debenture') || s.securityName.includes('Mutual Fund') || s.securityName.includes('Promoter Share'))) return false;
  if (s.sector === 'Promoter Share' || s.sector === 'Mutual Fund') return false;
  return ltp >= 90 && ltp <= 500;
});

console.log(`\nFiltered ${candidatesUnder500.length} ordinary equity stocks under Rs. 500 (Rs. 90 - Rs. 500).`);

// Evaluate each candidate through the 5 Sequential Institutional Filters
const evaluatedCandidates = [];

for (const stock of candidatesUnder500) {
  const symbol = stock.symbol;
  const ltp = Number(stock.ltp || stock.closePrice || 0);
  const open = Number(stock.openPrice || ltp);
  const high = Number(stock.highPrice || ltp);
  const low = Number(stock.lowPrice || ltp);
  const volume = Number(stock.totalTradedQuantity || stock.volume || 0);
  const turnover = Number(stock.totalTradedValue || stock.turnover || (ltp * volume) || 0);
  const turnoverLakhs = turnover / 100000;
  const pChange = Number(stock.pChange || stock.percentageChange || 0);
  const sector = stock.sector || 'Others';
  const sectorRank = sectorRankLookup[sector] || 99;

  // Retrieve candle history from SQLite
  const candles = db.prepare(`
    SELECT trade_date as date, open_price as open, high_price as high, low_price as low, close_price as close, total_volume as volume, total_turnover as turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(symbol);

  // Retrieve broker accumulation from daily_broker_ledger
  const brokerRows = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as total_buy, SUM(sell_vol) as total_sell, (SUM(buy_vol) - SUM(sell_vol)) as net_vol
    FROM daily_broker_ledger
    WHERE symbol = ?
    GROUP BY broker_id
    ORDER BY net_vol DESC
  `).all(symbol);

  const top3BuyRows = brokerRows.slice(0, 3);
  const top3BuyKitta = top3BuyRows.reduce((sum, r) => sum + Math.max(0, Number(r.total_buy || 0)), 0);
  const top3SellRows = [...brokerRows].sort((a, b) => (b.total_sell - a.total_sell)).slice(0, 3);
  const top3SellKitta = top3SellRows.reduce((sum, r) => sum + Math.max(0, Number(r.total_sell || 0)), 0);
  const totalVolumeFromBrokers = brokerRows.reduce((sum, r) => sum + Number(r.total_buy || 0), 0) || volume || 1;
  const bcr3BuyPct = +((top3BuyKitta / totalVolumeFromBrokers) * 100).toFixed(1);
  const bcr3SellPct = +((top3SellKitta / totalVolumeFromBrokers) * 100).toFixed(1);

  // Top broker details
  const leadBroker = top3BuyRows[0] || { broker_id: 'N/A', net_vol: 0 };

  // Calculate 20D average volume, 20 EMA, 50 EMA, ATR14
  let avgVolume20D = Math.max(1, volume);
  let ema50 = ltp;
  let ema20 = ltp;
  let atr14 = Math.max(1, +(ltp * 0.035).toFixed(1));

  if (candles.length >= 20) {
    const recent20 = candles.slice(-20);
    avgVolume20D = Math.round(recent20.reduce((sum, c) => sum + Number(c.volume || 0), 0) / 20);
    
    let k20 = 2 / (20 + 1);
    let k50 = 2 / (50 + 1);
    let e20 = Number(candles[0].close);
    let e50 = Number(candles[0].close);
    for (const c of candles) {
      const cl = Number(c.close);
      e20 = cl * k20 + e20 * (1 - k20);
      e50 = cl * k50 + e50 * (1 - k50);
    }
    ema20 = +e20.toFixed(1);
    ema50 = +e50.toFixed(1);

    if (candles.length >= 15) {
      const recent14 = candles.slice(-14);
      const trs = recent14.map(c => Math.max(Number(c.high) - Number(c.low), Math.abs(Number(c.high) - Number(c.close)), Math.abs(Number(c.low) - Number(c.close))));
      atr14 = Math.max(1, +(trs.reduce((a, b) => a + b, 0) / 14).toFixed(1));
    }
  }

  // Retrieve fundamentals & corporate actions
  const fundRow = db.prepare('SELECT * FROM scrip_fundamentals WHERE symbol = ?').get(symbol) || {};
  const corpRow = db.prepare('SELECT * FROM scrip_corporate_actions WHERE symbol = ?').get(symbol) || {};

  // ══════════════════════════════════════════════════════════════
  // FILTER 1: Sector Relative Strength & Institutional Rotation
  // ══════════════════════════════════════════════════════════════
  const filter1Passed = sectorRank <= 3;

  // ══════════════════════════════════════════════════════════════
  // FILTER 2: 8-Gate Quality Screener & Confluence Score
  // ══════════════════════════════════════════════════════════════
  const isAboveEma50 = ltp >= ema50 * 0.985;
  const isAboveEma20 = ltp >= ema20 * 0.985;
  const hasLiquidity = turnoverLakhs >= 35.0 || (volume >= 15000 && turnoverLakhs >= 20.0);
  const isHealthyEPS = fundRow.eps_ttm !== undefined ? Number(fundRow.eps_ttm) >= 0 : true;
  const isHealthyPE = fundRow.pe !== undefined ? Number(fundRow.pe) < 65 : true;
  const isNotNear52wLow = candles.length >= 40 ? ltp > Math.min(...candles.slice(-40).map(c => Number(c.low))) * 1.04 : true;

  let qualityGatesPassed = 0;
  if (isAboveEma50) qualityGatesPassed++;
  if (isAboveEma20) qualityGatesPassed++;
  if (hasLiquidity) qualityGatesPassed++;
  if (isHealthyEPS) qualityGatesPassed++;
  if (isHealthyPE) qualityGatesPassed++;
  if (isNotNear52wLow) qualityGatesPassed++;
  if (pChange >= -2.0) qualityGatesPassed++;
  if (bcr3BuyPct >= 35.0) qualityGatesPassed++;

  const confluenceScore = Math.min(100, Math.round(
    (qualityGatesPassed / 8) * 45 +
    (sectorRank <= 3 ? 25 : (sectorRank <= 5 ? 15 : 5)) +
    (bcr3BuyPct >= 45 ? 20 : (bcr3BuyPct >= 35 ? 12 : 5)) +
    (hasLiquidity ? 10 : 0)
  ));

  const filter2Passed = qualityGatesPassed >= 6 && confluenceScore >= 70 && hasLiquidity;

  // ══════════════════════════════════════════════════════════════
  // FILTER 3: Wyckoff VDU & Smart Money Concentration
  // ══════════════════════════════════════════════════════════════
  const p1Vdu = evaluatePillar1_WyckoffVduVcp({
    recentVolume: volume,
    avgVolume20D,
    currentHigh: high,
    currentLow: low,
    currentClose: ltp,
    priceHistory: candles.slice(-5),
    vduThreshold: 0.70
  });

  const candleRange = Math.max(0.1, high - low);
  const upperWick = high > Math.max(open, ltp) ? high - Math.max(open, ltp) : 0;
  const upperWickRatio = +(upperWick / candleRange).toFixed(2);
  const isWickClean = upperWickRatio < 0.42;

  const filter3Passed = (p1Vdu.vduRatio <= 0.65 || (volume > avgVolume20D && pChange > 0)) &&
                        bcr3BuyPct >= 38.0 &&
                        bcr3SellPct < 38.0 &&
                        isWickClean;

  // ══════════════════════════════════════════════════════════════
  // FILTER 4: Mandatory Hard Vetoes
  // ══════════════════════════════════════════════════════════════
  const vetoes = [];
  if (corpRow.lockin_expiry_days !== undefined && Number(corpRow.lockin_expiry_days) < 120 && Number(corpRow.lockin_expiry_days) > 0) {
    vetoes.push(`Promoter Lock-in cliff in ${corpRow.lockin_expiry_days} days`);
  }
  if ((sector.includes('Bank') || sector.includes('Finance') || sector.includes('Microfinance')) && fundRow.npl_pct && Number(fundRow.npl_pct) >= 5.0) {
    vetoes.push(`Regulatory NPL violation: ${fundRow.npl_pct}% >= 5.0%`);
  }
  if (sector.includes('Hydro') && fundRow.cost_per_mw && Number(fundRow.cost_per_mw) > 20.0) {
    vetoes.push(`Capex inflation: Rs. ${fundRow.cost_per_mw} Cr/MW > Rs. 20 Cr/MW`);
  }
  const isCircuitCeiling = pChange >= 13.0;
  if (isCircuitCeiling) {
    vetoes.push(`Circuit ceiling trap (+${pChange.toFixed(1)}%)`);
  }
  if (bcr3SellPct >= 42.0 && bcr3SellPct > bcr3BuyPct) {
    vetoes.push(`Operator dumping: Top-3 sell concentration ${bcr3SellPct}%`);
  }

  const filter4Passed = vetoes.length === 0;

  // ══════════════════════════════════════════════════════════════
  // FILTER 5: Execution Plan, Half-Kelly Sizing & Statutory Net R:R
  // ══════════════════════════════════════════════════════════════
  const stopLoss = Math.max(+(ltp * 0.92).toFixed(1), +(ltp - 1.75 * atr14).toFixed(1));
  const target1 = +(ltp * 1.15).toFixed(1);
  const target2 = +(ltp * 1.25).toFixed(1);

  const sizing = calculateNetExpectancyAndSizing({
    entryPrice: ltp,
    target1,
    target2,
    stopLossRaw: stopLoss,
    atr14,
    medianDailyTurnover20D: Math.max(5000000, turnover),
    userCapital: 500000,
    requiredNetRRR: 2.2
  });

  const netRRR = sizing?.netRRR || 0;
  const filter5Passed = netRRR >= 2.2 && !isCircuitCeiling && sizing?.finalKitta >= 10;

  let stagesPassed = 0;
  if (filter1Passed) stagesPassed++;
  if (filter2Passed) stagesPassed++;
  if (filter3Passed) stagesPassed++;
  if (filter4Passed) stagesPassed++;
  if (filter5Passed) stagesPassed++;

  evaluatedCandidates.push({
    symbol,
    companyName: stock.name || stock.securityName || symbol,
    sector,
    sectorRank,
    ltp,
    pChange,
    turnoverLakhs: +turnoverLakhs.toFixed(1),
    volume,
    avgVolume20D,
    vduRatio: p1Vdu.vduRatio,
    bcr3BuyPct,
    bcr3SellPct,
    leadBrokerId: leadBroker.broker_id,
    leadBrokerNetVol: leadBroker.net_vol,
    confluenceScore,
    qualityGatesPassed,
    stagesPassed,
    filter1Passed,
    filter2Passed,
    filter3Passed,
    filter4Passed,
    filter5Passed,
    vetoes,
    stopLoss,
    target1,
    target2,
    netRRR,
    sizing
  });
}

evaluatedCandidates.sort((a, b) => {
  if (b.stagesPassed !== a.stagesPassed) return b.stagesPassed - a.stagesPassed;
  if (b.confluenceScore !== a.confluenceScore) return b.confluenceScore - a.confluenceScore;
  return b.netRRR - a.netRRR;
});

console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`🏆 TOP 10 5-STEP ALPHA CANDIDATES UNDER RS. 500`);
console.log(`═══════════════════════════════════════════════════════════════════`);

evaluatedCandidates.slice(0, 10).forEach((c, idx) => {
  console.log(`\n#${idx + 1}: ${c.symbol} (LTP: Rs. ${c.ltp} | Sector: ${c.sector} [Rank #${c.sectorRank}])`);
  console.log(`   Stages Passed: ${c.stagesPassed}/5 | Confluence Score: ${c.confluenceScore}/100 | Net R:R: ${c.netRRR}:1`);
  console.log(`   Filters: F1(Sector RS)=${c.filter1Passed ? '✓' : '✗'} | F2(8-Gate)=${c.filter2Passed ? '✓' : '✗'} | F3(VDU/BCR3)=${c.filter3Passed ? '✓' : '✗'} | F4(Vetoes Clear)=${c.filter4Passed ? '✓' : '✗'} | F5(Sizing/RRR)=${c.filter5Passed ? '✓' : '✗'}`);
  console.log(`   Metrics: BCR3 Buy: ${c.bcr3BuyPct}% | Lead Broker: #${c.leadBrokerId} (+${c.leadBrokerNetVol} kitta) | VDU: ${c.vduRatio}x | Turnover: Rs. ${c.turnoverLakhs}L`);
  if (c.vetoes.length > 0) {
    console.log(`   🚨 Vetoes: ${c.vetoes.join(', ')}`);
  }
  console.log(`   Execution Plan: Entry Rs. ${c.ltp} | SL Rs. ${c.stopLoss} (-${(((c.ltp - c.stopLoss) / c.ltp) * 100).toFixed(1)}%) | T1 Rs. ${c.target1} (+15%) | T2 Rs. ${c.target2} (+25%)`);
  console.log(`   Sizing (Rs. 500k Portfolio): ${c.sizing?.finalKitta || 0} Kitta | Rs. 1 Lakh Multiplier: ${c.sizing?.kittaPer1Lakh || 0} Kitta`);
});

const prime = evaluatedCandidates[0];
console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`👑 ABSOLUTE BEST STOCK UNDER 500: ${prime.symbol} (LTP: Rs. ${prime.ltp})`);
console.log(`═══════════════════════════════════════════════════════════════════`);
console.log(JSON.stringify(prime, null, 2));
