// tests/todayDataSubfiles.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import {
  compileTodayStaticAnalytics,
  readTodayStaticAnalytics,
  initTodayTickStream,
  readTodayTickStream,
  ingestLiveTick,
  tickEventEmitter,
  TODAY_STATIC_ANALYTICS_JSON,
  TODAY_STATIC_ANALYTICS_GZ,
  TODAY_TICK_BY_TICK_JSON,
  TODAY_TICK_BY_TICK_GZ
} from '../proxy/utils/todayDataEngine.mjs';

test('Today Data Sub-Files: Compilation, Persistence & Statistical Precision', async (t) => {
  await t.test('Sub-File 1: today_static_analytics.json exists and has valid short/long term schemas', () => {
    const staticData = readTodayStaticAnalytics();
    assert.ok(staticData, 'Static analytics data must exist');
    assert.equal(staticData.file_type, 'TODAY_STATIC_ANALYTICS_SUBFILE');
    assert.ok(staticData.total_scrips > 0, 'Must contain compiled scrips');

    // Verify BARUN as canonical benchmark
    const barun = staticData.scrips.BARUN;
    assert.ok(barun, 'BARUN must be present in static analytics');
    
    // Check Short-Term Static
    const st = barun.short_term_static;
    assert.ok(st, 'Short term static object must exist');
    assert.ok(st.eod_price_reference.prev_close > 0, 'prev_close must be positive');
    assert.ok(st.eod_price_reference.circuit_ceiling > st.eod_price_reference.prev_close, 'Circuit ceiling must exceed prev_close');
    assert.ok(st.eod_price_reference.statistical_calculation, 'Calculation formula must be provided');
    assert.ok(st.eod_price_reference.interpretation, 'Interpretation must be provided');

    // Check Pivots
    assert.ok(st.pivot_points.classic.pp > 0, 'Classic pivot must exist');
    assert.ok(st.pivot_points.classic.r1 >= st.pivot_points.classic.pp, 'R1 must exceed PP');
    assert.ok(st.pivot_points.classic.s1 <= st.pivot_points.classic.pp, 'S1 must be below PP');
    assert.ok(st.pivot_points.camarilla.h4 > 0, 'Camarilla H4 must exist');

    // Check Oscillators & Risk
    assert.ok(st.volatility_and_risk.atr_14 > 0, 'ATR 14 must be positive');
    assert.ok(st.volatility_and_risk.min_stop_loss_distance > 0, 'Stop loss distance must be positive');
    assert.ok(st.daily_oscillators.rsi_14 >= 0 && st.daily_oscillators.rsi_14 <= 100, 'RSI must be between 0 and 100');
    assert.ok(st.daily_oscillators.ema_20 > 0, 'EMA 20 must be positive');

    // Check Smart Money 5D
    assert.ok(st.smart_money_5d_flow.bcr3_buy_pct >= 0, 'BCR3 must be defined');
    assert.ok(st.smart_money_5d_flow.operator_cost_floor > 0, 'Operator floor must be defined');
    assert.ok(st.smart_money_5d_flow.volume_profile_5d.poc_price > 0, 'POC price must be defined');

    // Check Long-Term Static
    const lt = barun.long_term_static;
    assert.ok(lt, 'Long term static object must exist');
    assert.equal(lt.corporate_capital_structure.face_value_npr, 100, 'Face value must be 100');
    assert.ok(lt.corporate_capital_structure.paid_up_capital_npr > 0, 'Paid up capital must be positive');
    assert.ok(lt.audited_quarterly_fundamentals.book_value_per_share > 0, 'BVPS must be positive');
    assert.ok(lt.valuation_models.graham_intrinsic_value > 0, 'Graham intrinsic value must be positive');
    assert.equal(lt.macro_10y_seasonality.seasonality_matrix_12m.length, 12, '12-month BS seasonality must be present');
    assert.ok(lt.statutory_regulatory_fees.sebon_fee_pct === 0.015, 'SEBON fee must be 0.015%');
    assert.ok(lt.statutory_regulatory_fees.circuit_limit_pct === 15.0, 'Circuit limit must be 15%');
  });

  await t.test('Sub-File 2: today_tick_by_tick.json handles dynamic ticks and level-2 depth', () => {
    initTodayTickStream();
    ingestLiveTick('NABIL', {
      ltp: 548.0,
      open: 545.0,
      high: 550.0,
      low: 544.0,
      prev_close: 544.0,
      volume: 45000,
      turnover: 24650000,
      trades: 350,
      bids: [{ price: 548.0, qty: 1000, orders: 2 }],
      asks: [{ price: 549.0, qty: 800, orders: 1 }],
      contracts: [{ contract_no: 101, buyer_broker: 58, seller_broker: 34, rate: 548.0, qty: 1000, amount: 548000 }]
    });

    const stream = readTodayTickStream();
    assert.equal(stream.file_type, 'TODAY_TICK_BY_TICK_STREAM_SUBFILE');
    const nabilTick = stream.ticks.NABIL;
    assert.ok(nabilTick, 'NABIL tick must be recorded');
    assert.equal(nabilTick.quote.ltp, 548.0);
    assert.equal(nabilTick.level2_depth.spread_npr, 1.0);
    assert.equal(nabilTick.recent_contract_stream[0].trade_type, 'Whale');
  });

  await t.test('SSE Real-Time EventEmitter broadcasts live ticks', (context, done) => {
    const testSymbol = 'HDL';
    const listener = (tickObj) => {
      if (tickObj.symbol === testSymbol) {
        assert.equal(tickObj.quote.ltp, 1285.0);
        tickEventEmitter.off('tick', listener);
        done();
      }
    };
    tickEventEmitter.on('tick', listener);

    ingestLiveTick(testSymbol, {
      ltp: 1285.0,
      open: 1270.0,
      prev_close: 1275.0,
      volume: 12000,
      turnover: 15400000
    });
  });

  await t.test('Both sub-files exist on disk in uncompressed and .gz formats', () => {
    assert.ok(fs.existsSync(TODAY_STATIC_ANALYTICS_JSON), 'today_static_analytics.json exists');
    assert.ok(fs.existsSync(TODAY_STATIC_ANALYTICS_GZ), 'today_static_analytics.json.gz exists');
    assert.ok(fs.existsSync(TODAY_TICK_BY_TICK_JSON), 'today_tick_by_tick.json exists');
    assert.ok(fs.existsSync(TODAY_TICK_BY_TICK_GZ), 'today_tick_by_tick.json.gz exists');
  });
});
