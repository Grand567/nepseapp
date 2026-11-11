import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { sendTelegramMessage, cleanBotToken } from '../proxy/telegramNotifier.mjs';

dotenv.config({ path: 'proxy/.env' });

const db = new Database('proxy/data/drabyashree_ledger.db', { readonly: true });
const ticketsRaw = JSON.parse(fs.readFileSync('qa/monday_stealth_tickets.json', 'utf8'));

// Calculate exact BCR3 Avg Buy Price and Operator Premium for each symbol
const enrichedTickets = ticketsRaw.tickets.map(t => {
  const rows = db.prepare(`
    SELECT broker_id, SUM(buy_vol) as buy_vol, SUM(sell_vol) as sell_vol, SUM(buy_amt) as buy_amt, SUM(sell_amt) as sell_amt
    FROM daily_broker_ledger
    WHERE symbol = ? AND trade_date >= '2026-10-14'
    GROUP BY broker_id
    ORDER BY buy_vol DESC
  `).all(t.symbol);

  let bcr3AvgBuyPrice = t.ltp;
  let top3Brokers = [];
  if (rows.length >= 3) {
    const top3 = rows.slice(0, 3);
    const top3BuyVol = top3.reduce((s, b) => s + Number(b.buy_vol), 0);
    const top3BuyAmt = top3.reduce((s, b) => s + Number(b.buy_amt), 0);
    bcr3AvgBuyPrice = top3BuyVol > 0 ? +(top3BuyAmt / top3BuyVol).toFixed(1) : t.ltp;
    top3Brokers = top3.map(b => `#${b.broker_id}`);
  }

  const operatorPremiumPct = bcr3AvgBuyPrice > 0 ? +(((t.ltp - bcr3AvgBuyPrice) / bcr3AvgBuyPrice) * 100).toFixed(1) : 0;
  
  return {
    ...t,
    bcr3AvgBuyPrice,
    operatorPremiumPct,
    top3Brokers: top3Brokers.join(', ')
  };
});

// Format Master Telegram Broadcast
function buildBroadcastHtml(tickets) {
  const dateStr = 'Monday Open (2026-11-09)';
  
  let header = `🎯 <b>DRAVYASHREE NEPSE: STEALTH ACCUMULATION ALERT</b>\n`;
  header += `📅 <b>Action Session:</b> ${dateStr}\n`;
  header += `🔍 <b>Engine:</b> 4-Condition Flowchart (VDU ≤ 0.60x, BBW ≤ 14%, CMF > 0, BCR3 ≥ 35%)\n`;
  header += `📊 <b>Status:</b> ${tickets.length} Prime Stocks Coiled at Operator Cost Basis\n`;
  header += `────────────────────────────\n\n`;

  const stockMessages = tickets.map((t, idx) => {
    const premiumBadge = t.operatorPremiumPct <= 0 
      ? `🟢 <b>At Discount (${t.operatorPremiumPct}%)</b>`
      : t.operatorPremiumPct <= 2.5 
        ? `🛡️ <b>Cost Floor (+${t.operatorPremiumPct}%)</b>` 
        : `⚠️ <b>+${t.operatorPremiumPct}% Over Cost</b>`;

    let msg = `<b>[${idx + 1}/${tickets.length}] ${t.symbol}</b> (${t.sector})\n`;
    msg += `• <b>Friday Close:</b> Rs. ${t.ltp}\n`;
    msg += `• <b>BCR3 Avg Buy Price:</b> Rs. ${t.bcr3AvgBuyPrice} (${premiumBadge})\n`;
    msg += `• <b>Top 3 Brokers:</b> ${t.top3Brokers} (Lead: Broker #${t.leadBrokerId} net +${t.leadBrokerNetKitta.toLocaleString()} k)\n`;
    msg += `• <b>Stealth Metrics:</b> VDU: <code>${t.vduRatio}x</code> | BBW: <code>${t.bbw}%</code> | CMF: <code>+${t.cmf}</code> | BCR3: <code>${t.bcr3}%</code>\n`;
    msg += `• <b>Entry Zone:</b> Rs. ${t.entryMin} - ${t.entryMax} (Chase Cap: Rs. ${t.chaseCap})\n`;
    msg += `• <b>Stop Loss:</b> Rs. ${t.stopLoss} (-3.5% breach)\n`;
    msg += `• <b>Target T1 (+8%):</b> Rs. ${t.target1} | <b>Target T2 (+15%):</b> Rs. ${t.target2}\n`;
    msg += `• <b>Net R:R:</b> <code>1 : ${t.netRRR}</code> (After SEBON, DP & 5-Tier Brokerage)\n`;
    return msg;
  });

  let footer = `\n────────────────────────────\n`;
  footer += `⚠️ <b>Statutory Execution Rules:</b>\n`;
  footer += `1. Demat Lock: Minimum holding T+2 days before sell eligibility.\n`;
  footer += `2. Max Allocation: Max 20% total portfolio per single ticket.\n`;
  footer += `3. Pre-Open Protocol: If opening gap > +1.8% above chase cap, skip and preserve cash.\n`;
  footer += `<i>Powered by Dravyashree Quantitative Engine</i>`;

  return { header, stockMessages, footer };
}

async function run() {
  console.log(`Prepared ${enrichedTickets.length} tickets for Telegram dispatch.`);
  const { header, stockMessages, footer } = buildBroadcastHtml(enrichedTickets);

  // Save to disk for reference
  fs.writeFileSync('qa/telegram_stealth_broadcast.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalTickets: enrichedTickets.length,
    tickets: enrichedTickets
  }, null, 2));

  // Chunk messages so they don't exceed Telegram's 4096 character limit
  const batch1 = header + stockMessages.slice(0, 5).join('\n──────────────────\n\n');
  const batch2 = `🎯 <b>DRAVYASHREE STEALTH PICKS (Part 2)</b>\n────────────────────────────\n\n` + 
                 stockMessages.slice(5).join('\n──────────────────\n\n') + footer;

  console.log('--- Batch 1 Preview (chars:', batch1.length, ') ---');
  console.log(batch1.slice(0, 500) + '...\n');
  console.log('--- Batch 2 Preview (chars:', batch2.length, ') ---');
  console.log(batch2.slice(0, 500) + '...\n');

  // Attempt dispatch via Telegram
  console.log('Attempting Telegram Bot Dispatch...');
  const res1 = await sendTelegramMessage(batch1);
  console.log('Batch 1 Result:', res1);

  if (res1.success) {
    const res2 = await sendTelegramMessage(batch2);
    console.log('Batch 2 Result:', res2);
  }
}

run().catch(console.error);
