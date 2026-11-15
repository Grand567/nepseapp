import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

process.env.SUPPRESS_TEST_ALERTS = 'true';

const SEEN_NEWS_PATH = path.resolve(process.cwd(), 'proxy/data/seen_news_keys.json');
const HISTORY_PATH = path.resolve(process.cwd(), 'proxy/data/smart_alert_history.json');

const hadSeenFile = fs.existsSync(SEEN_NEWS_PATH);
const origSeenContent = hadSeenFile ? fs.readFileSync(SEEN_NEWS_PATH, 'utf8') : null;
const hadHistoryFile = fs.existsSync(HISTORY_PATH);
const origHistoryContent = hadHistoryFile ? fs.readFileSync(HISTORY_PATH, 'utf8') : null;

const { pollLiveNewsAndIpoAlerts, getSmartAlertHistory } = await import('../proxy/smartAlertEngine.mjs');

async function runTest() {
  console.log('🧪 Starting 9-Portal Services Tab, Financial Results Suppression & Option 2 Alerts Test...');
  const tag = Date.now().toString(36);

  // Use scraper object matching proxy/workers.mjs wiring of all 9 Services tab portals
  const scrapersPayload = {
    scrapeMeroLaganiAnnouncements: async () => [
      {
        id: `test_merger_${tag}`,
        title: 'ग्लोबल आइएमई बैंक र बिओकेको मर्जर प्रक्रिया सम्पन्न, १:१ स्वाप अनुपात तय',
        source: 'MeroLagani',
        symbol: 'GBIME',
        url: `https://merolagani.com/news/101/${tag}`
      }
    ],
    scrapeMeroLaganiNews: async () => [
      {
        id: `test_earnings_${tag}`,
        title: 'NABIL Bank publishes Q3 provisional financial report showing net profit',
        source: 'MeroLagani',
        symbol: 'NABIL',
        url: `https://merolagani.com/news/107/${tag}`
      }
    ],
    scrapeShareSansarNews: async () => [
      {
        id: `test_sebon_${tag}`,
        title: 'नेपाल धितोपत्र बोर्डबाट नयाँ ब्रोकर लाइसेन्सको अन्तिम स्वीकृति तथा सञ्चालन अनुमति',
        source: 'ShareSansar',
        symbol: null,
        url: `https://sharesansar.com/news/102/${tag}`
      },
      {
        id: `test_9portal_ss_${tag}`,
        title: 'नेपाल राष्ट्र बैंकको नयाँ मौद्रिक समिक्षा र शेयर धितो कर्जा सीमा हेरफेर तयारी',
        source: 'ShareSansar',
        symbol: null,
        url: `https://sharesansar.com/news/201/${tag}`
      }
    ],
    fetchNepaliPaisaNews: async () => [
      {
        id: `test_allotment_${tag}`,
        title: 'सान्जेन जलविद्युत कम्पनीको साधारण सेयर बाँडफाँड सम्पन्न, नतिजा सार्वजनिक',
        source: 'NepaliPaisa',
        symbol: 'SANJEN',
        url: `https://nepalipaisa.com/news/103/${tag}`
      }
    ],
    scrapeBizshalaNews: async () => [
      {
        id: `test_milestone_${tag}`,
        title: 'नेप्से परिसूचक ३२ अंकले वृद्धि, शेयर बजार कारोबार रकम ५ अर्ब नाघ्यो',
        source: 'Bizshala',
        symbol: 'NEPSE',
        url: `https://bizshala.com/news/104/${tag}`
      },
      {
        id: `test_routine_${tag}`,
        title: 'कम्पनीको नयाँ एक्सटेन्सन काउन्टर धादिङबेंसीमा औपचारिक शुभारम्भ गरिएको छ',
        source: 'Bizshala',
        symbol: null,
        url: `https://bizshala.com/news/106/${tag}`
      }
    ],
    fetchClickmanduNews: async () => [
      {
        id: `test_trending_a_${tag}`,
        title: 'प्रधानमन्त्री र अर्थमन्त्रीद्वारा पूँजी बजार सुधारका लागि विशेष निर्देशन',
        source: 'Clickmandu',
        symbol: null,
        url: `https://clickmandu.com/news/105a/${tag}`
      }
    ],
    fetchKarobarNews: async () => [
      {
        id: `test_trending_b_${tag}`,
        title: 'पूँजी बजार सुधारका लागि अर्थमन्त्रीको विशेष निर्देशन, लगानीकर्तामा आशा',
        source: 'Karobar',
        symbol: null,
        url: `https://karobar.com/news/105b/${tag}`
      }
    ],
    scrapeBikashNews: async () => [
      {
        id: `test_9portal_bn_${tag}`,
        title: 'नेपाल राष्ट्र बैंकको नयाँ मौद्रिक समिक्षा र शेयर धितो कर्जा सीमा हेरफेर प्रस्ताव',
        source: 'BikashNews',
        symbol: null,
        url: `https://bikashnews.com/news/202/${tag}`
      }
    ],
    scrapeArthaKendraNews: async () => [
      {
        id: `test_earnings_np_${tag}`,
        title: 'सिटिजन्स बैंकको त्रैमासिक वित्तीय विवरण सार्वजनिक',
        source: 'ArthaKendra',
        symbol: 'CZBIL',
        url: `https://arthakendra.com/news/203/${tag}`
      }
    ],
    scrapeArthaSarokarNews: async () => [
      {
        id: `test_9portal_as_${tag}`,
        title: 'नेपाल राष्ट्र बैंकको नयाँ मौद्रिक समिक्षा र शेयर धितो कर्जा सीमा हेरफेर चर्चा',
        source: 'ArthaSarokar',
        symbol: null,
        url: `https://arthasarokar.com/news/204/${tag}`
      }
    ],
    getLiveIpoListings: async () => []
  };

  // Poll once to evaluate
  await pollLiveNewsAndIpoAlerts(scrapersPayload);

  const history = getSmartAlertHistory();

  // 1. Merger & Acquisition
  const mergerAlert = history.find(a => a.id === `news_test_merger_${tag}`);
  assert.ok(mergerAlert, 'Merger alert must be in alert history');
  assert.strictEqual(mergerAlert.type, 'MERGER_ALERT', 'Type should be MERGER_ALERT');
  console.log('✅ Merger & Acquisition alert validated:', mergerAlert.title);

  // 2. SEBON Regulatory Approval
  const sebonAlert = history.find(a => a.id === `news_test_sebon_${tag}`);
  assert.ok(sebonAlert, 'SEBON approval alert must be in alert history');
  assert.strictEqual(sebonAlert.type, 'SEBON_APPROVAL_ALERT', 'Type should be SEBON_APPROVAL_ALERT');
  console.log('✅ SEBON Regulatory Approval alert validated:', sebonAlert.title);

  // 3. IPO / FPO Allotment Result
  const allotmentAlert = history.find(a => a.id === `news_test_allotment_${tag}`);
  assert.ok(allotmentAlert, 'Allotment alert must be in alert history');
  assert.strictEqual(allotmentAlert.type, 'ALLOTMENT_ALERT', 'Type should be ALLOTMENT_ALERT');
  console.log('✅ Allotment Result alert validated:', allotmentAlert.title);

  // 4. Daily Market Close & Milestone
  const milestoneAlert = history.find(a => a.id === `news_test_milestone_${tag}`);
  assert.ok(milestoneAlert, 'Market milestone alert must be in alert history');
  assert.strictEqual(milestoneAlert.type, 'MARKET_MILESTONE_ALERT', 'Type should be MARKET_MILESTONE_ALERT');
  console.log('✅ Market Milestone alert validated:', milestoneAlert.title);

  // 5. Multi-Portal Trending Story (Clickmandu + Karobar)
  const trendingMatches = history.filter(a => a.id === `news_test_trending_a_${tag}` || a.id === `news_test_trending_b_${tag}`);
  assert.strictEqual(trendingMatches.length, 1, 'Multi-portal cluster should emit exactly 1 notification, not duplicates');
  assert.strictEqual(trendingMatches[0].type, 'TRENDING_NEWS_ALERT', 'Type should be TRENDING_NEWS_ALERT');
  assert.ok(trendingMatches[0].body.includes('Covered by:'), 'Trending body should list covering portals');
  console.log('✅ Clickmandu+Karobar Trending alert validated (cluster deduplicated):', trendingMatches[0].title);

  // 6. Newly Wired Services Tab Portals (ShareSansar + BikashNews + Artha Sarokar -> 3 portals!)
  const ninePortalMatches = history.filter(a =>
    a.id === `news_test_9portal_ss_${tag}` ||
    a.id === `news_test_9portal_bn_${tag}` ||
    a.id === `news_test_9portal_as_${tag}`
  );
  assert.strictEqual(ninePortalMatches.length, 1, '3-portal story across ShareSansar, BikashNews, ArthaSarokar must emit 1 clustered notification');
  assert.strictEqual(ninePortalMatches[0].portalCount, 3, 'Should detect 3 distinct Services tab portals');
  assert.ok(ninePortalMatches[0].body.includes('BikashNews'), 'Body should include BikashNews');
  assert.ok(ninePortalMatches[0].body.includes('Artha Sarokar'), 'Body should include Artha Sarokar');
  console.log('✅ 9-Portal Most Covered clustering validated:', ninePortalMatches[0].title, '|', ninePortalMatches[0].body);

  // 7. Financial Results (EARNINGS_ALERT) MUST be inAppOnly & suppressed from status bar push
  const earningsEn = history.find(a => a.id === `news_test_earnings_${tag}`);
  const earningsNp = history.find(a => a.id === `news_test_earnings_np_${tag}`);
  assert.ok(earningsEn, 'English Financial Results should be recorded in-app only');
  assert.strictEqual(earningsEn.type, 'EARNINGS_ALERT');
  assert.strictEqual(earningsEn.inAppOnly, true, 'English Financial Results must have inAppOnly: true');
  assert.strictEqual(earningsEn.pushStatusBar, false, 'English Financial Results must have pushStatusBar: false');
  assert.ok(earningsNp, 'Nepali Financial Results from ArthaKendra should be recorded in-app only');
  assert.strictEqual(earningsNp.type, 'EARNINGS_ALERT');
  assert.strictEqual(earningsNp.inAppOnly, true, 'Nepali Financial Results must have inAppOnly: true');
  assert.strictEqual(earningsNp.pushStatusBar, false, 'Nepali Financial Results must have pushStatusBar: false');
  console.log('✅ Financial Results status bar suppression validated (inAppOnly: true, pushStatusBar: false)');
}

runTest()
  .then(() => {
    console.log('🎉 All 9-Portal Services Tab, Financial Results suppression, and Trending tests passed!');
  })
  .finally(() => {
    try {
      if (hadSeenFile) fs.writeFileSync(SEEN_NEWS_PATH, origSeenContent, 'utf8');
      else if (fs.existsSync(SEEN_NEWS_PATH)) fs.unlinkSync(SEEN_NEWS_PATH);

      if (hadHistoryFile) fs.writeFileSync(HISTORY_PATH, origHistoryContent, 'utf8');
      else if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
    } catch (_) {}
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
