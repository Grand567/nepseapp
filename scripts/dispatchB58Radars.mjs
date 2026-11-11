const radarSymbols = ['RFPL', 'GHL', 'MKHC', 'SOHL', 'LBBL', 'BPCL'];

for (const sym of radarSymbols) {
  try {
    const res = await fetch('https://nepseapp.onrender.com/api/telegram/dispatch-broker58-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: sym })
    });
    const data = await res.json();
    console.log(`Dispatched B58 Radar for ${sym}:`, data.success ? `SUCCESS (msgId: ${data.result?.telegramResult?.messageId})` : data.error);
  } catch (e) {
    console.error(`Failed ${sym}:`, e.message);
  }
}
