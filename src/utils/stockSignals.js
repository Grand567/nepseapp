/**
 * stockSignals.js
 * Algorithmic Trading Signals & Quantitative Observations Engine
 * Modeled after Share Hub automated stock observations with verifiable mathematical criteria.
 */

export function calculateStockSignals(symbol, currentQuote = {}, priceHistory = []) {
  const sym = String(symbol || '').toUpperCase().trim();
  const quote = currentQuote || {};
  const signals = [];

  const ltp = Number(quote.ltp || quote.marketPrice || 0);
  const prevClose = Number(quote.prevClose || 0);
  const pChange = Number(quote.pChange || (prevClose > 0 ? ((ltp - prevClose) / prevClose) * 100 : 0));
  const currentVol = Number(quote.volume || 0);
  const high52w = Number(quote.high52w || quote.high52 || 0);
  const low52w = Number(quote.low52w || quote.low52 || 0);

  // Normalize history sorted newest first
  const history = Array.isArray(priceHistory) ? [...priceHistory].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];
  const closes = history.map(h => Number(h.close || h.ltp || 0)).filter(c => c > 0);
  const volumes = history.map(h => Number(h.volume || 0)).filter(v => v > 0);

  const now = new Date();
  const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
                  now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 1. 52-Week Average Volume & Volume Spike Detection (Share Hub Reference)
  const vol52wSample = volumes.slice(0, Math.min(250, volumes.length));
  const avgVol52w = vol52wSample.length > 0
    ? Math.round(vol52wSample.reduce((a, b) => a + b, 0) / vol52wSample.length)
    : 0;

  const effectiveVol = currentVol > 0 ? currentVol : (volumes[0] || 0);

  if (avgVol52w > 0 && effectiveVol > 0) {
    const spikePct = ((effectiveVol - avgVol52w) / avgVol52w) * 100;
    if (spikePct >= 50) {
      signals.push({
        id: 'vol-spike',
        type: spikePct >= 150 ? 'MAJOR' : 'NOTABLE',
        severity: spikePct >= 150 ? 'critical' : 'warning',
        title: 'Volume Spike',
        description: `${sym} volume spiked ${spikePct.toFixed(2)}% vs 52-week average (${avgVol52w.toLocaleString()})`,
        metric: `${spikePct >= 0 ? '+' : ''}${spikePct.toFixed(1)}%`,
        timestamp: timeStr,
        isBullish: pChange >= 0
      });
    }
  }

  // 2. Accumulation Day Signal
  // Closed up with volume significantly above 20-day moving average
  const vol20Sample = volumes.slice(0, Math.min(20, volumes.length));
  const avgVol20 = vol20Sample.length > 0
    ? Math.round(vol20Sample.reduce((a, b) => a + b, 0) / vol20Sample.length)
    : 0;

  if (pChange > 0 && avgVol20 > 0 && effectiveVol > avgVol20) {
    const volAboveAvg = ((effectiveVol - avgVol20) / avgVol20) * 100;
    if (volAboveAvg >= 20) {
      signals.push({
        id: 'accumulation-day',
        type: 'NOTABLE',
        severity: 'success',
        title: 'Accumulation day',
        description: `${sym} closed up ${pChange.toFixed(2)}% on ${volAboveAvg.toFixed(2)}% above-average volume`,
        metric: `+${pChange.toFixed(2)}%`,
        timestamp: timeStr,
        isBullish: true
      });
    }
  } else if (pChange < -1.5 && avgVol20 > 0 && effectiveVol > avgVol20 * 1.3) {
    const volAboveAvg = ((effectiveVol - avgVol20) / avgVol20) * 100;
    signals.push({
      id: 'distribution-day',
      type: 'NOTABLE',
      severity: 'danger',
      title: 'Distribution day',
      description: `${sym} dropped ${Math.abs(pChange).toFixed(2)}% on ${volAboveAvg.toFixed(2)}% above-average volume`,
      metric: `${pChange.toFixed(2)}%`,
      timestamp: timeStr,
      isBullish: false
    });
  }

  // 3. Consecutive Up/Down Streak
  if (closes.length >= 2) {
    let streakCount = 0;
    let streakBull = closes[0] >= closes[1];

    for (let i = 0; i < closes.length - 1; i++) {
      const isUp = closes[i] >= closes[i + 1];
      if (isUp === streakBull) {
        streakCount++;
      } else {
        break;
      }
    }

    if (streakCount >= 2) {
      signals.push({
        id: 'streak',
        type: streakCount >= 4 ? 'MAJOR' : 'NOTABLE',
        severity: streakBull ? 'success' : 'danger',
        title: `${streakCount} consecutive ${streakBull ? 'up' : 'down'} days`,
        description: `${sym} closed ${streakBull ? 'higher' : 'lower'} for ${streakCount} consecutive sessions`,
        metric: `${streakCount} sessions`,
        timestamp: timeStr,
        isBullish: streakBull
      });
    }
  }

  // 4. Multi-Period Momentum Gains (1-Week & 1-Month)
  // 1-Week (approx 5 trading days)
  if (closes.length >= 5) {
    const p1wClose = closes[4];
    if (p1wClose > 0 && ltp > 0) {
      const ch1w = ((ltp - p1wClose) / p1wClose) * 100;
      if (Math.abs(ch1w) >= 3) {
        signals.push({
          id: '1w-gain',
          type: 'NOTABLE',
          severity: ch1w > 0 ? 'success' : 'danger',
          title: `1-week ${ch1w >= 0 ? 'gain' : 'pullback'}`,
          description: `${sym} is ${ch1w >= 0 ? 'up' : 'down'} ${Math.abs(ch1w).toFixed(2)}% over the last 1-week`,
          metric: `${ch1w >= 0 ? '+' : ''}${ch1w.toFixed(2)}%`,
          timestamp: timeStr,
          isBullish: ch1w >= 0
        });
      }
    }
  }

  // 1-Month (approx 20 trading days)
  if (closes.length >= 20) {
    const p1mClose = closes[19];
    if (p1mClose > 0 && ltp > 0) {
      const ch1m = ((ltp - p1mClose) / p1mClose) * 100;
      if (Math.abs(ch1m) >= 5) {
        signals.push({
          id: '1m-gain',
          type: 'NOTABLE',
          severity: ch1m > 0 ? 'success' : 'danger',
          title: `1-month ${ch1m >= 0 ? 'gain' : 'pullback'}`,
          description: `${sym} is ${ch1m >= 0 ? 'up' : 'down'} ${Math.abs(ch1m).toFixed(2)}% over the last 1-month`,
          metric: `${ch1m >= 0 ? '+' : ''}${ch1m.toFixed(2)}%`,
          timestamp: timeStr,
          isBullish: ch1m >= 0
        });
      }
    }
  }

  // 5. Recovery from 52-Week Low
  if (low52w > 0 && ltp > low52w) {
    const recoveryPct = ((ltp - low52w) / low52w) * 100;
    if (recoveryPct >= 15) {
      signals.push({
        id: '52w-recovery',
        type: recoveryPct >= 40 ? 'MAJOR' : 'NOTABLE',
        severity: 'success',
        title: 'Recovered from 52-week low',
        description: `${sym} is up ${recoveryPct.toFixed(1)}% from its 52-week low of Rs. ${low52w.toFixed(2)}`,
        metric: `+${recoveryPct.toFixed(1)}%`,
        timestamp: timeStr,
        isBullish: true
      });
    }
  }

  // 6. Pullback from 52-Week High
  if (high52w > 0 && ltp < high52w) {
    const pullbackPct = ((high52w - ltp) / high52w) * 100;
    if (pullbackPct >= 20) {
      signals.push({
        id: '52w-pullback',
        type: 'NOTABLE',
        severity: 'warning',
        title: 'Discount from 52-week high',
        description: `${sym} is trading at a ${pullbackPct.toFixed(1)}% discount from its 52-week high of Rs. ${high52w.toFixed(2)}`,
        metric: `-${pullbackPct.toFixed(1)}%`,
        timestamp: timeStr,
        isBullish: false
      });
    } else if (pullbackPct <= 3 && ltp > 0) {
      signals.push({
        id: '52w-breakout-zone',
        type: 'MAJOR',
        severity: 'critical',
        title: 'Testing 52-week high',
        description: `${sym} is within ${pullbackPct.toFixed(1)}% of its 52-week high of Rs. ${high52w.toFixed(2)} (Breakout Watch)`,
        metric: `Rs. ${high52w}`,
        timestamp: timeStr,
        isBullish: true
      });
    }
  }

  // 7. Relative Strength / Outperformance
  if (pChange >= 4.0) {
    signals.push({
      id: 'high-momentum',
      type: 'MAJOR',
      severity: 'critical',
      title: 'Strong Bullish Expansion',
      description: `${sym} surged +${pChange.toFixed(2)}% in the latest session, demonstrating superior buyer dominance`,
      metric: `+${pChange.toFixed(2)}%`,
      timestamp: timeStr,
      isBullish: true
    });
  }

  return signals;
}
