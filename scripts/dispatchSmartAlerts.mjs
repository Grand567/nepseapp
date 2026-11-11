const swingSetups = [
  {
    symbol: 'RFPL',
    ltp: 375,
    buyZone: { low: 368, high: 378 },
    dominantBrokersText: 'Broker 58 (+1.38L kitta last 5d), B#45, B#34',
    concentrationPct: 62,
    stopLoss: 354,
    target1: 410,
    target2: 440
  },
  {
    symbol: 'GHL',
    ltp: 323,
    buyZone: { low: 315, high: 325 },
    dominantBrokersText: 'Broker 58 (26.8L kitta all-time, +3.46L kitta last 5d)',
    concentrationPct: 74,
    stopLoss: 308,
    target1: 355,
    target2: 385
  },
  {
    symbol: 'MKHC',
    ltp: 270.2,
    buyZone: { low: 262, high: 272 },
    dominantBrokersText: 'Broker 58 (+11.8k kitta), B#41 (+8.6k), B#39 (+7.3k)',
    concentrationPct: 58,
    stopLoss: 258,
    target1: 295,
    target2: 320
  }
];

for (const s of swingSetups) {
  try {
    const res = await fetch('https://nepseapp.onrender.com/api/telegram/test-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s)
    });
    const data = await res.json();
    console.log(`Dispatched Smart Alert for ${s.symbol}:`, data.success ? 'SUCCESS' : data.error);
  } catch (e) {
    console.error(`Failed ${s.symbol}:`, e.message);
  }
}
