/**
 * NEPSE News Impact & Relevance Scorer
 * Prioritizes news that directly or indirectly impacts NEPSE, listed stocks,
 * dividends, corporate actions, and monetary/capital market policies.
 */

export function getNepseImpactScore(article) {
  if (!article) return { score: 0, impactType: null };
  const title = String(article.title || article.headline || '').toLowerCase();
  const summary = String(article.summary || article.description || '').toLowerCase();
  const fullText = `${title} ${summary}`;

  let score = 0;
  let impactType = null;

  // ── 1. CORPORATE ACTIONS & DIVIDENDS (HIGHEST DIRECT STOCK IMPACT) ──
  const divKeywords = [
    'लाभांश', 'बोनस', 'हकप्रद', 'बुक क्लोज', 'बुकक्लोज', 'साधारण सभा', 'साधारणसभा',
    'dividend', 'bonus', 'right share', 'agm', 'book closure', 'cash dividend', 'प्रतिफल'
  ];
  for (const kw of divKeywords) {
    if (fullText.includes(kw)) {
      score += 70;
      impactType = 'Corporate Action / Dividend';
      break;
    }
  }

  // ── 2. NEPSE MARKET & TRADING DYNAMICS (DIRECT INDEX IMPACT) ──
  const marketKeywords = [
    'नेप्से', 'सेयर बजार', 'शेयर बजार', 'परिसूचक', 'कारोबार', 'सर्किट', 'बजार पुँजीकरण',
    'शेयरधनी', 'लगानीकर्ता', 'ब्रोकर', 'फ्लोरसिट', 'nepse', 'share market', 'stock market',
    'turnover', 'circuit', 'investor', 'broker', 'floorsheet'
  ];
  for (const kw of marketKeywords) {
    if (fullText.includes(kw)) {
      score += 55;
      if (!impactType) impactType = 'Market Dynamics';
      break;
    }
  }

  // ── 3. FINANCIAL STATEMENTS & EARNINGS ──
  const earningsKeywords = [
    'वित्तीय विवरण', 'नाफा', 'खुद नाफा', 'प्रतिशेयर आम्दानी', 'इपिएस', 'घाटा', 'वित्तीय अवस्था',
    'quarterly', 'earnings', 'profit', 'net profit', 'financial report'
  ];
  for (const kw of earningsKeywords) {
    if (fullText.includes(kw)) {
      score += 50;
      if (!impactType) impactType = 'Earnings & Financials';
      break;
    }
  }

  // ── 4. REGULATORY BODIES & MONETARY/FINANCIAL POLICY ──
  const policyKeywords = [
    'नेपाल राष्ट्र बैंक', 'राष्ट्र बैंक', 'धितोपत्र बोर्ड', 'सेबोन', 'मौद्रिक नीति', 'ब्याजदर',
    'ब्याज दर', 'मार्जिन', 'चालु पूँजी', 'nrb', 'sebon', 'monetary policy', 'interest rate',
    'margin lending', 'अर्थ मन्त्रालय', 'अर्थमन्त्री', 'पूँजी बजार सुधार', 'कार्यदल', 'अर्थ समिति', 'विधेयक'
  ];
  for (const kw of policyKeywords) {
    if (fullText.includes(kw)) {
      score += 45;
      if (!impactType) impactType = 'Policy & Regulatory';
      break;
    }
  }

  // ── 5. IPO, FPO, DEBENTURES & CAPITAL RAISING ──
  const ipoKeywords = [
    'आईपीओ', 'आइपिओ', 'हकप्रद सेयर', 'निष्कासन', 'बाँडफाँड', 'ऋणपत्र', 'डिबेन्चर',
    'ipo', 'fpo', 'allotment', 'debenture'
  ];
  for (const kw of ipoKeywords) {
    if (fullText.includes(kw)) {
      score += 40;
      if (!impactType) impactType = 'IPO & Capital Issue';
      break;
    }
  }

  // ── 6. SECTOR DEVELOPMENTS (INDIRECT IMPACT) ──
  const sectorKeywords = [
    'वाणिज्य बैंक', 'विकास बैंक', 'वित्त कम्पनी', 'लघुवित्त', 'बीमा', 'पुनर्बीमा', 'जलविद्युत',
    'विद्युत नियमन', 'तरलता', 'विदेशी मुद्रा', 'शोधनान्तर', 'commercial bank', 'hydropower',
    'microfinance', 'liquidity', 'remittance'
  ];
  for (const kw of sectorKeywords) {
    if (fullText.includes(kw)) {
      score += 25;
      if (!impactType) impactType = 'Sector Development';
      break;
    }
  }

  // ── 7. PENALTIES FOR UNRELATED CRIME / VEHICLE / ENTERTAINMENT NEWS ──
  const irrelevantKeywords = [
    'पक्राउ', 'फरार', 'ठगी', 'शव फेला', 'हत्या', 'लागुऔषध', 'दुर्घटना', 'चोरी',
    'सवारी', 'रोयल इनफिल्ड', 'मोटरसाइकल', 'स्मार्टफोन', 'अभिनेता', 'अभिनेत्री', 'गीत', 'तीजकाे'
  ];
  for (const kw of irrelevantKeywords) {
    if (title.includes(kw)) {
      if (score <= 25) {
        score -= 70;
      } else {
        score -= 25;
      }
    }
  }

  return { score, impactType };
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-PORTAL DEDUPLICATION ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export const ENTITY_GROUPS = [
  // Commercial Banks
  { id: 'NABIL', aliases: ['नबिल', 'nabil'] },
  { id: 'NICA', aliases: ['एनआइसी', 'एनआईसी', 'nica'] },
  { id: 'GBIME', aliases: ['ग्लोबल आइएमई', 'ग्लोबल', 'gbime'] },
  { id: 'KBL', aliases: ['कुमारी', 'kbl'] },
  { id: 'PRVU', aliases: ['प्रभु', 'prvu'] },
  { id: 'NBL', aliases: ['नेपाल बैंक', 'nbl'] },
  { id: 'ADBL', aliases: ['कृषि विकास', 'adbl'] },
  { id: 'SBL', aliases: ['सिद्धार्थ', 'sbl'] },
  { id: 'SANIMA', aliases: ['सानिमा', 'sanima'] },
  { id: 'EBL', aliases: ['एभरेष्ट', 'ebl'] },
  { id: 'LXBL', aliases: ['लक्ष्मी सनराइज', 'लक्ष्मी', 'lxbl'] },
  { id: 'MBL', aliases: ['माछापुच्छ्रे', 'mbl'] },
  { id: 'NMB', aliases: ['एनएमबि', 'nmb'] },
  { id: 'PBL', aliases: ['प्राइम', 'pbl'] },
  { id: 'NIMB', aliases: ['नेपाल इन्भेष्टमेन्ट', 'nimb'] },
  { id: 'HBL', aliases: ['हिमालयन', 'hbl'] },
  { id: 'SCB', aliases: ['स्ट्याण्डर्ड चार्टर्ड', 'scb'] },
  { id: 'CZBIL', aliases: ['सिटिजन्स', 'czbil'] },
  // Development Banks
  { id: 'MNBBL', aliases: ['मुक्तिनाथ', 'mnbbl'] },
  { id: 'GBLBS', aliases: ['गरिमा', 'gblbs'] },
  { id: 'JEBL', aliases: ['ज्योति', 'jebl'] },
  { id: 'KDLBL', aliases: ['कामना', 'kdlbl'] },
  { id: 'MLBL', aliases: ['महालक्ष्मी', 'mlbl'] },
  { id: 'SADBL', aliases: ['सांग्रिला', 'sadbl'] },
  { id: 'SHINE', aliases: ['शाइन रेसुंगा', 'shine'] },
  { id: 'LBBL', aliases: ['लुम्बिनी विकास', 'lbbl'] },
  // Hydropower & Infrastructure
  { id: 'UPPER', aliases: ['अपर तामाकोशी', 'अपर', 'upper'] },
  { id: 'CHCL', aliases: ['चिलिमे', 'chcl'] },
  { id: 'SHPC', aliases: ['सानिमा माई', 'shpc'] },
  { id: 'BPCL', aliases: ['बुधु', 'bpcl'] },
  { id: 'HIDCL', aliases: ['एचआइडिसीएल', 'hidcl'] },
  // Manufacturing & Others
  { id: 'SHIVM', aliases: ['शिवम्', 'शिवम', 'shivm'] },
  { id: 'GCCL', aliases: ['घोडाही', 'gccl'] },
  { id: 'SHL', aliases: ['सोल्टी', 'shl'] },
  { id: 'CGBL', aliases: ['चन्द्रागिरि', 'cgbl'] },
  { id: 'NTC', aliases: ['नेपाल टेलिकम', 'ntc'] },
  // Insurance
  { id: 'NLIC', aliases: ['नेपाल लाइफ', 'nlic'] },
  { id: 'LICN', aliases: ['लाइफ इन्स्योरेन्स', 'licn'] },
  { id: 'SICL', aliases: ['शिखर', 'sicl'] },
  { id: 'HEIC', aliases: ['हिमालयन एभरेष्ट', 'heic'] },
  { id: 'SALICO', aliases: ['सगरमाथा', 'salico'] },
  // Regulatory Bodies & Core Institutions
  { id: 'NRB', aliases: ['नेपाल राष्ट्र बैंक', 'राष्ट्र बैंक', 'nrb'] },
  { id: 'SEBON', aliases: ['धितोपत्र बोर्ड', 'सेबोन', 'sebon'] },
  { id: 'NEPSE', aliases: ['नेप्से', 'nepse'] },
  { id: 'CDSC', aliases: ['सिडिएससी', 'cdsc'] },
  { id: 'MOF', aliases: ['अर्थ मन्त्रालय', 'अर्थमन्त्री'] }
];

export const TOPIC_GROUPS = [
  { id: 'DIVIDEND', aliases: ['लाभांश', 'बोनस', 'नगद', 'dividend', 'bonus'] },
  { id: 'AGM', aliases: ['साधारण सभा', 'साधारणसभा', 'agm', 'book closure', 'बुक क्लोज', 'बुकक्लोज'] },
  { id: 'EARNINGS', aliases: ['वित्तीय विवरण', 'नाफा', 'खुद नाफा', 'घाटा', 'इपिएस', 'earnings', 'profit', 'loss', 'quarterly'] },
  { id: 'RIGHT_SHARE', aliases: ['हकप्रद', 'right share'] },
  { id: 'IPO', aliases: ['आइपिओ', 'आईपीओ', 'ipo', 'fpo', 'allotment', 'बाँडफाँड', 'निष्कासन'] },
  { id: 'DEBENTURE', aliases: ['ऋणपत्र', 'डिबेन्चर', 'debenture'] },
  { id: 'POLICY', aliases: ['मौद्रिक नीति', 'समीक्षा', 'ब्याजदर', 'मार्जिन', 'चालु पुँजी', 'चालु पूँजी', 'monetary policy', 'interest rate'] },
  { id: 'MARKET_MOVE', aliases: ['परिसूचक', 'अंकले', 'कारोबार', 'सर्किट', 'बजार पुँजीकरण', 'turnover', 'circuit', 'उकालो', 'ओरालो', 'बढोत्तरी'] }
];

export const STOP_WORDS = new Set([
  'को', 'का', 'की', 'ले', 'लाई', 'मा', 'बाट', 'द्वारा', 'सँग', 'सित',
  'र', 'तथा', 'वा', 'अनि', 'पनि', 'भने', 'भनी', 'हुने', 'भएको', 'गरेको',
  'गर्ने', 'गर्यो', 'भयो', 'थियो', 'रहेको', 'छ', 'छन्', 'थिए', 'दिन', 'हुन',
  'यस्तो', 'यस', 'यो', 'त्यो', 'यी', 'ती', 'एक', 'दुई', 'तीन', 'चार',
  'आज', 'भोलि', 'हिजो', 'मिति', 'समेत', 'प्रति', 'थप', 'अब', 'किन', 'कसरी',
  'कति', 'के', 'भनेर', 'बारे', 'लागि', 'गरी', 'भन्दै', 'हुँदा', 'हुनेछ',
  'गर्दा', 'गरेका', 'गरिने', 'गराउने', 'पर्ने', 'गर्नु', 'गर्न', 'हुनु',
  'समाचार', 'अपडेट', 'हेर्नुहोस्', 'विस्तृत', 'विवरण', 'विशेष', 'जानकारी',
  'portal', 'news', 'update', 'exclusive', 'breaking', 'daily', 'aaja'
]);

export function normalizeNewsTitle(title) {
  if (!title) return '';
  return String(title)
    .toLowerCase()
    .replace(/[०-९]/g, d => '०१२३४५६७८९'.indexOf(d))
    .replace(/[\?\!\।\,\-\–\—\‘\’\“\”\(\)\[\]\/\:\;\'\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractNewsTokens(title) {
  const norm = normalizeNewsTitle(title);
  const words = norm.match(/[\u0900-\u097F\w]+/g) || [];
  return words.filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

export function extractNewsEntities(title) {
  const norm = normalizeNewsTitle(title);
  const found = new Set();
  for (const group of ENTITY_GROUPS) {
    for (const alias of group.aliases) {
      if (norm.includes(alias.toLowerCase())) {
        found.add(group.id);
        break;
      }
    }
  }
  return found;
}

export function extractNewsTopics(title) {
  const norm = normalizeNewsTitle(title);
  const found = new Set();
  for (const group of TOPIC_GROUPS) {
    for (const alias of group.aliases) {
      if (norm.includes(alias.toLowerCase())) {
        found.add(group.id);
        break;
      }
    }
  }
  return found;
}

/**
 * Checks if two news titles represent the exact same story from different portals.
 */
export function areNewsArticlesDuplicates(titleA, titleB) {
  if (!titleA || !titleB) return false;
  if (titleA === titleB) return true;

  const tokensA = extractNewsTokens(titleA);
  const tokensB = extractNewsTokens(titleB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = tokensA.filter(w => setB.has(w));
  const union = new Set([...tokensA, ...tokensB]);

  const jaccard = intersection.length / union.size;
  const overlap = intersection.length / Math.min(setA.size, setB.size);

  const entitiesA = extractNewsEntities(titleA);
  const entitiesB = extractNewsEntities(titleB);

  // 1. Check for company entity conflict (e.g. NABIL vs KBL)
  if (entitiesA.size > 0 && entitiesB.size > 0) {
    const sharedEntities = [...entitiesA].filter(e => entitiesB.has(e));
    if (sharedEntities.length === 0) {
      return false; // Different companies! Never merge
    }

    // Shared company or regulator! Check topics
    const topicsA = extractNewsTopics(titleA);
    const topicsB = extractNewsTopics(titleB);
    const sharedTopics = [...topicsA].filter(t => topicsB.has(t));

    if (sharedTopics.length > 0 && (overlap >= 0.30 || jaccard >= 0.20)) {
      return true;
    }
    if (overlap >= 0.45 || jaccard >= 0.32) {
      return true;
    }
  }

  // 2. High general token similarity (market wraps, macro policy)
  if (jaccard >= 0.48 || overlap >= 0.65) {
    return true;
  }

  // 3. Significant word cluster overlap (e.g. 4+ key terms in common)
  if (intersection.length >= 4 && overlap >= 0.55) {
    return true;
  }

  return false;
}

/**
 * Deduplicates a list of articles across all portals.
 * When the same news is published by multiple portals, it retains one primary card
 * and records other portals in the `otherSources` array.
 */
export function deduplicateNews(newsList = [], activeSource = 'all') {
  if (!Array.isArray(newsList) || newsList.length === 0) return [];

  let inputList = newsList;
  if (activeSource && activeSource !== 'all') {
    inputList = newsList.filter(item => {
      const src = String(item.source || '').toLowerCase();
      return src.includes(activeSource.toLowerCase());
    });
  }

  const clusters = [];

  for (const article of inputList) {
    let matched = null;
    for (const cluster of clusters) {
      if (areNewsArticlesDuplicates(article.title, cluster.title)) {
        matched = cluster;
        break;
      }
    }

    if (matched) {
      if (!matched.otherSources) matched.otherSources = [];
      const existingSources = new Set([
        String(matched.source || '').toLowerCase(),
        ...matched.otherSources.map(s => String(s.source || '').toLowerCase())
      ]);
      const curSrc = String(article.source || '').toLowerCase();

      if (!existingSources.has(curSrc) || article.url !== matched.url) {
        matched.otherSources.push({
          source: article.source || 'Other Portal',
          url: article.url || article.link || '',
          title: article.title || '',
          pubDate: article.pubDate || article.date || '',
          summary: article.summary || ''
        });
      }

      // Upgrade summary if current article has better content
      if (!matched.summary && article.summary) {
        matched.summary = article.summary;
      }
      if ((article.impactScore || 0) > (matched.impactScore || 0)) {
        matched.impactScore = article.impactScore;
        matched.impactType = article.impactType;
      }
    } else {
      clusters.push({
        ...article,
        otherSources: []
      });
    }
  }

  return clusters;
}

// ══════════════════════════════════════════════════════════════════════════════
// DATE PARSING & MULTI-MODE SORTING
// ══════════════════════════════════════════════════════════════════════════════

export function parseNewsTimestamp(item) {
  if (!item) return 0;
  const rawDate = item.pubDate || item.date || '';
  if (!rawDate) return 0;

  // 1. Direct standard JS date parsing
  const parsed = Date.parse(rawDate);
  if (!isNaN(parsed) && parsed > 0) {
    return parsed;
  }

  // 2. Relative time strings in Nepali & English
  const str = String(rawDate).toLowerCase().trim();
  const now = Date.now();

  if (str.includes('just now') || str.includes('भर्खरै') || str.includes('today') || str.includes('आज')) {
    return now;
  }

  const normDigits = str.replace(/[०-९]/g, d => '०१२३४५६७८९'.indexOf(d));
  const numMatch = normDigits.match(/(\d+)/);
  const val = numMatch ? parseInt(numMatch[1], 10) : 1;

  if (str.includes('min') || str.includes('मिनेट')) {
    return now - val * 60 * 1000;
  }
  if (str.includes('hour') || str.includes('घण्टा') || str.includes('घन्टा')) {
    return now - val * 3600 * 1000;
  }
  if (str.includes('day') || str.includes('दिन') || str.includes('हिजो')) {
    return now - val * 86400 * 1000;
  }
  if (str.includes('week') || str.includes('हप्ता')) {
    return now - val * 7 * 86400 * 1000;
  }
  if (str.includes('month') || str.includes('महिना')) {
    return now - val * 30 * 86400 * 1000;
  }

  return 0;
}

/**
 * Sort news items by selected mode:
 * - 'latest': Strictly chronological (newest published date first, secondary impact score)
 * - 'impact': Highest NEPSE stock & market impact first, secondary newest date
 * - 'trending': Highest multi-portal coverage count first (stories covered by most portals)
 */
export function sortNews(newsList = [], sortMode = 'latest') {
  if (!Array.isArray(newsList)) return [];
  const list = [...newsList];

  switch (sortMode) {
    case 'latest':
      return list.sort((a, b) => {
        const timeA = parseNewsTimestamp(a);
        const timeB = parseNewsTimestamp(b);
        if (timeA !== timeB) return timeB - timeA;
        return (b.impactScore || 0) - (a.impactScore || 0);
      });

    case 'impact':
      return list.sort((a, b) => {
        const scoreDiff = (b.impactScore || 0) - (a.impactScore || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return parseNewsTimestamp(b) - parseNewsTimestamp(a);
      });

    case 'trending':
      return list.sort((a, b) => {
        const countA = (a.otherSources?.length || 0) + 1;
        const countB = (b.otherSources?.length || 0) + 1;
        if (countB !== countA) return countB - countA;
        return (b.impactScore || 0) - (a.impactScore || 0);
      });

    default:
      return list;
  }
}

/**
 * Legacy compatibility wrapper: Scores items, deduplicates, and sorts with NEPSE high-impact articles first
 */
export function sortNewsByNepseImpact(newsList = []) {
  if (!Array.isArray(newsList)) return [];

  const scoredList = newsList.map((item) => {
    const { score, impactType } = getNepseImpactScore(item);
    return {
      ...item,
      impactScore: score,
      impactType: impactType || item.impactType || null
    };
  });

  const deduped = deduplicateNews(scoredList);
  return sortNews(deduped, 'impact');
}
