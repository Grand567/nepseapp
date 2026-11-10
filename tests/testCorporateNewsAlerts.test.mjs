import assert from 'node:assert';
import { extractStockSymbolFromText, pollLiveNewsAndIpoAlerts } from '../proxy/smartAlertEngine.mjs';
import { classifyCorporateArticle } from '../src/services/merolaganiNewsService.js';

console.log('Testing Corporate News & Announcements Pipeline...');

// 1. Test company name -> symbol resolution
const testCases = [
  { text: 'Asha Laghubitta Bittiya Sanstha Limited has published its provisional financial statement for the 1st quarter of FY 2083/84', expected: 'ALBSL' },
  { text: 'Barahi Hydropower Public Limited has published its provisional financial statement for the 1st quarter of FY 2083/84', expected: 'BHPL' },
  { text: 'Declaration of 3.78% Cash Dividend and 3.7% Bonus Share - Mahalaxmi Bikas Bank Limited (MLBL)', expected: 'MLBL' },
  { text: 'Api Power Company Limited has notified that its 23rd AGM is scheduled for Mangsir 18, 2083', expected: 'API' },
  { text: 'Manjushree Finance Limited has published a notice regarding unclaimed cash dividends', expected: 'MFIL' },
  { text: 'Reliable Nepal Life Insurance Limited has published a notice regarding the sale of shares', expected: 'RNLI' },
  { text: 'Mountain Energy Nepal Limited has declared 10.5% cash dividend', expected: 'MEN' },
  { text: 'Garima Bikas Bank Limited (GBBL) 20th AGM Minutes', expected: 'GBBL' }
];

for (const tc of testCases) {
  const resolved = extractStockSymbolFromText(tc.text);
  assert.strictEqual(resolved, tc.expected, `Expected ${tc.expected} for "${tc.text}", got ${resolved}`);
  console.log(`✅ Symbol resolved: "${tc.text.slice(0, 50)}..." -> #${resolved}`);
}

// 2. Test classifyCorporateArticle
const divClass = classifyCorporateArticle({ title: 'Declaration of 3.78% Cash Dividend and 3.7% Bonus Share' });
assert.strictEqual(divClass.type, 'DIVIDEND');
console.log('✅ Classify Dividend passed');

const rightClass = classifyCorporateArticle({ title: 'Notice regarding 1:1 Right Share Issue' });
assert.strictEqual(rightClass.type, 'RIGHT_SHARE');
console.log('✅ Classify Right Share passed');

const agmClass = classifyCorporateArticle({ title: 'Api Power Company Limited has notified that its 23rd AGM is scheduled' });
assert.strictEqual(agmClass.type, 'BOOK_CLOSURE');
console.log('✅ Classify Book Closure / AGM passed');

const finClass = classifyCorporateArticle({ title: 'Asha Laghubitta has published its provisional financial statement for the 1st quarter' });
assert.strictEqual(finClass.type, 'FINANCIAL');
console.log('✅ Classify Financial Statement passed');

console.log('🎉 All Corporate News & Announcements unit tests passed successfully!');
