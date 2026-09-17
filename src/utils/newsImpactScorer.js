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

/**
 * Sort an array of news items with NEPSE high-impact articles first
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

  return scoredList.sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));
}
