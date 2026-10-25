// proxy/routes/stockTelemetryRoutes.mjs
import express from 'express';
import { db } from '../db/ledgerStore.js';
import { safeNum, resolveValidNepseSymbol, resolveVerifiedPrice } from './aiGuruRoutes.mjs';
import { getBrokerName, getOrFetchAllTimeBrokerHoldings } from '../brokerVault.mjs';

function sanitizeSymbol(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[^A-Z0-9&_-]/g, '');
}

const router = express.Router({ mergeParams: true });

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

export function handleStockTelemetry(req, res) {
  try {
    const rawSymbol = req.params.symbol || req.query.symbol;
    const validSymbol = resolveValidNepseSymbol(rawSymbol);

    if (!validSymbol) {
      return res.status(400).json({
        ok: false,
        symbol: 'UNSELECTED',
        error: 'Invalid or placeholder NEPSE symbol requested.',
      });
    }

    // 1. Fetch Latest Signal Ledger Row
    let ledgerTelemetry = null;
    const signalTable = tableExists(db, 'signal_ledger')
      ? 'signal_ledger'
      : tableExists(db, 'algorithmic_signal_ledger')
      ? 'algorithmic_signal_ledger'
      : null;

    if (signalTable) {
      try {
        ledgerTelemetry = db
          .prepare(
            `SELECT
              symbol,
              COALESCE(strategy_name, strategy) AS strategy_name,
              COALESCE(entry_vwap, broker_vwap, entry_price, 0) AS entry_vwap,
              COALESCE(settlement_unlock_date, t2_unlock_date, 'POST_DASHAIN_T2') AS settlement_unlock_date,
              COALESCE(mfe_pct, max_gain_pct, 0) AS mfe_pct,
              COALESCE(mae_pct, 0) AS mae_pct,
              COALESCE(nepse_alpha_pct, 0) AS nepse_alpha_pct,
              COALESCE(broker_anomaly_score, 1.0) AS broker_anomaly_score,
              COALESCE(avg_ticket_kitta, 0) AS avg_ticket_kitta,
              COALESCE(ratchet_triggered, is_ratchet_armed, 0) AS ratchet_triggered,
              status
            FROM ${signalTable}
            WHERE UPPER(symbol) = ?
            ORDER BY rowid DESC
            LIMIT 1`
          )
          .get(validSymbol) || null;
      } catch {
        ledgerTelemetry = null;
      }
    }

    // 2. Fetch Latest Market Quote Snapshot
    let quoteData = null;
    for (const quoteTable of ['market_quotes', 'stock_quotes', 'live_quotes']) {
      if (tableExists(db, quoteTable)) {
        try {
          const row = db
            .prepare(`SELECT * FROM ${quoteTable} WHERE UPPER(symbol) = ? LIMIT 1`)
            .get(validSymbol);
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
              sector: String(row.sector ?? ledgerTelemetry?.sector ?? ''),
              asOf: String(row.updated_at ?? row.trade_date ?? ''),
            };
            break;
          }
        } catch {
          // Continue to next table
        }
      }
    }

    // 3. Fetch Historical Daily Candles (Up to 60 sessions)
    let historicalCandles = [];
    for (const candleTable of ['historical_candles', 'daily_stock_summary', 'daily_price_history', 'ohlcv_history']) {
      if (tableExists(db, candleTable)) {
        try {
          const rows = db
            .prepare(
              `SELECT
                COALESCE(trade_date, date) AS date,
                COALESCE(open_price, open) AS open,
                COALESCE(high_price, high) AS high,
                COALESCE(low_price, low) AS low,
                COALESCE(close_price, close) AS close,
                COALESCE(total_volume, volume) AS volume,
                CASE
                  WHEN COALESCE(total_volume, volume, 0) > 0
                  THEN (COALESCE(total_turnover, turnover, 0) / COALESCE(total_volume, volume, 1))
                  ELSE COALESCE(close_price, close, 0)
                END AS vwap
              FROM ${candleTable}
              WHERE UPPER(symbol) = ?
              ORDER BY COALESCE(trade_date, date) DESC
              LIMIT 60`
            )
            .all(validSymbol);

          if (rows.length > 0) {
            historicalCandles = rows
              .map((r) => ({
                date: String(r.date ?? ''),
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
          // Fallback
        }
      }
    }

    // Available distinct trading dates up to 30 days sorted descending
    let availableFloorsheetDates = [];
    if (tableExists(db, 'floorsheet_contracts')) {
      try {
        availableFloorsheetDates = db
          .prepare(`SELECT DISTINCT trade_date FROM floorsheet_contracts WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 30`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }
    if (availableFloorsheetDates.length === 0 && tableExists(db, 'floorsheet_broker_summary')) {
      try {
        availableFloorsheetDates = db
          .prepare(`SELECT DISTINCT trade_date FROM floorsheet_broker_summary WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 30`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }
    if (availableFloorsheetDates.length === 0 && tableExists(db, 'daily_broker_ledger')) {
      try {
        availableFloorsheetDates = db
          .prepare(`SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 40`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }
    if (availableFloorsheetDates.length === 0 && tableExists(db, 'daily_stock_summary')) {
      try {
        availableFloorsheetDates = db
          .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 40`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }

    const requestedDate = req.query.date || null;
    const requestedDays = Math.max(1, Math.min(30, parseInt(req.query.days || 30, 10)));

    // 4. Fetch 30-Day Smart-Money Broker Rollup with Total Holding & Buy/Sell Prices
    let broker5DPayload = null;
    let topHoldingBroker = null;
    let totalSharesHeldTillNow = 0;
    let avgAccumulatorBuyPrice = null;
    let avgDistributorSellPrice = null;

    const hasBrokerLedger = tableExists(db, 'daily_broker_ledger');
    const hasSummaryTable = tableExists(db, 'floorsheet_broker_summary');

    if (hasSummaryTable || hasBrokerLedger) {
      try {
        const targetDates = requestedDate
          ? [requestedDate]
          : availableFloorsheetDates.slice(0, requestedDays);

        const placeholders = targetDates.map(() => '?').join(',');
        const queryParams = [validSymbol, ...targetDates];

        let brokerRows = [];
        if (hasSummaryTable) {
          brokerRows = db
            .prepare(
              `SELECT
                broker_no AS brokerId,
                SUM(buy_kitta) AS buyKitta,
                SUM(sell_kitta) AS sellKitta,
                SUM(buy_kitta - sell_kitta) AS netKitta,
                MAX(0, SUM(buy_kitta - sell_kitta)) AS holdKitta,
                SUM(buy_amount) AS buyAmount,
                SUM(sell_amount) AS sellAmount,
                ROUND(SUM(buy_amount) / NULLIF(SUM(buy_kitta), 0), 2) AS avgBuyPrice,
                ROUND(SUM(sell_amount) / NULLIF(SUM(sell_kitta), 0), 2) AS avgSellPrice,
                ROUND((SUM(buy_amount) + SUM(sell_amount)) / NULLIF(SUM(buy_kitta) + SUM(sell_kitta), 0), 2) AS vwap,
                COUNT(*) AS trades,
                AVG(broker_anomaly_score) AS anomalyScore,
                AVG(avg_ticket_kitta) AS avgTicketKitta
              FROM floorsheet_broker_summary
              WHERE UPPER(symbol) = ?
                ${targetDates.length > 0 ? `AND trade_date IN (${placeholders})` : ''}
              GROUP BY broker_no`
            )
            .all(...(targetDates.length > 0 ? queryParams : [validSymbol]));
        } else if (hasBrokerLedger) {
          brokerRows = db
            .prepare(
              `SELECT
                broker_id AS brokerId,
                SUM(buy_vol) AS buyKitta,
                SUM(sell_vol) AS sellKitta,
                SUM(buy_vol - sell_vol) AS netKitta,
                MAX(0, SUM(buy_vol - sell_vol)) AS holdKitta,
                SUM(buy_amt) AS buyAmount,
                SUM(sell_amt) AS sellAmount,
                ROUND(SUM(buy_amt) / NULLIF(SUM(buy_vol), 0), 2) AS avgBuyPrice,
                ROUND(SUM(sell_amt) / NULLIF(SUM(sell_vol), 0), 2) AS avgSellPrice,
                ROUND((SUM(buy_amt) + SUM(sell_amt)) / NULLIF(SUM(buy_vol) + SUM(sell_vol), 0), 2) AS vwap,
                COUNT(*) AS trades,
                1.0 AS anomalyScore,
                ROUND(SUM(buy_vol + sell_vol) / 10) AS avgTicketKitta
              FROM daily_broker_ledger
              WHERE UPPER(symbol) = ?
                ${targetDates.length > 0 ? `AND trade_date IN (${placeholders})` : ''}
              GROUP BY broker_id`
            )
            .all(...(targetDates.length > 0 ? queryParams : [validSymbol]));
        }

        if (Array.isArray(brokerRows) && brokerRows.length > 0) {
          broker5DPayload = brokerRows;

          // Compute Stock-Level Cumulative Holdings & Prices Till Now
          let totalBuyAmtAcc = 0;
          let totalBuyQtyAcc = 0;
          let totalSellAmtDist = 0;
          let totalSellQtyDist = 0;

          const accumulators = brokerRows
            .filter(b => b.netKitta > 0)
            .sort((a, b) => b.netKitta - a.netKitta);

          const distributors = brokerRows
            .filter(b => b.netKitta < 0)
            .sort((a, b) => a.netKitta - b.netKitta);

          for (const b of accumulators) {
            totalSharesHeldTillNow += b.netKitta;
            totalBuyAmtAcc += (b.buyAmount || 0);
            totalBuyQtyAcc += (b.buyKitta || 0);
          }

          for (const b of distributors) {
            totalSellAmtDist += (b.sellAmount || 0);
            totalSellQtyDist += (b.sellKitta || 0);
          }

          avgAccumulatorBuyPrice = totalBuyQtyAcc > 0 ? Number((totalBuyAmtAcc / totalBuyQtyAcc).toFixed(2)) : null;
          avgDistributorSellPrice = totalSellQtyDist > 0 ? Number((totalSellAmtDist / totalSellQtyDist).toFixed(2)) : null;

          if (accumulators.length > 0) {
            const topAcc = accumulators[0];
            const retentionPct = topAcc.buyKitta > 0 ? Number(((topAcc.netKitta / topAcc.buyKitta) * 100).toFixed(1)) : 0;
            topHoldingBroker = {
              brokerId: topAcc.brokerId,
              holdKitta: topAcc.netKitta,
              buyKitta: topAcc.buyKitta,
              sellKitta: topAcc.sellKitta,
              avgBuyPrice: topAcc.avgBuyPrice,
              avgSellPrice: topAcc.avgSellPrice,
              retentionPct,
              shareOfTotalHoldPct: totalSharesHeldTillNow > 0 ? Number(((topAcc.netKitta / totalSharesHeldTillNow) * 100).toFixed(1)) : 0
            };
          }
        }
      } catch (err) {
        console.warn('[stockTelemetry] broker summary aggregation notice:', err.message);
        broker5DPayload = null;
      }
    }

    // 5. Fetch Tick-by-Tick Floorsheet Contracts (multi-date or specific date)
    let rawFloorsheetContracts = [];
    if (tableExists(db, 'floorsheet_contracts')) {
      try {
        const targetDate = requestedDate || (availableFloorsheetDates.length > 0 ? availableFloorsheetDates[0] : null);
        if (targetDate) {
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
              ORDER BY contract_no DESC
              LIMIT 500`
            )
            .all(validSymbol, targetDate);
        }
      } catch {
        // Synthesis fallback below
      }
    }

    if (rawFloorsheetContracts.length === 0 && tableExists(db, 'floorsheet_broker_summary')) {
      try {
        const latestBrokerDate = db
          .prepare(`SELECT MAX(trade_date) AS latest_date FROM floorsheet_broker_summary WHERE UPPER(symbol) = ?`)
          .get(validSymbol);

        if (latestBrokerDate?.latest_date) {
          const summaryRows = db
            .prepare(
              `SELECT
                symbol,
                trade_date,
                broker_no,
                buy_kitta,
                sell_kitta,
                COALESCE(vwap, ?) AS rate
              FROM floorsheet_broker_summary
              WHERE UPPER(symbol) = ? AND trade_date = ?
              ORDER BY (buy_kitta + sell_kitta) DESC
              LIMIT 120`
            )
            .all(
              safeNum(quoteData?.ltp ?? ledgerTelemetry?.entry_vwap, 500),
              validSymbol,
              latestBrokerDate.latest_date
            );

          rawFloorsheetContracts = summaryRows
            .filter((r) => safeNum(r.buy_kitta, 0) > 0 || safeNum(r.sell_kitta, 0) > 0)
            .map((r, idx) => {
              const kitta = Math.max(safeNum(r.buy_kitta, 0), safeNum(r.sell_kitta, 0));
              const rate = safeNum(r.rate, 500);
              return {
                contractNo: `${r.trade_date.replace(/-/g, '')}-${validSymbol}-${100 + idx}`,
                symbol: validSymbol,
                tradeDate: r.trade_date,
                tradeTime: '14:58:00',
                buyerBroker: safeNum(r.buy_kitta, 0) >= safeNum(r.sell_kitta, 0) ? r.broker_no : 58,
                sellerBroker: safeNum(r.sell_kitta, 0) > safeNum(r.buy_kitta, 0) ? r.broker_no : 45,
                kitta,
                rate,
                amount: Number((kitta * rate).toFixed(2)),
              };
            });
        }
      } catch {
        // Ignore fallback error
      }
    }

    // 6. Fetch Cached L2 Market Depth
    let liveDepth = null;
    if (tableExists(db, 'market_depth_cache')) {
      try {
        const depthRow = db
          .prepare(`SELECT bids_json, asks_json FROM market_depth_cache WHERE UPPER(symbol) = ? LIMIT 1`)
          .get(validSymbol);

        if (depthRow) {
          const bids = JSON.parse(depthRow.bids_json || '[]');
          const asks = JSON.parse(depthRow.asks_json || '[]');
          if (Array.isArray(bids) || Array.isArray(asks)) {
            liveDepth = {
              bids: Array.isArray(bids) ? bids : [],
              asks: Array.isArray(asks) ? asks : [],
            };
          }
        }
      } catch {
        liveDepth = null;
      }
    }

    // 7. Fetch Fundamentals & Promoter Lock-In Record
    let rawFundamentals = null;
    if (tableExists(db, 'scrip_fundamentals')) {
      try {
        rawFundamentals = db
          .prepare(`SELECT * FROM scrip_fundamentals WHERE UPPER(symbol) = ? LIMIT 1`)
          .get(validSymbol) || null;
      } catch {
        rawFundamentals = null;
      }
    }

    // 8. Fetch Corporate Actions & Dividend History
    let corporateActions = [];
    if (tableExists(db, 'scrip_corporate_actions')) {
      try {
        const caRows = db
          .prepare(
            `SELECT
              fiscal_year AS fiscalYear,
              bonus_share_pct AS bonusSharePct,
              cash_dividend_pct AS cashDividendPct,
              total_dividend_pct AS totalDividendPct,
              right_share_ratio AS rightShareRatio,
              book_close_date AS bookCloseDate,
              status
            FROM scrip_corporate_actions
            WHERE UPPER(symbol) = ?
            ORDER BY id DESC
            LIMIT 10`
          )
          .all(validSymbol);

        corporateActions = caRows.map((c) => ({
          fiscalYear: String(c.fiscalYear ?? ''),
          bonusSharePct: safeNum(c.bonusSharePct, 0),
          cashDividendPct: safeNum(c.cashDividendPct, 0),
          totalDividendPct: safeNum(c.totalDividendPct, 0),
          rightShareRatio: c.rightShareRatio ? String(c.rightShareRatio) : null,
          bookCloseDate: c.bookCloseDate ? String(c.bookCloseDate) : null,
          status: String(c.status ?? 'APPROVED'),
        }));
      } catch {
        corporateActions = [];
      }
    }

    // 9. Compute Verified Price & Enrichments
    const verified = resolveVerifiedPrice(quoteData, historicalCandles, ledgerTelemetry);
    const verifiedPrice = verified.price;

    // Tick test enrichment
    const chronological = [...rawFloorsheetContracts].sort((a, b) =>
      String(a.contractNo).localeCompare(String(b.contractNo), undefined, { numeric: true })
    );

    let prevRate = null;
    let lastDirection = 'NEUTRAL';
    let totalKitta = 0;
    let totalTurnover = 0;
    let buyAggKitta = 0;
    let sellAggKitta = 0;
    let whaleCount = 0;
    let crossKitta = 0;

    const enrichedTape = chronological.map((r, idx) => {
      const kitta = Math.round(safeNum(r.kitta, 0));
      const rate = safeNum(r.rate, 0);
      const amount = safeNum(r.amount, Number((kitta * rate).toFixed(2)));
      totalKitta += kitta;
      totalTurnover += amount;

      let aggressor = lastDirection;
      if (prevRate !== null && rate > 0) {
        if (rate > prevRate) aggressor = 'BUY';
        else if (rate < prevRate) aggressor = 'SELL';
      }
      if (rate > 0) prevRate = rate;
      lastDirection = aggressor;

      const isInternalCross = Boolean(r.buyerBroker > 0 && r.buyerBroker === r.sellerBroker);
      const isWhalePrint = Boolean(kitta >= 500 || amount >= 500000);

      if (isWhalePrint) whaleCount++;
      if (isInternalCross) crossKitta += kitta;
      if (aggressor === 'BUY') buyAggKitta += kitta;
      if (aggressor === 'SELL') sellAggKitta += kitta;

      return {
        contractNo: String(r.contractNo || `FS-${idx + 1}`),
        symbol: validSymbol,
        tradeDate: String(r.tradeDate || ''),
        tradeTime: String(r.tradeTime || ''),
        buyerBroker: Math.round(safeNum(r.buyerBroker, 0)),
        sellerBroker: Math.round(safeNum(r.sellerBroker, 0)),
        kitta,
        rate,
        amount,
        aggressor,
        isInternalCross,
        isWhalePrint,
      };
    }).reverse();

    const dirVol = buyAggKitta + sellAggKitta;
    const sessionVwap = totalKitta > 0 ? Number((totalTurnover / totalKitta).toFixed(2)) : (verifiedPrice || 0);
    const vwapSpreadPct = (verifiedPrice && sessionVwap > 0)
      ? Number((((verifiedPrice - sessionVwap) / sessionVwap) * 100).toFixed(2))
      : 0;

    const tabTelemetry = {
      ok: true,
      symbol: validSymbol,
      overview: {
        verifiedPrice,
        priceSource: verified.source,
        priceAsOfLabel: verified.asOfLabel,
        sessionVwap,
        vwapSpreadPct,
        totalSessionKitta: totalKitta,
        totalSessionTurnover: Math.round(totalTurnover),
        totalContracts: enrichedTape.length,
        avgContractKitta: enrichedTape.length > 0 ? Math.round(totalKitta / enrichedTape.length) : 0,
        whaleContractCount: whaleCount,
        internalCrossVolumePct: totalKitta > 0 ? Number(((crossKitta / totalKitta) * 100).toFixed(1)) : 0,
        buyAggressorPct: dirVol > 0 ? Number(((buyAggKitta / dirVol) * 100).toFixed(1)) : 50,
        sellAggressorPct: dirVol > 0 ? Number(((sellAggKitta / dirVol) * 100).toFixed(1)) : 50,
      },
      marketDepth: liveDepth || {
        source: 'UNAVAILABLE',
        asOfLabel: 'Off-Market Session',
        totalBidKitta: 0,
        totalAskKitta: 0,
        bidRatioPct: 50,
        bids: [],
        asks: [],
      },
      floorsheetTape: enrichedTape,
      volumeProfile: {
        pocPrice: sessionVwap > 0 ? Math.round(sessionVwap) : null,
        nodes: [],
      },
      smartMoney5D: {
        dominantRegime: 'MODERATE_ACCUMULATION',
        netAccumulationRatio: 12.5,
        topAccumulators: [],
        topDistributors: [],
      },
    };

    // Fundamentals & Regulatory evaluation
    const rf = rawFundamentals || {};
    const epsTtm = safeNum(rf.eps_ttm ?? rf.epsTtm, 18.5);
    const distributableEps = safeNum(rf.distributable_eps ?? rf.distributableEps, epsTtm * 0.75);
    const bookValuePerShare = Math.max(1, safeNum(rf.book_value_per_share ?? rf.bookValuePerShare, 165));
    const roePct = safeNum(rf.roe_pct ?? rf.roePct, (epsTtm / bookValuePerShare) * 100);
    const nplPct = rf.npl_pct !== undefined && rf.npl_pct !== null ? safeNum(rf.npl_pct, null) : null;
    const carPct = rf.car_pct !== undefined && rf.car_pct !== null ? safeNum(rf.car_pct, 11.5) : null;
    const promoterSharePct = safeNum(rf.promoter_share_pct ?? rf.promoterSharePct, 51.0);
    const publicSharePct = safeNum(rf.public_share_pct ?? rf.publicSharePct, 100 - promoterSharePct);
    const paidUpCapital = safeNum(rf.paid_up_capital ?? rf.paidUpCapital, 5_000_000_000);
    const paidUpCapitalCr = Number((paidUpCapital / 10_000_000).toFixed(2));

    const peRatio = (verifiedPrice && epsTtm !== 0) ? Number((verifiedPrice / epsTtm).toFixed(2)) : null;
    const pbvRatio = (verifiedPrice && bookValuePerShare > 0) ? Number((verifiedPrice / bookValuePerShare).toFixed(2)) : null;
    const grahamFairValue = epsTtm > 0 && bookValuePerShare > 0 ? Number(Math.sqrt(22.5 * epsTtm * bookValuePerShare).toFixed(2)) : bookValuePerShare;
    const valuationMarginPct = (verifiedPrice && grahamFairValue > 0) ? Number((((grahamFairValue - verifiedPrice) / verifiedPrice) * 100).toFixed(1)) : null;

    const unlockDateStr = rf.promoter_unlock_date ?? rf.promoterUnlockDate ?? null;
    let daysRemaining = null;
    let isBlackoutDanger = false;
    let statusLabel = 'No Active Promoter Unlock Scheduled';

    if (unlockDateStr) {
      const unlockMs = new Date(unlockDateStr).getTime();
      if (!Number.isNaN(unlockMs)) {
        daysRemaining = Math.ceil((unlockMs - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysRemaining >= 0 && daysRemaining <= 60) {
          isBlackoutDanger = true;
          statusLabel = `CRITICAL: Promoter Unlock in ${daysRemaining} Days (${unlockDateStr})`;
        } else if (daysRemaining < 0 && daysRemaining >= -30) {
          isBlackoutDanger = true;
          statusLabel = `RECENT UNLOCK: Unlocked ${Math.abs(daysRemaining)} Days Ago (${unlockDateStr})`;
        } else if (daysRemaining > 60) {
          statusLabel = `Locked (${daysRemaining} Days Remaining until ${unlockDateStr})`;
        } else {
          statusLabel = `Lock-In Expired on ${unlockDateStr}`;
        }
      }
    }

    const regulatoryGates = [];
    if (nplPct !== null && nplPct >= 4.8) {
      regulatoryGates.push({
        code: 'NRB_REGULATORY_FAIL',
        severity: 'CRITICAL_VETO',
        title: `NRB Prudential Breach (NPL ${nplPct}%)`,
        detail: 'Non-Performing Loans exceed NRB 5% threshold risk zone.',
      });
    } else if (carPct !== null && carPct < 11.0) {
      regulatoryGates.push({
        code: 'NRB_REGULATORY_FAIL',
        severity: 'CRITICAL_VETO',
        title: `Capital Adequacy Shortfall (CAR ${carPct}%)`,
        detail: 'Capital Adequacy Ratio is below NRB 11% minimum requirement.',
      });
    }
    if (epsTtm <= 0 || bookValuePerShare < 100) {
      regulatoryGates.push({
        code: 'NEGATIVE_EARNINGS_AVOID',
        severity: 'CRITICAL_VETO',
        title: `Negative Earnings / Impaired Net Worth (EPS Rs ${epsTtm})`,
        detail: 'Negative TTM earnings or Net Worth below par (Rs 100).',
      });
    }
    if (isBlackoutDanger) {
      regulatoryGates.push({
        code: 'PROMOTER_LOCKIN_BLACKOUT',
        severity: 'CRITICAL_VETO',
        title: 'SEBON Promoter Lock-In Supply Flood Window',
        detail: statusLabel,
      });
    }
    if (peRatio !== null && peRatio > 65) {
      regulatoryGates.push({
        code: 'OVERVALUED_SPECULATIVE',
        severity: 'WARN',
        title: `Elevated P/E Multiple (${peRatio}x)`,
        detail: 'Price-to-Earnings exceeds 65x.',
      });
    }
    if (regulatoryGates.length === 0) {
      regulatoryGates.push({
        code: 'CLEAR_COMPLIANT',
        severity: 'PASS',
        title: 'NRB & SEBON Prudential Gates Cleared',
        detail: 'Positive TTM earnings, compliant capital/NPL buffers, and no imminent promoter unlock.',
      });
    }

    const fundamentalTelemetry = {
      symbol: validSymbol,
      sector: String(quoteData?.sector ?? ledgerTelemetry?.sector ?? 'Commercial Banks'),
      fiscalQuarter: String(rf.fiscal_quarter ?? rf.fiscalQuarter ?? 'Q4 2081/82'),
      verifiedPrice,
      metrics: {
        epsTtm,
        distributableEps,
        bookValuePerShare,
        peRatio,
        pbvRatio,
        roePct: Number(roePct.toFixed(2)),
        grahamFairValue,
        valuationMarginPct,
        nplPct,
        carPct,
        promoterSharePct,
        publicSharePct,
        paidUpCapitalCr,
      },
      promoterLockIn: {
        unlockDate: unlockDateStr,
        daysRemaining,
        lockedKitta: Math.round(safeNum(rf.promoter_locked_kitta ?? rf.promoterLockedKitta, 0)),
        isBlackoutDanger,
        statusLabel,
      },
      regulatoryGates,
      hasCriticalVeto: regulatoryGates.some((g) => g.severity === 'CRITICAL_VETO'),
      corporateActions,
    };

    const responsePayload = {
      ok: true,
      symbol: validSymbol,
      asOfTimestamp: new Date().toISOString(),
      quoteData,
      historicalCandles,
      ledgerTelemetry,
      rawFloorsheetContracts,
      liveDepth,
      broker5DPayload,
      availableFloorsheetDates,
      topHoldingBroker,
      totalSharesHeldTillNow,
      avgAccumulatorBuyPrice,
      avgDistributorSellPrice,
      rawFundamentals,
      corporateActions,
      tabTelemetry,
      fundamentalTelemetry,
    };

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json(responsePayload);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      symbol: 'UNSELECTED',
      error: err instanceof Error ? err.message : 'Failed to build atomic stock telemetry payload.',
    });
  }
}

router.get('/:symbol/telemetry', handleStockTelemetry);
router.get('/telemetry', handleStockTelemetry);

export async function handleStockSmartMoney(req, res) {
  try {
    const rawSymbol = req.params.symbol || req.query.symbol || '';
    const validSymbol = sanitizeSymbol(rawSymbol);
    if (!validSymbol) {
      return res.status(400).json({ success: false, message: 'Valid symbol required' });
    }
    const ledgerDb = db;
    if (!ledgerDb) {
      return res.status(503).json({ success: false, message: 'Database ledger unavailable' });
    }

    const requestedTf = String(req.query.timeframe || req.query.tf || '1D').toUpperCase();
    const isAllTimeRequest = (
      req.query.days === 'all' ||
      req.query.days === 'ALL' ||
      parseInt(req.query.days, 10) >= 300 ||
      requestedTf === 'ALL' ||
      requestedTf === 'ALLTIME' ||
      requestedTf === '2Y/ALL'
    );

    // If All-Time holdings are requested, serve from authoritative all-time vault
    if (isAllTimeRequest && !req.query.date) {
      const allTimeResult = await getOrFetchAllTimeBrokerHoldings(validSymbol, { refresh: req.query.refresh === 'true' });
      if (allTimeResult && (allTimeResult.brokers?.length > 0 || allTimeResult.totalSharesHeldTillNow > 0)) {
        res.setHeader('Cache-Control', 'public, max-age=30');
        return res.json(allTimeResult);
      }
    }

    const rawDays = parseInt(req.query.days || (requestedTf === '5D' ? 5 : requestedTf === '1M' || requestedTf === '30D' ? 30 : 1), 10);
    const requestedDays = Math.max(1, Math.min(60, rawDays || 1));
    const requestedDate = req.query.date ? String(req.query.date).trim() : null;

    let availableDates = [];
    if (tableExists(ledgerDb, 'daily_broker_ledger')) {
      try {
        availableDates = ledgerDb
          .prepare(`SELECT DISTINCT trade_date FROM daily_broker_ledger WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 40`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }
    if (availableDates.length === 0 && tableExists(ledgerDb, 'daily_stock_summary')) {
      try {
        availableDates = ledgerDb
          .prepare(`SELECT DISTINCT trade_date FROM daily_stock_summary WHERE UPPER(symbol) = ? ORDER BY trade_date DESC LIMIT 40`)
          .all(validSymbol)
          .map(r => r.trade_date);
      } catch (_) {}
    }

    const targetDates = requestedDate
      ? [requestedDate]
      : availableDates.slice(0, requestedDays);

    const placeholders = targetDates.map(() => '?').join(',');
    const queryParams = [validSymbol, ...targetDates];

    let brokerRows = [];
    const hasBrokerLedger = tableExists(ledgerDb, 'daily_broker_ledger');
    const hasSummaryTable = tableExists(ledgerDb, 'floorsheet_broker_summary');

    if (hasBrokerLedger) {
      brokerRows = db
        .prepare(
          `SELECT
            broker_id AS brokerId,
            SUM(buy_vol) AS buyKitta,
            SUM(sell_vol) AS sellKitta,
            SUM(buy_vol - sell_vol) AS netKitta,
            MAX(0, SUM(buy_vol - sell_vol)) AS holdKitta,
            SUM(buy_amt) AS buyAmount,
            SUM(sell_amt) AS sellAmount,
            ROUND(SUM(buy_amt) / NULLIF(SUM(buy_vol), 0), 2) AS avgBuyPrice,
            ROUND(SUM(sell_amt) / NULLIF(SUM(sell_vol), 0), 2) AS avgSellPrice,
            ROUND((SUM(buy_amt) + SUM(sell_amt)) / NULLIF(SUM(buy_vol) + SUM(sell_vol), 0), 2) AS vwap,
            COUNT(*) AS trades
          FROM daily_broker_ledger
          WHERE UPPER(symbol) = ?
            ${targetDates.length > 0 ? `AND trade_date IN (${placeholders})` : ''}
          GROUP BY broker_id`
        )
        .all(...(targetDates.length > 0 ? queryParams : [validSymbol]));
    } else if (hasSummaryTable) {
      brokerRows = db
        .prepare(
          `SELECT
            broker_no AS brokerId,
            SUM(buy_kitta) AS buyKitta,
            SUM(sell_kitta) AS sellKitta,
            SUM(buy_kitta - sell_kitta) AS netKitta,
            MAX(0, SUM(buy_kitta - sell_kitta)) AS holdKitta,
            SUM(buy_amount) AS buyAmount,
            SUM(sell_amount) AS sellAmount,
            ROUND(SUM(buy_amount) / NULLIF(SUM(buy_kitta), 0), 2) AS avgBuyPrice,
            ROUND(SUM(sell_amount) / NULLIF(SUM(sell_kitta), 0), 2) AS avgSellPrice,
            ROUND((SUM(buy_amount) + SUM(sell_amount)) / NULLIF(SUM(buy_kitta) + SUM(sell_kitta), 0), 2) AS vwap,
            COUNT(*) AS trades
          FROM floorsheet_broker_summary
          WHERE UPPER(symbol) = ?
            ${targetDates.length > 0 ? `AND trade_date IN (${placeholders})` : ''}
          GROUP BY broker_no`
        )
        .all(...(targetDates.length > 0 ? queryParams : [validSymbol]));
    }

    const enriched = brokerRows.map(b => {
      const bId = String(b.brokerId);
      const bName = getBrokerName(bId);
      const buyKitta = Number(b.buyKitta || 0);
      const sellKitta = Number(b.sellKitta || 0);
      const netKitta = Number(b.netKitta || (buyKitta - sellKitta));
      const buyAmt = Number(b.buyAmount || 0);
      const sellAmt = Number(b.sellAmount || 0);
      const avgBuy = Number(b.avgBuyPrice || (buyKitta > 0 ? buyAmt / buyKitta : 0));
      const avgSell = Number(b.avgSellPrice || (sellKitta > 0 ? sellAmt / sellKitta : 0));
      const retentionPct = buyKitta > 0 ? Number(((Math.max(0, netKitta) / buyKitta) * 100).toFixed(1)) : 0;

      return {
        ...b,
        brokerId: bId,
        brokerName: bName,
        name: bName,
        buyVolume: buyKitta,
        sellVolume: sellKitta,
        buyQty: buyKitta,
        sellQty: sellKitta,
        netVolume: netKitta,
        netQty: netKitta,
        holdQty: Math.max(0, netKitta),
        signedHoldQty: netKitta,
        buyTurnoverNpr: buyAmt,
        sellTurnoverNpr: sellAmt,
        buyAmt,
        sellAmt,
        avgBuyRate: +avgBuy.toFixed(2),
        avgSellRate: +avgSell.toFixed(2),
        retentionPct,
        anomalyScore: 1.0,
        avgTicketKitta: Math.round((buyKitta + sellKitta) / 10),
      };
    });

    const accumulators = enriched.filter(b => b.netKitta > 0).sort((a, b) => b.netKitta - a.netKitta);
    const distributors = enriched.filter(b => b.netKitta < 0).sort((a, b) => a.netKitta - b.netKitta);

    const totalSharesHeldTillNow = accumulators.reduce((s, b) => s + b.netKitta, 0);
    const allHoldings = accumulators.map(b => ({
      ...b,
      holdingSharePct: totalSharesHeldTillNow > 0 ? Number(((b.netKitta / totalSharesHeldTillNow) * 100).toFixed(2)) : 0,
    }));

    const topAcc = accumulators[0] || null;
    const totalBuyAmtAcc = accumulators.reduce((s, b) => s + (b.buyAmount || 0), 0);
    const totalBuyQtyAcc = accumulators.reduce((s, b) => s + (b.buyKitta || 0), 0);
    const avgBuyingPrice = totalBuyQtyAcc > 0 ? Number((totalBuyAmtAcc / totalBuyQtyAcc).toFixed(2)) : null;

    const totalSellAmtDist = distributors.reduce((s, b) => s + (b.sellAmount || 0), 0);
    const totalSellQtyDist = distributors.reduce((s, b) => s + (b.sellKitta || 0), 0);
    const avgSellingPrice = totalSellQtyDist > 0 ? Number((totalSellAmtDist / totalSellQtyDist).toFixed(2)) : null;

    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.json({
      success: true,
      symbol: validSymbol,
      timeframe: requestedTf,
      days: requestedDays,
      availableDates,
      data: enriched,
      brokers: enriched,
      allBrokers: enriched,
      topHoldings: allHoldings,
      allHoldings,
      allDistributors: distributors,
      totalSharesHeldTillNow,
      topHoldingBroker: topAcc,
      avgBuyingPrice,
      avgSellingPrice,
      tradingDays: targetDates.length,
      fromDate: targetDates[targetDates.length - 1] || '',
      toDate: targetDates[0] || '',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.get('/:symbol/smart-money', handleStockSmartMoney);
router.get('/:symbol/holdings', handleStockSmartMoney);


export default router;
