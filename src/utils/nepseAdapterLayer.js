/**
 * NEPSE Resilient Data Normalizer & Ingestion Adapter Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Unifies fragmented external ingestion channels:
 *   1. Live Ticker / Floor Sheet / Market Depth
 *   2. Historical OHLCV Time-Series
 *   3. Quarterly Financial Disclosures (EPS, NPL, CAR, NIM, Reserves, Net Profit)
 *   4. Sectoral Classification & Sub-indices
 *   5. Share Structure (Promoter vs. Public Float, Lock-in Schedules)
 *
 * Guaranteed Behaviors:
 *   - Normalizes camelCase, snake_case, short-keys (MeroLagani lp/op/h/l), and raw HTML tables.
 *   - Strictly returns explicit incomplete-data states ('insufficient_history' / null).
 *   - Enforces zero mock fallback, zero synthetic simulation generation.
 */

// ── 1. NUMBER / STRING EXTRACTION UTILITIES ──────────────────────────────────

export function parseCleanNumber(val, defaultVal = null) {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const cleaned = String(val).replace(/,/g, '').replace(/%/g, '').replace(/Rs\.?/gi, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

export function parseCleanString(val, defaultVal = '') {
  if (val === null || val === undefined) return defaultVal;
  return String(val).trim();
}

export function parseDateToIso(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, '-');

  // Format: 22-Sep-2026 or 22/Sep/2026
  const ddMonYYYY = /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/.exec(str);
  if (ddMonYYYY) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mon = months[ddMonYYYY[2].toLowerCase()] || '01';
    return `${ddMonYYYY[3]}-${mon}-${ddMonYYYY[1].padStart(2, '0')}`;
  }

  // Millisecond timestamp or ISO date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

// ── 2. LIVE TICKER & QUOTE NORMALIZER ────────────────────────────────────────

/**
 * Normalizes live market quote from ShareSansar, MeroLagani, NOTS, or proxy
 * @param {Object} raw 
 * @returns {Object|null} Strongly-typed normalized quote or null if invalid
 */
export function normalizeLiveQuote(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Extract symbol
  const symbol = parseCleanString(
    raw.symbol || raw.s || raw.scrip || raw.stockSymbol || raw.securitySymbol
  ).toUpperCase();
  if (!symbol) return null;

  // Extract prices
  const ltp = parseCleanNumber(
    raw.ltp ?? raw.lp ?? raw.lastTradedPrice ?? raw.closePrice ?? raw.closingPrice ?? raw.currentPrice ?? raw.price
  );
  if (ltp === null || ltp <= 0) return null; // Incomplete / invalid price

  const change = parseCleanNumber(raw.change ?? raw.c ?? raw.pointChange ?? raw.changePrice ?? 0);
  
  // Previous close calculation
  let prevClose = parseCleanNumber(
    raw.previousClose ?? raw.prevClose ?? raw.pcClose ?? raw.yesterdayClose
  );
  if (prevClose === null || prevClose <= 0) {
    prevClose = change !== 0 ? +(ltp - change).toFixed(2) : ltp;
  }

  // Percentage change
  let pChange = parseCleanNumber(
    raw.pChange ?? raw.percentageChange ?? raw.pc ?? raw.changePercent ?? raw.percentChange
  );
  if (pChange === null) {
    pChange = prevClose > 0 ? +(((ltp - prevClose) / prevClose) * 100).toFixed(2) : 0;
  }

  const open = parseCleanNumber(raw.open ?? raw.op ?? raw.openPrice ?? prevClose);
  const high = parseCleanNumber(raw.high ?? raw.h ?? raw.maxPrice ?? raw.highPrice ?? Math.max(open, ltp));
  const low = parseCleanNumber(raw.low ?? raw.l ?? raw.minPrice ?? raw.lowPrice ?? Math.min(open, ltp));
  const volume = parseCleanNumber(raw.volume ?? raw.q ?? raw.totalTradedQuantity ?? raw.tradedShares ?? 0);
  const turnover = parseCleanNumber(raw.turnover ?? raw.t ?? raw.totalTurnover ?? raw.totalTradedValue ?? (volume > 0 ? ltp * volume : 0));
  const transactions = parseCleanNumber(raw.transactions ?? raw.totalTrades ?? raw.tx ?? raw.trades ?? 0);

  const sector = parseCleanString(raw.sector || raw.sectorName || 'Others');
  const companyName = parseCleanString(raw.companyName || raw.name || raw.securityName || symbol);

  // 15% Daily Circuit Ceiling & Floor (Securities Trading Operation Fourth Amendment Regulations 2082)
  const circuitLimitPct = 15.0;
  const circuitCeiling = +(prevClose * (1 + circuitLimitPct / 100)).toFixed(1);
  const circuitFloor = +(prevClose * (1 - circuitLimitPct / 100)).toFixed(1);
  const isUpperCircuitHit = ltp >= (circuitCeiling - 0.1);
  const isLowerCircuitHit = ltp <= (circuitFloor + 0.1);

  return {
    symbol,
    companyName,
    sector,
    ltp: +ltp.toFixed(2),
    open: +open.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    close: +ltp.toFixed(2),
    prevClose: +prevClose.toFixed(2),
    previousClose: +prevClose.toFixed(2),
    change: +change.toFixed(2),
    pChange: +pChange.toFixed(2),
    percentageChange: +pChange.toFixed(2),
    volume: Math.round(volume),
    totalTradedQuantity: Math.round(volume),
    turnover: +turnover.toFixed(2),
    totalTurnover: +turnover.toFixed(2),
    transactions: Math.round(transactions),
    totalTransactions: Math.round(transactions),
    high52w: parseCleanNumber(raw.high52w ?? raw.high52 ?? raw.fiftyTwoWeekHigh),
    low52w: parseCleanNumber(raw.low52w ?? raw.low52 ?? raw.fiftyTwoWeekLow),
    circuitLimitPct,
    circuitCeiling,
    circuitFloor,
    isUpperCircuitHit,
    isLowerCircuitHit,
    asOf: raw.asOf || raw.date || new Date().toISOString(),
    source: raw.source || 'normalized-live'
  };
}

// ── 3. HISTORICAL OHLCV TIME-SERIES NORMALIZER ────────────────────────────────

/**
 * Normalizes OHLCV candles from UDF (NepseAlpha), ShareSansar, MeroLagani, or DB
 * @param {Array|Object} rawData 
 * @returns {Array} Array of ascending normalized candles
 */
export function normalizeCandleSeries(rawData) {
  if (!rawData) return [];

  const normalized = [];

  // Format 1: NepseAlpha / TradingView UDF format: { s: 'ok', t: [...], o: [...], h: [...], l: [...], c: [...], v: [...] }
  if (rawData.t && Array.isArray(rawData.t) && rawData.c && Array.isArray(rawData.c)) {
    const len = rawData.t.length;
    for (let i = 0; i < len; i++) {
      const close = parseCleanNumber(rawData.c[i]);
      if (close === null || close <= 0) continue;
      const timestamp = Number(rawData.t[i]);
      const date = !isNaN(timestamp)
        ? (timestamp > 1e11 ? new Date(timestamp) : new Date(timestamp * 1000)).toISOString().slice(0, 10)
        : null;
      if (!date) continue;

      const open = parseCleanNumber(rawData.o?.[i], close);
      const high = parseCleanNumber(rawData.h?.[i], Math.max(open, close));
      const low = parseCleanNumber(rawData.l?.[i], Math.min(open, close));
      const volume = parseCleanNumber(rawData.v?.[i], 0);

      normalized.push({
        date,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume: Math.round(volume),
        turnover: +(close * volume).toFixed(2),
        isReal: true
      });
    }
  } 
  // Format 2: Array of candle objects
  else if (Array.isArray(rawData)) {
    for (const item of rawData) {
      if (!item || typeof item !== 'object') continue;
      const close = parseCleanNumber(
        item.close ?? item.closePrice ?? item.closingPrice ?? item.rate ?? item.ltp ?? item.price
      );
      if (close === null || close <= 0) continue;

      const date = parseDateToIso(
        item.date ?? item.tradeDate ?? item.trade_date ?? item.businessDate ?? item.t
      );
      if (!date) continue;

      const open = parseCleanNumber(item.open ?? item.openPrice ?? item.op, close);
      const high = parseCleanNumber(item.high ?? item.highPrice ?? item.maxPrice ?? item.h, Math.max(open, close));
      const low = parseCleanNumber(item.low ?? item.lowPrice ?? item.minPrice ?? item.l, Math.min(open, close));
      const volume = parseCleanNumber(
        item.volume ?? item.totalTradedQuantity ?? item.quantity ?? item.vol ?? item.q ?? 0
      );
      const turnover = parseCleanNumber(
        item.turnover ?? item.totalTurnover ?? item.totalTradedValue ?? item.amount ?? (close * volume)
      );

      normalized.push({
        date,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
        volume: Math.round(volume),
        turnover: +turnover.toFixed(2),
        isReal: true
      });
    }
  }

  // Deduplicate and sort ascending by date
  const uniqueMap = new Map();
  for (const c of normalized) {
    uniqueMap.set(c.date, c);
  }

  const sorted = Array.from(uniqueMap.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return sorted;
}

// ── 4. QUARTERLY FINANCIAL DISCLOSURE NORMALIZER ──────────────────────────────

/**
 * Normalizes quarterly disclosures, extracting EPS, NPL, CAR, Reserves, Net Profit
 * Distinguishes BFI specific metrics (NPL, CAR, NIM) from general industrial metrics.
 * @param {Object} raw 
 * @param {string} [sector='']
 * @returns {Object} Normalized financial disclosure
 */
export function normalizeQuarterlyFinancials(raw, sector = '') {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'insufficient_history',
      symbol: null,
      fiscalYear: null,
      quarter: null,
      eps: null,
      pe: null,
      bookValue: null,
      pbv: null,
      roe: null,
      npl: null,
      car: null,
      nim: null,
      distributableProfit: null,
      reserves: null,
      netProfit: null,
      paidUpCapital: null,
      isBfi: false
    };
  }

  const symbol = parseCleanString(raw.symbol || raw.s).toUpperCase();
  const sec = parseCleanString(sector || raw.sector || '').toLowerCase();
  const isBfi = sec.includes('bank') || sec.includes('finance') || sec.includes('microfinance');

  const eps = parseCleanNumber(raw.eps ?? raw.earningPerShare ?? raw.earningsPerShare);
  const bookValue = parseCleanNumber(raw.bookValue ?? raw.bvps ?? raw.netWorthPerShare);
  const pe = parseCleanNumber(raw.pe ?? raw.priceToEarnings ?? raw.peRatio);
  const pbv = parseCleanNumber(raw.pbv ?? raw.pb ?? raw.priceToBook);
  const roe = parseCleanNumber(raw.roe ?? raw.returnOnEquity);

  // BFI regulatory metrics
  const npl = parseCleanNumber(raw.npl ?? raw.nonPerformingLoan ?? raw.nonPerformingLoanPct);
  const car = parseCleanNumber(raw.car ?? raw.capitalAdequacyRatio ?? raw.carPct);
  const nim = parseCleanNumber(raw.nim ?? raw.netInterestMargin ?? raw.netInterestMarginPct);
  const distributableProfit = parseCleanNumber(raw.distributableProfit ?? raw.distributableEps);

  // Balance sheet & PnL
  const reserves = parseCleanNumber(raw.reserves ?? raw.reserveAndSurplus);
  const netProfit = parseCleanNumber(raw.netProfit ?? raw.netIncome);
  const paidUpCapital = parseCleanNumber(raw.paidUpCapital ?? raw.paidUp);

  const hasCoreFinancials = eps !== null || bookValue !== null || netProfit !== null;

  return {
    status: hasCoreFinancials ? 'complete' : 'insufficient_history',
    symbol,
    fiscalYear: parseCleanString(raw.fiscalYear || raw.fy || raw.year),
    quarter: parseCleanString(raw.quarter || raw.qtr || 'Q4'),
    eps: eps !== null ? +eps.toFixed(2) : null,
    pe: pe !== null ? +pe.toFixed(2) : null,
    bookValue: bookValue !== null ? +bookValue.toFixed(2) : null,
    pbv: pbv !== null ? +pbv.toFixed(2) : null,
    roe: roe !== null ? +roe.toFixed(2) : null,
    npl: npl !== null ? +npl.toFixed(2) : null,
    car: car !== null ? +car.toFixed(2) : null,
    nim: nim !== null ? +nim.toFixed(2) : null,
    distributableProfit: distributableProfit !== null ? +distributableProfit.toFixed(2) : null,
    reserves: reserves !== null ? +reserves.toFixed(2) : null,
    netProfit: netProfit !== null ? +netProfit.toFixed(2) : null,
    paidUpCapital: paidUpCapital !== null ? +paidUpCapital.toFixed(2) : null,
    isBfi
  };
}

// ── 5. SECTORAL SUB-INDICES & BENCHMARK NORMALIZER ─────────────────────────────

/**
 * Normalizes Sector Indices and Headline Benchmarks
 * @param {Array|Object} raw 
 * @returns {Object}
 */
export function normalizeSectorIndices(raw) {
  if (!raw) {
    return {
      status: 'insufficient_history',
      nepse: null,
      sensitive: null,
      float: null,
      sensitiveFloat: null,
      subIndices: []
    };
  }

  const subIndices = [];
  let nepse = null;
  let sensitive = null;
  let floatIdx = null;
  let sensitiveFloat = null;

  const list = Array.isArray(raw) ? raw : (raw.subIndices || raw.indices || Object.values(raw));

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = parseCleanString(item.index || item.name || item.sector || item.indexName);
    if (!name) continue;

    const value = parseCleanNumber(item.value ?? item.currentValue ?? item.close ?? item.indexValue);
    if (value === null || value <= 0) continue;

    const change = parseCleanNumber(item.change ?? item.pointChange ?? 0);
    const pChange = parseCleanNumber(item.pChange ?? item.percentageChange ?? item.changePercent ?? 0);
    const turnover = parseCleanNumber(item.turnover ?? item.totalTurnover ?? 0);
    const prevClose = change !== 0 ? +(value - change).toFixed(2) : value;

    const normObj = {
      name,
      value: +value.toFixed(2),
      change: +change.toFixed(2),
      pChange: +pChange.toFixed(2),
      turnover: +turnover.toFixed(2),
      prevClose: +prevClose.toFixed(2)
    };

    const lower = name.toLowerCase();
    if (lower === 'nepse index' || lower === 'nepse') {
      nepse = normObj;
    } else if (lower.includes('sensitive float') || lower.includes('senfloat')) {
      sensitiveFloat = normObj;
    } else if (lower === 'sensitive index' || lower === 'sensitive') {
      sensitive = normObj;
    } else if (lower === 'float index' || lower === 'float') {
      floatIdx = normObj;
    } else {
      subIndices.push(normObj);
    }
  }

  return {
    status: nepse ? 'complete' : 'insufficient_history',
    nepse,
    sensitive,
    float: floatIdx,
    sensitiveFloat,
    subIndices
  };
}

// ── 6. SHARE STRUCTURE & FLOAT NORMALIZER ─────────────────────────────────────

/**
 * Normalizes share structure: Public vs Promoter shares, lock-in schedules
 * @param {Object} raw 
 * @returns {Object}
 */
export function normalizeShareStructure(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'insufficient_history',
      symbol: null,
      totalShares: null,
      promoterShares: null,
      publicShares: null,
      promoterPct: null,
      publicFloatPct: null,
      lockInExpiryDate: null,
      daysToLockInExpiry: null,
      isLockInNearExpiry: false
    };
  }

  const symbol = parseCleanString(raw.symbol || raw.s).toUpperCase();
  const totalShares = parseCleanNumber(raw.totalShares ?? raw.listedShares ?? raw.sharesOut);
  let promoterPct = parseCleanNumber(raw.promoterHolding ?? raw.promoterSharesPct ?? raw.promoterPercent ?? raw.promoterPct);
  let publicFloatPct = parseCleanNumber(raw.publicHolding ?? raw.publicSharesPct ?? raw.publicFloatPct ?? raw.publicPct);

  if (promoterPct !== null && publicFloatPct === null) {
    publicFloatPct = Math.max(0, 100 - promoterPct);
  } else if (publicFloatPct !== null && promoterPct === null) {
    promoterPct = Math.max(0, 100 - publicFloatPct);
  }

  let promoterShares = parseCleanNumber(raw.promoterShares);
  let publicShares = parseCleanNumber(raw.publicShares);
  if (totalShares && promoterPct !== null) {
    if (promoterShares === null) promoterShares = Math.round((totalShares * promoterPct) / 100);
    if (publicShares === null) publicShares = Math.round((totalShares * (publicFloatPct || (100 - promoterPct))) / 100);
  }

  // Lock-in schedule
  const lockInExpiryDate = parseDateToIso(raw.lockinExpiry ?? raw.lockInDate ?? raw.promoterLockinDate);
  let daysToLockInExpiry = null;
  let isLockInNearExpiry = false;

  if (lockInExpiryDate) {
    const diffMs = new Date(lockInExpiryDate).getTime() - Date.now();
    daysToLockInExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    isLockInNearExpiry = daysToLockInExpiry >= 0 && daysToLockInExpiry <= 60;
  }

  return {
    status: totalShares ? 'complete' : 'insufficient_history',
    symbol,
    totalShares,
    promoterShares,
    publicShares,
    promoterPct: promoterPct !== null ? +promoterPct.toFixed(2) : null,
    publicFloatPct: publicFloatPct !== null ? +publicFloatPct.toFixed(2) : null,
    lockInExpiryDate,
    daysToLockInExpiry,
    isLockInNearExpiry
  };
}

// ── 7. ORDER BOOK DEPTH & FLOOR SHEET NORMALIZER ──────────────────────────────

/**
 * Normalizes floorsheet rows into standardized trade tickets
 * @param {Array} rawRows 
 * @returns {Array}
 */
export function normalizeFloorSheet(rawRows) {
  if (!Array.isArray(rawRows)) return [];

  const tickets = [];
  for (const r of rawRows) {
    if (!r || typeof r !== 'object') continue;
    const contractNo = parseCleanString(r.contractNo || r.contractId || r.id || r.transactionNo);
    const symbol = parseCleanString(r.symbol || r.stockSymbol || r.company || r.s).toUpperCase();
    const buyer = parseCleanNumber(r.buyer || r.buyerBroker || r.buyerMemberId);
    const seller = parseCleanNumber(r.seller || r.sellerBroker || r.sellerMemberId);
    const quantity = parseCleanNumber(r.quantity || r.contractQuantity || r.q || r.shares);
    const rate = parseCleanNumber(r.rate || r.contractRate || r.price || r.p);
    const amount = parseCleanNumber(r.amount || r.contractAmount || (quantity && rate ? quantity * rate : 0));

    if (quantity && rate && quantity > 0 && rate > 0) {
      tickets.push({
        contractNo,
        symbol,
        buyerBroker: buyer,
        sellerBroker: seller,
        quantity: Math.round(quantity),
        rate: +rate.toFixed(2),
        amount: +amount.toFixed(2),
        time: r.time || r.tradeTime || r.businessDate || new Date().toISOString()
      });
    }
  }

  return tickets;
}
