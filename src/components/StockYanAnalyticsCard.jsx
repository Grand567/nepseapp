import React, { useMemo } from 'react';
import {
  Shield, TrendingUp, TrendingDown, Target, Zap, Activity,
  Layers, Lock, Unlock, Flame, Award, ChevronRight, BarChart2
} from 'lucide-react';
import { getBrokerName, formatBrokerAmount } from '../utils/accumulationDistributionEngine';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtQty(n) {
  const num = Math.abs(Number(n) || 0);
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)} K`;
  return num.toLocaleString();
}

/**
 * StockYan Pro Analytics Suite:
 * 1. Aggressive Broker Holding
 * 2. Broker Dominance Index (BDI)
 * 3. Magnetic Support & Breakable Resistance
 * 4. Parallel Channel & Breakout Tradable Scanner
 */
export default function StockYanAnalyticsCard({
  stock = {},
  history = [],
  brokerData = null,
  floorsheet = []
}) {
  const ltp = Number(stock.ltp || stock.close || 0);
  const closes = useMemo(() => {
    return Array.isArray(history)
      ? history.map(h => Number(h.close || h.ltp || 0)).filter(c => c > 0)
      : [];
  }, [history]);

  const highs = useMemo(() => {
    return Array.isArray(history)
      ? history.map(h => Number(h.high || h.ltp || 0)).filter(h => h > 0)
      : [];
  }, [history]);

  const lows = useMemo(() => {
    return Array.isArray(history)
      ? history.map(h => Number(h.low || h.ltp || 0)).filter(l => l > 0)
      : [];
  }, [history]);

  const volumes = useMemo(() => {
    return Array.isArray(history)
      ? history.map(h => Number(h.volume || 0)).filter(v => v >= 0)
      : [];
  }, [history]);

  // 1. Compute Aggressive Broker Holding
  const aggressiveHolders = useMemo(() => {
    if (!brokerData) return [];
    const list = Array.isArray(brokerData.brokers)
      ? brokerData.brokers
      : (Array.isArray(brokerData.topBuyers) ? brokerData.topBuyers : []);

    const result = [];
    list.forEach(b => {
      const id = String(b.brokerId || b.broker || b.brokerNo || b.id || '').trim();
      if (!id || id === '?') return;
      const buyQ = Number(b.buyQty ?? b.volume ?? b.kitta ?? 0);
      const sellQ = Number(b.sellQty ?? 0);
      const netQ = buyQ - sellQ;
      const holdPct = buyQ > 0 ? Math.round((netQ / buyQ) * 100) : 0;
      const name = b.name || b.brokerName || getBrokerName(id);
      const avgRate = Number(b.avgBuyRate || ltp || 100);

      // Aggressive holder: holds >= 70% of bought quantity with positive volume
      if (buyQ >= 100 && holdPct >= 70) {
        result.push({
          id,
          name,
          buyQty: buyQ,
          sellQty: sellQ,
          netQty: netQ,
          holdPct,
          holdAmt: netQ * avgRate,
          avgRate
        });
      }
    });

    return result.sort((a, b) => b.netQty - a.netQty).slice(0, 5);
  }, [brokerData, ltp]);

  // 2. Broker Dominance Index (BDI / Concentration Ratio)
  const brokerDominance = useMemo(() => {
    if (!brokerData) {
      return { bcr3: 0, bcr5: 0, dominantBrokers: [], tier: 'Fragmented', label: 'Retail Dispersed' };
    }
    const list = Array.isArray(brokerData.brokers)
      ? brokerData.brokers
      : (Array.isArray(brokerData.topBuyers) ? brokerData.topBuyers : []);

    const buyers = [...list]
      .map(b => ({
        id: String(b.brokerId || b.broker || b.brokerNo || b.id || '').trim(),
        name: b.name || b.brokerName || getBrokerName(b.brokerId || b.broker || b.id),
        buyQty: Number(b.buyQty ?? b.volume ?? b.kitta ?? 0)
      }))
      .filter(b => b.id && b.id !== '?' && b.buyQty > 0)
      .sort((a, b) => b.buyQty - a.buyQty);

    const totalBuy = buyers.reduce((sum, b) => sum + b.buyQty, 0) || 1;
    const top3Buy = buyers.slice(0, 3).reduce((sum, b) => sum + b.buyQty, 0);
    const top5Buy = buyers.slice(0, 5).reduce((sum, b) => sum + b.buyQty, 0);

    const bcr3 = Math.min(100, +((top3Buy / totalBuy) * 100).toFixed(1));
    const bcr5 = Math.min(100, +((top5Buy / totalBuy) * 100).toFixed(1));

    let tier = 'Moderate';
    let label = 'Balanced Market Participation';
    let color = '#38bdf8';

    if (bcr3 >= 48) {
      tier = 'High Institutional Dominance';
      label = 'Smart Money Float Cornering';
      color = '#10b981';
    } else if (bcr3 <= 25) {
      tier = 'Fragmented Flow';
      label = 'Retail Dispersed Participation';
      color = '#94a3b8';
    }

    const dominantBrokers = buyers.slice(0, 3).map(b => ({
      ...b,
      share: +((b.buyQty / totalBuy) * 100).toFixed(1)
    }));

    return { bcr3, bcr5, dominantBrokers, tier, label, color, totalBuy };
  }, [brokerData]);

  // 3. Magnetic Support & Breakable Resistance
  const levels = useMemo(() => {
    if (closes.length < 5) {
      const p = ltp || 100;
      return {
        magneticSupport: +(p * 0.95).toFixed(1),
        breakableResistance: +(p * 1.05).toFixed(1),
        distSupportPct: -5.0,
        distResistancePct: 5.0,
        isBreakable: true,
        supportStrength: 'Moderate',
        resistanceState: 'Breakout Watch'
      };
    }

    const recentLows = lows.slice(-20);
    const recentHighs = highs.slice(-20);
    const recentCloses = closes.slice(-20);
    const recentVols = volumes.slice(-20);

    // Compute volume-weighted price support node
    let volSum = 0;
    let vwapSum = 0;
    for (let i = 0; i < recentCloses.length; i++) {
      const v = recentVols[i] || 1000;
      const c = recentCloses[i];
      if (c <= ltp) {
        volSum += v;
        vwapSum += c * v;
      }
    }
    const vwapNode = volSum > 0 ? (vwapSum / volSum) : (Math.min(...recentLows) || ltp * 0.96);
    const minLow = Math.min(...recentLows) || ltp * 0.95;
    const magneticSupport = +(Math.max(minLow, vwapNode)).toFixed(1);

    // Breakable Resistance: highest swing high or supply cluster above LTP
    const overheadHighs = recentHighs.filter(h => h > ltp);
    const peakHigh = overheadHighs.length > 0 ? Math.min(...overheadHighs) : Math.max(...recentHighs);
    const breakableResistance = +(Math.max(ltp * 1.01, peakHigh)).toFixed(1);

    // Volume test score for resistance:
    const avgVol = recentVols.length > 0 ? (recentVols.reduce((a, b) => a + b, 0) / recentVols.length) : 1;
    const latestVol = recentVols[recentVols.length - 1] || avgVol;
    const isBreakable = latestVol >= avgVol * 1.2 || ltp >= breakableResistance * 0.985;

    const distSupportPct = +(((magneticSupport - ltp) / ltp) * 100).toFixed(1);
    const distResistancePct = +(((breakableResistance - ltp) / ltp) * 100).toFixed(1);

    return {
      magneticSupport,
      breakableResistance,
      distSupportPct,
      distResistancePct,
      isBreakable,
      supportStrength: Math.abs(distSupportPct) < 3.0 ? 'Near Magnetic Anchor' : 'Solid Base',
      resistanceState: isBreakable ? '🔓 Breakable Resistance (Breakout Imminent)' : '🛡️ Supply Barrier'
    };
  }, [closes, highs, lows, volumes, ltp]);

  // 4. Parallel Channel & Breakout Scanner
  const channel = useMemo(() => {
    const n = Math.min(25, closes.length);
    if (n < 8) {
      return {
        status: 'Inside Channel',
        upper: +(ltp * 1.06).toFixed(1),
        mid: +ltp.toFixed(1),
        lower: +(ltp * 0.94).toFixed(1),
        posPct: 50,
        slope: 0,
        tradable: false
      };
    }

    const subCloses = closes.slice(-n);
    const subHighs = highs.slice(-n);
    const subLows = lows.slice(-n);

    // Linear regression slope of closes
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += subCloses[i];
      sumXY += i * subCloses[i];
      sumXX += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Standard deviation / channel width
    let sumDiffSq = 0;
    for (let i = 0; i < n; i++) {
      const reg = intercept + slope * i;
      sumDiffSq += Math.pow(subCloses[i] - reg, 2);
    }
    const stdDev = Math.sqrt(sumDiffSq / n);
    const channelHalf = Math.max(stdDev * 1.8, (Math.max(...subHighs) - Math.min(...subLows)) / 3);

    const currentReg = intercept + slope * (n - 1);
    const upper = +(currentReg + channelHalf).toFixed(1);
    const mid = +currentReg.toFixed(1);
    const lower = +(currentReg - channelHalf).toFixed(1);

    const span = Math.max(1, upper - lower);
    const posPct = Math.min(100, Math.max(0, Math.round(((ltp - lower) / span) * 100)));

    let status = 'Consolidating Inside Channel';
    let tradable = false;
    let badgeColor = '#38bdf8';

    if (ltp >= upper) {
      status = '🚀 Parallel Channel Breakout (Tradable)';
      tradable = true;
      badgeColor = '#10b981';
    } else if (ltp <= lower * 1.015) {
      status = '📈 Channel Support Bounce Zone';
      tradable = true;
      badgeColor = '#38bdf8';
    } else if (ltp < lower) {
      status = '⚠️ Channel Breakdown Underway';
      tradable = false;
      badgeColor = '#f43f5e';
    } else {
      status = '🔄 Inside Channel Oscillation';
      tradable = false;
      badgeColor = '#a855f7';
    }

    return {
      status,
      upper,
      mid,
      lower,
      posPct,
      slope: +(slope).toFixed(2),
      tradable,
      badgeColor
    };
  }, [closes, highs, lows, ltp]);

  return (
    <div style={{
      background: 'linear-gradient(135deg, #111827 0%, #0f172a 100%)',
      border: '1px solid rgba(245, 158, 11, 0.35)',
      borderRadius: 16,
      padding: '16px 18px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      marginBottom: 16
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Award style={{ width: 17, height: 17, color: '#fbbf24' }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Drabyashree Pro Analytics Suite
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Institutional Dominance, Magnetic Nodes & Parallel Channel
            </div>
          </div>
        </div>

        <span style={{
          fontSize: 11,
          fontWeight: 800,
          padding: '3px 9px',
          borderRadius: 8,
          background: 'rgba(16, 185, 129, 0.18)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          color: '#10b981',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <Unlock style={{ width: 12, height: 12 }} /> 100% Unlocked Free
        </span>
      </div>

      {/* 2x2 Grid of StockYan Core Models */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* Module 1: Aggressive Broker Holding */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 12,
          padding: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame style={{ width: 15, height: 15, color: '#f59e0b' }} />
              Aggressive Broker Holding
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
              Hold ≥ 70% of Buy
            </span>
          </div>

          {aggressiveHolders.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aggressiveHolders.map((b, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  fontSize: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: '#f59e0b', fontFamily: 'var(--font-mono)' }}>#{b.id}</span>
                    <span style={{ color: '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                      {b.name}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      +{fmtQty(b.netQty)}
                    </span>
                    <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginLeft: 6 }}>
                      ({b.holdPct}% held)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8', padding: '12px 6px', textAlign: 'center' }}>
              No brokers hoarding &gt; 70% without selling in recent trades.
            </div>
          )}
        </div>

        {/* Module 2: Broker Dominance Index */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 12,
          padding: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <BarChart2 style={{ width: 15, height: 15, color: '#38bdf8' }} />
              Broker Dominance (BDI)
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: brokerDominance.color }}>
              BCR₃: {brokerDominance.bcr3}%
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, marginBottom: 8 }}>
            {brokerDominance.tier} · <span style={{ color: '#94a3b8' }}>{brokerDominance.label}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {brokerDominance.dominantBrokers.map((b, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
                borderRadius: 8,
                padding: '6px 8px',
                fontSize: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>#{b.id}</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 600, maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.name}
                  </span>
                </div>
                <div style={{ fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                  {b.share}% share ({fmtQty(b.buyQty)})
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Module 3: Magnetic Support & Breakable Resistance */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 12,
          padding: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target style={{ width: 15, height: 15, color: '#10b981' }} />
              Magnetic S/R Nodes
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: levels.isBreakable ? '#10b981' : '#f59e0b' }}>
              {levels.resistanceState}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>🧲 Magnetic Support</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {fmt(levels.magneticSupport)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {levels.distSupportPct}% from LTP
              </div>
            </div>

            <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>🔓 Breakable Resistance</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                Rs. {fmt(levels.breakableResistance)}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                +{levels.distResistancePct}% from LTP
              </div>
            </div>
          </div>
        </div>

        {/* Module 4: Parallel Channel & Breakout Tradable */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: 12,
          padding: 12
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers style={{ width: 15, height: 15, color: '#c084fc' }} />
              Parallel Trend Channel
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: channel.badgeColor }}>
              {channel.status}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#94a3b8', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
            <span>Lower: Rs. {channel.lower}</span>
            <span>Mid: Rs. {channel.mid}</span>
            <span>Upper: Rs. {channel.upper}</span>
          </div>

          {/* Progress bar showing position inside channel */}
          <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, position: 'relative', marginBottom: 8 }}>
            <div style={{
              position: 'absolute',
              left: `${channel.posPct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: channel.badgeColor,
              boxShadow: `0 0 6px ${channel.badgeColor}`
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#cbd5e1' }}>
            <span>Channel Slope: <b style={{ color: channel.slope >= 0 ? '#10b981' : '#f43f5e' }}>{channel.slope > 0 ? `+${channel.slope}` : channel.slope}</b></span>
            <span>Position: <b style={{ color: '#ffffff' }}>{channel.posPct}%</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}
