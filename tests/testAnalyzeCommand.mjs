import { db, getSmartMoneyAggregatedFlow, getSymbolHistoryFromDb } from '../proxy/db/ledgerStore.js';
import { BROKER_NAMES } from '../proxy/brokerVault.mjs';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateStockDeepAnalysis(symbol) {
  const sym = String(symbol || '').toUpperCase().trim();
  if (!sym) return { success: false, reason: 'No symbol provided' };

  // 1. Fetch Price History (last 30 sessions)
  const hist = getSymbolHistoryFromDb(sym, 30);
  if (!hist || hist.length === 0) {
    return { success: false, reason: `No trading data found for scrip $${sym}.` };
  }

  const latest = hist[0];
  const ltp = Number(latest.closePrice || latest.ltp || 0);
  const open = Number(latest.openPrice || ltp);
  const high = Number(latest.highPrice || ltp);
  const low = Number(latest.lowPrice || ltp);
  const volume = Number(latest.totalVolume || 0);
  const turnover = Number(latest.totalTurnover || 0);
  const tradeDate = latest.date || latest.tradeDate || 'Latest Session';

  // Day Change %
  const pChange = open > 0 ? (((ltp - open) / open) * 100) : 0;
  const pChangeStr = `${pChange >= 0 ? '+' : ''}${pChange.toFixed(2)}%`;

  // 20-period EMA
  const closes = hist.map(h => h.closePrice).reverse();
  const k = 2 / (Math.min(closes.length, 20) + 1);
  let ema20 = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema20 = closes[i] * k + ema20 * (1 - k);
  }
  const distFromEmaPct = +(((ltp - ema20) / ema20) * 100).toFixed(1);

  // 20-Day Range & Average Volume
  const slice20 = hist.slice(0, 20);
  const minLow20 = Math.min(...slice20.map(h => h.lowPrice || ltp));
  const maxHigh20 = Math.max(...slice20.map(h => h.highPrice || ltp));
  const avgVol20 = Math.round(slice20.reduce((acc, h) => acc + (h.totalVolume || 0), 0) / Math.max(1, slice20.length));
  const rvol = avgVol20 > 0 ? +(volume / avgVol20).toFixed(2) : 1.0;
  const baseRangePct = minLow20 > 0 ? +(((maxHigh20 - minLow20) / minLow20) * 100).toFixed(1) : 0;

  // 2. Fetch Multi-Session Broker Flow (last 5 sessions)
  const flow = getSmartMoneyAggregatedFlow(sym, 5);

  const buyers = flow.filter(f => f.buyVolume > 0).sort((a, b) => (b.buyVolume - b.sellVolume) - (a.buyVolume - a.sellVolume));
  const sellers = flow.filter(f => f.sellVolume > 0).sort((a, b) => (b.sellVolume - b.buyVolume) - (a.sellVolume - a.buyVolume));

  const top3Buyers = buyers.slice(0, 3);
  const top3Sellers = sellers.slice(0, 3);

  const top3BuyVol = top3Buyers.reduce((acc, b) => acc + Number(b.buyVolume || 0), 0);
  const top3BuyAmt = top3Buyers.reduce((acc, b) => acc + Number(b.buyAmount || 0), 0);
  const top3SellVol = top3Sellers.reduce((acc, s) => acc + Number(s.sellVolume || 0), 0);

  const totalBuyVolAll = flow.reduce((acc, f) => acc + Number(f.buyVolume || 0), 0);
  const totalSellVolAll = flow.reduce((acc, f) => acc + Number(f.sellVolume || 0), 0);

  const bcr3Buy = totalBuyVolAll > 0 ? +((top3BuyVol / totalBuyVolAll) * 100).toFixed(1) : 50.0;
  const bcr3Sell = totalSellVolAll > 0 ? +((top3SellVol / totalSellVolAll) * 100).toFixed(1) : 35.0;

  // 3. Average Broker Buy Price
  let avgBrokerPrice = top3BuyVol > 0 ? +(top3BuyAmt / top3BuyVol).toFixed(1) : ltp;
  if (!avgBrokerPrice || avgBrokerPrice <= 0) avgBrokerPrice = ltp;

  const distFromBroker = +(((ltp - avgBrokerPrice) / avgBrokerPrice) * 100).toFixed(1);
  const distSign = distFromBroker >= 0 ? '+' : '';

  // Lead Buyer Details
  const leadBuyer = top3Buyers[0] || null;
  const leadBrokerId = leadBuyer ? leadBuyer.brokerId : null;
  const leadBrokerName = leadBrokerId ? (BROKER_NAMES[String(leadBrokerId)] || `Broker #${leadBrokerId}`) : 'Top Desk';
  const cleanLeadName = String(leadBrokerName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim();
  const leadNetVol = leadBuyer ? (leadBuyer.buyVolume - leadBuyer.sellVolume) : 0;
  const leadAvgPrice = leadBuyer && leadBuyer.buyVolume > 0 ? +(leadBuyer.buyAmount / leadBuyer.buyVolume).toFixed(1) : avgBrokerPrice;

  // Lead Seller Details
  const leadSeller = top3Sellers[0] || null;
  const leadSellerId = leadSeller ? leadSeller.brokerId : null;
  const leadSellerName = leadSellerId ? (BROKER_NAMES[String(leadSellerId)] || `Broker #${leadSellerId}`) : 'Seller Desk';
  const cleanLeadSeller = String(leadSellerName).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim();
  const leadSellerNet = leadSeller ? (leadSeller.sellVolume - leadSeller.buyVolume) : 0;

  // 4. Decision Gates & Appropriateness Verdict
  const isNetAccumulated = (top3BuyVol > top3SellVol * 1.15) && (leadNetVol > 0);
  const isDumping = (top3SellVol > top3BuyVol * 1.30) || (leadSellerNet > top3BuyVol * 0.5);
  const isPriceNearBasis = distFromBroker >= -4.5 && distFromBroker <= 3.8;
  const isExtended = distFromBroker > 4.5 || pChange > 6.0;
  const isTrendSafe = ltp >= (ema20 * 0.96);

  let verdictType = 'NEUTRAL';
  let verdictBadge = '';
  let verdictReason = '';

  if (isDumping) {
    verdictType = 'AVOID';
    verdictBadge = '🔴 <b>NOT APPROPRIATE / HIGH DOWNSIDE RISK (DISTRIBUTION TRAP)</b>';
    verdictReason = `Broker #${leadSellerId} (${cleanLeadSeller}) and top sellers dumped <b>${top3SellVol.toLocaleString()} Kitta</b>, overwhelming buyers. Retail liquidity is being used as exit liquidity. <b>Do NOT buy! Preserve cash.</b>`;
  } else if (isExtended) {
    verdictType = 'WATCHLIST';
    verdictBadge = '🟡 <b>WATCHLIST ONLY / PULLBACK REQUIRED (LATE CHASE RISK)</b>';
    verdictReason = `Scrip has accumulated well, but price has jumped <b>${distSign}${distFromBroker}% above the Broker Average Cost Basis (Rs. ${avgBrokerPrice})</b>. Chasing now creates severe T+2 pullback risk. Wait for dip into the Buy Zone.`;
  } else if (isNetAccumulated && isPriceNearBasis && isTrendSafe) {
    verdictType = 'BUY';
    verdictBadge = '🟢 <b>APPROPRIATE TO INVEST (HIGH CONVICTION SWING ACCUMULATION)</b>';
    verdictReason = `Top institutional buyers (led by Broker #${leadBrokerId} ${cleanLeadName}) accumulated <b>${top3BuyVol.toLocaleString()} Kitta</b> at an <b>Average Broker Price of Rs. ${avgBrokerPrice}</b>. LTP is trading directly on/near this cost floor (${distSign}${distFromBroker}%). whalemen will defend this level!`;
  } else {
    verdictType = 'NEUTRAL';
    verdictBadge = '⚪ <b>NEUTRAL / LOW CONVICTION (WAIT FOR CATALYST)</b>';
    verdictReason = `Activity is balanced retail turnover with no decisive institutional supply cornering yet. Keep on radar for a volume breakout above 20 EMA.`;
  }

  // 5. Tactical Execution Levels
  const buyZoneLow = Math.max(1, Math.floor(Math.min(ltp, avgBrokerPrice) * 0.990));
  const buyZoneHigh = Math.max(1, Math.ceil(Math.max(ltp, avgBrokerPrice) * 1.012));
  const stopLoss = Math.max(1, +(buyZoneLow * 0.958).toFixed(1)); // -4.2% below base low
  const slPct = +(((ltp - stopLoss) / ltp) * 100).toFixed(1);
  const target1 = +(ltp * 1.082).toFixed(1); // +8.2% conservative
  const t1Pct = 8.2;
  const target2 = +(ltp * 1.150).toFixed(1); // +15.0% circuit ceiling
  const t2Pct = 15.0;

  const rrr = +((target1 - ltp) / Math.max(1, ltp - stopLoss)).toFixed(2);

  // Position Sizing (1% Capital Risk)
  const riskPerShare = Math.max(1, ltp - stopLoss);
  const shares1L = Math.max(5, Math.floor(1000 / riskPerShare));
  const shares5L = Math.max(25, Math.floor(5000 / riskPerShare));
  const deploy1L = Math.round(shares1L * ltp).toLocaleString();
  const deploy5L = Math.round(shares5L * ltp).toLocaleString();

  // 6. Format HTML Report
  const buyerLines = top3Buyers.map((b, i) => {
    const bName = escapeHtml(String(BROKER_NAMES[String(b.brokerId)] || `Broker #${b.brokerId}`).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
    const bAvg = b.buyVolume > 0 ? +(b.buyAmount / b.buyVolume).toFixed(1) : ltp;
    const bCr = (Number(b.buyAmount || 0) / 10000000).toFixed(2);
    const bNet = Number(b.buyVolume - b.sellVolume);
    return `  ${i + 1}. <b>Broker #${b.brokerId} (${bName}):</b> ${Number(b.buyVolume).toLocaleString()} Kitta (Net: ${bNet >= 0 ? '+' : ''}${bNet.toLocaleString()}) @ <b>Avg Rs. ${bAvg}</b> (Rs. ${bCr} Cr)`;
  });

  const sellerLines = top3Sellers.map((s, i) => {
    const sName = escapeHtml(String(BROKER_NAMES[String(s.brokerId)] || `Broker #${s.brokerId}`).replace(/\s+(Securities|Investment|Broking|Stock|House|Limited|Ltd)\b/gi, '').trim());
    const sAvg = s.sellVolume > 0 ? +(s.sellAmount / s.sellVolume).toFixed(1) : ltp;
    const sNet = Number(s.sellVolume - s.buyVolume);
    return `  ${i + 1}. <b>Broker #${s.brokerId} (${sName}):</b> Sold ${Number(s.sellVolume).toLocaleString()} Kitta (Net: -${sNet.toLocaleString()}) @ Avg Rs. ${sAvg}`;
  });

  return [
    `📊 <b>DEEP STOCK AUDIT: <code>$${sym}</code></b>`,
    `<b>Session Audited:</b> <code>${tradeDate}</code> | <b>Exchange:</b> NEPSE`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📈 <b>1. PRICE &amp; TREND STRUCTURE:</b>`,
    `• <b>Live Price (LTP):</b> <b>Rs. ${ltp.toFixed(2)}</b> (${pChangeStr})`,
    `• <b>Day Range:</b> Low Rs. ${low.toFixed(1)} – High Rs. ${high.toFixed(1)}`,
    `• <b>20-Period Trend (EMA):</b> Rs. ${ema20.toFixed(2)} (${distFromEmaPct >= 0 ? '+' : ''}${distFromEmaPct}% from 20 EMA)`,
    `• <b>20-Day Base Range:</b> Rs. ${minLow20.toFixed(1)} – Rs. ${maxHigh20.toFixed(1)} (Tight ${baseRangePct}% Base)`,
    ``,
    `🏛️ <b>2. INSTITUTIONAL ACCUMULATION &amp; BROKER COST:</b>`,
    `• 🎯 <b>Average Broker Buy Price (Cost Basis):</b> <b>Rs. ${avgBrokerPrice}</b> (${distSign}${distFromBroker}% from LTP)`,
    `• <b>Top Accumulating Desks (Last 5 Sessions):</b>`,
    ...buyerLines,
    `• <b>Buyer Dominance (BCR3 Buy):</b> <b>${bcr3Buy}%</b> (vs BCR3 Sell ${bcr3Sell}%)`,
    `• <b>Top Selling / Distribution Desks:</b>`,
    ...sellerLines,
    ``,
    `🌊 <b>3. VOLUME &amp; FLOAT ABSORPTION:</b>`,
    `• <b>Today's Volume:</b> ${volume.toLocaleString()} Kitta (<b>${rvol}x</b> of 20D Avg ${avgVol20.toLocaleString()} Kitta)`,
    `• <b>Turnover:</b> Rs. ${(turnover / 10000000).toFixed(2)} Crores`,
    `• <b>Supply Status:</b> ${isNetAccumulated ? 'Institutional float cornering in progress (Low float left)' : 'Mixed float circulation'}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚖️ <b>4. INVESTMENT &amp; PROFITABILITY VERDICT:</b>`,
    verdictBadge,
    `• <b>Audit Findings:</b> ${verdictReason}`,
    ``,
    `🎯 <b>5. TACTICAL PROFIT PLAYBOOK:</b>`,
    `• 🟢 <b>Limit Buy Zone:</b> <code>Rs. ${buyZoneLow} – Rs. ${buyZoneHigh}</code> <i>(Anchored to Broker Avg Rs. ${avgBrokerPrice})</i>`,
    `• 🛑 <b>Invalidation Stop-Loss:</b> <code>Rs. ${stopLoss}</code> (-${slPct}% Capital Floor)`,
    `• 💰 <b>Target 1 (Milestone 1):</b> <code>Rs. ${target1}</code> (+${t1Pct}% | <i>Sell 50% &amp; Move SL to Breakeven</i>)`,
    `• 🚀 <b>Target 2 (Circuit Runner):</b> <code>Rs. ${target2}</code> (+${t2Pct}% | <i>Upper Circuit Ceiling</i>)`,
    `• ⚖️ <b>Net Risk / Reward Ratio:</b> <b>${rrr} : 1</b>`,
    ``,
    `💼 <b>6. 1% RISK POSITION SIZING:</b>`,
    `• <b>Rs. 1 Lakh Portfolio (Rs. 1,000 Max Risk):</b> Buy <b>${shares1L} Kitta</b> (~Rs. ${deploy1L})`,
    `• <b>Rs. 5 Lakh Portfolio (Rs. 5,000 Max Risk):</b> Buy <b>${shares5L} Kitta</b> (~Rs. ${deploy5L})`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💡 <i>Auto-arm Exit Guard alerts for this stock: <code>/track ${sym}</code></i>`
  ].join('\n');
}

// Test with SHIVM and GHL
console.log('--- Testing generateStockDeepAnalysis(SHIVM) ---');
const reportShivm = generateStockDeepAnalysis('SHIVM');
console.log(reportShivm);

console.log('--- Testing generateStockDeepAnalysis(GHL) ---');
const reportGhl = generateStockDeepAnalysis('GHL');
console.log(reportGhl);
