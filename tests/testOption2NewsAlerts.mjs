import assert from 'node:assert';
import { pollLiveNewsAndIpoAlerts, getSmartAlertHistory } from '../proxy/smartAlertEngine.mjs';

async function runTest() {
  console.log('🧪 Starting Option 2 & Multi-Portal Trending News Alerts Test...');

  // Mock articles for Option 2 categories + Multi-Portal Trending story + Routine PR notice
  const testArticles = [
    // 1. 🤝 Merger & Acquisition
    {
      id: 'test_merger_01',
      title: 'ग्लोबल आइएमई बैंक र बिओकेको मर्जर प्रक्रिया सम्पन्न, १:१ स्वाप अनुपात तय',
      source: 'MeroLagani',
      symbol: 'GBIME',
      url: 'https://merolagani.com/news/101'
    },
    // 2. 📜 SEBON & Regulatory Approvals
    {
      id: 'test_sebon_02',
      title: 'नेपाल धितोपत्र बोर्डबाट नयाँ ब्रोकर लाइसेन्सको अन्तिम स्वीकृति तथा सञ्चालन अनुमति',
      source: 'ShareSansar',
      symbol: null,
      url: 'https://sharesansar.com/news/102'
    },
    // 3. 🎯 IPO / FPO Allotment Results
    {
      id: 'test_allotment_03',
      title: 'सान्जेन जलविद्युत कम्पनीको साधारण सेयर बाँडफाँड सम्पन्न, नतिजा सार्वजनिक',
      source: 'NepaliPaisa',
      symbol: 'SANJEN',
      url: 'https://nepalipaisa.com/news/103'
    },
    // 4. 📊 Daily NEPSE Market Close & Index Milestones
    {
      id: 'test_milestone_04',
      title: 'नेप्से परिसूचक ३२ अंकले वृद्धि, शेयर बजार कारोबार रकम ५ अर्ब नाघ्यो',
      source: 'Bizshala',
      symbol: 'NEPSE',
      url: 'https://bizshala.com/news/104'
    },
    // 5. 🔥 Multi-Portal Trending Story (Covered across 2 portals: Clickmandu + Karobar)
    {
      id: 'test_trending_05a',
      title: 'प्रधानमन्त्री र अर्थमन्त्रीद्वारा पूँजी बजार सुधारका लागि विशेष निर्देशन',
      source: 'Clickmandu',
      symbol: null,
      url: 'https://clickmandu.com/news/105a'
    },
    {
      id: 'test_trending_05b',
      title: 'पूँजी बजार सुधारका लागि अर्थमन्त्रीको विशेष निर्देशन, लगानीकर्तामा आशा',
      source: 'Karobar',
      symbol: null,
      url: 'https://karobar.com/news/105b'
    },
    // 6. Routine PR Notice (Single portal, routine announcement - should NOT trigger heads-up push)
    {
      id: 'test_routine_06',
      title: 'कम्पनीको नयाँ एक्सटेन्सन काउन्टर धादिङबेंसीमा औपचारिक शुभारम्भ गरिएको छ',
      source: 'Bizshala',
      symbol: null,
      url: 'https://bizshala.com/news/106'
    }
  ];

  const mockFetchNews = async () => testArticles;
  const mockGetIpo = async () => [];

  // Poll once to evaluate
  await pollLiveNewsAndIpoAlerts(mockFetchNews, mockGetIpo);

  const history = getSmartAlertHistory();

  // Verification
  const mergerAlert = history.find(a => a.id === 'news_test_merger_01');
  assert.ok(mergerAlert, 'Merger alert must be in alert history');
  assert.strictEqual(mergerAlert.type, 'MERGER_ALERT', 'Type should be MERGER_ALERT');
  console.log('✅ Merger & Acquisition alert validated:', mergerAlert.title);

  const sebonAlert = history.find(a => a.id === 'news_test_sebon_02');
  assert.ok(sebonAlert, 'SEBON approval alert must be in alert history');
  assert.strictEqual(sebonAlert.type, 'SEBON_APPROVAL_ALERT', 'Type should be SEBON_APPROVAL_ALERT');
  console.log('✅ SEBON Regulatory Approval alert validated:', sebonAlert.title);

  const allotmentAlert = history.find(a => a.id === 'news_test_allotment_03');
  assert.ok(allotmentAlert, 'Allotment alert must be in alert history');
  assert.strictEqual(allotmentAlert.type, 'ALLOTMENT_ALERT', 'Type should be ALLOTMENT_ALERT');
  console.log('✅ Allotment Result alert validated:', allotmentAlert.title);

  const milestoneAlert = history.find(a => a.id === 'news_test_milestone_04');
  assert.ok(milestoneAlert, 'Market milestone alert must be in alert history');
  assert.strictEqual(milestoneAlert.type, 'MARKET_MILESTONE_ALERT', 'Type should be MARKET_MILESTONE_ALERT');
  console.log('✅ Market Milestone alert validated:', milestoneAlert.title);

  const trendingAlert = history.find(a => a.id === 'news_test_trending_05a' || a.id === 'news_test_trending_05b');
  assert.ok(trendingAlert, 'Multi-portal trending alert must be in alert history');
  assert.strictEqual(trendingAlert.type, 'TRENDING_NEWS_ALERT', 'Type should be TRENDING_NEWS_ALERT');
  console.log('✅ Multi-Portal Trending alert validated:', trendingAlert.title);

  const routineAlert = history.find(a => a.id === 'news_test_routine_06');
  // Routine alert is recorded in history for in-app viewing, but with NEWS_ALERT type
  if (routineAlert) {
    assert.strictEqual(routineAlert.type, 'NEWS_ALERT', 'Routine PR should remain in-app NEWS_ALERT');
    console.log('✅ Routine PR notice appropriately captured in-app only:', routineAlert.title);
  }

  console.log('🎉 All Option 2 and Multi-Portal Trending tests passed successfully!');
  process.exit(0);
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
