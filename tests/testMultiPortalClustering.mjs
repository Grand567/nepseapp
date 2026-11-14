import { describe, it } from 'node:test';
import assert from 'node:assert';

const STOP_WORDS = new Set([
  'को', 'मा', 'र', 'ले', 'बाट', 'का', 'लाई', 'हुने', 'भयो', 'गर्ने', 'हुँदा', 'गरेको', 'थप', 'भने', 'पनि', 'गर्न',
  'भएको', 'छ', 'छन्', 'थियो', 'गरे', 'यो', 'यस', 'ती', 'यी', 'हुन', 'गर्यो', 'लागि', 'प्रति', 'सम्म', 'धेरै',
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'is', 'are', 'was', 'were',
  'from', 'as', 'has', 'have', 'had', 'its', 'their', 'be', 'been', 'this', 'that', 'after', 'per', 'pct', 'percent'
]);

function extractKeywords(title) {
  if (!title) return new Set();
  const clean = String(title)
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’।/\\\[\]0-9]/g, ' ')
    .trim();
  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

function normalizeSource(src, url = '') {
  const s = String(src || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (s.includes('merolagani') || u.includes('merolagani')) return 'merolagani';
  if (s.includes('sharesansar') || u.includes('sharesansar')) return 'sharesansar';
  if (s.includes('nepalipaisa') || u.includes('nepalipaisa')) return 'nepalipaisa';
  if (s.includes('bizshala') || u.includes('bizshala')) return 'bizshala';
  if (s.includes('karobar') || u.includes('karobar')) return 'karobar';
  if (s.includes('clickmandu') || u.includes('clickmandu')) return 'clickmandu';
  return s || 'other';
}

function computeCrossPortalCoverage(articles) {
  const coverageMap = new Map(); // index -> Set of distinct source names
  const parsed = articles.map((item, idx) => {
    const title = String(item.title || '').trim();
    const source = normalizeSource(item.source, item.url || item.link);
    const keywords = extractKeywords(title);
    const symbol = item.symbol ? String(item.symbol).toUpperCase().trim() : null;
    return { idx, title, source, keywords, symbol };
  });

  for (let i = 0; i < parsed.length; i++) {
    const a = parsed[i];
    if (!coverageMap.has(a.idx)) {
      coverageMap.set(a.idx, new Set([a.source]));
    }
    for (let j = i + 1; j < parsed.length; j++) {
      const b = parsed[j];
      if (a.source === b.source) continue; // Same portal doesn't count as cross-portal

      let isMatch = false;

      // 1. Symbol match with >= 1 overlapping keyword
      if (a.symbol && b.symbol && a.symbol === b.symbol && a.symbol !== 'NEPSE') {
        let common = 0;
        for (const kw of a.keywords) {
          if (b.keywords.has(kw)) common++;
        }
        if (common >= 1) isMatch = true;
      }

      // 2. Multi-word title keyword overlap (>= 2 common significant words)
      if (!isMatch) {
        let common = 0;
        for (const kw of a.keywords) {
          if (b.keywords.has(kw)) common++;
        }
        if (common >= 2) isMatch = true;
      }

      if (isMatch) {
        if (!coverageMap.has(a.idx)) coverageMap.set(a.idx, new Set([a.source]));
        if (!coverageMap.has(b.idx)) coverageMap.set(b.idx, new Set([b.source]));
        coverageMap.get(a.idx).add(b.source);
        coverageMap.get(b.idx).add(a.source);
      }
    }
  }

  return coverageMap;
}

// Tests
console.log('--- Running Multi-Portal Clustering Test ---');

const sampleArticles = [
  {
    title: 'नेपाल राष्ट्र बैंकद्वारा नयाँ मौद्रिक नीति जारी, शेयर बजारमा उत्साह',
    source: 'MeroLagani',
    symbol: 'NEPSE'
  },
  {
    title: 'राष्ट्र बैंकद्वारा मौद्रिक नीति सार्वजनिक, लगानीकर्ता उत्साहित',
    source: 'ShareSansar',
    symbol: 'NEPSE'
  },
  {
    title: 'ग्लोबल आइएमई बैंक र बैंक अफ काठमाण्डूको मर्जर सम्पन्न, एकीकृत कारोबार सुरु',
    source: 'NepaliPaisa',
    symbol: 'GBIME'
  },
  {
    title: 'ग्लोबल आइएमई र बिओके मर्जर प्रक्रिया पूरा, नयाँ स्वाप अनुपात तय',
    source: 'Bizshala',
    symbol: 'GBIME'
  },
  {
    title: 'ककनी गाउँपालिकामा बाटो निर्माण तीव्र गतिमा',
    source: 'Karobar',
    symbol: null
  }
];

const coverage = computeCrossPortalCoverage(sampleArticles);

for (const [idx, sources] of coverage.entries()) {
  console.log(`Article [${idx}] "${sampleArticles[idx].title.slice(0, 30)}..." -> Sources (${sources.size}):`, Array.from(sources));
}

assert.strictEqual(coverage.get(0).size >= 2, true, 'Article 0 should be covered by at least 2 portals');
assert.strictEqual(coverage.get(1).size >= 2, true, 'Article 1 should be covered by at least 2 portals');
assert.strictEqual(coverage.get(2).size >= 2, true, 'Article 2 should be covered by at least 2 portals');
assert.strictEqual(coverage.get(3).size >= 2, true, 'Article 3 should be covered by at least 2 portals');
assert.strictEqual(coverage.get(4).size === 1, true, 'Article 4 should only have 1 source (not trending)');

console.log('✅ All multi-portal coverage assertions passed!');
