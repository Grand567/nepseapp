#!/usr/bin/env node
/**
 * scripts/liveSessionCheck.mjs
 *
 * Pre-Market / Live-Market / Post-Market Health, Stream & Parity Verifier.
 * Usage:
 *   node scripts/liveSessionCheck.mjs [--url http://127.0.0.1:5000] [--symbol NABIL]
 *   npm run audit:live
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE_URL = String(getArg('--url', process.env.AUDIT_URL || 'http://127.0.0.1:5000')).replace(/\/+$/, '');
const SYMBOL = String(getArg('--symbol', 'NABIL')).trim().toUpperCase();

let passed = 0;
let warned = 0;
let failed = 0;

function record(status, label, detail = '') {
  const tag = status === 'PASS' ? '[PASS]' : status === 'WARN' ? '[WARN]' : '[FAIL]';
  if (status === 'PASS') passed++;
  else if (status === 'WARN') warned++;
  else failed++;
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function fetchJsonWithTiming(endpoint, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Drabyashree-SessionVerifier/1.0',
      },
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = null;
    }
    return {
      status: res.status,
      headers: res.headers,
      contentType: String(res.headers.get('content-type') || ''),
      edgeCache: String(res.headers.get('x-edge-cache') || ''),
      originStatus: String(res.headers.get('x-origin-status') || ''),
      data: json,
      rawLength: text.length,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatHttpFailureDetail(resp, extra = '') {
  const parts = [`HTTP ${resp.status}`];
  if (resp.contentType) parts.push(`ct=${resp.contentType}`);
  if (resp.edgeCache) parts.push(`edge=${resp.edgeCache}`);
  if (resp.originStatus) parts.push(`origin=${resp.originStatus}`);
  if (extra) parts.push(extra);
  if (resp.latencyMs !== undefined) parts.push(`(${resp.latencyMs}ms)`);
  return parts.join(', ');
}

async function probeSseStream(endpoint, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: {
        Accept: 'text/event-stream',
        'User-Agent': 'Drabyashree-SessionVerifier/1.0',
      },
    });
    const contentType = String(res.headers.get('content-type') || '');
    let firstChunk = '';
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      try {
        const readPromise = reader.read();
        const race = await Promise.race([
          readPromise,
          new Promise((resolve) => setTimeout(() => resolve({ value: null, done: false }), 1500)),
        ]);
        if (race?.value) {
          firstChunk = new TextDecoder().decode(race.value).slice(0, 120).replace(/\s+/g, ' ').trim();
        }
      } finally {
        try {
          await reader.cancel();
        } catch (_) {}
      }
    }
    controller.abort();
    return {
      ok: res.status === 200 && contentType.toLowerCase().includes('text/event-stream'),
      status: res.status,
      contentType,
      firstChunk,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      firstChunk: '',
      latencyMs: Date.now() - start,
      error: err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function hasAnyNaN(val, depth = 0) {
  if (depth > 8 || val == null) return false;
  if (typeof val === 'number') return Number.isNaN(val);
  if (typeof val === 'string') return val.trim() === 'NaN';
  if (Array.isArray(val)) return val.some((item) => hasAnyNaN(item, depth + 1));
  if (typeof val === 'object') return Object.values(val).some((v) => hasAnyNaN(v, depth + 1));
  return false;
}

async function main() {
  console.log('======================================================================');
  console.log('DRABYASHREE NEPSE — LIVE / OFF-HOURS SESSION VERIFIER');
  console.log(`Target Proxy: ${BASE_URL} | Probe Symbol: ${SYMBOL}`);
  console.log('======================================================================\n');

  let marketIsOpen = false;
  let marketModeLabel = 'UNKNOWN';

  // Pre-wake remote HTTPS Render/Worker deployments so Free-tier spin-down (50s+) doesn't cascade-abort Steps 1-4
  const skipWake = process.argv.includes('--no-wake');
  if (!skipWake && BASE_URL.startsWith('https://')) {
    const wakeStart = Date.now();
    let awake = false;
    while (Date.now() - wakeStart < 70000) {
      try {
        const probe = await fetchJsonWithTiming('/api/ping', 8000);
        if (probe.status === 200) {
          awake = true;
          if (Date.now() - wakeStart > 3000) {
            console.log(`  [WAKE] Remote proxy awake in ${Math.round((Date.now() - wakeStart) / 1000)}s.\n`);
          }
          break;
        }
        if (probe.status === 429) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!awake) {
      console.log('  [WAKE] Warning: /api/ping did not answer HTTP 200 within 70s; running timed probes anyway...\n');
    }
  }

  let upstreamHtml429Detected = false;
  const trackHtml429 = (resp) => {
    if (resp?.status === 429 && String(resp.contentType || '').toLowerCase().includes('text/html')) {
      upstreamHtml429Detected = true;
    }
  };

  // 1. Health check
  try {
    const h = await fetchJsonWithTiming('/health', 5000);
    trackHtml429(h);
    if (h.status === 200 && h.latencyMs < 2000) {
      record('PASS', 'GET /health', `HTTP ${h.status} in ${h.latencyMs}ms`);
    } else if (h.status === 200) {
      record('WARN', 'GET /health', `HTTP ${h.status} slow (${h.latencyMs}ms >= 2000ms)`);
    } else {
      record('FAIL', 'GET /health', formatHttpFailureDetail(h));
    }
  } catch (err) {
    record('FAIL', 'GET /health', err?.message || String(err));
  }

  // 2. Market status & cache discipline
  try {
    const st = await fetchJsonWithTiming('/api/market-status', 10000);
    trackHtml429(st);
    const body = st.data?.data || st.data || {};
    marketIsOpen = Boolean(body.isOpen);
    const session = body.session || body.status || body.statusLabel || (marketIsOpen ? 'LIVE' : 'CLOSED');
    const asOfDate = body.asOfDate || body.sessionDate || body.lastClosedSessionDate || body.targetSessionDate || 'unknown';
    marketModeLabel = marketIsOpen ? 'LIVE' : 'PRE/POST-MARKET';
    const cacheCtrl = String(st.headers.get('cache-control') || '');

    if (st.status === 200 && st.data) {
      record('PASS', 'GET /api/market-status', `mode=${marketModeLabel}, isOpen=${marketIsOpen}, session=${session}, asOf=${asOfDate} (${st.latencyMs}ms)`);
      if (marketIsOpen && !cacheCtrl.toLowerCase().includes('no-store')) {
        record('WARN', 'Live /api/market-status Cache-Control', `header="${cacheCtrl || 'none'}" (expected no-store during live hours)`);
      }
    } else {
      record('FAIL', 'GET /api/market-status', formatHttpFailureDetail(st));
    }
  } catch (err) {
    record('FAIL', 'GET /api/market-status', err?.message || String(err));
  }

  // 3. Indices validity & finite NEPSE > 1000
  try {
    const idx = await fetchJsonWithTiming('/api/indices', 15000);
    trackHtml429(idx);
    const payload = idx.data?.data || idx.data || {};
    const nepseObj = payload.nepse || payload.NEPSE || null;
    const nepseVal = Number(nepseObj?.value ?? nepseObj?.currentValue ?? nepseObj?.indexValue ?? nepseObj?.close ?? 0);
    const nanDetected = hasAnyNaN(payload);
    if (idx.status === 200 && Number.isFinite(nepseVal) && nepseVal > 1000 && !nanDetected) {
      record('PASS', 'GET /api/indices', `NEPSE=${nepseVal}, zero NaN (${idx.latencyMs}ms)`);
    } else {
      record('FAIL', 'GET /api/indices', formatHttpFailureDetail(idx, `NEPSE=${nepseVal}, hasNaN=${nanDetected}`));
    }
  } catch (err) {
    record('FAIL', 'GET /api/indices', err?.message || String(err));
  }

  // 4. Today prices breadth & LTP validity
  try {
    const tp = await fetchJsonWithTiming('/api/today-prices', 20000);
    trackHtml429(tp);
    const rows = Array.isArray(tp.data) ? tp.data : (Array.isArray(tp.data?.data) ? tp.data.data : (Array.isArray(tp.data?.stocks) ? tp.data.stocks : []));
    const validLtpCount = rows.filter((r) => {
      const ltp = Number(r?.ltp ?? r?.close ?? r?.lastTradedPrice ?? 0);
      return Number.isFinite(ltp) && ltp > 0;
    }).length;
    if (tp.status === 200 && rows.length >= 200 && validLtpCount >= 200) {
      record('PASS', 'GET /api/today-prices', `${rows.length} securities, ${validLtpCount} finite positive LTPs (${tp.latencyMs}ms)`);
    } else {
      record('FAIL', 'GET /api/today-prices', formatHttpFailureDetail(tp, `rows=${rows.length}, validLtp=${validLtpCount}`));
    }
  } catch (err) {
    record('FAIL', 'GET /api/today-prices', err?.message || String(err));
  }

  // 5. Market depth endpoint responsiveness
  try {
    const md = await fetchJsonWithTiming(`/api/nepse/market-depth/${encodeURIComponent(SYMBOL)}`, 15000);
    trackHtml429(md);
    if (md.status === 200 && md.data && typeof md.data === 'object') {
      record('PASS', `GET /api/nepse/market-depth/${SYMBOL}`, `HTTP 200 valid payload (${md.latencyMs}ms)`);
    } else {
      record('FAIL', `GET /api/nepse/market-depth/${SYMBOL}`, formatHttpFailureDetail(md));
    }
  } catch (err) {
    record('FAIL', `GET /api/nepse/market-depth/${SYMBOL}`, err?.message || String(err));
  }

  // 6. Broker heatmap / matrix latest non-empty unmasked guard
  try {
    const hm = await fetchJsonWithTiming('/api/smart-money/broker-heatmap', 20000);
    trackHtml429(hm);
    const dataObj = hm.data?.data || hm.data || {};
    const matrix = Array.isArray(dataObj.matrix) ? dataObj.matrix : [];
    const matrixDate = dataObj.businessDate || dataObj.date || dataObj.asOfDate || null;
    const diskLatestPath = path.join(ROOT_DIR, 'proxy', 'data', 'broker_matrix_latest.json');
    let diskCount = 0;
    let diskDate = null;
    if (fs.existsSync(diskLatestPath)) {
      const parsed = JSON.parse(fs.readFileSync(diskLatestPath, 'utf8'));
      diskCount = Array.isArray(parsed?.matrix) ? parsed.matrix.length : 0;
      diskDate = parsed?.date || parsed?.businessDate || null;
    }
    if (hm.status === 200 && matrix.length > 0 && matrixDate && diskCount > 0) {
      record('PASS', 'GET /api/smart-money/broker-heatmap + broker_matrix_latest.json', `API matrix=${matrix.length} brokers (${matrixDate}), disk=${diskCount} (${diskDate}) (${hm.latencyMs}ms)`);
    } else {
      record('FAIL', 'GET /api/smart-money/broker-heatmap + broker_matrix_latest.json', formatHttpFailureDetail(hm, `apiMatrix=${matrix.length}, apiDate=${matrixDate}, diskMatrix=${diskCount}`));
    }
  } catch (err) {
    record('FAIL', 'GET /api/smart-money/broker-heatmap', err?.message || String(err));
  }

  // 7. Broker analysis endpoint
  try {
    const ba = await fetchJsonWithTiming(`/api/broker-analysis/${encodeURIComponent(SYMBOL)}`, 20000);
    trackHtml429(ba);
    const payload = ba.data?.data || ba.data || null;
    if (ba.status === 200 && payload && typeof payload === 'object') {
      const brokersCount = Array.isArray(payload.brokers) ? payload.brokers.length : 0;
      record('PASS', `GET /api/broker-analysis/${SYMBOL}`, `HTTP 200, brokers=${brokersCount} (${ba.latencyMs}ms)`);
    } else {
      record('FAIL', `GET /api/broker-analysis/${SYMBOL}`, formatHttpFailureDetail(ba));
    }
  } catch (err) {
    record('FAIL', `GET /api/broker-analysis/${SYMBOL}`, err?.message || String(err));
  }

  // 8. SSE live stream probes
  for (const streamPath of [
    `/api/today/ticks/stream?symbol=${encodeURIComponent(SYMBOL)}`,
    `/api/floorsheet/stream?symbol=${encodeURIComponent(SYMBOL)}`,
  ]) {
    const sse = await probeSseStream(streamPath, 4000);
    trackHtml429(sse);
    if (sse.ok) {
      record('PASS', `SSE ${streamPath}`, `HTTP ${sse.status}, content-type=${sse.contentType}${sse.firstChunk ? `, event="${sse.firstChunk}"` : ''} (${sse.latencyMs}ms)`);
    } else {
      record('FAIL', `SSE ${streamPath}`, `status=${sse.status}, ct=${sse.contentType}, err=${sse.error || 'invalid stream'}`);
    }
  }

  // 9. Local broker vault parity spot check (GHL.json latestDate)
  try {
    const ghlPath = path.join(ROOT_DIR, 'proxy', 'data', 'broker_vault', 'GHL.json');
    if (!fs.existsSync(ghlPath)) {
      record('FAIL', 'Local Vault GHL.json', 'File missing');
    } else {
      const ghl = JSON.parse(fs.readFileSync(ghlPath, 'utf8'));
      const latestDate = typeof ghl?.latestDate === 'string' ? ghl.latestDate.trim() : '';
      if (latestDate.length >= 10) {
        record('PASS', 'Local Vault GHL.json', `latestDate=${latestDate}`);
      } else {
        record('FAIL', 'Local Vault GHL.json', `missing or invalid latestDate=${ghl?.latestDate}`);
      }
    }
  } catch (err) {
    record('FAIL', 'Local Vault GHL.json', err?.message || String(err));
  }

  // 10. Dual-Tier Radar & Unbiased Regime endpoint
  try {
    const dt = await fetchJsonWithTiming('/api/radar/dual-tier', 20000);
    trackHtml429(dt);
    if (dt.status === 200 && dt.data?.success && typeof dt.data?.marketRegime === 'string') {
      const t1 = Array.isArray(dt.data?.tier1Sniper) ? dt.data.tier1Sniper.length : 0;
      const t2 = Array.isArray(dt.data?.tier2Balanced) ? dt.data.tier2Balanced.length : 0;
      record('PASS', 'GET /api/radar/dual-tier', `regime=${dt.data.marketRegime}, tier1=${t1}, tier2=${t2} (${dt.latencyMs}ms)`);
    } else {
      record('FAIL', 'GET /api/radar/dual-tier', formatHttpFailureDetail(dt));
    }
  } catch (err) {
    record('FAIL', 'GET /api/radar/dual-tier', err?.message || String(err));
  }

  console.log('\n----------------------------------------------------------------------');
  console.log(`MODE: ${marketModeLabel} | PASSED: ${passed} | WARN: ${warned} | FAILED: ${failed}`);
  console.log('----------------------------------------------------------------------');
  if (upstreamHtml429Detected) {
    console.log('[DIAGNOSIS] Upstream returned HTTP 429 text/html (Render/Cloudflare ingress challenge, NOT Express JSON limiter).');
    console.log('            Ensure cloudflare/worker.js is deployed (`cd cloudflare && npx wrangler deploy`) and wait ~60s before re-probing,');
    console.log('            or test Render origin directly: `node scripts/liveSessionCheck.mjs --url https://drabyashree-nepse-hub.onrender.com`');
  }
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[liveSessionCheck] Fatal error:', err);
  process.exit(1);
});
