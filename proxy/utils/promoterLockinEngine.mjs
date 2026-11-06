// proxy/utils/promoterLockinEngine.mjs
/**
 * Promoter Share 3-Year Lock-In Expiry & Dumping Guard Engine
 * 
 * Tracks official SEBON promoter lock-in expiration schedules,
 * calculating dynamic countdowns, unlock supply ratios, and
 * institutional supply cliff threat levels for investors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REGISTRY_FILE = path.resolve(__dirname, '..', 'data', 'promoter_lockin_registry.json');

/**
 * Load raw promoter lock-in registry
 */
export function loadRawRegistry() {
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    } catch (err) {
      console.warn('[PromoterLockinEngine] Failed to read registry:', err.message);
    }
  }
  return [];
}

/**
 * Get evaluated promoter lock-in registry with live dynamic countdowns
 * @param {string|Date} [referenceDate] 
 */
export function getEvaluatedPromoterLockinList(referenceDate = null) {
  const now = referenceDate ? new Date(referenceDate) : new Date();
  const rawList = loadRawRegistry();

  return rawList.map(item => {
    let daysRemaining = null;
    let isExpired = item.lockinExpiry === 'Unlocked';
    let riskCategory = 'UNLOCKED_FREE_FLOAT';
    let riskLevel = 'Low';
    let isThreat = false;
    let warningNp = 'प्रमोटर सेयर पूर्ण रूपमा अनलक भइसकेको छ। साधारण बजार कारोबारमा छ।';

    if (!isExpired && item.lockinExpiry) {
      const exp = new Date(item.lockinExpiry);
      daysRemaining = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysRemaining <= 0) {
        isExpired = true;
        daysRemaining = 0;
        riskCategory = 'UNLOCKED_FREE_FLOAT';
        riskLevel = 'Low';
      } else if (daysRemaining <= 30) {
        riskCategory = 'CRITICAL_SUPPLY_SHOCK';
        riskLevel = 'High';
        isThreat = true;
        warningNp = `🚨 चरम सप्लाइ डम्पिङ खतरा: आगामी ${daysRemaining} दिनभित्र (${item.lockinExpiry}) संस्थापक सेयर अनलक हुँदैछ। संस्थागत डम्पिङको उच्च जोखिम रहेकाले नयाँ खरिद नगर्नुहोला!`;
      } else if (daysRemaining <= 90) {
        riskCategory = 'EXPIRING_SOON';
        riskLevel = 'Medium';
        isThreat = true;
        warningNp = `⚠️ मध्यम चेतावनी: प्रमोटर सेयर लकिङ ${daysRemaining} दिनमा समाप्त हुँदैछ (${item.lockinExpiry})। बजारमा थप आपूर्ति आउने सम्भावना छ।`;
      } else {
        riskCategory = 'LOCKED_SAFE';
        riskLevel = 'Low';
        warningNp = `✅ सुरक्षित: प्रमोटर सेयर अझै ${daysRemaining} दिनसम्म वैधानिक लकिङमा छ। तत्काल डम्पिङको जोखिम छैन।`;
      }
    }

    const promoterShares = Number(item.promoterShares || 0);
    const publicShares = Number(item.publicShares || 1);
    const unlockSupplyRatio = +(promoterShares / Math.max(1, publicShares)).toFixed(2);

    return {
      ...item,
      daysRemaining,
      isExpired,
      riskCategory,
      riskLevel,
      isThreat,
      unlockSupplyRatio,
      status: isExpired 
        ? 'Fully Unlocked' 
        : (daysRemaining <= 30 ? 'Critical Shock (<30d)' : (daysRemaining <= 90 ? 'Expiring Soon (<90d)' : 'Statutory Lock-in Active')),
      warningNp,
      evaluatedAt: now.toISOString()
    };
  });
}

/**
 * Retrieve promoter lock-in evaluation for a single symbol
 * @param {string} symbol 
 * @param {string|Date} [referenceDate] 
 */
export function getScripPromoterLockin(symbol, referenceDate = null) {
  const sym = String(symbol || '').toUpperCase().trim();
  const list = getEvaluatedPromoterLockinList(referenceDate);
  const found = list.find(s => s.symbol === sym);
  
  if (found) return found;

  // Default fallback for unlisted / standard equities
  return {
    symbol: sym,
    name: sym,
    sector: 'Equity',
    promoterRatio: 51.0,
    publicRatio: 49.0,
    totalShares: 'N/A',
    promoterShares: 0,
    publicShares: 0,
    lockinExpiry: 'Unlocked',
    lockinType: 'Standard Free-Float / Historical Listing',
    daysRemaining: 0,
    isExpired: true,
    riskCategory: 'UNLOCKED_FREE_FLOAT',
    riskLevel: 'Low',
    isThreat: false,
    unlockSupplyRatio: 1.04,
    status: 'Fully Unlocked',
    warningNp: 'प्रमोटर सेयर सम्बन्धी कुनै तत्काल आपूर्ति जोखिम छैन।',
    fundamentals: null,
    evaluatedAt: new Date().toISOString()
  };
}
