import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

const stockMap = JSON.parse(fs.readFileSync('proxy/stockmap.json', 'utf8'));

function normalizeCorpName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(limited|ltd|public limited|company|co|pvt|corp|corporation|promoter share|promoter|promotor)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build name matchers
const nameMatchers = [];
for (const [sym, info] of Object.entries(stockMap)) {
  if (!info || !info.name) continue;
  const isPromoter = sym.endsWith('P') || sym.endsWith('PO') || sym.includes('PROMOTER');
  const targetSym = isPromoter ? sym.replace(/P$|PO$/, '') : sym;
  
  const cleanName = normalizeCorpName(info.name);
  
  if (cleanName.length >= 3) {
    nameMatchers.push({ sym: targetSym, pattern: cleanName, len: cleanName.length });
  }

  // Microfinance alias
  if (cleanName.includes('microfinance')) {
    const alias = cleanName.replace('microfinance', 'laghubitta').trim();
    nameMatchers.push({ sym: targetSym, pattern: alias, len: alias.length });
  } else if (cleanName.includes('laghubitta')) {
    const alias = cleanName.replace('laghubitta', 'microfinance').trim();
    nameMatchers.push({ sym: targetSym, pattern: alias, len: alias.length });
  }
}

// Add direct symbol matchers
for (const sym of Object.keys(stockMap)) {
  if (sym.length >= 3) {
    nameMatchers.push({ sym, pattern: sym.toLowerCase(), isTicker: true, len: sym.length });
  }
}

// Sort longest first
nameMatchers.sort((a, b) => b.len - a.len);

function categorize(title) {
  const lower = title.toLowerCase();
  const isDividend = ['लाभांश', 'बोनस', 'नगद लाभांश', 'dividend', 'bonus share', 'bonus', 'cash dividend', 'प्रतिशत लाभांश'].some(kw => lower.includes(kw));
  const isRightShare = ['हकप्रद', 'right share', 'right issue', 'rights issue', 'हकप्रद सेयर'].some(kw => lower.includes(kw));
  const isBookClosure = ['बुक क्लोज', 'बुकक्लोज', 'साधारण सभा', 'book closure', 'agm', 'annual general meeting', 'special general meeting', 'sgm'].some(kw => lower.includes(kw));
  const isFinancial = ['वित्तीय विवरण', 'त्रैमासिक', 'quarterly report', 'quarterly', 'financial statement', 'financial report', 'provisional financial', 'earnings', 'खुद नाफा', 'quarter of fy'].some(kw => lower.includes(kw));

  if (isDividend) return '💰 DIVIDEND';
  if (isRightShare) return '📈 RIGHT_SHARE';
  if (isBookClosure) return '📅 AGM / BOOK_CLOSURE';
  if (isFinancial) return '📊 FINANCIAL_REPORT';
  return '📰 CORPORATE_NEWS';
}

async function test() {
  const r = await axios.get('https://merolagani.com/AnnouncementList.aspx', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 8000
  });
  const $ = cheerio.load(r.data);
  let matched = 0;
  let total = 0;
  $('.media').each((i, el) => {
    const linkEl = $(el).find('.media-body a[href*="AnnouncementDetail.aspx"]');
    if (!linkEl.length) return;
    const text = linkEl.text().replace(/\s+/g, ' ').trim();
    total++;
    const normText = normalizeCorpName(text);
    let found = null;
    for (const m of nameMatchers) {
      if (m.isTicker) {
        const regex = new RegExp(`(^|\\s)${m.pattern}(\\s|$)`, 'i');
        if (regex.test(normText)) {
          found = m.sym;
          break;
        }
      } else if (normText.includes(m.pattern)) {
        found = m.sym;
        break;
      }
    }
    const cat = categorize(text);
    console.log(`[${(found || 'NO_MATCH').padEnd(7)}] [${cat.padEnd(23)}] -> ${text.slice(0, 65)}...`);
    if (found) matched++;
  });
  console.log(`\nTotal announcements: ${total}, Matched symbols: ${matched} (${Math.round(matched/total*100)}%)`);
}
test().catch(console.error);
