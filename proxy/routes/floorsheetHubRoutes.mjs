// proxy/routes/floorsheetHubRoutes.mjs
import express from 'express';
import { db } from '../db/ledgerStore.js';
import { safeNum } from './aiGuruRoutes.mjs';

const router = express.Router();

function tableExists(database, name) {
  try {
    const row = database
      .prepare(`SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name = ? LIMIT 1`)
      .get(name);
    return Boolean(row);
  } catch {
    return false;
  }
}

const RETAIL_GIANT_BASELINE = {
  58: 0.085,
  45: 0.042,
  49: 0.038,
  34: 0.032,
};

function enrichFloorsheetContracts(rawRows, fallbackSymbol) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

  // Sort chronologically by tradeTime (oldest contract first) to infer uptick/downtick direction
  const chronological = [...rawRows].sort((a, b) => {
    const tA = String(a.tradeTime ?? a.trade_time ?? a.time ?? '');
    const tB = String(b.tradeTime ?? b.trade_time ?? b.time ?? '');
    if (tA && tB && tA !== tB) return tA.localeCompare(tB);
    const cA = String(a.contractNo ?? a.contract_no ?? a.contractId ?? '');
    const cB = String(b.contractNo ?? b.contract_no ?? b.contractId ?? '');
    return cA.localeCompare(cB, undefined, { numeric: true });
  });

  let prevRate = null;
  let lastDirection = 'NEUTRAL';

  const enriched = chronological.map((row, idx) => {
    const contractNo = String(row.contractNo ?? row.contract_no ?? row.contractId ?? `FS-${idx + 1}`);
    const symbol = String(row.symbol || row.stockSymbol || fallbackSymbol || 'NEPSE').toUpperCase();
    const tradeDate = String(row.tradeDate ?? row.trade_date ?? row.businessDate ?? new Date().toISOString().slice(0, 10));
    const tradeTime = String(row.tradeTime ?? row.trade_time ?? '');
    const buyerBroker = Math.round(safeNum(row.buyerBroker ?? row.buyer_broker ?? row.buyerMemberId ?? row.buyer, 0));
    const sellerBroker = Math.round(safeNum(row.sellerBroker ?? row.seller_broker ?? row.sellerMemberId ?? row.seller, 0));
    const kitta = Math.round(safeNum(row.kitta ?? row.quantity ?? row.contractQuantity, 0));
    const rate = safeNum(row.rate ?? row.price ?? row.contractRate, 0);
    const amount = safeNum(row.amount ?? row.contractAmount, Number((kitta * rate).toFixed(2)));

    let aggressor = lastDirection;
    if (row.aggressor || row.aggressor_side) {
      const explicit = String(row.aggressor || row.aggressor_side).toUpperCase();
      if (explicit === 'BUY' || explicit === 'SELL' || explicit === 'NEUTRAL') {
        aggressor = explicit;
      }
    } else if (prevRate !== null && rate > 0) {
      if (rate > prevRate) {
        aggressor = 'BUY';
        lastDirection = 'BUY';
      } else if (rate < prevRate) {
        aggressor = 'SELL';
        lastDirection = 'SELL';
      }
    }
    if (rate > 0) prevRate = rate;

    const isInternalCross = Boolean(
      row.isInternalCross ||
      row.is_internal_cross ||
      (buyerBroker > 0 && buyerBroker === sellerBroker)
    );
    const isWhalePrint = Boolean(
      row.isWhalePrint ||
      row.is_whale_print ||
      (kitta >= 500 || amount >= 500000)
    );

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
    };
  });

  return enriched;
}

export function handleFloorsheetHub(req, res) {
  try {
    const symbolFilter = (req.query.symbol || '').trim().toUpperCase();
    const buyerFilter = Math.round(safeNum(req.query.buyer, 0));
    const sellerFilter = Math.round(safeNum(req.query.seller, 0));
    const minKitta = Math.round(safeNum(req.query.minKitta, 0));
    const minAmount = safeNum(req.query.minAmount, 0);
    const whaleOnly = req.query.whaleOnly === 'true';
    const excludeCross = req.query.excludeCross === 'true';
    const limit = Math.min(1000, Math.max(50, Math.round(safeNum(req.query.limit, 350))));

    let rawContracts = [];
    let asOfDate = new Date().toISOString().slice(0, 10);
    let source = 'EMPTY';
    let availableDates = [];

    // Distinct trading dates for date dropdown (up to 30 dates sorted descending)
    if (tableExists(db, 'floorsheet_contracts')) {
      try {
        availableDates = db
          .prepare(`SELECT DISTINCT trade_date FROM floorsheet_contracts ORDER BY trade_date DESC LIMIT 30`)
          .all()
          .map(r => r.trade_date);
      } catch (_) {}
    }
    if (availableDates.length === 0 && tableExists(db, 'floorsheet_broker_summary')) {
      try {
        availableDates = db
          .prepare(`SELECT DISTINCT trade_date FROM floorsheet_broker_summary ORDER BY trade_date DESC LIMIT 30`)
          .all()
          .map(r => r.trade_date);
      } catch (_) {}
    }

    const requestedDate = req.query.date || null;

    // 1. Primary Path: Query tick-level `floorsheet_contracts` table
    if (tableExists(db, 'floorsheet_contracts')) {
      const latestDateRow = db
        .prepare(`SELECT MAX(trade_date) AS latest_date FROM floorsheet_contracts`)
        .get();

      const chosenDate = requestedDate || (availableDates.length > 0 ? availableDates[0] : latestDateRow?.latest_date);
      if (chosenDate) {
        asOfDate = chosenDate;
        source = 'SQLITE_CONTRACTS';

        const clauses = [`trade_date = ?`];
        const params = [asOfDate];

        if (symbolFilter && symbolFilter !== 'ALL') {
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
          WHERE ${clauses.join(' AND ')}
          ORDER BY trade_date DESC, trade_time DESC, contract_no DESC
          LIMIT ?
        `;
        params.push(limit * 2);

        rawContracts = db.prepare(sql).all(...params);
      }
    }

    // 2. Fallback Path: If `floorsheet_contracts` is empty, synthesize representative tape from `floorsheet_broker_summary`
    if (rawContracts.length === 0 && tableExists(db, 'floorsheet_broker_summary')) {
      const latestDateRow = db
        .prepare(`SELECT MAX(trade_date) AS latest_date FROM floorsheet_broker_summary`)
        .get();

      if (latestDateRow?.latest_date) {
        asOfDate = latestDateRow.latest_date;
        source = 'SQLITE_BROKER_SUMMARY_SYNTHESIS';

        const summaryRows = db
          .prepare(
            `SELECT
              symbol,
              trade_date,
              broker_no,
              buy_kitta,
              sell_kitta,
              COALESCE(vwap, 500) AS rate
            FROM floorsheet_broker_summary
            WHERE trade_date = ?
            ORDER BY (buy_kitta + sell_kitta) DESC
            LIMIT 400`
          )
          .all(asOfDate);

        rawContracts = summaryRows
          .filter((r) => safeNum(r.buy_kitta, 0) > 0 || safeNum(r.sell_kitta, 0) > 0)
          .map((r, i) => {
            const kitta = Math.max(safeNum(r.buy_kitta, 0), safeNum(r.sell_kitta, 0));
            const rate = safeNum(r.rate, 500);
            return {
              contractNo: `${asOfDate.replace(/-/g, '')}-SYN-${1000 + i}`,
              symbol: r.symbol,
              tradeDate: r.trade_date,
              tradeTime: '14:59:00',
              buyerBroker: safeNum(r.buy_kitta, 0) >= safeNum(r.sell_kitta, 0) ? r.broker_no : 58,
              sellerBroker: safeNum(r.sell_kitta, 0) > safeNum(r.buy_kitta, 0) ? r.broker_no : 45,
              kitta,
              rate,
              amount: Number((kitta * rate).toFixed(2)),
            };
          });
      }
    }

    // 3. Enrich contracts per scrip so Tick-Test Aggressor works per ticker
    const bySymbolMap = new Map();
    for (const c of rawContracts) {
      const sym = String(c.symbol || 'NEPSE').toUpperCase();
      const arr = bySymbolMap.get(sym) || [];
      arr.push(c);
      bySymbolMap.set(sym, arr);
    }

    let allEnriched = [];
    for (const [sym, rows] of bySymbolMap.entries()) {
      const enrichedForSym = enrichFloorsheetContracts(rows, sym);
      allEnriched.push(...enrichedForSym);
    }

    // Apply client filters on synthesized rows as well
    allEnriched = allEnriched.filter((c) => {
      if (symbolFilter && symbolFilter !== 'ALL' && !c.symbol.includes(symbolFilter)) return false;
      if (buyerFilter > 0 && c.buyerBroker !== buyerFilter) return false;
      if (sellerFilter > 0 && c.sellerBroker !== sellerFilter) return false;
      if (minKitta > 0 && c.kitta < minKitta) return false;
      if (minAmount > 0 && c.amount < minAmount) return false;
      if (whaleOnly && !c.isWhalePrint) return false;
      if (excludeCross && c.isInternalCross) return false;
      return true;
    });

    // Sort newest/largest first
    allEnriched.sort((a, b) => {
      const tA = String(a.tradeTime || '');
      const tB = String(b.tradeTime || '');
      if (tA && tB && tA !== tB) return tB.localeCompare(tA);
      return b.contractNo.localeCompare(a.contractNo, undefined, { numeric: true });
    });

    // 4. Compute Market-Wide Summary, Top Whale Scrips, and Top Institutional Brokers
    let totalKitta = 0;
    let totalTurnover = 0;
    let whaleContractCount = 0;
    let whaleTurnover = 0;
    let internalCrossKitta = 0;
    let buyAggressorKitta = 0;
    let sellAggressorKitta = 0;

    const scripAgg = new Map();
    const brokerAgg = new Map();

    for (const c of allEnriched) {
      totalKitta += c.kitta;
      totalTurnover += c.amount;
      if (c.isWhalePrint) {
        whaleContractCount += 1;
        whaleTurnover += c.amount;
      }
      if (c.isInternalCross) internalCrossKitta += c.kitta;
      if (c.aggressor === 'BUY') buyAggressorKitta += c.kitta;
      if (c.aggressor === 'SELL') sellAggressorKitta += c.kitta;

      // Scrip aggregation
      const s = scripAgg.get(c.symbol) || {
        totalKitta: 0,
        totalTurnover: 0,
        whalePrintCount: 0,
        buyAggKitta: 0,
        sellAggKitta: 0,
        buyerBrokerVolumes: new Map(),
      };
      s.totalKitta += c.kitta;
      s.totalTurnover += c.amount;
      if (c.isWhalePrint) s.whalePrintCount += 1;
      if (c.aggressor === 'BUY') s.buyAggKitta += c.kitta;
      if (c.aggressor === 'SELL') s.sellAggKitta += c.kitta;
      s.buyerBrokerVolumes.set(
        c.buyerBroker,
        (s.buyerBrokerVolumes.get(c.buyerBroker) || 0) + c.kitta
      );
      scripAgg.set(c.symbol, s);

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
    }

    const topWhaleScrips = Array.from(scripAgg.entries())
      .map(([symbol, st]) => {
        let topBuyerBroker = 0;
        let maxBuyVol = 0;
        for (const [bId, vol] of st.buyerBrokerVolumes.entries()) {
          if (vol > maxBuyVol) {
            maxBuyVol = vol;
            topBuyerBroker = bId;
          }
        }
        const dirVol = st.buyAggKitta + st.sellAggKitta;
        return {
          symbol,
          totalKitta: st.totalKitta,
          totalTurnover: Math.round(st.totalTurnover),
          vwap: st.totalKitta > 0 ? Number((st.totalTurnover / st.totalKitta).toFixed(2)) : 0,
          whalePrintCount: st.whalePrintCount,
          buyAggressorPct: dirVol > 0 ? Number(((st.buyAggKitta / dirVol) * 100).toFixed(1)) : 50,
          topBuyerBroker,
        };
      })
      .sort((a, b) => b.whalePrintCount - a.whalePrintCount || b.totalTurnover - a.totalTurnover)
      .slice(0, 8);

    const topInstitutionalBrokers = Array.from(brokerAgg.entries())
      .map(([brokerId, br]) => {
        const netKitta = br.buyKitta - br.sellKitta;
        const avgTicket = (br.buyKitta + br.sellKitta) / Math.max(1, br.trades);
        const baseline = RETAIL_GIANT_BASELINE[brokerId] ?? 0.018;
        const buyShare = totalKitta > 0 ? br.buyKitta / totalKitta : baseline;
        const ticketMult = avgTicket >= 300 ? 1.35 : avgTicket < 45 ? 0.65 : 1.0;
        const anomalyScore = Number(Math.max(0.1, (buyShare / baseline) * ticketMult).toFixed(2));

        return {
          brokerId,
          buyKitta: br.buyKitta,
          sellKitta: br.sellKitta,
          netKitta,
          turnover: Math.round(br.turnover),
          whaleTrades: br.whaleTrades,
          anomalyScore,
        };
      })
      .filter((b) => b.netKitta > 0)
      .sort((a, b) => b.netKitta * b.anomalyScore - a.netKitta * a.anomalyScore)
      .slice(0, 8);

    const dirTotal = buyAggressorKitta + sellAggressorKitta;

    const responsePayload = {
      ok: true,
      asOfDate,
      availableDates,
      source,
      summary: {
        totalContracts: allEnriched.length,
        totalKitta,
        totalTurnover: Math.round(totalTurnover),
        whaleContractCount,
        whaleTurnoverPct: totalTurnover > 0 ? Number(((whaleTurnover / totalTurnover) * 100).toFixed(1)) : 0,
        internalCrossKittaPct: totalKitta > 0 ? Number(((internalCrossKitta / totalKitta) * 100).toFixed(1)) : 0,
        marketBuyAggressorPct: dirTotal > 0 ? Number(((buyAggressorKitta / dirTotal) * 100).toFixed(1)) : 50,
      },
      topWhaleScrips,
      topInstitutionalBrokers,
      contracts: allEnriched.slice(0, limit),
    };

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(responsePayload);
  } catch (err) {
    return res.status(200).json({
      ok: false,
      asOfDate: new Date().toISOString().slice(0, 10),
      availableDates: [],
      source: 'EMPTY',
      error: err instanceof Error ? err.message : 'Failed to load Floorsheet Hub',
      summary: {
        totalContracts: 0,
        totalKitta: 0,
        totalTurnover: 0,
        whaleContractCount: 0,
        whaleTurnoverPct: 0,
        internalCrossKittaPct: 0,
        marketBuyAggressorPct: 50,
      },
      topWhaleScrips: [],
      topInstitutionalBrokers: [],
      contracts: [],
    });
  }
}

router.get('/hub', handleFloorsheetHub);
router.get('/', handleFloorsheetHub);

export default router;
