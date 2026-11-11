import fs from 'fs';

const holdings = [
  { symbol: 'AKJCL', buyPrice: 343.9, stopLoss: 332, target1: 370, target2: 395, kitta: 100 },
  { symbol: 'AKPL', buyPrice: 256.2, stopLoss: 253, target1: 272, target2: 285, kitta: 100 },
  { symbol: 'SHEL', buyPrice: 304.6, stopLoss: 296, target1: 322, target2: 340, kitta: 100 },
  { symbol: 'DORDI', buyPrice: 273.8, stopLoss: 264, target1: 295, target2: 312, kitta: 100 },
  { symbol: 'MKHC', buyPrice: 270.2, stopLoss: 260, target1: 292, target2: 315, kitta: 100 },
  { symbol: 'SOHL', buyPrice: 628.0, stopLoss: 615, target1: 650, target2: 685, kitta: 100 }
];

for (const h of holdings) {
  try {
    const res = await fetch('https://nepseapp.onrender.com/api/portfolio/track-holding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(h)
    });
    const data = await res.json();
    console.log(`Dispatched ${h.symbol}:`, data.success ? 'ARMED & SENT TO TELEGRAM' : data.error);
  } catch (e) {
    console.error(`Failed ${h.symbol}:`, e.message);
  }
}
