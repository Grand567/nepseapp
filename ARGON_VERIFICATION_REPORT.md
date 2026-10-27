# ARGON MASTER VERIFICATION REPORT — ALL 22 PATCHES (PARTS 1, 2 & 3)

Apply every single `SEARCH` and `REPLACE` block below to the specified file paths in the "Drabyashree NEPSE" repository.

---

## PART 1: INGESTION, DATABASE SCHEMA & SERVICE HUB

### PATCH 1.1: `proxy/db/ledgerStore.js`
**Fixes:** Arithmetic consistency (`qty * rate == amount`), dead cross-trade code, `low_price` zero trap, 50,000-row transaction rollback on missing `trade_time`, and Whale Print threshold (`>= 200` kitta or `>= Rs. 100,000`).

```javascript
<<<<<<< SEARCH
    const qty = Math.round(Number(trade.contractQuantity || trade.quantity || trade.qty || trade.kitta || 0));
    const rate = Number(trade.contractRate || trade.rate || trade.price || 0);
    const amt = Number(trade.contractAmount || trade.amount || qty * rate);
    const buyer = parseBrokerInt(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer_broker ?? trade.buyer);
    const seller = parseBrokerInt(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller_broker ?? trade.seller);

    if (qty <= 0 || (!buyer && !seller)) continue;
    pureEquityTrades.push(trade);

    let s = stockAggMap.get(symbol);
    if (!s) {
      const initialRate = rate > 0 ? rate : amt > 0 ? amt / qty : 100;
      s = {
        open: initialRate,
        high: initialRate,
        low: initialRate,
        close: initialRate,
        buyVolSum: 0,
        sellVolSum: 0,
        buyAmtSum: 0,
        sellAmtSum: 0,
        brokers: new Map(),
      };
      stockAggMap.set(symbol, s);
    }

    const currentRate = rate > 0 ? rate : amt > 0 ? amt / qty : s.close;
    if (currentRate > 0) {
      if (currentRate > s.high) s.high = currentRate;
      if (currentRate < s.low || s.low <= 0) s.low = currentRate;
      s.close = currentRate;
    }

    const isInternalCross = (buyer > 0 && seller > 0 && buyer === seller);
    if (buyer > 0) {
      const b = s.brokers.get(buyer) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
      b.buyVol += qty;
      b.buyAmt += amt;
      if (isInternalCross) {
        b.crossVol = (b.crossVol || 0) + qty;
      }
      s.brokers.set(buyer, b);
      s.buyVolSum += qty;
      s.buyAmtSum += amt;
    }

    if (seller > 0) {
      const b = s.brokers.get(seller) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
      b.sellVol += qty;
      b.sellAmt += amt;
      if (isInternalCross && buyer !== seller) {
        b.crossVol = (b.crossVol || 0) + qty;
      }
      s.brokers.set(seller, b);
      s.sellVolSum += qty;
      s.sellAmtSum += amt;
    }
  }

  const upsertStock = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, symbol) DO UPDATE SET
      open_price = excluded.open_price,
      high_price = MAX(daily_stock_summary.high_price, excluded.high_price),
      low_price = MIN(daily_stock_summary.low_price, excluded.low_price),
      close_price = excluded.close_price,
      total_volume = excluded.total_volume,
      total_turnover = excluded.total_turnover
  `);
=======
    const qty = Math.round(Number(trade.contractQuantity || trade.quantity || trade.qty || trade.kitta || 0));
    const rate = Number(trade.contractRate || trade.rate || trade.price || 0);
    const rawAmt = Number(trade.contractAmount || trade.amount || 0);
    const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
    const amt = (expectedAmt > 0 && (!Number.isFinite(rawAmt) || rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
      ? expectedAmt
      : Number((rawAmt > 0 ? rawAmt : expectedAmt).toFixed(2));
    const buyer = parseBrokerInt(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer_broker ?? trade.buyer);
    const seller = parseBrokerInt(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller_broker ?? trade.seller);

    if (qty <= 0 || (!buyer && !seller)) continue;
    pureEquityTrades.push({ ...trade, contractId: cid || undefined, amount: amt, rate, kitta: qty });

    let s = stockAggMap.get(symbol);
    if (!s) {
      const initialRate = rate > 0 ? rate : amt > 0 ? amt / qty : 100;
      s = {
        open: initialRate,
        high: initialRate,
        low: initialRate,
        close: initialRate,
        buyVolSum: 0,
        sellVolSum: 0,
        buyAmtSum: 0,
        sellAmtSum: 0,
        brokers: new Map(),
      };
      stockAggMap.set(symbol, s);
    }

    const currentRate = rate > 0 ? rate : amt > 0 ? amt / qty : s.close;
    if (currentRate > 0) {
      if (currentRate > s.high) s.high = currentRate;
      if (currentRate < s.low || s.low <= 0) s.low = currentRate;
      s.close = currentRate;
    }

    const isInternalCross = (buyer > 0 && seller > 0 && buyer === seller);
    if (buyer > 0) {
      const b = s.brokers.get(buyer) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
      b.buyVol += qty;
      b.buyAmt += amt;
      if (isInternalCross) {
        b.crossVol = (b.crossVol || 0) + qty;
      }
      s.brokers.set(buyer, b);
      s.buyVolSum += qty;
      s.buyAmtSum += amt;
    }

    if (seller > 0) {
      const b = s.brokers.get(seller) || { buyVol: 0, sellVol: 0, buyAmt: 0, sellAmt: 0, crossVol: 0 };
      b.sellVol += qty;
      b.sellAmt += amt;
      s.brokers.set(seller, b);
      s.sellVolSum += qty;
      s.sellAmtSum += amt;
    }
  }

  const upsertStock = db.prepare(`
    INSERT INTO daily_stock_summary (trade_date, symbol, open_price, high_price, low_price, close_price, total_volume, total_turnover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(trade_date, symbol) DO UPDATE SET
      open_price = excluded.open_price,
      high_price = MAX(COALESCE(daily_stock_summary.high_price, 0), excluded.high_price),
      low_price = CASE
        WHEN daily_stock_summary.low_price IS NULL OR daily_stock_summary.low_price <= 0 THEN excluded.low_price
        WHEN excluded.low_price IS NULL OR excluded.low_price <= 0 THEN daily_stock_summary.low_price
        ELSE MIN(daily_stock_summary.low_price, excluded.low_price)
      END,
      close_price = excluded.close_price,
      total_volume = excluded.total_volume,
      total_turnover = excluded.total_turnover
  `);
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
    let prevDate = null;
    let prevRate = null;
    let lastDir = "NEUTRAL";

    for (const t of trades) {
      const cid = String(t.contractId || t.contract_no || t.contractNo || `FS-${tradeDate}-${sym}-${count + 1}`);
      const date = String(t.businessDate || t.tradeDate || t.trade_date || tradeDate);
      const time = String(t.tradeTime || t.trade_time || "");
      const buyer = Number(t.buyerMemberId || t.buyerBroker || t.buyer_broker || t.buyer || 0);
      const seller = Number(t.sellerMemberId || t.sellerBroker || t.seller_broker || t.seller || 0);
      const qty = Number(t.contractQuantity || t.quantity || t.qty || t.kitta || 0);
      const rate = Number(t.contractRate || t.rate || t.price || 0);
      const amt = Number(t.contractAmount || t.amount || qty * rate);

      if (qty <= 0) continue;

      // Ingest-Time Parity & Field Validation Check (Fix 2)
      if (
        !cid || !sym || !date || !time ||
        buyer <= 0 || seller <= 0 || qty <= 0 ||
        isNaN(rate) || rate <= 0 || isNaN(amt) || amt <= 0
      ) {
        throw new Error(`Floorsheet Ingestion Parity Violation: Contract ${cid} on ${date} has invalid/corrupted fields (buyer=${buyer}, seller=${seller}, qty=${qty}, rate=${rate}, amt=${amt})`);
      }

      // Reset tick-test state at session date boundaries
      if (date !== prevDate) {
        prevDate = date;
        prevRate = null;
        lastDir = "NEUTRAL";
      }

      let dir = lastDir;
      if (t.aggressor || t.aggressor_side) {
        dir = String(t.aggressor || t.aggressor_side).toUpperCase();
        lastDir = dir;
      } else if (prevRate !== null && rate > 0) {
        if (rate > prevRate) {
          dir = "BUY";
          lastDir = "BUY";
        } else if (rate < prevRate) {
          dir = "SELL";
          lastDir = "SELL";
        }
      }
      if (rate > 0) prevRate = rate;

      const isInternal = buyer > 0 && buyer === seller ? 1 : 0;
      const isWhale = qty >= 500 || amt >= 500000 ? 1 : 0;

      insert.run(cid, sym, date, time, buyer, seller, qty, rate, amt, dir, isInternal, isWhale);
      count++;
    }
=======
    let prevDate = null;
    let prevRate = null;
    let lastDir = "NEUTRAL";
    const seenContractIds = new Set();

    for (let idx = 0; idx < trades.length; idx++) {
      const t = trades[idx];
      const date = String(t.businessDate || t.tradeDate || t.trade_date || tradeDate).slice(0, 10);
      const time = String(t.tradeTime || t.trade_time || t.time || "14:59:59");
      const buyer = parseBrokerInt(t.buyerMemberId ?? t.buyerBroker ?? t.buyer_broker ?? t.buyer);
      const seller = parseBrokerInt(t.sellerMemberId ?? t.sellerBroker ?? t.seller_broker ?? t.seller);
      const qty = Math.round(Number(t.contractQuantity || t.quantity || t.qty || t.kitta || 0));
      const rate = Number(t.contractRate || t.rate || t.price || 0);
      const rawAmt = Number(t.contractAmount || t.amount || 0);
      const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
      const amt = (expectedAmt > 0 && (!Number.isFinite(rawAmt) || rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
        ? expectedAmt
        : Number((rawAmt > 0 ? rawAmt : expectedAmt).toFixed(2));

      const rawCid = String(t.contractId ?? t.contract_no ?? t.contractNo ?? "").trim();
      const cid = rawCid || `SYN-${date}-${sym}-${buyer}-${seller}-${qty}-${rate}-${idx + 1}`;

      if (seenContractIds.has(cid)) continue;
      seenContractIds.add(cid);

      if (
        !cid || !sym || !date ||
        buyer <= 0 || seller <= 0 || qty <= 0 ||
        isNaN(rate) || rate <= 0 || isNaN(amt) || amt <= 0
      ) {
        continue;
      }

      // Reset tick-test state at session date boundaries
      if (date !== prevDate) {
        prevDate = date;
        prevRate = null;
        lastDir = "NEUTRAL";
      }

      let dir = lastDir;
      if (t.aggressor || t.aggressor_side) {
        dir = String(t.aggressor || t.aggressor_side).toUpperCase();
        lastDir = dir;
      } else if (prevRate !== null && rate > 0) {
        if (rate > prevRate) {
          dir = "BUY";
          lastDir = "BUY";
        } else if (rate < prevRate) {
          dir = "SELL";
          lastDir = "SELL";
        }
      }
      if (rate > 0) prevRate = rate;

      const isInternal = buyer > 0 && buyer === seller ? 1 : 0;
      // Whale print threshold: >= 200 kitta OR >= Rs. 100,000 (1 Lakh)
      const isWhale = qty >= 200 || amt >= 100000 ? 1 : 0;

      insert.run(cid, sym, date, time, buyer, seller, qty, rate, amt, dir, isInternal, isWhale);
      count++;
    }
>>>>>>> REPLACE
```

---

### PATCH 1.2: `proxy/db/ledgerStore.js`
**Fixes:** Populate `HOT_CACHE.stockDiagnostics`, preserve `cross_vol` on snapshot restore, and count active sessions in `getSmartMoneyAggregatedFlow`.

```javascript
<<<<<<< SEARCH
      const insertBroker = db.prepare(`
        INSERT OR REPLACE INTO daily_broker_ledger 
        (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of brokerLedger) {
        insertBroker.run(b.trade_date, b.symbol, b.broker_id, b.buy_vol, b.sell_vol, b.buy_amt, b.sell_amt);
      }
=======
      const insertBroker = db.prepare(`
        INSERT OR REPLACE INTO daily_broker_ledger 
        (trade_date, symbol, broker_id, buy_vol, sell_vol, buy_amt, sell_amt, cross_vol)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of brokerLedger) {
        insertBroker.run(b.trade_date, b.symbol, b.broker_id, b.buy_vol, b.sell_vol, b.buy_amt, b.sell_amt, b.cross_vol || 0);
      }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
    for (const days of timeframes) {
      const diag = calculateMultiDayDiagnostics(dailyHistory, days);
      if (diag) {
        if (days === 3) diag3 = diag;
        if (days === 30) diag30 = diag;
=======
    for (const days of timeframes) {
      const diag = calculateMultiDayDiagnostics(dailyHistory, days);
      if (diag) {
        nextDiagnostics.set(`${symbol}_${days}`, diag);
        if (days === 3) diag3 = diag;
        if (days === 30) diag30 = diag;
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
      SELECT
        b.broker_id AS brokerId,
        SUM(b.buy_vol) AS buyVolume,
        SUM(b.sell_vol) AS sellVolume,
        0 AS buyTrades,
        0 AS sellTrades,
        SUM(b.buy_amt) AS buyAmount,
        SUM(b.sell_amt) AS sellAmount
      FROM daily_broker_ledger b
      INNER JOIN recent_dates r ON b.trade_date = r.trade_date
      WHERE b.symbol = @symbol
      GROUP BY b.broker_id
      ORDER BY (SUM(b.buy_vol) - SUM(b.sell_vol)) DESC
=======
      SELECT
        b.broker_id AS brokerId,
        SUM(b.buy_vol) AS buyVolume,
        SUM(b.sell_vol) AS sellVolume,
        COUNT(CASE WHEN b.buy_vol > 0 THEN 1 END) AS buyTrades,
        COUNT(CASE WHEN b.sell_vol > 0 THEN 1 END) AS sellTrades,
        SUM(b.buy_amt) AS buyAmount,
        SUM(b.sell_amt) AS sellAmount,
        SUM(COALESCE(b.cross_vol, 0)) AS crossVolume
      FROM daily_broker_ledger b
      INNER JOIN recent_dates r ON b.trade_date = r.trade_date
      WHERE b.symbol = @symbol
      GROUP BY b.broker_id
      ORDER BY (SUM(b.buy_vol) - SUM(b.sell_vol)) DESC
>>>>>>> REPLACE
```

---

### PATCH 1.3: `proxy/utils/floorsheetDeduplicator.mjs`
**Fixes:** Deterministic synthetic contract IDs, symbol normalization, and arithmetic verification (`qty * rate == amount`).

```javascript
<<<<<<< SEARCH
export function extractContractNumber(trade, defaultDate = '', index = 0) {
  if (!trade) return '';
  const rawId = trade.contractId ?? trade.contract_no ?? trade.contractNo ?? trade.id ?? trade.tranId ?? trade.tradeBookId;
  if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
    return String(rawId).trim();
  }
  const sym = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || 'UNK').toUpperCase().trim();
  const dt = String(trade.businessDate || trade.tradeDate || trade.trade_date || defaultDate || 'UNKNOWN').trim();
  return `SYN-${dt}-${sym}-${index + 1}`;
}

/**
 * Deduplicates an array of floorsheet trade records using their contract numbers.
 *
 * @param {Array<object>} rawTrades - Array of trade objects
 * @param {string} sessionDate - Target session date YYYY-MM-DD
 * @returns {{ deduplicatedTrades: Array<object>, duplicateCount: number, totalRawCount: number, uniqueCount: number }}
 */
export function deduplicateFloorsheetContracts(rawTrades, sessionDate = '') {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) {
    return {
      deduplicatedTrades: [],
      duplicateCount: 0,
      totalRawCount: 0,
      uniqueCount: 0,
    };
  }

  const seenContracts = new Set();
  const deduplicatedTrades = [];
  let duplicateCount = 0;

  for (let i = 0; i < rawTrades.length; i++) {
    const trade = rawTrades[i];
    if (!trade || typeof trade !== 'object') continue;

    const contractNo = extractContractNumber(trade, sessionDate, i);
    if (seenContracts.has(contractNo)) {
      duplicateCount++;
      continue;
    }

    seenContracts.add(contractNo);
    // Ensure the record carries normalized contractId and contract_no
    deduplicatedTrades.push({
      ...trade,
      contractId: contractNo,
      contract_no: contractNo,
    });
  }
=======
export function extractContractNumber(trade, defaultDate = '', index = 0) {
  if (!trade) return '';
  const rawId = trade.contractId ?? trade.contract_no ?? trade.contractNo ?? trade.id ?? trade.tranId ?? trade.tradeBookId;
  if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
    return String(rawId).trim();
  }
  const sym = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || 'UNK').toUpperCase().trim();
  const dt = String(trade.businessDate || trade.tradeDate || trade.trade_date || defaultDate || 'UNKNOWN').trim().slice(0, 10);
  const buyer = String(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer_broker ?? trade.buyer ?? '0').trim();
  const seller = String(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller_broker ?? trade.seller ?? '0').trim();
  const qty = Math.round(Number(trade.contractQuantity ?? trade.quantity ?? trade.qty ?? trade.kitta ?? 0));
  const rate = Number(trade.contractRate ?? trade.rate ?? trade.price ?? 0);
  const time = String(trade.tradeTime ?? trade.trade_time ?? trade.time ?? '').trim();
  return time
    ? `SYN-${dt}-${sym}-${buyer}-${seller}-${qty}-${rate}-${time}`
    : `SYN-${dt}-${sym}-${buyer}-${seller}-${qty}-${rate}-${index + 1}`;
}

/**
 * Deduplicates an array of floorsheet trade records using their contract numbers,
 * normalizes stock symbols (trimmed/uppercased), and enforces quantity * rate == amount.
 *
 * @param {Array<object>} rawTrades - Array of trade objects
 * @param {string} sessionDate - Target session date YYYY-MM-DD
 * @returns {{ deduplicatedTrades: Array<object>, duplicateCount: number, totalRawCount: number, uniqueCount: number }}
 */
export function deduplicateFloorsheetContracts(rawTrades, sessionDate = '') {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) {
    return {
      deduplicatedTrades: [],
      duplicateCount: 0,
      totalRawCount: 0,
      uniqueCount: 0,
    };
  }

  const seenContracts = new Set();
  const deduplicatedTrades = [];
  let duplicateCount = 0;

  for (let i = 0; i < rawTrades.length; i++) {
    const trade = rawTrades[i];
    if (!trade || typeof trade !== 'object') continue;

    const contractNo = extractContractNumber(trade, sessionDate, i);
    if (!contractNo || seenContracts.has(contractNo)) {
      duplicateCount++;
      continue;
    }

    const sym = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || '').toUpperCase().trim();
    const qty = Math.round(Number(trade.contractQuantity ?? trade.quantity ?? trade.qty ?? trade.kitta ?? 0));
    const rate = Number(trade.contractRate ?? trade.rate ?? trade.price ?? 0);
    const rawAmt = Number(trade.contractAmount ?? trade.amount ?? 0);
    const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
    const verifiedAmt = (expectedAmt > 0 && (!Number.isFinite(rawAmt) || rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
      ? expectedAmt
      : Number((rawAmt > 0 ? rawAmt : expectedAmt).toFixed(2));

    seenContracts.add(contractNo);
    // Ensure the record carries normalized contractId, contract_no, symbol, and arithmetic consistency
    deduplicatedTrades.push({
      ...trade,
      symbol: sym || trade.symbol,
      stockSymbol: sym || trade.stockSymbol,
      contractId: contractNo,
      contract_no: contractNo,
      kitta: qty > 0 ? qty : trade.kitta,
      quantity: qty > 0 ? qty : trade.quantity,
      rate: rate > 0 ? rate : trade.rate,
      amount: verifiedAmt > 0 ? verifiedAmt : trade.amount,
    });
  }
>>>>>>> REPLACE
```

---

### PATCH 1.4: `src/services/floorsheet/floorsheetHubEngine.ts`
**Fixes:** Contract deduplication, date-scoped Tick-Test aggressor, zero-amount fallback bug, and self-trade double-counting in `aggregateBrokersFromContracts`.

```typescript
<<<<<<< SEARCH
  const chronological = [...filtered].sort((a, b) => {
    const cA = String(a.contractNo ?? a.contract_no ?? "");
    const cB = String(b.contractNo ?? b.contract_no ?? "");
    return cA.localeCompare(cB, undefined, { numeric: true });
  });

  let prevRate: number | null = null;
  let lastDirection: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";

  const enriched: EnrichedFloorsheetContract[] = chronological.map((row, idx) => {
    const contractNo = String(row.contractNo ?? row.contract_no ?? `FS-${idx + 1}`);
    const symbol =
      resolveValidNepseSymbol(row.symbol ?? row.stockSymbol, fallbackSymbol) ||
      fallbackSymbol;
    const tradeDate = String(
      row.tradeDate ??
        row.trade_date ??
        row.businessDate ??
        new Date().toISOString().slice(0, 10)
    );
    const tradeTime = String(row.tradeTime ?? row.trade_time ?? "");
    const buyerBroker = Math.round(
      safeNum(
        row.buyerBroker ?? row.buyer_broker ?? row.buyerMemberId ?? row.buyer,
        0
      )
    );
    const sellerBroker = Math.round(
      safeNum(
        row.sellerBroker ??
          row.seller_broker ??
          row.sellerMemberId ??
          row.seller,
        0
      )
    );
    const kitta = Math.round(
      safeNum(row.kitta ?? row.quantity ?? row.contractQuantity, 0)
    );
    const rate = safeNum(row.rate ?? row.price ?? row.contractRate, 0);
    const amount = safeNum(
      row.amount ?? row.contractAmount,
      Number((kitta * rate).toFixed(2))
    );

    let aggressor: "BUY" | "SELL" | "NEUTRAL" = lastDirection;
    if (prevRate !== null && rate > 0) {
      if (rate > prevRate) {
        aggressor = "BUY";
        lastDirection = "BUY";
      } else if (rate < prevRate) {
        aggressor = "SELL";
        lastDirection = "SELL";
      }
    }
    if (rate > 0) prevRate = rate;

    const isInternalCross = buyerBroker > 0 && buyerBroker === sellerBroker;
    const isWhalePrint = kitta >= 200 || amount >= 100_000;
    const isMegaBlock = kitta >= 500 || amount >= 500_000;

    return {
      contractNo,
      symbol,
      tradeDate,
      tradeTime,
      buyerBroker,
      sellerBroker,
      kitta,
      rate,
      amount,
      aggressor,
      isInternalCross,
      isWhalePrint,
      isMegaBlock,
    };
  });

  return enriched.reverse();
=======
  const chronological = [...filtered].sort((a, b) => {
    const dA = String(a.tradeDate ?? a.trade_date ?? a.businessDate ?? "");
    const dB = String(b.tradeDate ?? b.trade_date ?? b.businessDate ?? "");
    if (dA && dB && dA !== dB) return dA.localeCompare(dB);
    const tA = String(a.tradeTime ?? a.trade_time ?? "");
    const tB = String(b.tradeTime ?? b.trade_time ?? "");
    if (tA && tB && tA !== tB) return tA.localeCompare(tB);
    const cA = String(a.contractNo ?? a.contract_no ?? "");
    const cB = String(b.contractNo ?? b.contract_no ?? "");
    return cA.localeCompare(cB, undefined, { numeric: true });
  });

  let prevDate: string | null = null;
  let prevRate: number | null = null;
  let lastDirection: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
  const seenContracts = new Set<string>();
  const enriched: EnrichedFloorsheetContract[] = [];

  for (let idx = 0; idx < chronological.length; idx++) {
    const row = chronological[idx];
    const contractNo = String(row.contractNo ?? row.contract_no ?? `FS-${idx + 1}`).trim();
    if (seenContracts.has(contractNo)) continue;
    seenContracts.add(contractNo);

    const symbol = String(
      resolveValidNepseSymbol(row.symbol ?? row.stockSymbol, fallbackSymbol) ||
      fallbackSymbol
    ).toUpperCase().trim();
    const tradeDate = String(
      row.tradeDate ??
        row.trade_date ??
        row.businessDate ??
        new Date().toISOString().slice(0, 10)
    ).slice(0, 10);
    const tradeTime = String(row.tradeTime ?? row.trade_time ?? "");
    const buyerBroker = Math.round(
      safeNum(
        row.buyerBroker ?? row.buyer_broker ?? row.buyerMemberId ?? row.buyer,
        0
      )
    );
    const sellerBroker = Math.round(
      safeNum(
        row.sellerBroker ??
          row.seller_broker ??
          row.sellerMemberId ??
          row.seller,
        0
      )
    );
    const kitta = Math.round(
      safeNum(row.kitta ?? row.quantity ?? row.contractQuantity, 0)
    );
    if (kitta <= 0) continue;

    const rate = safeNum(row.rate ?? row.price ?? row.contractRate, 0);
    const rawAmount = safeNum(row.amount ?? row.contractAmount, 0);
    const expectedAmount = kitta > 0 && rate > 0 ? Number((kitta * rate).toFixed(2)) : 0;
    const amount =
      expectedAmount > 0 && (rawAmount <= 0 || Math.abs(rawAmount - expectedAmount) > Math.max(1, expectedAmount * 0.01))
        ? expectedAmount
        : rawAmount > 0
        ? Number(rawAmount.toFixed(2))
        : expectedAmount;

    if (tradeDate !== prevDate) {
      prevDate = tradeDate;
      prevRate = null;
      lastDirection = "NEUTRAL";
    }

    let aggressor: "BUY" | "SELL" | "NEUTRAL" = lastDirection;
    const existingAgg = String((row as Record<string, unknown>).aggressor ?? (row as Record<string, unknown>).aggressor_side ?? "").toUpperCase();
    if (prevRate !== null && rate > 0) {
      if (rate > prevRate) {
        aggressor = "BUY";
        lastDirection = "BUY";
      } else if (rate < prevRate) {
        aggressor = "SELL";
        lastDirection = "SELL";
      } else if (existingAgg === "BUY" || existingAgg === "SELL" || existingAgg === "NEUTRAL") {
        aggressor = existingAgg as "BUY" | "SELL" | "NEUTRAL";
      }
    } else if (existingAgg === "BUY" || existingAgg === "SELL" || existingAgg === "NEUTRAL") {
      aggressor = existingAgg as "BUY" | "SELL" | "NEUTRAL";
      lastDirection = aggressor;
    }
    if (rate > 0) prevRate = rate;

    const isInternalCross = buyerBroker > 0 && buyerBroker === sellerBroker;
    const isWhalePrint = kitta >= 200 || amount >= 100_000;
    const isMegaBlock = kitta >= 500 || amount >= 500_000;

    enriched.push({
      contractNo,
      symbol,
      tradeDate,
      tradeTime,
      buyerBroker,
      sellerBroker,
      kitta,
      rate,
      amount,
      aggressor,
      isInternalCross,
      isWhalePrint,
      isMegaBlock,
    });
  }

  return enriched.reverse();
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
function aggregateBrokersFromContracts(contracts: EnrichedFloorsheetContract[]) {
  const map = new Map<
    number,
    { brokerId: number; buyKitta: number; sellKitta: number; trades: number; buyAmount: number; sellAmount: number }
  >();

  for (const c of contracts) {
    if (c.buyerBroker > 0) {
      const b = map.get(c.buyerBroker) || {
        brokerId: c.buyerBroker,
        buyKitta: 0,
        sellKitta: 0,
        trades: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      b.buyKitta += c.kitta;
      b.buyAmount += c.amount;
      b.trades += 1;
      map.set(c.buyerBroker, b);
    }
    if (c.sellerBroker > 0) {
      const s = map.get(c.sellerBroker) || {
        brokerId: c.sellerBroker,
        buyKitta: 0,
        sellKitta: 0,
        trades: 0,
        buyAmount: 0,
        sellAmount: 0,
      };
      s.sellKitta += c.kitta;
      s.sellAmount += c.amount;
      s.trades += 1;
      map.set(c.sellerBroker, s);
    }
  }

  return Array.from(map.values());
}
=======
function aggregateBrokersFromContracts(contracts: EnrichedFloorsheetContract[]) {
  const map = new Map<
    number,
    {
      brokerId: number;
      buyKitta: number;
      sellKitta: number;
      netKitta: number;
      crossKitta: number;
      trades: number;
      buyAmount: number;
      sellAmount: number;
      netAmt: number;
      avgBuyPrice: number;
      avgSellPrice: number;
    }
  >();

  for (const c of contracts) {
    const isSelfTrade = c.buyerBroker > 0 && c.buyerBroker === c.sellerBroker;
    if (c.buyerBroker > 0) {
      const b = map.get(c.buyerBroker) || {
        brokerId: c.buyerBroker,
        buyKitta: 0,
        sellKitta: 0,
        netKitta: 0,
        crossKitta: 0,
        trades: 0,
        buyAmount: 0,
        sellAmount: 0,
        netAmt: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
      };
      b.buyKitta += c.kitta;
      b.buyAmount += c.amount;
      b.trades += 1;
      if (isSelfTrade) b.crossKitta += c.kitta;
      map.set(c.buyerBroker, b);
    }
    if (c.sellerBroker > 0) {
      const s = map.get(c.sellerBroker) || {
        brokerId: c.sellerBroker,
        buyKitta: 0,
        sellKitta: 0,
        netKitta: 0,
        crossKitta: 0,
        trades: 0,
        buyAmount: 0,
        sellAmount: 0,
        netAmt: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
      };
      s.sellKitta += c.kitta;
      s.sellAmount += c.amount;
      // Do not double-count trade count when buyerBroker === sellerBroker
      if (!isSelfTrade) s.trades += 1;
      map.set(c.sellerBroker, s);
    }
  }

  return Array.from(map.values()).map((b) => ({
    ...b,
    netKitta: b.buyKitta - b.sellKitta,
    netAmt: Number((b.buyAmount - b.sellAmount).toFixed(2)),
    avgBuyPrice: b.buyKitta > 0 ? Number((b.buyAmount / b.buyKitta).toFixed(2)) : 0,
    avgSellPrice: b.sellKitta > 0 ? Number((b.sellAmount / b.sellKitta).toFixed(2)) : 0,
  }));
}
>>>>>>> REPLACE
```

---

### PATCH 1.5: `src/app/api/floorsheet/hub/route.ts`
**Fixes:** High-volume session truncation (`LIMIT 100000`), exact symbol filter match, whale threshold (`>= 200` kitta / `>= Rs. 100,000`), and self-trade turnover/trade double-counting.

```typescript
<<<<<<< SEARCH
        if (symbolFilter && symbolFilter !== "ALL") {
          clauses.push(`UPPER(symbol) LIKE ?`);
          params.push(`%${symbolFilter}%`);
        }
        if (buyerFilter > 0) {
          clauses.push(`buyer_broker = ?`);
          params.push(buyerFilter);
        }
        if (sellerFilter > 0) {
          clauses.push(`seller_broker = ?`);
          params.push(sellerFilter);
        }
        if (minKitta > 0) {
          clauses.push(`kitta >= ?`);
          params.push(minKitta);
        }
        if (minAmount > 0) {
          clauses.push(`amount >= ?`);
          params.push(minAmount);
        }
        if (whaleOnly) {
          clauses.push(`(kitta >= 500 OR amount >= 500000 OR is_whale_print = 1)`);
        }
        if (excludeCross) {
          clauses.push(`buyer_broker != seller_broker`);
        }

        const sql = `
          SELECT
            contract_no AS contractNo,
            symbol,
            trade_date AS tradeDate,
            trade_time AS tradeTime,
            buyer_broker AS buyerBroker,
            seller_broker AS sellerBroker,
            kitta,
            rate,
            amount
          FROM floorsheet_contracts
          WHERE ${clauses.join(" AND ")}
          ORDER BY trade_date DESC, trade_time DESC, contract_no DESC
          LIMIT ?
        `;
        params.push(limit * 2); // Fetch extra to compute accurate session rollups

        rawContracts = db.prepare(sql).all(...params) as RawFloorsheetContract[];
=======
        if (symbolFilter && symbolFilter !== "ALL") {
          clauses.push(`UPPER(symbol) = ?`);
          params.push(symbolFilter);
        }
        if (buyerFilter > 0) {
          clauses.push(`buyer_broker = ?`);
          params.push(buyerFilter);
        }
        if (sellerFilter > 0) {
          clauses.push(`seller_broker = ?`);
          params.push(sellerFilter);
        }
        if (minKitta > 0) {
          clauses.push(`kitta >= ?`);
          params.push(minKitta);
        }
        if (minAmount > 0) {
          clauses.push(`amount >= ?`);
          params.push(minAmount);
        }
        if (whaleOnly) {
          clauses.push(`(kitta >= 200 OR amount >= 100000 OR is_whale_print = 1)`);
        }
        if (excludeCross) {
          clauses.push(`buyer_broker != seller_broker`);
        }

        const sql = `
          SELECT
            contract_no AS contractNo,
            symbol,
            trade_date AS tradeDate,
            trade_time AS tradeTime,
            buyer_broker AS buyerBroker,
            seller_broker AS sellerBroker,
            kitta,
            rate,
            amount,
            aggressor_side AS aggressor
          FROM floorsheet_contracts
          WHERE ${clauses.join(" AND ")}
          ORDER BY trade_date DESC, trade_time DESC, contract_no DESC
          LIMIT ?
        `;
        // Allow full-session rollup on high-volume NEPSE days (up to 100,000 contracts) while slicing `contracts` response to `limit`
        params.push(100000);

        rawContracts = db.prepare(sql).all(...params) as RawFloorsheetContract[];
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
    // Apply client filters on synthesized rows as well
    allEnriched = allEnriched.filter((c) => {
      if (symbolFilter && symbolFilter !== "ALL" && !c.symbol.includes(symbolFilter)) return false;
      if (buyerFilter > 0 && c.buyerBroker !== buyerFilter) return false;
=======
    // Apply client filters on synthesized rows as well
    allEnriched = allEnriched.filter((c) => {
      if (symbolFilter && symbolFilter !== "ALL" && c.symbol !== symbolFilter) return false;
      if (buyerFilter > 0 && c.buyerBroker !== buyerFilter) return false;
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
      // Buyer Broker aggregation
      if (c.buyerBroker > 0) {
        const b = brokerAgg.get(c.buyerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        b.buyKitta += c.kitta;
        b.turnover += c.amount;
        if (c.isWhalePrint) b.whaleTrades += 1;
        b.trades += 1;
        brokerAgg.set(c.buyerBroker, b);
      }

      // Seller Broker aggregation
      if (c.sellerBroker > 0) {
        const sl = brokerAgg.get(c.sellerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        sl.sellKitta += c.kitta;
        sl.turnover += c.amount;
        sl.trades += 1;
        brokerAgg.set(c.sellerBroker, sl);
      }
=======
      const isSelfTrade = c.buyerBroker > 0 && c.buyerBroker === c.sellerBroker;

      // Buyer Broker aggregation
      if (c.buyerBroker > 0) {
        const b = brokerAgg.get(c.buyerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        b.buyKitta += c.kitta;
        b.turnover += c.amount;
        if (c.isWhalePrint) b.whaleTrades += 1;
        b.trades += 1;
        brokerAgg.set(c.buyerBroker, b);
      }

      // Seller Broker aggregation
      if (c.sellerBroker > 0) {
        const sl = brokerAgg.get(c.sellerBroker) || {
          buyKitta: 0,
          sellKitta: 0,
          turnover: 0,
          whaleTrades: 0,
          trades: 0,
        };
        sl.sellKitta += c.kitta;
        // Avoid double-counting turnover and trade count on self-trades (buyerBroker === sellerBroker)
        if (!isSelfTrade) {
          sl.turnover += c.amount;
          sl.trades += 1;
        }
        brokerAgg.set(c.sellerBroker, sl);
      }
>>>>>>> REPLACE
```

---

### PATCH 1.6: `src/app/api/stocks/[symbol]/telemetry/route.ts`
**Fixes:** Connect authoritative `daily_stock_summary` table for `quoteData` and `historicalCandles`, and raise single-stock contract limit to `25000`.

```typescript
<<<<<<< SEARCH
    // 2. Fetch Latest Market Quote Snapshot (if `market_quotes` or `stock_quotes` exists)
    let quoteData: RawQuotePayload | null = null;
    for (const quoteTable of ["market_quotes", "stock_quotes", "live_quotes"]) {
      if (tableExists(db, quoteTable)) {
        try {
          const row = db
            .prepare(`SELECT * FROM ${quoteTable} WHERE UPPER(symbol) = ? LIMIT 1`)
            .get(validSymbol) as Record<string, unknown> | undefined;
          if (row) {
            quoteData = {
              symbol: validSymbol,
              ltp: safeNum(row.ltp ?? row.last_traded_price ?? row.close, 0),
              close: safeNum(row.close ?? row.previous_close ?? row.ltp, 0),
              previousClose: safeNum(row.previous_close ?? row.prev_close, 0),
              open: safeNum(row.open, 0),
              high: safeNum(row.high, 0),
              low: safeNum(row.low, 0),
              volume: safeNum(row.volume ?? row.total_traded_quantity, 0),
              vwap: safeNum(row.vwap ?? row.average_traded_price, 0),
              sector: String(row.sector ?? ledgerTelemetry?.sector ?? ""),
              asOf: String(row.updated_at ?? row.trade_date ?? ""),
            };
            break;
          }
        } catch {
          // Continue to next candidate table
        }
      }
    }

    // 3. Fetch Historical Daily Candles (Up to 60 sessions for ATR, RSI, 52W & Walk-Forward)
    let historicalCandles: HistoricalCandle[] = [];
    for (const candleTable of ["historical_candles", "daily_candles", "ohlcv_history"]) {
      if (tableExists(db, candleTable)) {
        try {
          const rows = db
            .prepare(
              `SELECT
                trade_date AS date,
                open,
                high,
                low,
                close,
                volume,
                vwap
              FROM ${candleTable}
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 60`
            )
            .all(validSymbol) as Array<Record<string, unknown>>;

          if (rows.length > 0) {
            historicalCandles = rows
              .map((r) => ({
                date: String(r.date ?? ""),
                open: safeNum(r.open, 0),
                high: safeNum(r.high, 0),
                low: safeNum(r.low, 0),
                close: safeNum(r.close, 0),
                volume: safeNum(r.volume, 0),
                vwap: safeNum(r.vwap ?? r.close, 0),
              }))
              .reverse();
            break;
          }
        } catch {
          // Continue fallback
        }
      }
    }
=======
    // 2. Fetch Latest Market Quote Snapshot (including authoritative `daily_stock_summary` fallback)
    let quoteData: RawQuotePayload | null = null;
    for (const quoteTable of ["market_quotes", "stock_quotes", "live_quotes"]) {
      if (tableExists(db, quoteTable)) {
        try {
          const row = db
            .prepare(`SELECT * FROM ${quoteTable} WHERE UPPER(symbol) = ? LIMIT 1`)
            .get(validSymbol) as Record<string, unknown> | undefined;
          if (row) {
            quoteData = {
              symbol: validSymbol,
              ltp: safeNum(row.ltp ?? row.last_traded_price ?? row.close, 0),
              close: safeNum(row.close ?? row.previous_close ?? row.ltp, 0),
              previousClose: safeNum(row.previous_close ?? row.prev_close, 0),
              open: safeNum(row.open, 0),
              high: safeNum(row.high, 0),
              low: safeNum(row.low, 0),
              volume: safeNum(row.volume ?? row.total_traded_quantity, 0),
              vwap: safeNum(row.vwap ?? row.average_traded_price, 0),
              sector: String(row.sector ?? ledgerTelemetry?.sector ?? ""),
              asOf: String(row.updated_at ?? row.trade_date ?? ""),
            };
            break;
          }
        } catch {
          // Continue to next candidate table
        }
      }
    }

    if (!quoteData && tableExists(db, "daily_stock_summary")) {
      try {
        const recentRows = db
          .prepare(
            `SELECT * FROM daily_stock_summary
             WHERE UPPER(symbol) = ? AND COALESCE(calendar_status, 'VALID') != 'PARTIAL_SESSION'
             ORDER BY trade_date DESC LIMIT 2`
          )
          .all(validSymbol) as Array<Record<string, unknown>>;
        if (recentRows.length 0) {
          const latest = recentRows[0];
          const prev = recentRows[1];
          const vol = safeNum(latest.total_volume, 0);
          const turn = safeNum(latest.total_turnover, 0);
          const closePx = safeNum(latest.close_price, 0);
          quoteData = {
            symbol: validSymbol,
            ltp: closePx,
            close: closePx,
            previousClose: safeNum(prev?.close_price ?? latest.open_price, closePx),
            open: safeNum(latest.open_price, closePx),
            high: safeNum(latest.high_price, closePx),
            low: safeNum(latest.low_price, closePx),
            volume: vol,
            vwap: vol > 0 ? Number((turn / vol).toFixed(2)) : closePx,
            sector: String(ledgerTelemetry?.sector ?? ""),
            asOf: String(latest.trade_date ?? ""),
          };
        }
      } catch {
        // Ignore fallback error
      }
    }

    // 3. Fetch Historical Daily Candles (Up to 60 sessions for ATR, RSI, 52W & Walk-Forward)
    let historicalCandles: HistoricalCandle[] = [];
    for (const candleTable of ["historical_candles", "daily_candles", "ohlcv_history"]) {
      if (tableExists(db, candleTable)) {
        try {
          const rows = db
            .prepare(
              `SELECT
                trade_date AS date,
                open,
                high,
                low,
                close,
                volume,
                vwap
              FROM ${candleTable}
              WHERE UPPER(symbol) = ?
              ORDER BY trade_date DESC
              LIMIT 60`
            )
            .all(validSymbol) as Array<Record<string, unknown>>;

          if (rows.length > 0) {
            historicalCandles = rows
              .map((r) => ({
                date: String(r.date ?? ""),
                open: safeNum(r.open, 0),
                high: safeNum(r.high, 0),
                low: safeNum(r.low, 0),
                close: safeNum(r.close, 0),
                volume: safeNum(r.volume, 0),
                vwap: safeNum(r.vwap ?? r.close, 0),
              }))
              .reverse();
            break;
          }
        } catch {
          // Continue fallback
        }
      }
    }

    if (historicalCandles.length === 0 && tableExists(db, "daily_stock_summary")) {
      try {
        const rows = db
          .prepare(
            `SELECT
              trade_date AS date,
              open_price AS open,
              high_price AS high,
              low_price AS low,
              close_price AS close,
              total_volume AS volume,
              CASE WHEN total_volume > 0 THEN ROUND(total_turnover / total_volume, 2) ELSE close_price END AS vwap
            FROM daily_stock_summary
            WHERE UPPER(symbol) = ? AND COALESCE(calendar_status, 'VALID') != 'PARTIAL_SESSION'
            ORDER BY trade_date DESC
            LIMIT 60`
          )
          .all(validSymbol) as Array<Record<string, unknown>>;

        if (rows.length > 0) {
          historicalCandles = rows
            .map((r) => ({
              date: String(r.date ?? ""),
              open: safeNum(r.open, 0),
              high: safeNum(r.high, 0),
              low: safeNum(r.low, 0),
              close: safeNum(r.close, 0),
              volume: safeNum(r.volume, 0),
              vwap: safeNum(r.vwap ?? r.close, 0),
            }))
            .reverse();
        }
      } catch {
        // Ignore fallback error
      }
    }
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
          rawFloorsheetContracts = db
            .prepare(
              `SELECT
                contract_no AS contractNo,
                symbol,
                trade_date AS tradeDate,
                trade_time AS tradeTime,
                buyer_broker AS buyerBroker,
                seller_broker AS sellerBroker,
                kitta,
                rate,
                amount
              FROM floorsheet_contracts
              WHERE UPPER(symbol) = ? AND trade_date = ?
              ORDER BY trade_time DESC, contract_no DESC
              LIMIT 500`
            )
            .all(validSymbol, latestSessionRow.latest_date) as RawFloorsheetContract[];
=======
          rawFloorsheetContracts = db
            .prepare(
              `SELECT
                contract_no AS contractNo,
                symbol,
                trade_date AS tradeDate,
                trade_time AS tradeTime,
                buyer_broker AS buyerBroker,
                seller_broker AS sellerBroker,
                kitta,
                rate,
                amount,
                aggressor_side AS aggressor
              FROM floorsheet_contracts
              WHERE UPPER(symbol) = ? AND trade_date = ?
              ORDER BY trade_time DESC, contract_no DESC
              LIMIT 25000`
            )
            .all(validSymbol, latestSessionRow.latest_date) as RawFloorsheetContract[];
>>>>>>> REPLACE
```

---

### PATCH 1.7: `src/hooks/useUnifiedStockTelemetry.ts`
**Fixes:** Prevent cross-symbol stale data and async abort race conditions.

```typescript
<<<<<<< SEARCH
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/stocks/${encodeURIComponent(validSymbol)}/telemetry`,
          {
            signal,
            cache: "no-store",
          }
        );
        const json = (await res.json()) as AtomicStockTelemetryApiResponse & {
          error?: string;
        };

        if (!res.ok || !json.ok) {
          throw new Error(json.error || `Failed to load telemetry for ${validSymbol}`);
        }
        setData(json);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setError(
            err instanceof Error ? err.message : "Telemetry synchronization failed"
          );
        }
      } finally {
        setLoading(false);
      }
=======
      setLoading(true);
      setError(null);
      setData((prev) => (prev && prev.symbol === validSymbol ? prev : null));

      try {
        const res = await fetch(
          `/api/stocks/${encodeURIComponent(validSymbol)}/telemetry`,
          {
            signal,
            cache: "no-store",
          }
        );
        const json = (await res.json()) as AtomicStockTelemetryApiResponse & {
          error?: string;
        };

        if (!res.ok || !json.ok) {
          throw new Error(json.error || `Failed to load telemetry for ${validSymbol}`);
        }
        if (!signal?.aborted) {
          setData(json);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError" && !signal?.aborted) {
          setError(
            err instanceof Error ? err.message : "Telemetry synchronization failed"
          );
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
>>>>>>> REPLACE
```

---

## PART 2: BROKER FLOW, SMART MONEY & SERVICE HUB INTERFACE

### PATCH 2.1: `src/utils/sharedBrokerAggregationEngine.js`
**Fixes:** Contract deduplication in Path 1, zero-volume trade count inflation in Paths 2 & 3, 2x volume double-counting in Path 4 (`bVol + sVol`), and exact VWAP calculation for `bigBrokerVWAP`.

```javascript
<<<<<<< SEARCH
  // PATH 1: Raw floorsheet contracts provided
  if (rawTrades.length > 0) {
    const symbolTrades = rawTrades.filter(t => {
      const s = String(t.symbol || t.stockSymbol || t.contractSymbol || '').toUpperCase().trim();
      return !normSym || !s || s === normSym;
    });

    for (const t of symbolTrades) {
      const qty = Math.round(Number(t.quantity || t.qty || t.kitta || t.contractQuantity || 0));
      const rate = Number(t.rate || t.price || t.contractRate || 0);
      const amt = Number(t.amount || t.contractAmount || (qty * rate) || 0);
      const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || t.buyerMemberId || '').replace(/^0+/, '').trim();
      const sId = String(t.seller || t.sellerBroker || t.seller_broker || t.sellerMemberId || '').replace(/^0+/, '').trim();
      const isCross = Boolean(bId && sId && bId === sId);

      if (qty <= 0) continue;
=======
  // PATH 1: Raw floorsheet contracts provided
  if (rawTrades.length > 0) {
    const symbolTrades = rawTrades.filter(t => {
      const s = String(t.symbol || t.stockSymbol || t.contractSymbol || '').toUpperCase().trim();
      return !normSym || !s || s === normSym;
    });

    const seenContracts = new Set();
    for (const t of symbolTrades) {
      const cid = String(t.contractId ?? t.contract_no ?? t.contractNo ?? t.id ?? '').trim();
      if (cid) {
        if (seenContracts.has(cid)) continue;
        seenContracts.add(cid);
      }

      const qty = Math.round(Number(t.quantity || t.qty || t.kitta || t.contractQuantity || 0));
      const rate = Number(t.rate || t.price || t.contractRate || 0);
      const rawAmt = Number(t.amount || t.contractAmount || 0);
      const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
      const amt = (expectedAmt > 0 && (rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
        ? expectedAmt
        : (rawAmt > 0 ? rawAmt : expectedAmt);
      const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || t.buyerMemberId || '').replace(/^0+/, '').trim();
      const sId = String(t.seller || t.sellerBroker || t.seller_broker || t.sellerMemberId || '').replace(/^0+/, '').trim();
      const isCross = Boolean(bId && sId && bId === sId);

      if (qty <= 0) continue;
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.crossVol = (prev.crossVol || 0) + bCross;
        prev.nonCrossBuyVol += nonCrossB;
        prev.nonCrossSellVol += nonCrossS;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        prev.sellTrades += Number(b.sellTrades || b.trades || 1);

        totalNonCrossBuyVol += nonCrossB;
        totalNonCrossSellVol += nonCrossS;
      }
    }
    if (totalNonCrossBuyVol === 0) totalNonCrossBuyVol = totalVolume;
    if (totalNonCrossSellVol === 0) totalNonCrossSellVol = totalVolume;
  }
  // PATH 3: dailyLedgerRows (direct SQLite rows) provided
  else if (dailyLedgerRows.length > 0) {
    for (const r of dailyLedgerRows) {
      if (r.calendarStatus === 'PARTIAL_SESSION' || r.calendar_status === 'PARTIAL_SESSION' || r.trade_date === '2026-10-25' || r.tradeDate === '2026-10-25') {
        continue;
      }
      const bId = String(r.brokerId || r.broker || r.broker_id || r.broker_no || '').replace(/^0+/, '').trim();
      if (!bId) continue;

      const bVol = Number(r.buyVol || r.buy_vol || r.buyKitta || r.buy_kitta || 0);
      const sVol = Number(r.sellVol || r.sell_vol || r.sellKitta || r.sell_kitta || 0);
      const bAmt = Number(r.buyAmt || r.buy_amt || r.buyAmount || r.buy_amount || 0);
      const sAmt = Number(r.sellAmt || r.sell_amt || r.sellAmount || r.sell_amount || 0);
      const crossVol = Number(r.crossVol || r.cross_vol || 0);
      const nonCrossB = Math.max(0, bVol - crossVol);
      const nonCrossS = Math.max(0, sVol - crossVol);

      totalVolume += bVol;
      totalTurnover += bAmt;

      if (!brokerMap.has(bId)) {
        brokerMap.set(bId, {
          brokerId: bId,
          brokerName: getBrokerName(bId),
          buyVol: 0,
          sellVol: 0,
          crossVol: 0,
          nonCrossBuyVol: 0,
          nonCrossSellVol: 0,
          buyAmt: 0,
          sellAmt: 0,
          buyTrades: 0,
          sellTrades: 0
        });
      }
      const prev = brokerMap.get(bId);
      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.crossVol = (prev.crossVol || 0) + crossVol;
      prev.nonCrossBuyVol += nonCrossB;
      prev.nonCrossSellVol += nonCrossS;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;
      prev.buyTrades += Number(r.trades || 1);
      prev.sellTrades += Number(r.trades || 1);

      totalNonCrossBuyVol += nonCrossB;
      totalNonCrossSellVol += nonCrossS;
    }
    // When non-cross total is 0, do NOT fallback to totalVolume (Part D)
  }
  // PATH 4: realBrokerAnalysis / cached broker data provided
  else if (params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis) {
    const rba = params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
    const rawBuyers = Array.isArray(rba?.topBuyers) ? rba.topBuyers : (Array.isArray(rba?.topBuyerBrokers) ? rba.topBuyerBrokers : []);
    const rawSellers = Array.isArray(rba?.topSellers) ? rba.topSellers : (Array.isArray(rba?.topSellerBrokers) ? rba.topSellerBrokers : []);
    const brokersList = Array.isArray(rba?.brokers) && rba.brokers.length > 0 ? rba.brokers : [...rawBuyers, ...rawSellers];

    if (brokersList.length > 0) {
      for (const b of brokersList) {
        const bId = String(b.brokerId || b.broker || b.id || b.brokerNo || '').replace(/^0+/, '').trim();
        if (!bId) continue;
        const bVol = Number(b.buyVol || b.buyQty || b.shares || (b.sellQty ? 0 : b.volume) || 0);
        const sVol = Number(b.sellVol || b.sellQty || 0);
        const bAmt = Number(b.buyAmt ?? b.buyAmount ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)) ?? 0);
        const sAmt = Number(b.sellAmt ?? b.sellAmount ?? (sVol * Number(b.avgSellPrice || b.rate || 0)) ?? 0);
        totalVolume += (bVol + sVol);
        totalTurnover += (bAmt + sAmt);
        if (!brokerMap.has(bId)) {
          brokerMap.set(bId, {
            brokerId: bId,
            brokerName: b.brokerName || b.name || getBrokerName(bId),
            buyVol: 0,
            sellVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const prev = brokerMap.get(bId);
        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.nonCrossBuyVol += bVol;
        prev.nonCrossSellVol += sVol;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        prev.sellTrades += Number(b.sellTrades || b.trades || 1);
      }
      totalNonCrossBuyVol = totalVolume;
      totalNonCrossSellVol = totalVolume;
    }
  }
=======
        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.crossVol = (prev.crossVol || 0) + bCross;
        prev.nonCrossBuyVol += nonCrossB;
        prev.nonCrossSellVol += nonCrossS;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        if (bVol > 0) prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        if (sVol > 0) prev.sellTrades += Number(b.sellTrades || b.trades || 1);

        totalNonCrossBuyVol += nonCrossB;
        totalNonCrossSellVol += nonCrossS;
      }
    }
    if (totalNonCrossBuyVol === 0 && crossVolume === 0) totalNonCrossBuyVol = totalVolume;
    if (totalNonCrossSellVol === 0 && crossVolume === 0) totalNonCrossSellVol = totalVolume;
  }
  // PATH 3: dailyLedgerRows (direct SQLite rows) provided
  else if (dailyLedgerRows.length > 0) {
    for (const r of dailyLedgerRows) {
      if (r.calendarStatus === 'PARTIAL_SESSION' || r.calendar_status === 'PARTIAL_SESSION' || r.trade_date === '2026-10-25' || r.tradeDate === '2026-10-25') {
        continue;
      }
      const bId = String(r.brokerId || r.broker || r.broker_id || r.broker_no || '').replace(/^0+/, '').trim();
      if (!bId) continue;

      const bVol = Number(r.buyVol || r.buy_vol || r.buyKitta || r.buy_kitta || 0);
      const sVol = Number(r.sellVol || r.sell_vol || r.sellKitta || r.sell_kitta || 0);
      const bAmt = Number(r.buyAmt || r.buy_amt || r.buyAmount || r.buy_amount || 0);
      const sAmt = Number(r.sellAmt || r.sell_amt || r.sellAmount || r.sell_amount || 0);
      const crossVol = Number(r.crossVol || r.cross_vol || 0);
      const nonCrossB = Math.max(0, bVol - crossVol);
      const nonCrossS = Math.max(0, sVol - crossVol);

      totalVolume += bVol;
      totalTurnover += bAmt;

      if (!brokerMap.has(bId)) {
        brokerMap.set(bId, {
          brokerId: bId,
          brokerName: getBrokerName(bId),
          buyVol: 0,
          sellVol: 0,
          crossVol: 0,
          nonCrossBuyVol: 0,
          nonCrossSellVol: 0,
          buyAmt: 0,
          sellAmt: 0,
          buyTrades: 0,
          sellTrades: 0
        });
      }
      const prev = brokerMap.get(bId);
      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.crossVol = (prev.crossVol || 0) + crossVol;
      prev.nonCrossBuyVol += nonCrossB;
      prev.nonCrossSellVol += nonCrossS;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;
      if (bVol > 0) prev.buyTrades += Number(r.buyTrades || r.trades || 1);
      if (sVol > 0) prev.sellTrades += Number(r.sellTrades || r.trades || 1);

      totalNonCrossBuyVol += nonCrossB;
      totalNonCrossSellVol += nonCrossS;
    }
    // When non-cross total is 0, do NOT fallback to totalVolume (Part D)
  }
  // PATH 4: realBrokerAnalysis / cached broker data provided
  else if (params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis) {
    const rba = params.realBrokerAnalysis || stockSummary?.realBrokerAnalysis || stockSummary?.brokerAnalysis;
    const rawBuyers = Array.isArray(rba?.topBuyers) ? rba.topBuyers : (Array.isArray(rba?.topBuyerBrokers) ? rba.topBuyerBrokers : []);
    const rawSellers = Array.isArray(rba?.topSellers) ? rba.topSellers : (Array.isArray(rba?.topSellerBrokers) ? rba.topSellerBrokers : []);
    const brokersList = Array.isArray(rba?.brokers) && rba.brokers.length > 0 ? rba.brokers : [...rawBuyers, ...rawSellers];

    if (brokersList.length > 0) {
      let sumBuyVol = 0;
      let sumSellVol = 0;
      let sumBuyAmt = 0;
      let sumSellAmt = 0;
      for (const b of brokersList) {
        const bId = String(b.brokerId || b.broker || b.id || b.brokerNo || '').replace(/^0+/, '').trim();
        if (!bId) continue;
        const bVol = Number(b.buyVol || b.buyQty || b.buyKitta || b.shares || (b.sellQty || b.sellKitta ? 0 : b.volume) || 0);
        const sVol = Number(b.sellVol || b.sellQty || b.sellKitta || 0);
        const bAmt = Number(b.buyAmt ?? b.buyAmount ?? (bVol * Number(b.avgBuyPrice || b.avgBuyRate || b.rate || 0)) ?? 0);
        const sAmt = Number(b.sellAmt ?? b.sellAmount ?? (sVol * Number(b.avgSellPrice || b.avgSellRate || b.rate || 0)) ?? 0);
        const bCross = Number(b.crossVol || b.cross_vol || 0);
        const nonCrossB = Math.max(0, bVol - bCross);
        const nonCrossS = Math.max(0, sVol - bCross);

        sumBuyVol += bVol;
        sumSellVol += sVol;
        sumBuyAmt += bAmt;
        sumSellAmt += sAmt;

        if (!brokerMap.has(bId)) {
          brokerMap.set(bId, {
            brokerId: bId,
            brokerName: b.brokerName || b.name || getBrokerName(bId),
            buyVol: 0,
            sellVol: 0,
            crossVol: 0,
            nonCrossBuyVol: 0,
            nonCrossSellVol: 0,
            buyAmt: 0,
            sellAmt: 0,
            buyTrades: 0,
            sellTrades: 0
          });
        }
        const prev = brokerMap.get(bId);
        prev.buyVol += bVol;
        prev.sellVol += sVol;
        prev.crossVol += bCross;
        prev.nonCrossBuyVol += nonCrossB;
        prev.nonCrossSellVol += nonCrossS;
        prev.buyAmt += bAmt;
        prev.sellAmt += sAmt;
        if (bVol > 0) prev.buyTrades += Number(b.buyTrades || b.trades || 1);
        if (sVol > 0) prev.sellTrades += Number(b.sellTrades || b.trades || 1);

        totalNonCrossBuyVol += nonCrossB;
        totalNonCrossSellVol += nonCrossS;
      }
      // Do NOT sum buyVol + sellVol (which doubles market volume); use authoritative totalVolume or max(sumBuyVol, sumSellVol)
      totalVolume = Number(rba?.totalVolume || rba?.summary?.totalVolume || 0) || Math.max(sumBuyVol, sumSellVol);
      totalTurnover = Number(rba?.totalTurnover || rba?.summary?.totalTurnover || rba?.summary?.totalAmount || 0) || Math.max(sumBuyAmt, sumSellAmt);
      if (totalNonCrossBuyVol === 0) totalNonCrossBuyVol = totalVolume;
      if (totalNonCrossSellVol === 0) totalNonCrossSellVol = totalVolume;
    }
  }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  const marketVWAP = totalVolume > 0 ? Number((totalTurnover / totalVolume).toFixed(2)) : 0;
  const top5NetTurnover = topAccumulators.slice(0, 5).reduce((sum, b) => sum + (b.netQty * b.avgBuyPrice), 0);
  const bigBrokerVWAP = top5NetBuyVol > 0 ? Number((top5NetTurnover / top5NetBuyVol).toFixed(2)) : marketVWAP;
=======
  const marketVWAP = totalVolume > 0 ? Number((totalTurnover / totalVolume).toFixed(2)) : 0;
  const top5GrossBuyAmt = topAccumulators.slice(0, 5).reduce((sum, b) => sum + b.buyAmt, 0);
  const top5GrossBuyQty = topAccumulators.slice(0, 5).reduce((sum, b) => sum + b.buyVol, 0);
  const bigBrokerVWAP = top5GrossBuyQty > 0 ? Number((top5GrossBuyAmt / top5GrossBuyQty).toFixed(2)) : marketVWAP;
>>>>>>> REPLACE
```

---

### PATCH 2.2: `proxy/utils/microstructureEngine.js`
**Fixes:** Always-true `sessionsWithPositiveSmartFlow`, cross-trade exclusion from concentration ratios, duplicate broker split in `buildDailyHistoryFromStockData`, and `if / else if` fallthrough in `evaluateEarlyIgnition`.

```javascript
<<<<<<< SEARCH
      const bVol = Math.max(0, Number(b.buyVol || b.buyQty || b.shares || 0));
      const sVol = Math.max(0, Number(b.sellVol || b.sellQty || 0));
      const bAmt = bVol > 0
        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 && b.amount ? b.amount : 0) ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)))
        : 0;
      const sAmt = sVol > 0
        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 && b.amount ? b.amount : 0) ?? (sVol * Number(b.avgSellPrice || b.rate || 0)))
        : 0;

      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;

      prev.dailySeries.push({
        date: dt,
        buyVol: bVol,
        sellVol: sVol,
        netVol: bVol - sVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        avgBuyPrice: bVol > 0 ? Number((bAmt / bVol).toFixed(2)) : 0,
        avgSellPrice: sVol > 0 ? Number((sAmt / sVol).toFixed(2)) : 0,
        close: Number(day.closePrice || day.close || day.ltp || 0)
      });

      brokerLedger.set(brokerId, prev);

      dayTopBuyerVol += bVol;
      dayTopSellerVol += sVol;
    }

    if (dayTopBuyerVol >= dayTopSellerVol && dayTopBuyerVol > 0) {
      sessionsWithPositiveSmartFlow++;
    }
  }
=======
      const bVol = Math.max(0, Number(b.buyVol || b.buyQty || b.shares || 0));
      const sVol = Math.max(0, Number(b.sellVol || b.sellQty || 0));
      const cVol = Math.max(0, Number(b.crossVol || b.cross_vol || 0));
      const bAmt = bVol > 0
        ? Number(b.buyAmt ?? b.buyAmount ?? (sVol === 0 && b.amount ? b.amount : 0) ?? (bVol * Number(b.avgBuyPrice || b.rate || 0)))
        : 0;
      const sAmt = sVol > 0
        ? Number(b.sellAmt ?? b.sellAmount ?? (bVol === 0 && b.amount ? b.amount : 0) ?? (sVol * Number(b.avgSellPrice || b.rate || 0)))
        : 0;

      prev.buyVol += bVol;
      prev.sellVol += sVol;
      prev.crossVol = (prev.crossVol || 0) + cVol;
      prev.buyAmt += bAmt;
      prev.sellAmt += sAmt;

      prev.dailySeries.push({
        date: dt,
        buyVol: bVol,
        sellVol: sVol,
        crossVol: cVol,
        netVol: bVol - sVol,
        buyAmt: bAmt,
        sellAmt: sAmt,
        avgBuyPrice: bVol > 0 ? Number((bAmt / bVol).toFixed(2)) : 0,
        avgSellPrice: sVol > 0 ? Number((sAmt / sVol).toFixed(2)) : 0,
        close: Number(day.closePrice || day.close || day.ltp || 0)
      });

      brokerLedger.set(brokerId, prev);
    }

    // Compare Top 3 Net Buyers vs Top 3 Net Sellers for this session (not total buy vs total sell which is always equal)
    const sessionNets = (day.brokers || []).map(b => Number(b.buyVol || b.buyQty || 0) - Number(b.sellVol || b.sellQty || 0));
    dayTopBuyerVol = sessionNets.filter(n => n > 0).sort((a, b) => b - a).slice(0, 3).reduce((s, n) => s + n, 0);
    dayTopSellerVol = sessionNets.filter(n => n < 0).sort((a, b) => a - b).slice(0, 3).reduce((s, n) => s + Math.abs(n), 0);

    if (dayTopBuyerVol > dayTopSellerVol && dayTopBuyerVol > 0) {
      sessionsWithPositiveSmartFlow++;
    }
  }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  const top3GrossBuyVol = topGrossBuyers.slice(0, 3).reduce((sum, b) => sum + b.buyVol, 0);
  const top5GrossBuyVol = topGrossBuyers.slice(0, 5).reduce((sum, b) => sum + b.buyVol, 0);
  const top3GrossSellVol = topGrossSellers.slice(0, 3).reduce((sum, s) => sum + s.sellVol, 0);

  const bcr3NetPct = Number(((top3NetBuyVol / totalVolume) * 100).toFixed(1));
  const bcr5NetPct = Number(((top5NetBuyVol / totalVolume) * 100).toFixed(1));
  const scr3NetPct = Number(((top3NetSellVol / totalVolume) * 100).toFixed(1));

  const bcr3BuyPct = Number(((top3GrossBuyVol / totalVolume) * 100).toFixed(1));
  const bcr5BuyPct = Number(((top5GrossBuyVol / totalVolume) * 100).toFixed(1));
  const scr3SellPct = Number(((top3GrossSellVol / totalVolume) * 100).toFixed(1));
=======
  const totalCrossVol = brokersArray.reduce((sum, b) => sum + Number(b.crossVol || 0), 0);
  const nonCrossMarketVol = Math.max(1, totalVolume - totalCrossVol);

  const top3GrossBuyVol = topGrossBuyers.slice(0, 3).reduce((sum, b) => sum + Math.max(0, b.buyVol - Number(b.crossVol || 0)), 0);
  const top5GrossBuyVol = topGrossBuyers.slice(0, 5).reduce((sum, b) => sum + Math.max(0, b.buyVol - Number(b.crossVol || 0)), 0);
  const top3GrossSellVol = topGrossSellers.slice(0, 3).reduce((sum, s) => sum + Math.max(0, s.sellVol - Number(s.crossVol || 0)), 0);

  const bcr3NetPct = Number(((top3NetBuyVol / nonCrossMarketVol) * 100).toFixed(1));
  const bcr5NetPct = Number(((top5NetBuyVol / nonCrossMarketVol) * 100).toFixed(1));
  const scr3NetPct = Number(((top3NetSellVol / nonCrossMarketVol) * 100).toFixed(1));

  const bcr3BuyPct = Number(Math.min(100, (top3GrossBuyVol / nonCrossMarketVol) * 100).toFixed(1));
  const bcr5BuyPct = Number(Math.min(100, (top5GrossBuyVol / nonCrossMarketVol) * 100).toFixed(1));
  const scr3SellPct = Number(Math.min(100, (top3GrossSellVol / nonCrossMarketVol) * 100).toFixed(1));
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  // 2. Single-Session Fallback (Strictly 1-Day Authentic Snapshot — NEVER clone Day 1 brokers onto past candles!)
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers)
    ? realBrokerAnalysis.brokers
    : [
        ...(realBrokerAnalysis?.topBuyers || []).map(b => ({
          ...b,
          buyQty: Number(b.volume ?? b.buyQty ?? b.shares ?? 0),
          sellQty: 0,
          buyAmt: Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? 0),
          sellAmt: 0,
        })),
        ...(realBrokerAnalysis?.topSellers || []).map(s => ({
          ...s,
          buyQty: 0,
          sellQty: Number(s.volume ?? s.sellQty ?? s.shares ?? 0),
          buyAmt: 0,
          sellAmt: Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? 0),
        }))
      ];
=======
  // 2. Single-Session Fallback (Strictly 1-Day Authentic Snapshot — merge topBuyers & topSellers by brokerId so netVol = buyVol - sellVol)
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers) && realBrokerAnalysis.brokers.length > 0
    ? realBrokerAnalysis.brokers
    : (() => {
        const merged = new Map();
        for (const b of (realBrokerAnalysis?.topBuyers || [])) {
          const id = String(b.broker || b.brokerId || b.id || '').trim();
          if (!id) continue;
          const cur = merged.get(id) || { brokerId: id, brokerName: b.brokerName || b.name, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
          cur.buyQty += Number(b.buyQty ?? b.buyKitta ?? b.volume ?? b.shares ?? 0);
          cur.buyAmt += Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? 0);
          merged.set(id, cur);
        }
        for (const s of (realBrokerAnalysis?.topSellers || [])) {
          const id = String(s.broker || s.brokerId || s.id || '').trim();
          if (!id) continue;
          const cur = merged.get(id) || { brokerId: id, brokerName: s.brokerName || s.name, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
          cur.sellQty += Number(s.sellQty ?? s.sellKitta ?? s.volume ?? s.shares ?? 0);
          cur.sellAmt += Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? 0);
          merged.set(id, cur);
        }
        return Array.from(merged.values());
      })();
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  let ignitionStage = 'NEUTRAL_ACCUMULATION';
  let stageLabel = 'Neutral / No Ignition';
  let stageBadge = '⚪ Neutral / Base';
  let ignitionScore = 45;
  let entrySignal = 'WAIT';
  let tacticalAdvice = 'Normal trading flow. No active early ignition impulse detected.';

  if (isWashTrap) {
    ignitionStage = 'WASH_CHURN_TRAP';
    stageLabel = 'Fake Wash Churn Trap';
    stageBadge = '🚨 Fake Wash Churn';
    ignitionScore = Math.max(10, Math.round(30 - (scr3NetPct * 0.5)));
    entrySignal = 'AVOID_TRAP';
    tacticalAdvice = `High churn circular volume detected with low net retention (${avgGrossRetention}% retention, SCR3: ${scr3NetPct}%). Operators offloading into retail liquidity.`;
  }
  // STAGE 2: Prime Ignition Entry (Supply Vacuum Ignition)
  else if (
    rvol3d >= 1.6 &&
    smh3dPct >= 18 &&
    t2RetentionPct >= 85 &&
    priceChange3dPct >= 1.0 &&
    priceChange3dPct <= 6.5 &&
    operatorProfitMargin3d <= 6.0
  ) {
    ignitionStage = 'STAGE_2_SUPPLY_VACUUM_IGNITION';
    stageLabel = 'Day 3 Prime Ignition Entry';
    stageBadge = '⚡ Day 3 Prime Ignition Entry';
    ignitionScore = Math.min(100, Math.round(85 + (smh3dPct * 0.4) + (rvol3d * 3)));
    entrySignal = 'PRIME_BUY';
    tacticalAdvice = `Supply vacuum confirmed! Smart money holding +${smh3dPct}% with ${t2RetentionPct}% T+2 retention. Operator margin is tight (+${operatorProfitMargin3d}%). Prime early entry window before public breakout.`;
  }
  // Single-day or 3-day spike under the ±15% circuit limit
  const day0PriceChange = Array.isArray(dailyHistory) && dailyHistory.length > 0
    ? Number(dailyHistory[0]?.priceChangePct || dailyHistory[0]?.pChange || 0)
    : 0;
  const isLargeSpike = day0PriceChange > 9.0 || priceChange3dPct > 9.0;
  const isNearCircuit = priceChange3dPct >= 12.5 || day0PriceChange >= 12.5;
  const isCircuitLocked = priceChange3dPct >= 14.8 || day0PriceChange >= 14.8;

  // STAGE 3: Breakout / Gap-Up Markup in Progress (Evaluated before Stealth Seeding to catch >9% spikes)
  if (
    isLargeSpike ||
    (priceChange3dPct > 6.5 && smh3dPct >= 15)
  ) {
=======
  // Single-day or 3-day spike under the ±15% circuit limit
  const day0PriceChange = Array.isArray(dailyHistory) && dailyHistory.length > 0
    ? Number(dailyHistory[0]?.priceChangePct || dailyHistory[0]?.pChange || 0)
    : 0;
  const isLargeSpike = day0PriceChange > 9.0 || priceChange3dPct > 9.0;
  const isNearCircuit = priceChange3dPct >= 12.5 || day0PriceChange >= 12.5;
  const isCircuitLocked = priceChange3dPct >= 14.8 || day0PriceChange >= 14.8;

  let ignitionStage = 'NEUTRAL_ACCUMULATION';
  let stageLabel = 'Neutral / No Ignition';
  let stageBadge = '⚪ Neutral / Base';
  let ignitionScore = 45;
  let entrySignal = 'WAIT';
  let tacticalAdvice = 'Normal trading flow. No active early ignition impulse detected.';

  if (isWashTrap) {
    ignitionStage = 'WASH_CHURN_TRAP';
    stageLabel = 'Fake Wash Churn Trap';
    stageBadge = '🚨 Fake Wash Churn';
    ignitionScore = Math.max(10, Math.round(30 - (scr3NetPct * 0.5)));
    entrySignal = 'AVOID_TRAP';
    tacticalAdvice = `High churn circular volume detected with low net retention (${avgGrossRetention}% retention, SCR3: ${scr3NetPct}%). Operators offloading into retail liquidity.`;
  }
  // STAGE 2: Prime Ignition Entry (Supply Vacuum Ignition)
  else if (
    !isLargeSpike &&
    rvol3d >= 1.6 &&
    smh3dPct >= 18 &&
    t2RetentionPct >= 85 &&
    priceChange3dPct >= 1.0 &&
    priceChange3dPct <= 6.5 &&
    operatorProfitMargin3d <= 6.0
  ) {
    ignitionStage = 'STAGE_2_SUPPLY_VACUUM_IGNITION';
    stageLabel = 'Day 3 Prime Ignition Entry';
    stageBadge = '⚡ Day 3 Prime Ignition Entry';
    ignitionScore = Math.min(100, Math.round(85 + (smh3dPct * 0.4) + (rvol3d * 3)));
    entrySignal = 'PRIME_BUY';
    tacticalAdvice = `Supply vacuum confirmed! Smart money holding +${smh3dPct}% with ${t2RetentionPct}% T+2 retention. Operator margin is tight (+${operatorProfitMargin3d}%). Prime early entry window before public breakout.`;
  }
  // STAGE 3: Breakout / Gap-Up Markup in Progress (Evaluated as else-if so it never clobbers Stage 2 or Wash Trap)
  else if (
    isLargeSpike ||
    (priceChange3dPct > 6.5 && smh3dPct >= 15)
  ) {
>>>>>>> REPLACE
```

---

### PATCH 2.3: `src/utils/microstructureEngine.js`
**Fixes:** Align return fields (`topHoldings`, `totalSharesHeldTillNow`, `avgAccumulatorBuyPrice`, `avgDistributorSellPrice`, `summary`, `availableDates`) with `StockDetailModal.jsx`, and fix `buildDailyHistoryFromStockData` and `evaluateEarlyIgnition`.

```javascript
<<<<<<< SEARCH
  return {
    ...agg,
    timeframeDays: actualDays,
    scopeLabel:
      actualDays < days
        ? `INCOMPLETE HISTORY: ${actualDays} of ${days} sessions`
        : (actualDays === 1
            ? `Latest Trading Session (${windowData[0]?.date || "1D"}) — Intraday Microstructure`
            : `Cumulative ${actualDays}-Day Window — Institutional Trend & Absorption`),
    historyWarning: actualDays < days ? `INCOMPLETE HISTORY: ${actualDays} of ${days} sessions` : null,
    isHistoryIncomplete: actualDays < days,
    buyZoneMin,
    buyZoneMax,
    entryStatus,
    entryDescription,
    topBuyers: agg.topAccumulators,
    topSellers: agg.topDistributors,
    topAccumulators: agg.topAccumulators,
    topDistributors: agg.topDistributors,
    totalBuyersCount: agg.topAccumulators.length,
    totalSellersCount: agg.topDistributors.length,
    topGrossBuyers: agg.topGrossBuyers.map(b => ({
      ...b,
      pct: Number(((b.buyVol / (agg.totalVolume || 1)) * 100).toFixed(1))
    })),
    topGrossSellers: agg.topGrossSellers.map(s => ({
      ...s,
      pct: Number(((s.sellVol / (agg.totalVolume || 1)) * 100).toFixed(1))
    })),
    top5NetInflowAmt,
    top5NetOutflowAmt,
    smartMoneyNetInflowAmt,
    leadAccumulator,
    leadDistributor,
    isSyndicateCoAccumulation,
    syndicateBrokers: activeSyndicateBrokers.slice(0, 5).map(b => b.brokerId),
    allBrokers: agg.allBrokers,
    brokers: agg.allBrokers,
    dailyFlow
  };
=======
  const availableDates = Array.from(
    new Set(
      dailyHistory
        .map((d) => String(d.date || d.trade_date || d.businessDate || ''))
        .filter(Boolean)
    )
  ).sort().reverse().slice(0, 30);

  const totalSharesHeldTillNow = agg.topAccumulators.reduce((s, b) => s + Math.max(0, Number(b.netQty ?? b.netVol ?? 0)), 0);
  const topHoldings = agg.topAccumulators.map((b) => ({
    ...b,
    holdQty: b.netQty,
    holdAmt: Math.max(0, b.netAmt),
    buyQty: b.buyVol,
    sellQty: b.sellVol,
    avgBuyRate: b.avgBuyPrice,
    avgSellRate: b.avgSellPrice,
    shareOfTotalHoldPct: totalSharesHeldTillNow > 0 ? Number(((b.netQty / totalSharesHeldTillNow) * 100).toFixed(1)) : 0,
    shareOfTotalVol: agg.totalVolume > 0 ? Number(((b.buyVol / agg.totalVolume) * 100).toFixed(1)) : 0
  }));

  const topHolder = topHoldings[0] || null;
  const accBuyVol = agg.topAccumulators.reduce((s, b) => s + b.buyVol, 0);
  const accBuyAmt = agg.topAccumulators.reduce((s, b) => s + b.buyAmt, 0);
  const avgAccumulatorBuyPrice = accBuyVol > 0 ? Number((accBuyAmt / accBuyVol).toFixed(2)) : (topHolder?.avgBuyRate || agg.marketVWAP);

  const distSellVol = agg.topDistributors.reduce((s, b) => s + b.sellVol, 0);
  const distSellAmt = agg.topDistributors.reduce((s, b) => s + b.sellAmt, 0);
  const avgDistributorSellPrice = distSellVol > 0 ? Number((distSellAmt / distSellVol).toFixed(2)) : (agg.topDistributors[0]?.avgSellPrice || agg.marketVWAP);

  return {
    ...agg,
    timeframeDays: actualDays,
    scopeLabel:
      actualDays < days
        ? `INCOMPLETE HISTORY: ${actualDays} of ${days} sessions`
        : (actualDays === 1
            ? `Latest Trading Session (${windowData[0]?.date || "1D"}) — Intraday Microstructure`
            : `Cumulative ${actualDays}-Day Window — Institutional Trend & Absorption`),
    historyWarning: actualDays < days ? `INCOMPLETE HISTORY: ${actualDays} of ${days} sessions` : null,
    isHistoryIncomplete: actualDays < days,
    buyZoneMin,
    buyZoneMax,
    entryStatus,
    entryDescription,
    topBuyers: agg.topAccumulators,
    topSellers: agg.topDistributors,
    topAccumulators: agg.topAccumulators,
    topDistributors: agg.topDistributors,
    totalBuyersCount: agg.topAccumulators.length,
    totalSellersCount: agg.topDistributors.length,
    topGrossBuyers: agg.topGrossBuyers.map(b => ({
      ...b,
      pct: Number(((b.buyVol / (agg.totalVolume || 1)) * 100).toFixed(1))
    })),
    topGrossSellers: agg.topGrossSellers.map(s => ({
      ...s,
      pct: Number(((s.sellVol / (agg.totalVolume || 1)) * 100).toFixed(1))
    })),
    top5NetInflowAmt,
    top5NetOutflowAmt,
    smartMoneyNetInflowAmt,
    leadAccumulator,
    leadDistributor,
    isSyndicateCoAccumulation,
    syndicateBrokers: activeSyndicateBrokers.slice(0, 5).map(b => b.brokerId),
    allBrokers: agg.allBrokers,
    brokers: agg.allBrokers,
    dailyFlow,
    dateWiseBrokers: dailyFlow,
    availableDates,
    fromDate: windowData[windowData.length - 1]?.date || '',
    toDate: windowData[0]?.date || '',
    tradingDays: actualDays,
    topHoldings,
    totalSharesHeldTillNow,
    topHoldingBroker: topHolder?.brokerId || null,
    avgAccumulatorBuyPrice,
    avgBuyingPrice: avgAccumulatorBuyPrice,
    avgDistributorSellPrice,
    avgSellingPrice: avgDistributorSellPrice,
    summary: {
      totalVolume: agg.totalVolume,
      totalTurnover: agg.totalTurnover,
      vwap: agg.marketVWAP,
      totalHoldQty: totalSharesHeldTillNow,
      totalSharesHeldTillNow,
      topHoldingBroker: topHolder?.brokerId || null,
      avgAccumulatorBuyPrice,
      avgBuyingPrice: avgAccumulatorBuyPrice,
      avgDistributorSellPrice,
      avgSellingPrice: avgDistributorSellPrice
    }
  };
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  // 2. Single-Session Fallback (Strictly 1-Day Authentic Snapshot — NEVER clone Day 1 brokers onto past candles!)
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers)
    ? realBrokerAnalysis.brokers
    : [
        ...(realBrokerAnalysis?.topBuyers || []).map(b => ({
          ...b,
          buyQty: Number(b.volume ?? b.buyQty ?? b.shares ?? 0),
          sellQty: 0,
          buyAmt: Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? 0),
          sellAmt: 0,
        })),
        ...(realBrokerAnalysis?.topSellers || []).map(s => ({
          ...s,
          buyQty: 0,
          sellQty: Number(s.volume ?? s.sellQty ?? s.shares ?? 0),
          buyAmt: 0,
          sellAmt: Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? 0),
        }))
      ];
=======
  // 2. Single-Session Fallback (Strictly 1-Day Authentic Snapshot — merge topBuyers & topSellers by brokerId so netVol = buyVol - sellVol)
  const rawBrokers = Array.isArray(realBrokerAnalysis?.brokers) && realBrokerAnalysis.brokers.length > 0
    ? realBrokerAnalysis.brokers
    : (() => {
        const merged = new Map();
        for (const b of (realBrokerAnalysis?.topBuyers || [])) {
          const id = String(b.broker || b.brokerId || b.id || '').trim();
          if (!id) continue;
          const cur = merged.get(id) || { brokerId: id, brokerName: b.brokerName || b.name, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
          cur.buyQty += Number(b.buyQty ?? b.buyKitta ?? b.volume ?? b.shares ?? 0);
          cur.buyAmt += Number(b.buyAmt ?? b.buyAmount ?? b.amount ?? 0);
          merged.set(id, cur);
        }
        for (const s of (realBrokerAnalysis?.topSellers || [])) {
          const id = String(s.broker || s.brokerId || s.id || '').trim();
          if (!id) continue;
          const cur = merged.get(id) || { brokerId: id, brokerName: s.brokerName || s.name, buyQty: 0, sellQty: 0, buyAmt: 0, sellAmt: 0 };
          cur.sellQty += Number(s.sellQty ?? s.sellKitta ?? s.volume ?? s.shares ?? 0);
          cur.sellAmt += Number(s.sellAmt ?? s.sellAmount ?? s.amount ?? 0);
          merged.set(id, cur);
        }
        return Array.from(merged.values());
      })();
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  let ignitionStage = 'NEUTRAL_ACCUMULATION';
  let stageLabel = 'Neutral / No Ignition';
  let stageBadge = '⚪ Neutral / Base';
  let ignitionScore = 45;
  let entrySignal = 'WAIT';
  let tacticalAdvice = 'Normal trading flow. No active early ignition impulse detected.';

  if (isWashTrap) {
    ignitionStage = 'WASH_CHURN_TRAP';
    stageLabel = 'Fake Wash Churn Trap';
    stageBadge = '🚨 Fake Wash Churn';
    ignitionScore = Math.max(10, Math.round(30 - (scr3NetPct * 0.5)));
    entrySignal = 'AVOID_TRAP';
    tacticalAdvice = `High churn circular volume detected with low net retention (${avgGrossRetention}% retention, SCR3: ${scr3NetPct}%). Operators offloading into retail liquidity.`;
  }
  // STAGE 2: Prime Ignition Entry (Supply Vacuum Ignition)
  else if (
    rvol3d >= 1.6 &&
    smh3dPct >= 18 &&
    t2RetentionPct >= 85 &&
    priceChange3dPct >= 1.0 &&
    priceChange3dPct <= 6.5 &&
    operatorProfitMargin3d <= 6.0
  ) {
    ignitionStage = 'STAGE_2_SUPPLY_VACUUM_IGNITION';
    stageLabel = 'Day 3 Prime Ignition Entry';
    stageBadge = '⚡ Day 3 Prime Ignition Entry';
    ignitionScore = Math.min(100, Math.round(85 + (smh3dPct * 0.4) + (rvol3d * 3)));
    entrySignal = 'PRIME_BUY';
    tacticalAdvice = `Supply vacuum confirmed! Smart money holding +${smh3dPct}% with ${t2RetentionPct}% T+2 retention. Operator margin is tight (+${operatorProfitMargin3d}%). Prime early entry window before public breakout.`;
  }
  // Single-day or 3-day spike under the ±15% circuit limit
  const day0PriceChange = Array.isArray(dailyHistory) && dailyHistory.length > 0
    ? Number(dailyHistory[0]?.priceChangePct || dailyHistory[0]?.pChange || 0)
    : 0;
  const isLargeSpike = day0PriceChange > 9.0 || priceChange3dPct > 9.0;
  const isNearCircuit = priceChange3dPct >= 12.5 || day0PriceChange >= 12.5;
  const isCircuitLocked = priceChange3dPct >= 14.8 || day0PriceChange >= 14.8;

  // STAGE 3: Breakout / Gap-Up Markup in Progress (Evaluated before Stealth Seeding to catch >9% spikes)
  if (
    isLargeSpike ||
    (priceChange3dPct > 6.5 && smh3dPct >= 15)
  ) {
=======
  // Single-day or 3-day spike under the ±15% circuit limit
  const day0PriceChange = Array.isArray(dailyHistory) && dailyHistory.length > 0
    ? Number(dailyHistory[0]?.priceChangePct || dailyHistory[0]?.pChange || 0)
    : 0;
  const isLargeSpike = day0PriceChange > 9.0 || priceChange3dPct > 9.0;
  const isNearCircuit = priceChange3dPct >= 12.5 || day0PriceChange >= 12.5;
  const isCircuitLocked = priceChange3dPct >= 14.8 || day0PriceChange >= 14.8;

  let ignitionStage = 'NEUTRAL_ACCUMULATION';
  let stageLabel = 'Neutral / No Ignition';
  let stageBadge = '⚪ Neutral / Base';
  let ignitionScore = 45;
  let entrySignal = 'WAIT';
  let tacticalAdvice = 'Normal trading flow. No active early ignition impulse detected.';

  if (isWashTrap) {
    ignitionStage = 'WASH_CHURN_TRAP';
    stageLabel = 'Fake Wash Churn Trap';
    stageBadge = '🚨 Fake Wash Churn';
    ignitionScore = Math.max(10, Math.round(30 - (scr3NetPct * 0.5)));
    entrySignal = 'AVOID_TRAP';
    tacticalAdvice = `High churn circular volume detected with low net retention (${avgGrossRetention}% retention, SCR3: ${scr3NetPct}%). Operators offloading into retail liquidity.`;
  }
  // STAGE 2: Prime Ignition Entry (Supply Vacuum Ignition)
  else if (
    !isLargeSpike &&
    rvol3d >= 1.6 &&
    smh3dPct >= 18 &&
    t2RetentionPct >= 85 &&
    priceChange3dPct >= 1.0 &&
    priceChange3dPct <= 6.5 &&
    operatorProfitMargin3d <= 6.0
  ) {
    ignitionStage = 'STAGE_2_SUPPLY_VACUUM_IGNITION';
    stageLabel = 'Day 3 Prime Ignition Entry';
    stageBadge = '⚡ Day 3 Prime Ignition Entry';
    ignitionScore = Math.min(100, Math.round(85 + (smh3dPct * 0.4) + (rvol3d * 3)));
    entrySignal = 'PRIME_BUY';
    tacticalAdvice = `Supply vacuum confirmed! Smart money holding +${smh3dPct}% with ${t2RetentionPct}% T+2 retention. Operator margin is tight (+${operatorProfitMargin3d}%). Prime early entry window before public breakout.`;
  }
  // STAGE 3: Breakout / Gap-Up Markup in Progress (Evaluated as else-if so it never clobbers Stage 2 or Wash Trap)
  else if (
    isLargeSpike ||
    (priceChange3dPct > 6.5 && smh3dPct >= 15)
  ) {
>>>>>>> REPLACE
```

---

### PATCH 2.4: `src/utils/accumulationDistributionEngine.ts`
**Fixes:** Support `kitta`, `buyKitta`, `sellKitta`, `buyVol`, `sellVol`, `topAccumulators`, and `topDistributors` in `calculateMultiSessionBrokerFootprint` and `detectSyndicateCluster`.

```typescript
<<<<<<< SEARCH
      const buyer = String(t.buyerBroker || t.buyerMemberId || t.buyer || '').trim();
      const seller = String(t.sellerBroker || t.sellerMemberId || t.seller || '').trim();
      const qty = Number(t.contractQuantity || t.quantity || t.qty || 0);
      const rate = Number(t.contractRate || t.rate || t.price || ltp || 0);
      const amt = Number(t.contractAmount || t.amount || (qty * rate));
=======
      const buyer = String(t.buyerBroker || t.buyer_broker || t.buyerMemberId || t.buyer || '').trim();
      const seller = String(t.sellerBroker || t.seller_broker || t.sellerMemberId || t.seller || '').trim();
      const qty = Number(t.contractQuantity || t.quantity || t.qty || t.kitta || 0);
      const rate = Number(t.contractRate || t.rate || t.price || ltp || 0);
      const amt = Number(t.contractAmount || t.amount || (qty * rate));
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  // Extract buyers, sellers, or full broker roster from any common shape (BrokerAnalysisService, BrokerConcentrationResult, or raw API)
  const rawBuyers: any[] = brokerData.buyers || brokerData.topBuyerBrokers || brokerData.topBuyers || [];
  const rawSellers: any[] = brokerData.sellers || brokerData.topSellerBrokers || brokerData.topSellers || [];
  const fullBrokers: any[] = Array.isArray(brokerData.brokers) ? brokerData.brokers : [];
=======
  // Extract buyers, sellers, or full broker roster from any common shape (BrokerAnalysisService, BrokerConcentrationResult, smartMoney5D, or raw API)
  const rawBuyers: any[] = brokerData.buyers || brokerData.topBuyerBrokers || brokerData.topBuyers || brokerData.topAccumulators || [];
  const rawSellers: any[] = brokerData.sellers || brokerData.topSellerBrokers || brokerData.topSellers || brokerData.topDistributors || [];
  const fullBrokers: any[] = Array.isArray(brokerData.brokers) ? brokerData.brokers : (Array.isArray(brokerData.allBrokers) ? brokerData.allBrokers : []);
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
  if (fullBrokers.length > 0) {
    for (const br of fullBrokers) {
      const bId = br.brokerId ?? br.broker ?? br.id ?? br.brokerNo ?? br.memberId ?? '';
      if (!bId) continue;
      const entry = getOrInit(bId, br.brokerName || br.name || getBrokerName(bId));
      entry.buyQty += Number(br.buyQty || br.shares || br.volume || 0);
      entry.buyAmount += Number(br.buyAmount || br.buyAmt || br.amount || 0);
      entry.sellQty += Number(br.sellQty || 0);
      entry.sellAmount += Number(br.sellAmount || br.sellAmt || 0);
    }
  } else {
    for (const b of rawBuyers) {
      const bId = b.brokerId ?? b.broker ?? b.id ?? '';
      if (!bId) continue;
      const entry = getOrInit(bId, b.brokerName || b.name || '');
      entry.buyQty += Number(b.buyQty || b.volume || 0);
      entry.buyAmount += Number(b.buyAmount || b.buyAmt || b.amount || 0);
    }

    for (const s of rawSellers) {
      const sId = s.brokerId ?? s.broker ?? s.id ?? '';
      if (!sId) continue;
      const entry = getOrInit(sId, s.brokerName || s.name || '');
      entry.sellQty += Number(s.sellQty || s.volume || 0);
      entry.sellAmount += Number(s.sellAmount || s.sellAmt || s.amount || 0);
    }
  }
=======
  if (fullBrokers.length > 0) {
    for (const br of fullBrokers) {
      const bId = br.brokerId ?? br.broker ?? br.id ?? br.brokerNo ?? br.memberId ?? '';
      if (!bId) continue;
      const entry = getOrInit(bId, br.brokerName || br.name || getBrokerName(bId));
      entry.buyQty += Number(br.buyQty || br.buyVol || br.buyKitta || br.shares || br.volume || 0);
      entry.buyAmount += Number(br.buyAmount || br.buyAmt || br.turnover || br.amount || 0);
      entry.sellQty += Number(br.sellQty || br.sellVol || br.sellKitta || 0);
      entry.sellAmount += Number(br.sellAmount || br.sellAmt || 0);
    }
  } else {
    for (const b of rawBuyers) {
      const bId = b.brokerId ?? b.broker ?? b.id ?? '';
      if (!bId) continue;
      const entry = getOrInit(bId, b.brokerName || b.name || '');
      entry.buyQty += Number(b.buyQty || b.buyVol || b.buyKitta || b.volume || 0);
      entry.buyAmount += Number(b.buyAmount || b.buyAmt || b.turnover || b.amount || 0);
    }

    for (const s of rawSellers) {
      const sId = s.brokerId ?? s.broker ?? s.id ?? '';
      if (!sId) continue;
      const entry = getOrInit(sId, s.brokerName || s.name || '');
      entry.sellQty += Number(s.sellQty || s.sellVol || s.sellKitta || s.volume || 0);
      entry.sellAmount += Number(s.sellAmount || s.sellAmt || s.turnover || s.amount || 0);
    }
  }
>>>>>>> REPLACE
```

---

### PATCH 2.5: `src/utils/breakoutTrapEngine.ts`
**Fixes:** Exclude self-trades (`buyerBroker === sellerBroker`) from `brokerOffloadingIntoBreakout` trap check and support `t.kitta`.

```typescript
<<<<<<< SEARCH
      trades.forEach((t) => {
        const sId = String(t.seller || t.sellerBroker || '').trim();
        const qty = Number(t.quantity || t.qty || 0);
        if (sId && qty > 0) {
          sellers.set(sId, (sellers.get(sId) || 0) + qty);
          totalSellVol += qty;
        }
      });
=======
      trades.forEach((t) => {
        const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || '').trim();
        const sId = String(t.seller || t.sellerBroker || t.seller_broker || '').trim();
        if (bId && sId && bId === sId) return; // Exclude self-trades from distribution trap check
        const qty = Number(t.quantity || t.qty || t.kitta || 0);
        if (sId && qty > 0) {
          sellers.set(sId, (sellers.get(sId) || 0) + qty);
          totalSellVol += qty;
        }
      });
>>>>>>> REPLACE
```

---

### PATCH 2.6: `src/utils/signals/brokerFloorsheetSignals.js`
**Fixes:** Support `buyKitta`/`sellKitta`, subtract `crossVol` in concentration calculations, and exclude internal cross trades from directional aggressor imbalance.

```javascript
<<<<<<< SEARCH
  // Calculate net position per broker
  const brokerList = brokers.map(b => {
    const buyQty = Math.max(0, Number(b.buyQty || b.buyVol || 0));
    const sellQty = Math.max(0, Number(b.sellQty || b.sellVol || 0));
=======
  // Calculate net position per broker
  const brokerList = brokers.map(b => {
    const buyQty = Math.max(0, Number(b.buyQty || b.buyVol || b.buyKitta || b.buy_kitta || 0));
    const sellQty = Math.max(0, Number(b.sellQty || b.sellVol || b.sellKitta || b.sell_kitta || 0));
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  const buyers = brokers
    .map(b => ({ brokerId: String(b.brokerId || b.broker || ''), buyQty: Math.max(0, Number(b.buyQty || b.buyVol || 0)) }))
    .filter(b => b.buyQty > 0)
    .sort((a, b) => b.buyQty - a.buyQty);

  const sellers = brokers
    .map(b => ({ brokerId: String(b.brokerId || b.broker || ''), sellQty: Math.max(0, Number(b.sellQty || b.sellVol || 0)) }))
    .filter(b => b.sellQty > 0)
    .sort((a, b) => b.sellQty - a.sellQty);
=======
  const buyers = brokers
    .map(b => {
      const grossB = Math.max(0, Number(b.buyQty || b.buyVol || b.buyKitta || b.buy_kitta || 0));
      const cross = Math.max(0, Number(b.crossVol || b.cross_vol || 0));
      return { brokerId: String(b.brokerId || b.broker || ''), buyQty: Math.max(0, grossB - cross) };
    })
    .filter(b => b.buyQty > 0)
    .sort((a, b) => b.buyQty - a.buyQty);

  const sellers = brokers
    .map(b => {
      const grossS = Math.max(0, Number(b.sellQty || b.sellVol || b.sellKitta || b.sell_kitta || 0));
      const cross = Math.max(0, Number(b.crossVol || b.cross_vol || 0));
      return { brokerId: String(b.brokerId || b.broker || ''), sellQty: Math.max(0, grossS - cross) };
    })
    .filter(b => b.sellQty > 0)
    .sort((a, b) => b.sellQty - a.sellQty);
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  for (const c of contracts) {
    const qty = Math.max(0, Number(c.kitta || c.quantity || c.contractQuantity || 0));
    const rate = Number(c.rate || c.contractRate || c.price || 0);
    const amt = Number(c.amount || c.contractAmount || (qty * rate));
    const isWhale = qty >= 500 || amt >= 500000;
=======
  for (const c of contracts) {
    const qty = Math.max(0, Number(c.kitta || c.quantity || c.qty || c.contractQuantity || 0));
    const rate = Number(c.rate || c.contractRate || c.price || 0);
    const amt = Number(c.amount || c.contractAmount || (qty * rate));
    const buyer = Number(c.buyerBroker || c.buyer_broker || c.buyer || 0);
    const seller = Number(c.sellerBroker || c.seller_broker || c.seller || 0);
    if (c.isInternalCross || (buyer > 0 && buyer === seller)) {
      neutralQty += qty;
      continue;
    }
    const isWhale = qty >= 200 || amt >= 100000 || Boolean(c.isWhalePrint);
>>>>>>> REPLACE
```

---

### PATCH 2.7: `src/components/ServicesHub.tsx`
**Fixes:** Fix `matchingStocks` search displaying `pointChange` as `ltp`.

```typescript
<<<<<<< SEARCH
    return matched.map((sec) => {
      const live = livePriceMap.get(sec.symbol.toUpperCase());
      const ltp = live?.lastTradedPrice ?? live?.closingPrice ?? live?.pointChange ?? null;
      const pChange = live?.percentageChange ?? live?.pChange ?? (live?.previousClose && ltp ? ((ltp - live.previousClose) / live.previousClose) * 100 : 0);
=======
    return matched.map((sec) => {
      const live = livePriceMap.get(sec.symbol.toUpperCase());
      const ltp = live?.ltp ?? live?.lastTradedPrice ?? live?.close ?? live?.closePrice ?? live?.closingPrice ?? null;
      const pChange = live?.percentageChange ?? live?.pChange ?? (live?.previousClose && ltp ? ((ltp - live.previousClose) / live.previousClose) * 100 : 0);
>>>>>>> REPLACE
```

---

### PATCH 2.8: `src/components/BrokerFlowDominanceService.tsx`
**Fixes:** Compute `buyQty`, `sellQty`, `netQty`, `avgBuyRate`, and `avgSellRate` in 1D floorsheet fallback, and include `scr3SellPct` / `scr3NetPct` in `evaluateStep4`.

```typescript
<<<<<<< SEARCH
    // B. 1D Horizon with active floorsheet
    if (floorsheet && floorsheet.length > 0) {
      const brokerMap = new Map<string, { buy: number; sell: number; trades: number; scrips: Map<string, { buy: number; sell: number }> }>();

      // Pre-seed major brokers
      MAJOR_BROKERS.forEach(b => {
        brokerMap.set(b.id, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
      });

      floorsheet.forEach((t: any) => {
        const bId = String(t.buyer || t.buyerBroker || '').trim();
        const sId = String(t.seller || t.sellerBroker || '').trim();
        if (bId && sId && bId === sId) return; // Self-matching filter: ignore bilateral wash cross-trades
        const amt = Number(t.amount || (Number(t.quantity || 0) * Number(t.rate || 0)) || 0);
        const sym = String(t.symbol || t.stockSymbol || '').trim();

        if (bId) {
          if (!brokerMap.has(bId)) brokerMap.set(bId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const bEntry = brokerMap.get(bId)!;
          bEntry.buy += amt;
          bEntry.trades += 1;
          if (sym) {
            const sc = bEntry.scrips.get(sym) || { buy: 0, sell: 0 };
            sc.buy += amt;
            bEntry.scrips.set(sym, sc);
          }
        }

        if (sId) {
          if (!brokerMap.has(sId)) brokerMap.set(sId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const sEntry = brokerMap.get(sId)!;
          sEntry.sell += amt;
          sEntry.trades += 1;
          if (sym) {
            const sc = sEntry.scrips.get(sym) || { buy: 0, sell: 0 };
            sc.sell += amt;
            sEntry.scrips.set(sym, sc);
          }
        }
      });

      const list: BrokerStat[] = [];
      brokerMap.forEach((val, bId) => {
        if (val.buy === 0 && val.sell === 0 && val.trades === 0) return;
        const bInfo = MAJOR_BROKERS.find(b => b.id === bId);
        const name = bInfo ? bInfo.name : `Broker #${bId}`;

        let topStock = '—';
        let maxScripAmt = 0;
        val.scrips.forEach((sc, sSym) => {
          const sAmt = sc.buy + sc.sell;
          if (sAmt > maxScripAmt) {
            maxScripAmt = sAmt;
            topStock = sSym;
          }
        });

        const allScrips: BrokerScripItem[] = Array.from(val.scrips.entries())
          .map(([sSym, sc]) => {
            const matched = stocks.find(st => st.symbol === sSym);
            const net = sc.buy - sc.sell;
            return {
              symbol: sSym,
              name: matched?.companyName || matched?.name || sSym,
              buyAmount: Math.round(sc.buy),
              sellAmount: Math.round(sc.sell),
              netFlow: Math.round(net),
              bias: net > 500000 ? 'Accumulation' : net < -500000 ? 'Distribution' : 'Neutral'
            };
          });

        const topScrips = [...allScrips].sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);
        const topAccumulation = [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => (y.netFlow !== x.netFlow ? y.netFlow - x.netFlow : y.buyAmount - x.buyAmount)).slice(0, 10);
        const topDistribution = [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => (x.netFlow !== y.netFlow ? x.netFlow - y.netFlow : y.sellAmount - x.sellAmount)).slice(0, 10);
=======
    // B. 1D Horizon with active floorsheet
    if (floorsheet && floorsheet.length > 0) {
      const brokerMap = new Map<string, { buy: number; sell: number; trades: number; scrips: Map<string, { buy: number; sell: number; buyQty: number; sellQty: number }> }>();

      // Pre-seed major brokers
      MAJOR_BROKERS.forEach(b => {
        brokerMap.set(b.id, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
      });

      const seenContracts = new Set<string>();
      floorsheet.forEach((t: any) => {
        const cid = String(t.contractId ?? t.contract_no ?? t.contractNo ?? t.id ?? '').trim();
        if (cid) {
          if (seenContracts.has(cid)) return;
          seenContracts.add(cid);
        }
        const bId = String(t.buyer || t.buyerBroker || t.buyer_broker || '').trim();
        const sId = String(t.seller || t.sellerBroker || t.seller_broker || '').trim();
        if (bId && sId && bId === sId) return; // Self-matching filter: ignore bilateral wash cross-trades
        const qty = Math.round(Number(t.quantity || t.qty || t.kitta || t.contractQuantity || 0));
        const rate = Number(t.rate || t.price || t.contractRate || 0);
        const amt = Number(t.amount || t.contractAmount || (qty * rate) || 0);
        const sym = String(t.symbol || t.stockSymbol || '').toUpperCase().trim();

        if (bId && qty > 0) {
          if (!brokerMap.has(bId)) brokerMap.set(bId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const bEntry = brokerMap.get(bId)!;
          bEntry.buy += amt;
          bEntry.trades += 1;
          if (sym) {
            const sc = bEntry.scrips.get(sym) || { buy: 0, sell: 0, buyQty: 0, sellQty: 0 };
            sc.buy += amt;
            sc.buyQty += qty;
            bEntry.scrips.set(sym, sc);
          }
        }

        if (sId && qty > 0) {
          if (!brokerMap.has(sId)) brokerMap.set(sId, { buy: 0, sell: 0, trades: 0, scrips: new Map() });
          const sEntry = brokerMap.get(sId)!;
          sEntry.sell += amt;
          sEntry.trades += 1;
          if (sym) {
            const sc = sEntry.scrips.get(sym) || { buy: 0, sell: 0, buyQty: 0, sellQty: 0 };
            sc.sell += amt;
            sc.sellQty += qty;
            sEntry.scrips.set(sym, sc);
          }
        }
      });

      const list: BrokerStat[] = [];
      brokerMap.forEach((val, bId) => {
        if (val.buy === 0 && val.sell === 0 && val.trades === 0) return;
        const bInfo = MAJOR_BROKERS.find(b => b.id === bId);
        const name = bInfo ? bInfo.name : `Broker #${bId}`;

        let topStock = '—';
        let maxScripAmt = 0;
        val.scrips.forEach((sc, sSym) => {
          const sAmt = sc.buy + sc.sell;
          if (sAmt > maxScripAmt) {
            maxScripAmt = sAmt;
            topStock = sSym;
          }
        });

        const allScrips: BrokerScripItem[] = Array.from(val.scrips.entries())
          .map(([sSym, sc]) => {
            const matched = stocks.find(st => st.symbol === sSym);
            const net = sc.buy - sc.sell;
            const netQty = sc.buyQty - sc.sellQty;
            return {
              symbol: sSym,
              name: matched?.companyName || matched?.name || sSym,
              buyAmount: Math.round(sc.buy),
              sellAmount: Math.round(sc.sell),
              netFlow: Math.round(net),
              buyQty: sc.buyQty > 0 ? sc.buyQty : undefined,
              sellQty: sc.sellQty > 0 ? sc.sellQty : undefined,
              netQty: netQty !== 0 ? netQty : undefined,
              avgBuyRate: sc.buyQty > 0 ? +(sc.buy / sc.buyQty).toFixed(2) : undefined,
              avgSellRate: sc.sellQty > 0 ? +(sc.sell / sc.sellQty).toFixed(2) : undefined,
              bias: net > 500000 ? 'Accumulation' : net < -500000 ? 'Distribution' : 'Neutral'
            };
          });

        const topScrips = [...allScrips].sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);
        const topAccumulation = [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => (y.netFlow !== x.netFlow ? y.netFlow - x.netFlow : y.buyAmount - x.buyAmount)).slice(0, 10);
        const topDistribution = [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => (x.netFlow !== y.netFlow ? x.netFlow - y.netFlow : y.sellAmount - x.sellAmount)).slice(0, 10);
        const topByNetQty = [...allScrips].filter(s => (s.netQty || 0) > 0).sort((x, y) => (y.netQty || 0) - (x.netQty || 0)).slice(0, 10);
        const topByGrossBuyAmt = [...allScrips].filter(s => s.buyAmount > 0).sort((x, y) => y.buyAmount - x.buyAmount).slice(0, 10);
        const topByGrossBuyQty = [...allScrips].filter(s => (s.buyQty || 0) > 0).sort((x, y) => (y.buyQty || 0) - (x.buyQty || 0)).slice(0, 10);
        const topDistByNetQty = [...allScrips].filter(s => (s.netQty || 0) < 0).sort((x, y) => (x.netQty || 0) - (y.netQty || 0)).slice(0, 10);
        const topDistByGrossSellAmt = [...allScrips].filter(s => s.sellAmount > 0).sort((x, y) => y.sellAmount - x.sellAmount).slice(0, 10);
        const topDistByGrossSellQty = [...allScrips].filter(s => (s.sellQty || 0) > 0).sort((x, y) => (y.sellQty || 0) - (x.sellQty || 0)).slice(0, 10);
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
          topScrips: topScrips.length > 0 ? topScrips : undefined,
          topAccumulation: topAccumulation.length > 0 ? topAccumulation : undefined,
          topDistribution: topDistribution.length > 0 ? topDistribution : undefined,
        });
=======
          topScrips: topScrips.length > 0 ? topScrips : undefined,
          topAccumulation: topAccumulation.length > 0 ? topAccumulation : undefined,
          topDistribution: topDistribution.length > 0 ? topDistribution : undefined,
          topByNetQty: topByNetQty.length > 0 ? topByNetQty : undefined,
          topByGrossBuyAmt: topByGrossBuyAmt.length > 0 ? topByGrossBuyAmt : undefined,
          topByGrossBuyQty: topByGrossBuyQty.length > 0 ? topByGrossBuyQty : undefined,
          topDistByNetQty: topDistByNetQty.length > 0 ? topDistByNetQty : undefined,
          topDistByGrossSellAmt: topDistByGrossSellAmt.length > 0 ? topDistByGrossSellAmt : undefined,
          topDistByGrossSellQty: topDistByGrossSellQty.length > 0 ? topDistByGrossSellQty : undefined,
        });
>>>>>>> REPLACE
```

```typescript
<<<<<<< SEARCH
        const bcr3Buy = Number(cachedRba.bcr3BuyPct || (cachedRba.crb5 ? cachedRba.crb5 * 100 : 0)) || 0;
        const bcr3Sell = Number(cachedRba.bcr3SellPct || 0);
=======
        const bcr3Buy = Number(cachedRba.bcr3BuyPct ?? cachedRba.bcr5BuyPct ?? (cachedRba.crb5 ? cachedRba.crb5 * 100 : 0)) || 0;
        const bcr3Sell = Number(cachedRba.bcr3SellPct ?? cachedRba.scr3SellPct ?? cachedRba.scr3NetPct ?? 0);
>>>>>>> REPLACE
```

---

## PART 3: STOCK DETAIL UI TABS (`src/components/StockDetailModal.jsx`)

### PATCH 3.1: `src/components/StockDetailModal.jsx`
**Fixes:** Reset all 14 symbol-scoped states when switching stocks to prevent cross-stock state leakage.

```javascript
<<<<<<< SEARCH
  // Fetch real price history (500 trading days) & corporate dividend history
  useEffect(() => {
    let active = true;
    if (!d?.symbol) return;

    // Keep real historical data intact by initializing from snapshot/fundamentals cache immediately
    const cachedSnap = getSnapshotCache(d.symbol);
=======
  // Fetch real price history (500 trading days) & corporate dividend history
  useEffect(() => {
    let active = true;
    if (!d?.symbol) return;

    // Reset all symbol-scoped states immediately to prevent cross-stock state leakage
    setLiveQuote(null);
    setAllTimeBrokerAnalysis(null);
    setBrokerAccumData(null);
    setDividendHistory(null);
    setQuarterlyReports([]);
    setLedgerTelemetry(null);
    setAiResult('');
    setHistoryFilterDate('');
    setFloorsheetDate('');
    setFloorsheetBuyerInput('');
    setFloorsheetSellerInput('');
    setFloorsheetAppliedBuyer('');
    setFloorsheetAppliedSeller('');
    setBrokerDate('');

    // Keep real historical data intact by initializing from snapshot/fundamentals cache immediately
    const cachedSnap = getSnapshotCache(d.symbol);
>>>>>>> REPLACE
```

---

### PATCH 3.2: `src/components/StockDetailModal.jsx`
**Fixes:** Replace missing `fetchFromBackend` call in `handleFetchSmartMoney` with native `fetch` + `AbortController`.

```javascript
<<<<<<< SEARCH
  const handleFetchSmartMoney = useCallback(async (sym, tf, days) => {
    try {
      const res = await fetchFromBackend(`/api/stocks/${encodeURIComponent(sym)}/smart-money?timeframe=${tf}&days=${days}`, 6000);
      if (res?.data && res.data.length > 0) return res;
    } catch (_) {}
    const fallback = await fetchRealBrokerAnalysis(sym, days, { refresh: false }).catch(() => null);
    if (fallback?.topBuyers?.length || fallback?.brokers?.length) {
      return fallback;
    }
    return null;
  }, []);
=======
  const handleFetchSmartMoney = useCallback(async (sym, tf, days) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(`/api/stocks/${encodeURIComponent(sym)}/smart-money?timeframe=${tf}&days=${days}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (resp.ok) {
        const res = await resp.json();
        if (res?.data && res.data.length > 0) return res;
      }
    } catch (_) {}
    const fallback = await fetchRealBrokerAnalysis(sym, days, { refresh: false }).catch(() => null);
    if (fallback?.topBuyers?.length || fallback?.brokers?.length) {
      return fallback;
    }
    return null;
  }, []);
>>>>>>> REPLACE
```

---

### PATCH 3.3: `src/components/StockDetailModal.jsx`
**Fixes:** Use normalized `floorsheet` / `realFloorsheet.rows` in `multiSessionFootprint` and avoid double-counting synthetic broker trades.

```javascript
<<<<<<< SEARCH
  const multiSessionFootprint = useMemo(() => {
    if (!d?.symbol) return null;
    const sessions = [];
    if (realFloorsheet) {
      if (Array.isArray(realFloorsheet.trades)) sessions.push(realFloorsheet.trades);
      else if (Array.isArray(realFloorsheet)) sessions.push(realFloorsheet);
    }
    if (sessions.length === 0 && realBrokerAnalysis) {
      const synthTrades = [];
      (realBrokerAnalysis.topBuyers || []).forEach(b => {
        synthTrades.push({ buyer: b.broker || b.brokerId, qty: b.volume || b.kitta || 0, rate: d.ltp || 0 });
      });
      (realBrokerAnalysis.topSellers || []).forEach(s => {
        synthTrades.push({ seller: s.broker || s.brokerId, qty: s.volume || s.kitta || 0, rate: d.ltp || 0 });
      });
      if (synthTrades.length > 0) sessions.push(synthTrades);
    }
    if (sessions.length === 0) return null;
    return calculateMultiSessionBrokerFootprint(sessions, d.symbol, d.ltp);
  }, [d?.symbol, d?.ltp, realFloorsheet, realBrokerAnalysis]);
=======
  const multiSessionFootprint = useMemo(() => {
    if (!d?.symbol) return null;
    const sessions = [];
    if (Array.isArray(floorsheet) && floorsheet.length > 0) {
      sessions.push(floorsheet);
    } else if (realFloorsheet) {
      if (Array.isArray(realFloorsheet.rows) && realFloorsheet.rows.length > 0) sessions.push(realFloorsheet.rows);
      else if (Array.isArray(realFloorsheet.trades) && realFloorsheet.trades.length > 0) sessions.push(realFloorsheet.trades);
      else if (Array.isArray(realFloorsheet) && realFloorsheet.length > 0) sessions.push(realFloorsheet);
    }
    if (sessions.length === 0 && realBrokerAnalysis) {
      const brokerList = Array.isArray(realBrokerAnalysis.brokers) && realBrokerAnalysis.brokers.length > 0
        ? realBrokerAnalysis.brokers
        : [...(realBrokerAnalysis.topBuyers || []), ...(realBrokerAnalysis.topSellers || [])];
      const synthTrades = [];
      const seenBrokers = new Set();
      brokerList.forEach(b => {
        const bId = String(b.broker || b.brokerId || b.id || '').trim();
        if (!bId || seenBrokers.has(bId)) return;
        seenBrokers.add(bId);
        const bQty = Number(b.buyQty ?? b.volume ?? b.kitta ?? 0);
        const sQty = Number(b.sellQty ?? 0);
        const bRate = Number(b.avgBuyRate || (b.buyAmt && bQty > 0 ? b.buyAmt / bQty : d.ltp || 0));
        const sRate = Number(b.avgSellRate || (b.sellAmt && sQty > 0 ? b.sellAmt / sQty : d.ltp || 0));
        if (bQty > 0) synthTrades.push({ buyer: bId, buyerBroker: bId, qty: bQty, quantity: bQty, rate: bRate, amount: bQty * bRate });
        if (sQty > 0) synthTrades.push({ seller: bId, sellerBroker: bId, qty: sQty, quantity: sQty, rate: sRate, amount: sQty * sRate });
      });
      if (synthTrades.length > 0) sessions.push(synthTrades);
    }
    if (sessions.length === 0) return null;
    return calculateMultiSessionBrokerFootprint(sessions, d.symbol, d.ltp);
  }, [d?.symbol, d?.ltp, floorsheet, realFloorsheet, realBrokerAnalysis]);
>>>>>>> REPLACE
```

---

### PATCH 3.4: `src/components/StockDetailModal.jsx`
**Fixes:** Fix `90D`/`180D`/`260D` period key lookup, use net accumulator vs net distributor volume in Market Depth flow comparison, and compute Whale VWAP strictly as `SUM(buyAmt) / SUM(buyQty)`.

```javascript
<<<<<<< SEARCH
  // Broker Accumulation History: fetch when depth tab active or period selector changes
  useEffect(() => {
    if ((activeTab !== 'market_depth' && activeTab !== 'depth_broker') || !d?.symbol) return;
    const daysMap = { '1D': 1, '5D': 5, '15D': 15, '30D': 30, '60D': 60, '1W': 7, '1M': 30, '2M': 60, '3M': 90, '6M': 180, '1Y': 260, '500D': 500, '2Y/All': 500 };
    const days = daysMap[brokerAccumPeriod] || brokerDays || 5;
=======
  // Broker Accumulation History: fetch when depth tab active or period selector changes
  useEffect(() => {
    if ((activeTab !== 'market_depth' && activeTab !== 'depth_broker') || !d?.symbol) return;
    const daysMap = {
      '1D': 1, '5D': 5, '15D': 15, '30D': 30, '60D': 60,
      '90D': 90, '180D': 180, '260D': 260, '500D': 500,
      '1W': 7, '1M': 30, '2M': 60, '3M': 90, '6M': 180, '1Y': 260, '2Y/All': 500
    };
    const days = daysMap[brokerAccumPeriod] || brokerDays || 5;
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
              const bcr3Buy = Number(ba?.bcr3BuyPct ?? bc?.bcr3BuyPct ?? 0);
              const bcr3Sell = Number(ba?.bcr3SellPct ?? bc?.bcr3SellPct ?? 0);
              const totalBuyVol = Number(ba?.totalBuyVolume || ba?.totalVolume || bc?.totalBuyVolume || 0);
              const totalSellVol = Number(ba?.totalSellVolume || bc?.totalSellVolume || ba?.totalVolume || 0);
=======
              const bcr3Buy = Number(ba?.bcr3BuyPct ?? bc?.bcr3BuyPct ?? 0);
              const bcr3Sell = Number(ba?.bcr3SellPct ?? bc?.bcr3SellPct ?? 0);
              const netAccumSum = netAccums.reduce((s, b) => s + Math.max(0, Number(b.netQty !== undefined ? b.netQty : ((b.buyQty || b.volume || 0) - (b.sellQty || 0)))), 0);
              const netDistSum = netDists.reduce((s, b) => s + Math.abs(Math.min(0, Number(b.netQty !== undefined ? b.netQty : ((b.buyQty || 0) - (b.sellQty || b.volume || 0))))), 0);
              const totalBuyVol = netAccumSum > 0 ? netAccumSum : Number(ba?.totalBuyVolume || ba?.totalVolume || bc?.totalBuyVolume || 0);
              const totalSellVol = netDistSum > 0 ? netDistSum : Number(ba?.totalSellVolume || bc?.totalSellVolume || ba?.totalVolume || 0);
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
              // Whale VWAP computation (weighted avg rate of top accumulators)
              const whaleVwap = (() => {
                const topB = netAccums.slice(0, 5);
                const totAmt = topB.reduce((s, b) => s + (Number(b.avgBuyRate || (b.buyAmt && b.buyQty ? b.buyAmt / b.buyQty : 0)) * Number(b.netQty !== undefined ? b.netQty : b.buyQty || 0)), 0);
                const totQty = topB.reduce((s, b) => s + Number(b.netQty !== undefined ? b.netQty : b.buyQty || 0), 0);
                return totQty > 0 ? +(totAmt / totQty).toFixed(1) : null;
              })();
=======
              // Whale VWAP computation (strictly Volume-Weighted Average Price: SUM(buyAmt) / SUM(buyQty) across top 5 accumulators)
              const whaleVwap = (() => {
                const topB = netAccums.slice(0, 5);
                let totAmt = 0;
                let totQty = 0;
                topB.forEach(b => {
                  const grossBuyQty = Number(b.buyQty || b.volume || b.netQty || 0);
                  const grossBuyAmt = Number(b.buyAmt || b.amount || (grossBuyQty * Number(b.avgBuyRate || 0)));
                  if (grossBuyQty > 0 && grossBuyAmt > 0) {
                    totQty += grossBuyQty;
                    totAmt += grossBuyAmt;
                  }
                });
                return totQty > 0 ? +(totAmt / totQty).toFixed(2) : null;
              })();
>>>>>>> REPLACE
```

---

### PATCH 3.5: `src/components/StockDetailModal.jsx`
**Fixes:** Enforce `qty * rate` arithmetic fallback and route `filteredFloorsheet` into the Floorsheet tab table.

```javascript
<<<<<<< SEARCH
        .map(r => {
          const bBroker = String(r.buyerBroker || r.buyer || r.buyerMemberId || r.buyerBrokerCode || '').trim();
          const sBroker = String(r.sellerBroker || r.seller || r.sellerMemberId || r.sellerBrokerCode || '').trim();
          return {
            id: r.contractId || r.id,
            buyer: bBroker,
            seller: sBroker,
            buyerBroker: bBroker,
            sellerBroker: sBroker,
            buyerBrokerName: r.buyerBrokerName || (bBroker ? getBrokerName(bBroker) : '—'),
            sellerBrokerName: r.sellerBrokerName || (sBroker ? getBrokerName(sBroker) : '—'),
            qty: Number(r.qty || r.quantity || 0),
            quantity: Number(r.qty || r.quantity || 0),
            rate: Number(r.rate || 0),
            amount: Number(r.amount || 0),
            time: r.businessDate || r.time || '',
            symbol: r.stockSymbol || r.symbol || cleanSym,
            isReal: true
          };
        });
=======
        .map(r => {
          const bBroker = String(r.buyerBroker || r.buyer || r.buyerMemberId || r.buyerBrokerCode || '').trim();
          const sBroker = String(r.sellerBroker || r.seller || r.sellerMemberId || r.sellerBrokerCode || '').trim();
          const qty = Number(r.qty || r.quantity || r.kitta || 0);
          const rate = Number(r.rate || 0);
          const rawAmount = Number(r.amount || 0);
          const amount = rawAmount > 0 ? rawAmount : +(qty * rate).toFixed(2);
          return {
            id: r.contractId || r.contractNo || r.id,
            contractId: r.contractId || r.contractNo || r.id,
            buyer: bBroker,
            seller: sBroker,
            buyerBroker: bBroker,
            sellerBroker: sBroker,
            buyerBrokerName: r.buyerBrokerName || (bBroker ? getBrokerName(bBroker) : '—'),
            sellerBrokerName: r.sellerBrokerName || (sBroker ? getBrokerName(sBroker) : '—'),
            qty,
            quantity: qty,
            rate,
            amount,
            time: r.businessDate || r.time || '',
            symbol: String(r.stockSymbol || r.symbol || cleanSym).toUpperCase().trim(),
            isSelfTrade: Boolean(bBroker && sBroker && bBroker === sBroker),
            isReal: true
          };
        });
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
          const activeFsDate = floorsheetDate || realFloorsheet?.businessDate || fsAvailDates[0] || '';
          const fsRows = Array.isArray(realFloorsheet?.rows) ? realFloorsheet.rows : floorsheet;
          const totalFsPages = Math.max(1, Number(realFloorsheet?.totalPages || 1));
=======
          const activeFsDate = floorsheetDate || realFloorsheet?.businessDate || fsAvailDates[0] || '';
          const fsRows = filteredFloorsheet.length > 0 || floorsheetMode !== 'all' || brokerFilter.trim() !== ''
            ? filteredFloorsheet
            : floorsheet;
          const totalFsPages = Math.max(1, Number(realFloorsheet?.totalPages || 1));
>>>>>>> REPLACE
```

---

### PATCH 3.6: `src/components/StockDetailModal.jsx`
**Fixes:** Guarantee chronological sorting (oldest-first in charts, newest-first in tables) and preserve `turnover` and `trades` in `history12M`.

```javascript
<<<<<<< SEARCH
    setRealHistoryLoading(!cachedHist || cachedHist.length === 0);
    fetchRealPriceHistory(d.symbol, 500).then(data => {
      if (!active) return;
      let fullHistory = (data && Array.isArray(data)) ? [...data] : [];
=======
    setRealHistoryLoading(!cachedHist || cachedHist.length === 0);
    fetchRealPriceHistory(d.symbol, 500).then(data => {
      if (!active) return;
      let fullHistory = (data && Array.isArray(data))
        ? [...data].sort((a, b) => String(a.date || a.time || '').localeCompare(String(b.date || b.time || '')))
        : [];
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
        return {
          date: item.date,
          close: rawClose,
          open: item.open,
          high: item.high,
          low: item.low,
          volume: item.volume,
          isToday: Boolean(item.isToday),
          sma200: sma200 != null ? Number(sma200.toFixed(2)) : null,
          sma50: sma50 != null ? Number(sma50.toFixed(2)) : null,
          isAdjusted: adjusted[i]?.isAdjusted || false
        };
=======
        return {
          date: item.date,
          close: rawClose,
          open: item.open,
          high: item.high,
          low: item.low,
          volume: item.volume,
          turnover: item.turnover,
          trades: item.trades,
          change: item.change,
          pChange: item.pChange,
          isToday: Boolean(item.isToday),
          sma200: sma200 != null ? Number(sma200.toFixed(2)) : null,
          sma50: sma50 != null ? Number(sma50.toFixed(2)) : null,
          isAdjusted: adjusted[i]?.isAdjusted || false
        };
>>>>>>> REPLACE
```

---

### PATCH 3.7: `src/components/StockDetailModal.jsx`
**Fixes:** Sync Buy/Sell Calculator `priceInput` and `waccInput` when switching stock symbols.

```javascript
<<<<<<< SEARCH
  // Calculator State
  const [qtyInput, setQtyInput] = useState('100');
  const [priceInput, setPriceInput] = useState(String(d.ltp || 350));
  const [waccInput, setWaccInput] = useState(String(Number((d.ltp || 350) * 0.92).toFixed(1)));
  const [holdType, setHoldType] = useState('individual_short');
  const [calcMode, setCalcMode] = useState('buy');
=======
  // Calculator State
  const [qtyInput, setQtyInput] = useState('100');
  const [priceInput, setPriceInput] = useState(String(d.ltp || 350));
  const [waccInput, setWaccInput] = useState(String(Number((d.ltp || 350) * 0.92).toFixed(1)));
  const [holdType, setHoldType] = useState('individual_short');
  const [calcMode, setCalcMode] = useState('buy');

  useEffect(() => {
    if (d?.ltp > 0) {
      setPriceInput(String(d.ltp));
      setWaccInput(String(Number(d.ltp * 0.92).toFixed(1)));
    }
  }, [d?.symbol]);
>>>>>>> REPLACE
```