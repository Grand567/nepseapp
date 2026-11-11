// scripts/dispatchEliteStealthViaRender.mjs
import fs from 'fs';

const tickets = [
  {
    symbol: 'SBI',
    companyName: 'State Bank of India Nepal',
    sector: 'Commercial Banks',
    ltp: 438.0,
    bcr3AvgBuyPrice: 433.4,
    operatorPremiumPct: 1.1,
    topBrokers: '#44 Dynamic, #56 Sri Hari, #58 Naasa',
    leadBroker: 'Broker #44 Dynamic (Net +154,241 kitta)',
    bcr3: 60.4,
    vdu: 0.14,
    bbw: 6.7,
    cmf: 0.530,
    turnoverLakhs: 53.9,
    entryLow: 434.0,
    entryHigh: 441.5,
    chaseCap: 445.9,
    stopLoss: 422.7,
    target1: 473.0,
    target2: 503.7,
    netRRR: '1 : 1.54',
    badge: '👑 ALPHA WHALE LOCK (#1 PICK)'
  },
  {
    symbol: 'MANDU',
    companyName: 'Mandu Hydropower Limited',
    sector: 'Hydro Power',
    ltp: 820.0,
    bcr3AvgBuyPrice: 806.8,
    operatorPremiumPct: 1.6,
    topBrokers: '#34 Vision, #49 Online, #58 Naasa',
    leadBroker: 'Broker #34 Vision Securities (Net +7,777 kitta)',
    bcr3: 47.4,
    vdu: 0.56,
    bbw: 6.6,
    cmf: 0.350,
    turnoverLakhs: 32.5,
    entryLow: 813.0,
    entryHigh: 826.5,
    chaseCap: 834.8,
    stopLoss: 791.3,
    target1: 885.6,
    target2: 943.0,
    netRRR: '1 : 1.59',
    badge: '🚀 HIGH-VELOCITY MOMENTUM'
  },
  {
    symbol: 'HEI',
    companyName: 'Himalayan Everest Insurance',
    sector: 'Non-Life Insurance',
    ltp: 444.3,
    bcr3AvgBuyPrice: 433.4,
    operatorPremiumPct: 2.5,
    topBrokers: '#64 Sani, #45 Imperial, #58 Naasa',
    leadBroker: 'Broker #64 Sani Securities (Net +98,684 kitta)',
    bcr3: 41.4,
    vdu: 0.28,
    bbw: 3.1,
    cmf: 0.262,
    turnoverLakhs: 32.2,
    entryLow: 440.0,
    entryHigh: 447.9,
    chaseCap: 452.3,
    stopLoss: 428.7,
    target1: 479.8,
    target2: 510.9,
    netRRR: '1 : 1.54',
    badge: '🛡️ TIGHTEST VOLATILITY SQUEEZE'
  },
  {
    symbol: 'BHCL',
    companyName: 'Bhugol Energy Development',
    sector: 'Hydro Power',
    ltp: 546.0,
    bcr3AvgBuyPrice: 550.7,
    operatorPremiumPct: -0.9,
    topBrokers: '#56 Sri Hari, #45 Imperial, #58 Naasa',
    leadBroker: 'Broker #56 Sri Hari Securities (Net +2,401 kitta)',
    bcr3: 46.9,
    vdu: 0.28,
    bbw: 5.9,
    cmf: 0.142,
    turnoverLakhs: 92.4,
    entryLow: 541.0,
    entryHigh: 550.0,
    chaseCap: 555.8,
    stopLoss: 526.9,
    target1: 589.7,
    target2: 627.9,
    netRRR: '1 : 1.58',
    badge: '🟢 AT OPERATOR DISCOUNT (-0.9%)'
  }
];

function buildTicketHtml(t, idx, total) {
  const premiumTag = t.operatorPremiumPct <= 0
    ? `🟢 <b>Below Operator Cost (${t.operatorPremiumPct}% Discount)</b>`
    : `🛡️ <b>Operator Cost Basis Floor (+${t.operatorPremiumPct}% Premium)</b>`;

  let html = `🎯 <b>STEALTH ACCUMULATION TICKET [${idx}/${total}]</b>\n`;
  html += `<b>${t.symbol}</b> — <i>${t.companyName}</i> (${t.sector})\n`;
  html += `<b>Classification:</b> ${t.badge}\n`;
  html += `────────────────────────────\n`;
  html += `• <b>Friday Close (LTP):</b> Rs. ${t.ltp}\n`;
  html += `• <b>BCR3 Avg Buy Price:</b> Rs. ${t.bcr3AvgBuyPrice} (${premiumTag})\n`;
  html += `• <b>Top Accumulators:</b> ${t.topBrokers}\n`;
  html += `  └ Lead Whale: <code>${t.leadBroker}</code>\n`;
  html += `• <b>Quantitative Coiling Factors:</b>\n`;
  html += `  - Volume Dry-Up (VDU): <code>${t.vdu}x</code> (Supply Exhausted)\n`;
  html += `  - Bollinger Squeeze (BBW): <code>${t.bbw}%</code> (Coiled)\n`;
  html += `  - Money Flow (CMF): <code>+${t.cmf}</code> (Institutional Inflow)\n`;
  html += `  - Broker Concentration (BCR3): <code>${t.bcr3}%</code>\n`;
  html += `  - Session Turnover: <code>Rs. ${t.turnoverLakhs} Lakhs</code>\n`;
  html += `────────────────────────────\n`;
  html += `📍 <b>Execution Corridor:</b> Rs. ${t.entryLow} – ${t.entryHigh}\n`;
  html += `⛔ <b>Pre-Open Chase Cap:</b> Rs. ${t.chaseCap} <i>(Skip if gapped higher)</i>\n`;
  html += `🛑 <b>Stop Loss:</b> Rs. ${t.stopLoss} <i>(-3.5% structural risk gate)</i>\n`;
  html += `🎯 <b>Target 1 (+8%):</b> Rs. ${t.target1} <i>(Book 50% & SL to breakeven)</i>\n`;
  html += `🚀 <b>Target 2 (+15%):</b> Rs. ${t.target2} <i>(Exit runner units)</i>\n`;
  html += `⚖️ <b>Net R:R Ratio:</b> <code>${t.netRRR}</code> <i>(Post-brokerage & CGT)</i>\n`;
  html += `────────────────────────────\n`;
  html += `<i>Drabyashree NEPSE • 8-Factor Quant Model</i>`;
  return html;
}

async function run() {
  console.log(`Dispatching ${tickets.length} Elite Stealth Tickets via Render backend...`);

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const html = buildTicketHtml(t, i + 1, tickets.length);

    try {
      const res = await fetch('https://nepseapp.onrender.com/api/telegram/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: t.symbol,
          ltp: t.ltp,
          ticketPayload: { html }
        })
      });

      const data = await res.json();
      console.log(`[${i + 1}/${tickets.length}] Dispatched ${t.symbol}:`, data.success ? '✅ SUCCESS' : `❌ ${data.error || data.message}`);
      // Brief pause to preserve message ordering in Telegram
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[${i + 1}/${tickets.length}] Failed to send ${t.symbol}:`, err.message);
    }
  }

  console.log('\nAll 4 elite stealth accumulation tickets sent to Telegram!');
}

run().catch(console.error);
