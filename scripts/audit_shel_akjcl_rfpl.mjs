// scripts/audit_shel_akjcl_rfpl.mjs
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const db = new Database('./proxy/data/drabyashree_ledger.db', { readonly: true });

const targets = ['SHEL', 'AKJCL', 'RFPL'];

console.log('Auditing SHEL, AKJCL, RFPL across all historical and broker data...\n');

function calcRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcEma(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcSma(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

for (const sym of targets) {
  console.log('================================================================================');
  console.log(`📊 COMPREHENSIVE HISTORICAL AUDIT: ${sym}`);
  console.log('================================================================================');

  // 1. All-time OHLCV
  const bars = db.prepare(`
    SELECT trade_date, open_price, high_price, low_price, close_price, total_volume, total_turnover
    FROM daily_stock_summary
    WHERE symbol = ?
    ORDER BY trade_date ASC
  `).all(sym);

  if (!bars.length) {
    console.log(`No records found for ${sym}`);
    continue;
  }

  const closes = bars.map(b => Number(b.close_price || 0));
  const latestBar = bars[bars.length - 1];
  const ltp = latestBar.close_price;
  const prevBar = bars[bars.length - 2] || latestBar;
  const change1d = ((ltp - prevBar.close_price) / prevBar.close_price) * 100;

  const allTimeHigh = Math.max(...bars.map(b => b.high_price));
  const allTimeLow = Math.min(...bars.filter(b => b.low_price > 0).map(b => b.low_price));
  const bars52W = bars.slice(-240);
  const high52W = Math.max(...bars52W.map(b => b.high_price));
  const low52W = Math.min(...bars52W.filter(b => b.low_price > 0).map(b => b.low_price));

  const ema20 = calcEma(closes, 20);
  const ema50 = calcEma(closes, 50);
  const sma200 = calcSma(closes, 200);
  const rsi14 = calcRsi(closes, 14);

  const avgVol20 = bars.slice(-20).reduce((a, b) => a + b.total_volume, 0) / 20;
  const rvol = latestBar.total_volume / Math.max(1, avgVol20);

  console.log(`Company / Symbol  : ${sym}`);
  console.log(`Latest Session    : ${latestBar.trade_date} | LTP: Rs. ${ltp} (${change1d >= 0 ? '+' : ''}${change1d.toFixed(2)}%)`);
  console.log(`Volume / Turnover : ${latestBar.total_volume.toLocaleString()} kitta | Rs. ${Math.round(latestBar.total_turnover).toLocaleString()} (RVOL: ${rvol.toFixed(2)}x)`);
  console.log(`52-Week Range     : Rs. ${low52W} – Rs. ${high52W} | Current Distance from 52W High: ${(((ltp - high52W)/high52W)*100).toFixed(1)}%`);
  console.log(`All-Time Range    : Rs. ${allTimeLow} – Rs. ${allTimeHigh} (Total Recorded Sessions: ${bars.length})`);
  console.log(`Technical Levels  : 20-EMA: Rs. ${ema20?.toFixed(1) || 'N/A'} | 50-EMA: Rs. ${ema50?.toFixed(1) || 'N/A'} | 200-SMA: Rs. ${sma200?.toFixed(1) || 'N/A'}`);
  console.log(`Momentum / RSI(14): ${rsi14?.toFixed(1) || 'N/A'} | Trend: ${ltp >= ema20 ? '🟢 Above 20-EMA' : '🔴 Below 20-EMA'} & ${ltp >= ema50 ? '🟢 Above 50-EMA' : '🔴 Below 50-EMA'}`);

  // 2. Fundamentals & Float
  const fund = db.prepare('SELECT * FROM scrip_fundamentals WHERE symbol = ?').get(sym);
  if (fund) {
    const paidUp = Number(fund.paid_up_capital || 0);
    const floatKitta = Number(fund.public_float_kitta || 0);
    const floatPct = fund.public_share_pct || (paidUp > 0 ? ((floatKitta * 100) / (paidUp / 100)).toFixed(1) : 'N/A');
    console.log(`\nFundamentals:`);
    console.log(`  Sector: ${fund.sector} | Paid-Up: Rs. ${(paidUp/10000000).toFixed(2)} Cr | Public Float: ${floatKitta > 0 ? (floatKitta/1000000).toFixed(2) + 'M shs (' + floatPct + '%)' : 'Est. ~10M shs'}`);
    console.log(`  EPS (TTM): Rs. ${fund.eps_ttm ?? 'N/A'} | Book Value (BVPS): Rs. ${fund.book_value_per_share ?? 'N/A'} | ROE: ${fund.roe_pct ?? 'N/A'}%`);
  }

  // 3. Corporate Actions
  const actions = db.prepare('SELECT * FROM scrip_corporate_actions WHERE symbol = ? ORDER BY book_close_date DESC').all(sym);
  if (actions.length > 0) {
    console.log(`\nCorporate Actions:`);
    actions.forEach(a => {
      console.log(`  - FY ${a.fiscal_year}: Bonus ${a.bonus_share_pct}%, Cash ${a.cash_dividend_pct}%, Right ${a.right_share_ratio || 'None'} (Book Close: ${a.book_close_date})`);
    });
  }

  // 4. Broker Syndicate Analysis (Last 5 Sessions, 20 Sessions, and All-Time)
  const allDates = db.prepare('SELECT DISTINCT trade_date FROM daily_stock_summary ORDER BY trade_date DESC LIMIT 30').all().map(r => r.trade_date);
  const recent5 = allDates.slice(0, 5);
  const recent20 = allDates.slice(0, 20);

  const broker5D = db.prepare(`
    SELECT broker_id, 
           SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v,
           (SUM(buy_vol) - SUM(sell_vol)) as net_v,
           SUM(buy_amt) as buy_a, SUM(sell_amt) as sell_a
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date IN (${recent5.map(d => `'${d}'`).join(',')})
    GROUP BY broker_id
    ORDER BY net_v DESC
  `).all(sym);

  const totalBuy5D = broker5D.reduce((s, b) => s + b.buy_v, 0);
  const top3Buyers5D = broker5D.filter(b => b.net_v > 0).slice(0, 3);
  const top3Sellers5D = [...broker5D].filter(b => b.net_v < 0).sort((a, b) => a.net_v - b.net_v).slice(0, 3);

  console.log(`\nLast 5-Session Broker Matrix:`);
  console.log(`  Top Accumulators:`);
  top3Buyers5D.forEach(b => {
    const vwap = b.buy_v > 0 ? (b.buy_a / b.buy_v).toFixed(1) : 0;
    const bcr = totalBuy5D > 0 ? ((b.buy_v / totalBuy5D) * 100).toFixed(1) : 0;
    console.log(`    Broker #${b.broker_id}: Buy ${b.buy_v.toLocaleString()} | Sell ${b.sell_v.toLocaleString()} | Net +${b.net_v.toLocaleString()} kitta (${bcr}% buy share) | VWAP: Rs. ${vwap}`);
  });
  console.log(`  Top Distributors:`);
  top3Sellers5D.forEach(b => {
    const vwap = b.sell_v > 0 ? (b.sell_a / b.sell_v).toFixed(1) : 0;
    console.log(`    Broker #${b.broker_id}: Buy ${b.buy_v.toLocaleString()} | Sell ${b.sell_v.toLocaleString()} | Net ${b.net_v.toLocaleString()} kitta | VWAP: Rs. ${vwap}`);
  });

  // Broker #58 Specific All-Time Position
  const b58Db = db.prepare(`
    SELECT SUM(buy_vol) as buy_v, SUM(sell_vol) as sell_v, 
           (SUM(buy_vol) - SUM(sell_vol)) as net_v,
           CASE WHEN SUM(buy_vol) > 0 THEN SUM(buy_amt)/SUM(buy_vol) ELSE 0 END as vwap
    FROM daily_broker_ledger
    WHERE symbol = ? AND broker_id = 58
  `).get(sym);

  // Alltime file check
  const alltimeFile = path.join(process.cwd(), 'proxy', 'data', 'broker_alltime', `${sym}.json`);
  let b58AlltimeNet = 0;
  let b58AlltimeBuy = 0;
  let b58AlltimeSell = 0;
  let b58AlltimeAmt = 0;
  if (fs.existsSync(alltimeFile)) {
    try {
      const alltimeObj = JSON.parse(fs.readFileSync(alltimeFile, 'utf8'));
      const rollup = alltimeObj.dailyRollup || {};
      for (const [dt, brokers] of Object.entries(rollup)) {
        if (brokers['58']) {
          b58AlltimeBuy += brokers['58'][0] || 0;
          b58AlltimeSell += brokers['58'][1] || 0;
          b58AlltimeAmt += brokers['58'][2] || 0;
        }
      }
      b58AlltimeNet = b58AlltimeBuy - b58AlltimeSell;
    } catch (_) {}
  }

  console.log(`\nBroker #58 (Naasa Securities) Footprint:`);
  console.log(`  Recent Ledger (Last ~43 sessions): Net ${b58Db?.net_v >= 0 ? '+' : ''}${b58Db?.net_v.toLocaleString()} kitta | VWAP: Rs. ${b58Db?.vwap.toFixed(1)}`);
  if (b58AlltimeNet !== 0) {
    const atVwap = b58AlltimeBuy > 0 ? (b58AlltimeAmt / b58AlltimeBuy).toFixed(1) : 0;
    console.log(`  Historical All-Time Accumulation: Net ${b58AlltimeNet >= 0 ? '+' : ''}${b58AlltimeNet.toLocaleString()} kitta (Bought ${b58AlltimeBuy.toLocaleString()}, Sold ${b58AlltimeSell.toLocaleString()}) | VWAP: Rs. ${atVwap}`);
  }

  // Recent 10 daily candles
  console.log(`\nRecent 10 Trading Sessions Trajectory:`);
  bars.slice(-10).forEach(b => {
    const chg = b.open_price > 0 ? (((b.close_price - b.open_price) / b.open_price) * 100).toFixed(1) : 0;
    console.log(`  ${b.trade_date}: Open Rs. ${b.open_price} | High Rs. ${b.high_price} | Low Rs. ${b.low_price} | Close Rs. ${b.close_price} (${chg >= 0 ? '+' : ''}${chg}%) | Vol: ${b.total_volume.toLocaleString()} | Turnover: Rs. ${Math.round(b.total_turnover).toLocaleString()}`);
  });

  console.log('\n');
}
