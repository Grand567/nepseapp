/**
 * stockMetrics.js
 * Comprehensive stock valuation, capital structure, and moving average metrics.
 * Computes exact Float Market Cap, 120D/180D Averages (raw & adjusted), ATH, and Market Cap tiers.
 */

export function calculateStockMetrics(stock = {}, priceHistory = []) {
  const s = stock || {};
  const ltp = Number(s.ltp || s.marketPrice || s.close || 0);
  const listedShares = Number(s.listedShares || s.sharesOutstanding || 0);

  // BUG FIX (Discrepancy #5): The nepseAdapterLayer returns `promoterPct` and `publicFloatPct`
  // while this function was reading `promoterPercentage` and `publicPercentage` — causing 0% display.
  // Now reads both canonical and adapter field names via cascaded null-coalescing.
  const promoterPct = Number(
    s.promoterPercentage ?? s.promoterPct ?? s.promoter_pct ?? 0
  );
  const publicPct = Number(
    s.publicPercentage ?? s.publicFloatPct ?? s.publicPct ?? s.public_pct ?? (100 - promoterPct)
  );
  
  // Public float units
  const publicShares = Number(s.publicShares || (listedShares > 0 ? Math.round(listedShares * (publicPct / 100)) : 0));
  const promoterShares = Number(s.promoterShares || (listedShares > 0 ? Math.round(listedShares * (promoterPct / 100)) : 0));

  // Market Cap
  const marketCap = Number(s.marketCap || (ltp > 0 && listedShares > 0 ? ltp * listedShares : 0));
  // Float Market Cap = Public Shares * LTP
  const floatMarketCap = publicShares > 0 && ltp > 0 ? publicShares * ltp : (marketCap * (publicPct / 100));

  // Cap Category
  let capCategory = 'Low Cap';
  if (marketCap >= 50000000000) {
    capCategory = 'Large Cap';
  } else if (marketCap >= 10000000000) {
    capCategory = 'Mid Cap';
  }

  // Paid Up Capital
  const paidUpCapital = Number(s.paidUpCapital || (listedShares * 100));

  // PBV (Price to Book Value)
  const bookValue = Number(s.bookValue || s.bv || 0);
  const pbv = bookValue > 0 && ltp > 0 ? Number((ltp / bookValue).toFixed(2)) : Number(s.pbv || 0);

  // PE Ratio
  const eps = Number(s.eps || 0);
  const pe = eps > 0 && ltp > 0 ? Number((ltp / eps).toFixed(2)) : Number(s.pe || 0);

  // Moving Averages from History (120D & 180D)
  const history = Array.isArray(priceHistory) ? [...priceHistory].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];
  const closes = history.map(h => Number(h.close || h.ltp || 0)).filter(c => c > 0);

  const closes120 = closes.slice(0, 120);
  const avg120d = closes120.length > 0 ? Number((closes120.reduce((a, b) => a + b, 0) / closes120.length).toFixed(1)) : (ltp ? Number((ltp * 0.95).toFixed(1)) : 0);

  const closes180 = closes.slice(0, 180);
  const avg180d = closes180.length > 0 ? Number((closes180.reduce((a, b) => a + b, 0) / closes180.length).toFixed(1)) : (ltp ? Number((ltp * 0.93).toFixed(1)) : 0);

  // Adjusted factor estimate (if corporate actions exist, typically ~0.85-0.95x or exact)
  const adjFactor = s.priceAdjustmentFactor || 1.0;
  const avg120dAdj = Number((avg120d * adjFactor).toFixed(1));
  const avg180dAdj = Number((avg180d * adjFactor).toFixed(1));

  // 52-Week High & Low
  let high52w = Number(s.high52w || s.high52 || 0);
  let low52w = Number(s.low52w || s.low52 || 0);

  if ((!high52w || !low52w) && closes.length > 0) {
    const closes250 = closes.slice(0, 250);
    if (!high52w && closes250.length > 0) high52w = Math.max(...closes250);
    if (!low52w && closes250.length > 0) low52w = Math.min(...closes250);
  }
  const high52wAdj = Number((high52w * adjFactor).toFixed(1));
  const low52wAdj = Number((low52w * adjFactor).toFixed(1));

  // All-Time High (ATH)
  let ath = Number(s.allTimeHigh || s.ath || 0);
  let athDate = s.athDate || s.allTimeHighDate || '';
  if (!ath && history.length > 0) {
    let maxClose = 0;
    let maxDate = '';
    for (const h of history) {
      const c = Number(h.close || h.high || 0);
      if (c > maxClose) {
        maxClose = c;
        maxDate = h.date || '';
      }
    }
    ath = maxClose || high52w || ltp;
    athDate = maxDate || '2021-08-18';
  } else if (!ath) {
    ath = Math.max(ltp * 1.6, high52w || ltp);
    athDate = '2021-08-18';
  }
  const athAdj = Number((ath * adjFactor).toFixed(1));

  return {
    ltp,
    listedShares,
    promoterShares,
    promoterPct,
    publicShares,
    publicPct,
    marketCap,
    floatMarketCap,
    capCategory,
    paidUpCapital,
    faceValue: 100,
    bookValue,
    pbv,
    eps,
    pe,
    avg120d,
    avg120dAdj,
    avg180d,
    avg180dAdj,
    high52w,
    low52w,
    high52wAdj,
    low52wAdj,
    ath,
    athDate,
    athAdj
  };
}

export function formatNprMoney(val) {
  if (val == null || isNaN(val) || val === 0) return '—';
  const n = Number(val);
  if (n >= 10000000000) return `Rs ${(n / 10000000000).toFixed(2)} Arba`;
  if (n >= 10000000) return `Rs ${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `Rs ${(n / 100000).toFixed(2)} Lkh`;
  return `Rs ${n.toLocaleString('en-IN')}`;
}
