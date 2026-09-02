/**
 * Mock Data Engine for Nepal Stock Exchange (NEPSE)
 * Contains 60+ real NEPSE company tickers with fundamentals
 */

import {
  isNepseTradingDay,
  isNepsePublicHoliday,
  isNepseWeekend,
  getLastValidTradingDay,
  generateTradingDaysSequence,
  getIsoDateInNPT,
  getDetailedMarketStatus
} from './nepseCalendar';
import {
  calculateGrahamIntrinsicValue,
  calculateVolumeZScore,
  calculateBollingerBandWidth,
  calculateRelativeStrength,
  calculateCompositeTechnicalScore,
  calculateFundamentalScore,
  calculateCompositeMomentumScore,
  classifyActionZone,
  calculateATR,
  calculateStealthAccumulationIndex,
  calculateOrderBookImbalanceRatio,
  calculateImpendingLiquidityShockIndex,
  calculateDecisionProbabilityIndex,
  calculateMatchingTradesSynchronization,
  calculateTradeLabRankScore,
  calculateBrokerDominanceIndex
} from './quantEngine';




export const SECTORS = [
  "Commercial Banks",
  "Development Banks",
  "Finance",
  "Microfinance",
  "Hydro Power",
  "Life Insurance",
  "Non Life Insurance",
  "Hotels And Tourism",
  "Manufacturing And Processing",
  "Investment",
  "Tradings",
  "Mutual Fund",
  "Others"
];

// 60+ actual NEPSE listed companies with real baseline data
export const INITIAL_COMPANIES = [
  // ===== BANKING =====
  { symbol: "NABIL",  name: "Nabil Bank Limited",              sector: "Banking",          basePrice: 395,   eps: 21.5, bookValue: 185,  divYield: 3.2,  roe: 12.4, listedShares: 144.78, paidUpCapital: 14478, bonusShare: 10, cashDiv: 5,  avg120: 388 },
  { symbol: "NICA",   name: "NIC Asia Bank Limited",           sector: "Banking",          basePrice: 425,   eps: 24.8, bookValue: 198,  divYield: 2.8,  roe: 13.1, listedShares: 156.09, paidUpCapital: 15609, bonusShare: 15, cashDiv: 0,  avg120: 418 },
  { symbol: "EBL",    name: "Everest Bank Limited",            sector: "Banking",          basePrice: 485,   eps: 28.2, bookValue: 210,  divYield: 4.1,  roe: 14.5, listedShares: 86.06,  paidUpCapital: 8606,  bonusShare: 0,  cashDiv: 10, avg120: 476 },
  { symbol: "GBIME",  name: "Global IME Bank Limited",         sector: "Banking",          basePrice: 195,   eps: 12.1, bookValue: 130,  divYield: 3.5,  roe: 9.8,  listedShares: 318.24, paidUpCapital: 31824, bonusShare: 10, cashDiv: 0,  avg120: 192 },
  { symbol: "KBL",    name: "Kumari Bank Limited",             sector: "Banking",          basePrice: 178,   eps: 10.4, bookValue: 121,  divYield: 2.5,  roe: 8.7,  listedShares: 202.31, paidUpCapital: 20231, bonusShare: 5,  cashDiv: 0,  avg120: 175 },
  { symbol: "MBL",    name: "Machhapuchchhre Bank Limited",    sector: "Banking",          basePrice: 168,   eps: 9.8,  bookValue: 118,  divYield: 2.0,  roe: 8.4,  listedShares: 223.55, paidUpCapital: 22355, bonusShare: 5,  cashDiv: 0,  avg120: 165 },
  { symbol: "PRVU",   name: "Prabhu Bank Limited",             sector: "Banking",          basePrice: 172,   eps: 10.2, bookValue: 115,  divYield: 1.8,  roe: 8.5,  listedShares: 243.14, paidUpCapital: 24314, bonusShare: 5,  cashDiv: 0,  avg120: 170 },
  { symbol: "SBI",    name: "Nepal SBI Bank Limited",          sector: "Banking",          basePrice: 262,   eps: 16.5, bookValue: 160,  divYield: 3.8,  roe: 11.2, listedShares: 100.70, paidUpCapital: 10070, bonusShare: 10, cashDiv: 5,  avg120: 258 },
  { symbol: "SANIMA", name: "Sanima Bank Limited",             sector: "Banking",          basePrice: 268,   eps: 17.1, bookValue: 162,  divYield: 3.5,  roe: 11.5, listedShares: 118.75, paidUpCapital: 11875, bonusShare: 10, cashDiv: 0,  avg120: 265 },
  { symbol: "SCB",    name: "Standard Chartered Bank Nepal",   sector: "Banking",          basePrice: 520,   eps: 33.8, bookValue: 310,  divYield: 5.5,  roe: 15.2, listedShares: 54.19,  paidUpCapital: 5419,  bonusShare: 0,  cashDiv: 20, avg120: 515 },
  { symbol: "NBB",    name: "Nepal Bangladesh Bank Limited",   sector: "Banking",          basePrice: 145,   eps: 8.5,  bookValue: 105,  divYield: 1.5,  roe: 7.9,  listedShares: 241.54, paidUpCapital: 24154, bonusShare: 5,  cashDiv: 0,  avg120: 143 },
  { symbol: "ADBL",   name: "Agricultural Development Bank",   sector: "Banking",          basePrice: 220,   eps: 13.5, bookValue: 145,  divYield: 3.0,  roe: 9.5,  listedShares: 318.35, paidUpCapital: 31835, bonusShare: 5,  cashDiv: 5,  avg120: 218 },
  { symbol: "CZBIL",  name: "Citizen Bank International",      sector: "Banking",          basePrice: 198,   eps: 11.8, bookValue: 128,  divYield: 2.2,  roe: 9.1,  listedShares: 175.06, paidUpCapital: 17506, bonusShare: 5,  cashDiv: 0,  avg120: 195 },
  { symbol: "LBBL",   name: "Laxmi Sunrise Bank Limited",      sector: "Banking",          basePrice: 162,   eps: 9.2,  bookValue: 112,  divYield: 1.8,  roe: 7.8,  listedShares: 292.04, paidUpCapital: 29204, bonusShare: 5,  cashDiv: 0,  avg120: 160 },
  { symbol: "HBL",    name: "Himalayan Bank Limited",          sector: "Banking",          basePrice: 298,   eps: 18.6, bookValue: 172,  divYield: 3.0,  roe: 11.2, listedShares: 96.27,  paidUpCapital: 9627,  bonusShare: 10, cashDiv: 0,  avg120: 295 },
  // ===== DEVELOPMENT BANK =====
  { symbol: "MNBBL",  name: "Muktinath Bikas Bank Limited",    sector: "Development Bank", basePrice: 285,   eps: 16.4, bookValue: 152,  divYield: 3.5,  roe: 11.3, listedShares: 75.80,  paidUpCapital: 7580,  bonusShare: 15, cashDiv: 0,  avg120: 282 },
  { symbol: "SADBL",  name: "Saptakoshi Development Bank",     sector: "Development Bank", basePrice: 182,   eps: 10.5, bookValue: 120,  divYield: 2.5,  roe: 8.9,  listedShares: 35.00,  paidUpCapital: 3500,  bonusShare: 10, cashDiv: 0,  avg120: 180 },
  { symbol: "SHINE",  name: "Shine Resunga Development Bank",  sector: "Development Bank", basePrice: 419,   eps: 20.93, bookValue: 153.05, divYield: 1.23, roe: 13.68, listedShares: 50.22,  paidUpCapital: 5022,  bonusShare: 10, cashDiv: 0,  avg120: 412 },
  { symbol: "GBBL",   name: "Garima Bikas Bank Limited",       sector: "Development Bank", basePrice: 310,   eps: 18.2, bookValue: 165,  divYield: 3.8,  roe: 11.6, listedShares: 62.00,  paidUpCapital: 6200,  bonusShare: 15, cashDiv: 5,  avg120: 308 },
  // ===== FINANCE =====
  { symbol: "SIFC",   name: "Srijana Finance Limited",         sector: "Finance",          basePrice: 140,   eps: 7.8,  bookValue: 98,   divYield: 2.5,  roe: 8.0,  listedShares: 10.00,  paidUpCapital: 1000,  bonusShare: 5,  cashDiv: 5,  avg120: 138 },
  { symbol: "GFCL",   name: "General Finance Company Limited", sector: "Finance",          basePrice: 120,   eps: 6.5,  bookValue: 88,   divYield: 2.0,  roe: 7.4,  listedShares: 8.00,   paidUpCapital: 800,   bonusShare: 0,  cashDiv: 5,  avg120: 118 },
  // ===== MICROFINANCE =====
  { symbol: "CBBL",   name: "Chhimek Laghubitta Bittiya Sanstha", sector: "Microfinance", basePrice: 780,   eps: 36.4, bookValue: 220,  divYield: 4.8,  roe: 18.5, listedShares: 25.10,  paidUpCapital: 2510,  bonusShare: 20, cashDiv: 5,  avg120: 775 },
  { symbol: "NUBL",   name: "Nirdhan Utthan Laghubitta",       sector: "Microfinance",    basePrice: 610,   eps: 22.5, bookValue: 190,  divYield: 4.0,  roe: 13.8, listedShares: 22.00,  paidUpCapital: 2200,  bonusShare: 15, cashDiv: 5,  avg120: 605 },
  { symbol: "SMFDB",  name: "Sana Kisan Bikas Bank",           sector: "Microfinance",    basePrice: 398,   eps: 18.4, bookValue: 165,  divYield: 3.5,  roe: 12.5, listedShares: 28.50,  paidUpCapital: 2850,  bonusShare: 10, cashDiv: 5,  avg120: 395 },
  { symbol: "SKBBL",  name: "Swabhiman Laghubitta Bittiya",    sector: "Microfinance",    basePrice: 485,   eps: 20.2, bookValue: 178,  divYield: 3.8,  roe: 14.2, listedShares: 18.00,  paidUpCapital: 1800,  bonusShare: 15, cashDiv: 0,  avg120: 480 },
  { symbol: "MERO",   name: "Mero Microfinance Laghubitta",    sector: "Microfinance",    basePrice: 520,   eps: 22.8, bookValue: 185,  divYield: 4.0,  roe: 14.9, listedShares: 20.50,  paidUpCapital: 2050,  bonusShare: 15, cashDiv: 5,  avg120: 515 },
  // ===== LIFE INSURANCE =====
  { symbol: "ALICL",  name: "Asian Life Insurance Co. Ltd.",   sector: "Life Insurance",  basePrice: 540,   eps: 15.6, bookValue: 135,  divYield: 3.0,  roe: 13.2, listedShares: 32.56,  paidUpCapital: 3256,  bonusShare: 10, cashDiv: 5,  avg120: 535 },
  { symbol: "LICN",   name: "Life Insurance Company Nepal",    sector: "Life Insurance",  basePrice: 860,   eps: 28.5, bookValue: 245,  divYield: 2.5,  roe: 12.4, listedShares: 20.00,  paidUpCapital: 2000,  bonusShare: 10, cashDiv: 5,  avg120: 855 },
  { symbol: "NLIC",   name: "Nepal Life Insurance Co. Ltd.",   sector: "Life Insurance",  basePrice: 720,   eps: 24.8, bookValue: 210,  divYield: 2.8,  roe: 12.8, listedShares: 22.00,  paidUpCapital: 2200,  bonusShare: 10, cashDiv: 5,  avg120: 715 },
  { symbol: "PLIC",   name: "Prime Life Insurance Company",    sector: "Life Insurance",  basePrice: 540,   eps: 18.5, bookValue: 175,  divYield: 2.5,  roe: 11.5, listedShares: 25.00,  paidUpCapital: 2500,  bonusShare: 10, cashDiv: 5,  avg120: 535 },
  { symbol: "SLI",    name: "Surya Life Insurance Co. Ltd.",   sector: "Life Insurance",  basePrice: 490,   eps: 16.2, bookValue: 165,  divYield: 2.2,  roe: 10.8, listedShares: 22.50,  paidUpCapital: 2250,  bonusShare: 5,  cashDiv: 5,  avg120: 485 },
  // ===== NON-LIFE INSURANCE =====
  { symbol: "NICL",   name: "Nepal Insurance Co. Ltd.",        sector: "Non-Life Insurance", basePrice: 380, eps: 14.8, bookValue: 128, divYield: 3.5, roe: 12.2, listedShares: 14.00,  paidUpCapital: 1400,  bonusShare: 10, cashDiv: 5,  avg120: 376 },
  { symbol: "SICL",   name: "Siddhartha Insurance Limited",    sector: "Non-Life Insurance", basePrice: 620, eps: 18.2, bookValue: 160, divYield: 2.5, roe: 13.5, listedShares: 18.50,  paidUpCapital: 1850,  bonusShare: 10, cashDiv: 5,  avg120: 615 },
  { symbol: "PICL",   name: "Premier Insurance Company Nepal", sector: "Non-Life Insurance", basePrice: 470, eps: 16.5, bookValue: 145, divYield: 3.0, roe: 12.8, listedShares: 16.00,  paidUpCapital: 1600,  bonusShare: 10, cashDiv: 5,  avg120: 466 },
  { symbol: "RBCL",   name: "Rastriya Beema Company Limited",  sector: "Non-Life Insurance", basePrice: 398, eps: 14.2, bookValue: 132, divYield: 3.2, roe: 11.5, listedShares: 15.00,  paidUpCapital: 1500,  bonusShare: 5,  cashDiv: 5,  avg120: 395 },
  // ===== HYDROPOWER =====
  { symbol: "AHPC",   name: "Arun Valley Hydropower Dev.",     sector: "Hydropower",       basePrice: 225,   eps: 8.4,  bookValue: 110,  divYield: 1.5,  roe: 7.5,  listedShares: 45.20,  paidUpCapital: 4520,  bonusShare: 5,  cashDiv: 0,  avg120: 222 },
  { symbol: "UPPER",  name: "Upper Tamakoshi Hydropower Ltd.", sector: "Hydropower",       basePrice: 190,   eps: -2.1, bookValue: 88,   divYield: 0,    roe: -2.4, listedShares: 385.29, paidUpCapital: 38529, bonusShare: 0,  cashDiv: 0,  avg120: 188 },
  { symbol: "CHCL",   name: "Chilime Hydropower Co. Ltd.",     sector: "Hydropower",       basePrice: 345,   eps: 14.2, bookValue: 145,  divYield: 3.8,  roe: 10.5, listedShares: 35.00,  paidUpCapital: 3500,  bonusShare: 10, cashDiv: 5,  avg120: 342 },
  { symbol: "BPCL",   name: "Butwal Power Company Limited",    sector: "Hydropower",       basePrice: 228,   eps: 9.5,  bookValue: 115,  divYield: 2.0,  roe: 8.5,  listedShares: 38.98,  paidUpCapital: 3898,  bonusShare: 5,  cashDiv: 5,  avg120: 225 },
  { symbol: "NHPC",   name: "National Hydro Power Company",    sector: "Hydropower",       basePrice: 138,   eps: 5.2,  bookValue: 85,   divYield: 1.5,  roe: 6.5,  listedShares: 61.28,  paidUpCapital: 6128,  bonusShare: 5,  cashDiv: 0,  avg120: 136 },
  { symbol: "RURU",   name: "Rural Microfinance Dev. Centre",  sector: "Hydropower",       basePrice: 172,   eps: 7.5,  bookValue: 100,  divYield: 2.0,  roe: 7.8,  listedShares: 50.00,  paidUpCapital: 5000,  bonusShare: 5,  cashDiv: 0,  avg120: 170 },
  { symbol: "GHL",    name: "Gandaki Hydropower Limited",      sector: "Hydropower",       basePrice: 158,   eps: 6.8,  bookValue: 95,   divYield: 1.8,  roe: 7.2,  listedShares: 45.00,  paidUpCapital: 4500,  bonusShare: 5,  cashDiv: 0,  avg120: 156 },
  { symbol: "RHPL",   name: "Ridi Hydropower Development Co.", sector: "Hydropower",       basePrice: 220,   eps: 10.5, bookValue: 118,  divYield: 2.5,  roe: 9.2,  listedShares: 30.00,  paidUpCapital: 3000,  bonusShare: 5,  cashDiv: 5,  avg120: 218 },
  { symbol: "KPCL",   name: "Koshi Power Company Limited",     sector: "Hydropower",       basePrice: 145,   eps: 5.8,  bookValue: 88,   divYield: 1.5,  roe: 6.8,  listedShares: 38.00,  paidUpCapital: 3800,  bonusShare: 5,  cashDiv: 0,  avg120: 143 },
  { symbol: "TPC",    name: "The Tansen Power Company",        sector: "Hydropower",       basePrice: 132,   eps: 5.2,  bookValue: 82,   divYield: 1.2,  roe: 6.4,  listedShares: 28.00,  paidUpCapital: 2800,  bonusShare: 0,  cashDiv: 5,  avg120: 130 },
  // ===== MANUFACTURING =====
  { symbol: "HDL",    name: "Himalayan Distillery Limited",    sector: "Manufacturing",    basePrice: 1650,  eps: 65.4, bookValue: 310,  divYield: 4.5,  roe: 22.8, listedShares: 12.00,  paidUpCapital: 1200,  bonusShare: 10, cashDiv: 10, avg120: 1630 },
  { symbol: "GCIL",   name: "Gorakhkali Cement Industrie",     sector: "Manufacturing",    basePrice: 365,   eps: 14.8, bookValue: 148,  divYield: 3.0,  roe: 11.2, listedShares: 15.00,  paidUpCapital: 1500,  bonusShare: 10, cashDiv: 5,  avg120: 362 },
  { symbol: "SHAN",   name: "Shankhu Kapilvastu Brick",        sector: "Manufacturing",    basePrice: 286,   eps: 11.2, bookValue: 135,  divYield: 2.8,  roe: 9.5,  listedShares: 10.00,  paidUpCapital: 1000,  bonusShare: 5,  cashDiv: 5,  avg120: 283 },
  { symbol: "SHIVM",  name: "Shivam Cement Limited",           sector: "Manufacturing",    basePrice: 268,   eps: 10.8, bookValue: 128,  divYield: 2.5,  roe: 9.2,  listedShares: 42.00,  paidUpCapital: 4200,  bonusShare: 5,  cashDiv: 5,  avg120: 265 },
  // ===== HOTELS =====
  { symbol: "OHL",    name: "Oriental Hotels Limited",         sector: "Hotels",           basePrice: 128,   eps: 3.5,  bookValue: 82,   divYield: 1.5,  roe: 5.2,  listedShares: 25.00,  paidUpCapital: 2500,  bonusShare: 0,  cashDiv: 5,  avg120: 126 },
  { symbol: "SHL",    name: "Soaltee Hotel Limited",           sector: "Hotels",           basePrice: 108,   eps: 2.8,  bookValue: 72,   divYield: 1.2,  roe: 4.5,  listedShares: 38.00,  paidUpCapital: 3800,  bonusShare: 0,  cashDiv: 5,  avg120: 106 },
  // ===== TRADING =====
  { symbol: "BBC",    name: "Bottlers Nepal Limited",          sector: "Trading",          basePrice: 3100,  eps: 72.5, bookValue: 480,  divYield: 2.5,  roe: 18.2, listedShares: 5.50,   paidUpCapital: 550,   bonusShare: 0,  cashDiv: 10, avg120: 3080 },
  { symbol: "NIFRA",  name: "Nepal Infrastructure Bank",       sector: "Trading",          basePrice: 182,   eps: 8.5,  bookValue: 110,  divYield: 2.0,  roe: 8.0,  listedShares: 104.77, paidUpCapital: 10477, bonusShare: 0,  cashDiv: 5,  avg120: 180 },
  // ===== INVESTMENT =====
  { symbol: "CIT",    name: "Citizen Investment Trust",        sector: "Investment",       basePrice: 1850,  eps: 38.5, bookValue: 240,  divYield: 2.0,  roe: 16.8, listedShares: 8.50,   paidUpCapital: 850,   bonusShare: 5,  cashDiv: 5,  avg120: 1835 },
  { symbol: "NIBL",   name: "Nepal Investment Bank Ltd.",      sector: "Investment",       basePrice: 248,   eps: 15.8, bookValue: 148,  divYield: 2.5,  roe: 11.2, listedShares: 154.40, paidUpCapital: 15440, bonusShare: 10, cashDiv: 5,  avg120: 246 },
  // ===== OTHERS =====
  { symbol: "NTC",    name: "Nepal Telecom",                   sector: "Others",           basePrice: 820,   eps: 42.1, bookValue: 560,  divYield: 5.5,  roe: 8.5,  listedShares: 232.55, paidUpCapital: 23255, bonusShare: 0,  cashDiv: 30, avg120: 812 },
  { symbol: "NRIC",   name: "Nepal Reinsurance Company",       sector: "Others",           basePrice: 278,   eps: 12.5, bookValue: 142,  divYield: 2.5,  roe: 9.8,  listedShares: 36.75,  paidUpCapital: 3675,  bonusShare: 5,  cashDiv: 5,  avg120: 275 },
  { symbol: "BFIL",   name: "Butwal Finance Co. Limited",      sector: "Others",           basePrice: 135,   eps: 6.8,  bookValue: 92,   divYield: 2.2,  roe: 7.5,  listedShares: 12.00,  paidUpCapital: 1200,  bonusShare: 5,  cashDiv: 5,  avg120: 133 },
  { symbol: "SGIC",   name: "Sagarmatha Insurance Company",    sector: "Non-Life Insurance", basePrice: 425, eps: 15.5, bookValue: 138, divYield: 3.0, roe: 12.5, listedShares: 14.50,  paidUpCapital: 1450,  bonusShare: 10, cashDiv: 5,  avg120: 422 },
  { symbol: "UPCL",   name: "Unique Power Company Limited",    sector: "Hydropower",       basePrice: 168,   eps: 7.2,  bookValue: 98,   divYield: 1.8,  roe: 7.4,  listedShares: 35.00,  paidUpCapital: 3500,  bonusShare: 5,  cashDiv: 0,  avg120: 166 },
  { symbol: "API",    name: "Api Power Company Limited",       sector: "Hydropower",       basePrice: 145,   eps: 5.8,  bookValue: 88,   divYield: 1.5,  roe: 6.8,  listedShares: 42.00,  paidUpCapital: 4200,  bonusShare: 5,  cashDiv: 0,  avg120: 143 },
  { symbol: "RNLI",   name: "Rastriya Nagarik Laghubitta",     sector: "Microfinance",    basePrice: 720,   eps: 28.5, bookValue: 195,  divYield: 3.5,  roe: 15.5, listedShares: 16.00,  paidUpCapital: 1600,  bonusShare: 15, cashDiv: 5,  avg120: 715 },
  { symbol: "FOWAD",  name: "Fowad Microfinance Bittiya",      sector: "Microfinance",    basePrice: 850,   eps: 32.2, bookValue: 210,  divYield: 3.8,  roe: 16.2, listedShares: 18.50,  paidUpCapital: 1850,  bonusShare: 15, cashDiv: 5,  avg120: 845 },
  { symbol: "MLBL",   name: "Mahalaxmi Life Insurance",        sector: "Life Insurance",  basePrice: 460,   eps: 15.8, bookValue: 158,  divYield: 2.5,  roe: 11.2, listedShares: 20.00,  paidUpCapital: 2000,  bonusShare: 10, cashDiv: 5,  avg120: 457 },
  { symbol: "IME",    name: "IME General Insurance Co. Ltd.",  sector: "Non-Life Insurance", basePrice: 360, eps: 13.5, bookValue: 124, divYield: 3.0, roe: 11.8, listedShares: 15.00,  paidUpCapital: 1500,  bonusShare: 10, cashDiv: 5,  avg120: 357 },
];

// Mock IPO issues for MeroShare
export const MOCK_IPOS = [
  { id: 25, name: "Snow Rivers Limited. (For General Public)",          type: "IPO", status: "Open", units: 10, shareId: "125" },
  { id: 24, name: "Taksar Pikhuwa Khola Hydropower Ltd. (For General Public)", type: "IPO", status: "Open", units: 10, shareId: "124" },
  { id: 23, name: "Mount Everest Power Development Limited (For Local)",  type: "IPO", status: "Open", units: 10, shareId: "123" },
  { id: 22, name: "Sarvottam Paints Industries Ltd. (For Foreign Employment)", type: "IPO", status: "Alloted", units: 10, shareId: "122" },
  { id: 21, name: "Yambaling Hydropower Ltd. (For General Public)",       type: "IPO", status: "Alloted", units: 10, shareId: "121" },
  { id: 20, name: "Everest Colour Limited (For Foreign Employment)",      type: "IPO", status: "Alloted", units: 10, shareId: "120" },
  { id: 19, name: "Sopan Pharmaceuticals Limited (For General Public)",   type: "IPO", status: "Alloted", units: 10, shareId: "119" },
  { id: 18, name: "Appolo Hydropower Limited (For General Public)",       type: "IPO", status: "Alloted", units: 10, shareId: "118" },
  { id: 17, name: "Kalinchock Hydropower Limited (For General Public)",   type: "IPO", status: "Alloted", units: 10, shareId: "117" },
  { id: 16, name: "Yambaling Hydropower Limited (For Local)",             type: "IPO", status: "Alloted", units: 10, shareId: "116" },
  { id: 15, name: "Taksar Pikhuwa Khola Hydropower Limited (For Local)",  type: "IPO", status: "Alloted", units: 10, shareId: "115" },
  { id: 14, name: "Sanigad Hydro Ltd. (For Foreign Employment)",          type: "IPO", status: "Alloted", units: 10, shareId: "114" },
  { id: 13, name: "Garima Subarna Yojana",                                type: "Mutual Fund", status: "Alloted", units: 100, shareId: "113" },
  { id: 12, name: "Kalanga Hydro Ltd. (Foreign Employment)",              type: "IPO", status: "Alloted", units: 10, shareId: "112" },
];

// DP/Bank client list for MeroShare login
export const MOCK_DP_LIST = [
  { id: "101", code: "01", name: "Nabil Investment Banking Ltd. (101)" },
  { id: "102", code: "02", name: "NIC Asia Capital Ltd. (102)" },
  { id: "103", code: "03", name: "Global IME Capital Ltd. (103)" },
  { id: "104", code: "04", name: "Siddhartha Capital Ltd. (104)" },
  { id: "105", code: "05", name: "NIBL Ace Capital Ltd. (105)" },
  { id: "106", code: "06", name: "Civil Capital Market Ltd. (106)" },
  { id: "107", code: "07", name: "Sanima Capital Ltd. (107)" },
  { id: "108", code: "08", name: "Kumari Capital Limited (108)" },
  { id: "109", code: "09", name: "Laxmi Capital Market Ltd. (109)" },
];

import stockMap from './stockmap.json';

/**
 * Initialize stock database with baseline stats and technical indicators.
 * Populates all 350+ NEPSE companies from stockmap.json including GLBSL.
 */
export function initializeMarket() {
  const initialMap = {};
  INITIAL_COMPANIES.forEach(c => { initialMap[c.symbol] = c; });

  const allSymbols = Object.keys(stockMap);

  // Distribute 105 advancing, 234 declining, 18 unchanged to match today's live session (Image 2)
  return allSymbols.map((sym, idx) => {
    const meta = stockMap[sym] || {};
    const baseObj = initialMap[sym] || {};

    let basePrice = baseObj.basePrice || (150 + ((idx * 37) % 750));
    if (sym === 'GLBSL') basePrice = 640;

    let pChange = 0;
    if (idx < 2) {
      pChange = Number((9.8 + Math.random() * 0.2).toFixed(2)); // 2 positive circuits
    } else if (idx < 105) {
      pChange = Number((0.15 + (Math.random() * 6.5)).toFixed(2)); // Advanced (total 105)
    } else if (idx < 339) {
      pChange = Number((-0.15 - (Math.random() * 5.5)).toFixed(2)); // Declined (total 234)
    } else {
      pChange = 0; // Unchanged (total 18)
    }

    const prevClose = basePrice;
    const ltp = Number((prevClose * (1 + pChange / 100)).toFixed(2));
    const change = Number((ltp - prevClose).toFixed(2));
    const open = Number((prevClose * (1 + (pChange * 0.3) / 100)).toFixed(2));
    const high = Number((Math.max(open, ltp) * (1 + Math.random() * 0.015)).toFixed(2));
    const low = Number((Math.min(open, ltp) * (1 - Math.random() * 0.015)).toFixed(2));
    const volume = Math.floor(2500 + ((idx * 8421) % 95000));
    const turnover = Number((ltp * volume).toFixed(2));

    const eps = baseObj.eps || Number((10 + Math.random() * 25).toFixed(1));
    const bookValue = baseObj.bookValue || Number((100 + Math.random() * 120).toFixed(1));
    const pe = eps > 0 ? Number((ltp / eps).toFixed(2)) : 0;
    const pb = bookValue > 0 ? Number((ltp / bookValue).toFixed(2)) : 0;
    const listedShares = baseObj.listedShares || Number((5 + Math.random() * 40).toFixed(2));
    const marketCap = Number((ltp * listedShares).toFixed(2)); // in millions

    // ── Public Float & Tradable Enlisted Shares Analytics ──
    const sec = (meta.sector || baseObj.sector || 'Others').toLowerCase();
    let publicFloatPct = 35;
    if (sec.includes('hydro')) publicFloatPct = 49;
    else if (sec.includes('bank') || sec.includes('commercial')) publicFloatPct = 30;
    else if (sec.includes('development')) publicFloatPct = 35;
    else if (sec.includes('finance')) publicFloatPct = 40;
    else if (sec.includes('micro')) publicFloatPct = 32;
    else if (sec.includes('insurance')) publicFloatPct = 30;
    else if (sec.includes('manufacturing')) publicFloatPct = 20;
    else if (sec.includes('mutual')) publicFloatPct = 100;

    // Tradable public shares (Total Enlisted Shares * Float %)
    const totalEnlistedShares = Math.round(listedShares * 1000000);
    const tradableFloatShares = Math.round(totalEnlistedShares * (publicFloatPct / 100));
    const floatTurnoverPct = Number(((volume / (tradableFloatShares || 1000000)) * 100).toFixed(2));
    const avgVolume20D = Math.max(1000, Math.round(volume * (0.4 + ((idx * 17) % 70) / 100)));
    const volumeSurgeRatio = Number((volume / avgVolume20D).toFixed(2));

    const rsi = Number((35 + Math.random() * 40).toFixed(1));
    const ema20 = Number((ltp * (0.98 + Math.random() * 0.04)).toFixed(2));
    const ema50 = Number((ltp * (0.97 + Math.random() * 0.06)).toFixed(2));
    const ema200 = Number((ltp * (0.92 + Math.random() * 0.1)).toFixed(2));
    const macdLine = Number(((Math.random() - 0.5) * (ltp * 0.02)).toFixed(4));
    const macdSignal = Number((macdLine * 0.8).toFixed(4));
    const macdHist = Number((macdLine - macdSignal).toFixed(4));

    // ── Quantitative Technical Composite Rating (0–100) ──
    let score = 50;
    if (rsi >= 50 && rsi <= 68) score += 14;
    else if (rsi > 68) score += 6;
    else if (rsi < 35) score -= 12;
    if (pChange > 0) score += Math.min(16, pChange * 3.2);
    else score += Math.max(-16, pChange * 3.2);
    if (ltp > ema20) score += 7;
    if (ema20 > ema50) score += 6;
    if (macdLine > macdSignal) score += 8;
    if (floatTurnoverPct >= 1.5) score += 5;
    score = Math.max(12, Math.min(97, Math.round(score)));

    const technicalRating = score >= 80 ? 'Strong Buy' : score >= 65 ? 'Buy' : score >= 45 ? 'Neutral' : score >= 32 ? 'Sell' : 'Strong Sell';
    const relativeStrength = Math.max(8, Math.min(99, Math.round(50 + pChange * 5 + ((idx * 13) % 25) - 12)));

    // Recognized Candlestick Pattern
    const patterns = ['Bullish Engulfing', 'Hammer Reversal', 'Morning Star', 'Breakout Marubozu', 'Piercing Line', 'Tight Consolidation Doji', 'Spinning Top', 'Shooting Star'];
    const candlestickPattern = pChange >= 3 ? patterns[idx % 3] : pChange > 0 ? patterns[3 + (idx % 2)] : patterns[5 + (idx % 3)];

    const high52w = Number((ltp * (1.20 + Math.random() * 0.2)).toFixed(2));
    const low52w = Number((ltp * (0.75 + Math.random() * 0.15)).toFixed(2));

    // ── Benjamin Graham Intrinsic Valuation Model ──
    const graham = calculateGrahamIntrinsicValue(eps, bookValue, ltp);

    // ── Volume Z-Score Engine ──
    const stdDevVol = Math.max(1, avgVolume20D * 0.35);
    const zVol = calculateVolumeZScore(volume, avgVolume20D, stdDevVol);

    // ── Volatility & ATR ──
    const atr = Number((ltp * 0.028).toFixed(2));
    const bbw = calculateBollingerBandWidth([ltp * 0.98, ltp * 0.99, ltp, ltp * 1.01, ltp]);

    // Construct preliminary stock object
    const stockObj = {
      symbol: sym,
      name: meta.name || baseObj.name || sym,
      sector: meta.sector || baseObj.sector || 'Others',
      basePrice,
      ltp,
      prevClose,
      change,
      pChange,
      high,
      low,
      open,
      volume,
      turnover,
      pe,
      pb,
      eps,
      bookValue,
      listedShares,
      totalEnlistedShares,
      publicFloatPct,
      tradableFloat: tradableFloatShares,
      tradableFloatShares,
      floatTurnoverPct,
      avgVolume20D,
      volumeSurgeRatio,
      volumeZScore: zVol.zScore,
      isVolumeShocker: zVol.isVolumeShocker,
      grahamIntrinsicValue: graham.intrinsicValue,
      marginOfSafetyPct: graham.marginOfSafetyPct,
      isUndervalued: graham.isUndervalued,
      valuationStatus: graham.valuationStatus,
      atr,
      bbw: bbw.bbw,
      bbwPct: bbw.bbwPct,
      isSqueeze: bbw.isSqueeze,
      technicalScore: score,
      technicalRating,
      relativeStrength,
      candlestickPattern,
      paidUpCapital: baseObj.paidUpCapital || (listedShares * 100),
      marketCap,
      rsi,
      ema20,
      ema50,
      ema200,
      macd: { line: macdLine, signal: macdSignal, hist: macdHist },
      high52w,
      low52w,
      bonusShare: baseObj.bonusShare || 5,
      cashDiv: baseObj.cashDiv || 0.26,
    };

    // ── Machine Learning Action Zone Classification & Composite Momentum Score ──
    const actionZone = classifyActionZone(stockObj);
    stockObj.actionZone = actionZone;
    stockObj.zone = actionZone.zone;
    stockObj.zoneBadge = actionZone.zoneBadge;
    stockObj.zoneColor = actionZone.zoneColor;
    stockObj.momentumScore = actionZone.momentumScore;
    stockObj.rrr = actionZone.rrr;

    // ── StockYan Microstructure & Predictive Quant Engines ──
    const stealth = calculateStealthAccumulationIndex(stockObj);
    stockObj.stealthAccumulation = stealth;
    stockObj.bcr3 = stealth.bcr3;
    stockObj.bcr3Pct = stealth.bcr3Pct;
    stockObj.sai = stealth.sai;
    stockObj.isStealthAccumulation = stealth.isStealthAccumulation;

    const obir = calculateOrderBookImbalanceRatio(volume * (pChange >= 0 ? 0.60 : 0.40), volume * (pChange >= 0 ? 0.40 : 0.60));
    stockObj.obir = obir;

    const ilsi = calculateImpendingLiquidityShockIndex(listedShares * 0.20, tradableFloatShares);
    stockObj.ilsi = ilsi.ilsi;
    stockObj.ilsiObj = ilsi;

    const dpi = calculateDecisionProbabilityIndex(stockObj);
    stockObj.dpi = dpi;
    stockObj.decision = dpi.decision;
    stockObj.actionDirective = dpi.actionDirective;

    const tradeLab = calculateTradeLabRankScore(stockObj);
    stockObj.tradeLab = tradeLab;
    stockObj.sRank = tradeLab.sRank;
    stockObj.isHighProbabilityBreakout = tradeLab.isHighProbabilityBreakout;

    return stockObj;
  });



}

/**
 * Simulates a single market tick update.
 * @param {Array} currentStocks - Array of current stock states
 * @param {string} trend - 'bull', 'bear', 'volatile', or 'flat'
 */
export function simulateMarketTick(currentStocks, trend = 'flat') {
  let drift = 0;
  let volatility = 0.005;

  if (trend === 'bull')      { drift = 0.002;  volatility = 0.008; }
  else if (trend === 'bear') { drift = -0.002; volatility = 0.008; }
  else if (trend === 'volatile') { drift = 0; volatility = 0.022; }
  else                       { drift = 0;      volatility = 0.003; }

  return currentStocks.map(stock => {
    const rand = (Math.random() * 2 - 1) * volatility + drift;
    const priceChange = stock.ltp * rand;
    const newLtp = Math.max(10, Number((stock.ltp + priceChange).toFixed(2)));
    const totalChange = Number((newLtp - stock.prevClose).toFixed(2));
    const pChange = Number(((totalChange / stock.prevClose) * 100).toFixed(2));

    const high = Math.max(stock.high, newLtp);
    const low  = Math.min(stock.low, newLtp);

    const tickVolume = Math.floor(Math.random() * 2000);
    const newVolume  = stock.volume + tickVolume;
    const newTurnover = Number((stock.turnover + (tickVolume * newLtp)).toFixed(2));

    const newRsi = Math.max(5, Math.min(95, Number((stock.rsi + (pChange * 1.5) + (Math.random() - 0.5) * 2).toFixed(2))));

    const k20  = 2 / 21;
    const k50  = 2 / 51;
    const k200 = 2 / 201;
    const newEma20  = Number((newLtp * k20  + stock.ema20  * (1 - k20)).toFixed(2));
    const newEma50  = Number((newLtp * k50  + stock.ema50  * (1 - k50)).toFixed(2));
    const newEma200 = Number((newLtp * k200 + stock.ema200 * (1 - k200)).toFixed(2));

    const newMacdLine   = Number((newEma20 - newEma50).toFixed(4));
    const macdK         = 2 / 10;
    const newMacdSignal = Number((newMacdLine * macdK + stock.macd.signal * (1 - macdK)).toFixed(4));
    const newMacdHist   = Number((newMacdLine - newMacdSignal).toFixed(4));

    const pe = stock.eps > 0 ? Number((newLtp / stock.eps).toFixed(2)) : 0;
    const pb = stock.bookValue > 0 ? Number((newLtp / stock.bookValue).toFixed(2)) : 0;
    const marketCap = Number((newLtp * stock.listedShares).toFixed(2));

    return {
      ...stock,
      ltp: newLtp,
      change: totalChange,
      pChange,
      high,
      low,
      volume: newVolume,
      turnover: newTurnover,
      pe,
      pb,
      marketCap,
      rsi: newRsi,
      ema20: newEma20,
      ema50: newEma50,
      ema200: newEma200,
      macd: { line: newMacdLine, signal: newMacdSignal, hist: newMacdHist },
      high52w: Math.max(stock.high52w, newLtp),
      low52w:  Math.min(stock.low52w, newLtp),
    };
  });
}

/**
 * Calculates NEPSE, Float, and Sensitive indices using dynamic market cap weighting.
 * Formula: Index = BaseValue × (Σ LTP×Shares) / (Σ BasePrice×Shares)
 */
export function calculateIndices(stocks) {
  let totalCap = 0;
  let baseCap  = 0;

  stocks.forEach(s => {
    totalCap += s.ltp       * s.listedShares;
    baseCap  += s.basePrice * s.listedShares;
  });

  const ratio = baseCap > 0 ? totalCap / baseCap : 1;

  const nepse     = Number((2000 * ratio).toFixed(2));
  const floatIdx  = Number((120  * ratio).toFixed(2));
  const sensitive = Number((380  * ratio).toFixed(2));

  const prevNepse = 2000, prevFloat = 120, prevSens = 380;

  return {
    nepse:     { value: nepse,     change: Number((nepse     - prevNepse).toFixed(2)), pChange: Number(((nepse     - prevNepse) / prevNepse * 100).toFixed(2)) },
    float:     { value: floatIdx,  change: Number((floatIdx  - prevFloat).toFixed(2)), pChange: Number(((floatIdx  - prevFloat) / prevFloat * 100).toFixed(2)) },
    sensitive: { value: sensitive, change: Number((sensitive - prevSens).toFixed(2)),  pChange: Number(((sensitive - prevSens)  / prevSens  * 100).toFixed(2)) },
  };
}

/**
 * Generates historical OHLCV data for charting and quantitative analysis.
 * Supports >= 365 days (1 Year), 730 days (2 Years), and 1825 days (5 Years).
 * Strictly filters out Fridays, Saturdays, and Nepal Public Holidays.
 * Guarantees that the latest day ends at EXACTLY basePrice (LTP).
 */
export function generateHistory(symbol, basePrice, days = 365) {
  const ltp = Number(basePrice) || 100;
  const now = new Date();
  
  // Strictly generate real NEPSE trading days, skipping Fridays, Saturdays, and Nepal Public Holidays
  const tradingDates = generateTradingDaysSequence(days, now);
  const totalDays = tradingDates.length;
  const history = [];
  let price = ltp;

  for (let i = 0; i < totalDays; i++) {
    // i counts backwards from latest session
    const revIdx = totalDays - 1 - i;
    const dateObj = tradingDates[revIdx];
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: days > 90 ? 'numeric' : undefined });
    const isoDate = getIsoDateInNPT(dateObj);

    if (i === 0) {
      // Latest valid trading day (last open session)
      const prevC = Number((ltp * 0.99).toFixed(2));
      history.unshift({
        date: dateStr,
        isoDate,
        dateObj,
        open: prevC,
        high: Number((ltp * 1.015).toFixed(2)),
        low: Number((ltp * 0.985).toFixed(2)),
        close: ltp,
        volume: Math.floor(15000 + Math.random() * 45000),
        turnover: Math.floor(ltp * (15000 + Math.random() * 45000))
      });
    } else {
      // Create realistic bounded market cycle over real trading days
      const cycleWave = Math.sin(i / 35) * 0.004 + Math.cos(i / 90) * 0.006;
      const noise = (Math.random() * 0.02 - 0.01);
      const dailyDelta = cycleWave + noise;
      
      const prevClose = price;
      const minAllowed = Number((ltp * 0.72).toFixed(2));
      const maxAllowed = Number((ltp * 1.30).toFixed(2));
      price = Number(Math.max(minAllowed, Math.min(maxAllowed, price * (1 - dailyDelta))).toFixed(2));
      
      const open = Number((prevClose * (1 + (Math.random() * 0.008 - 0.004))).toFixed(2));
      const high = Number((Math.max(open, prevClose) * (1 + Math.random() * 0.012)).toFixed(2));
      const low = Number((Math.min(open, prevClose) * (1 - Math.random() * 0.012)).toFixed(2));
      const volume = Math.floor(6000 + Math.random() * 35000);

      history.unshift({
        date: dateStr,
        isoDate,
        dateObj,
        open,
        high,
        low,
        close: prevClose,
        volume,
        turnover: Math.floor(prevClose * volume)
      });
    }
  }

  // Double-verify that the latest day is strictly LTP
  if (history.length > 0) {
    history[history.length - 1].close = ltp;
  }

  // Compute 200 SMA, 50 SMA, 20 SMA, and Chaikin ADL over real trading day series
  let runningCloseSum200 = 0;
  let runningCloseSum50 = 0;
  let runningCloseSum20 = 0;
  let runningADL = 0;

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    runningCloseSum200 += item.close;
    runningCloseSum50 += item.close;
    runningCloseSum20 += item.close;

    if (i >= 200) runningCloseSum200 -= history[i - 200].close;
    if (i >= 50) runningCloseSum50 -= history[i - 50].close;
    if (i >= 20) runningCloseSum20 -= history[i - 20].close;

    item.sma200 = i >= 199 ? Number((runningCloseSum200 / 200).toFixed(2)) : Number((runningCloseSum200 / (i + 1)).toFixed(2));
    item.sma50 = i >= 49 ? Number((runningCloseSum50 / 50).toFixed(2)) : Number((runningCloseSum50 / (i + 1)).toFixed(2));
    item.sma20 = i >= 19 ? Number((runningCloseSum20 / 20).toFixed(2)) : Number((runningCloseSum20 / (i + 1)).toFixed(2));

    // Chaikin Accumulation / Distribution Money Flow Multiplier
    const clv = (item.high !== item.low) ? ((item.close - item.low) - (item.high - item.close)) / (item.high - item.low) : 0;
    runningADL += clv * item.volume;
    item.adl = Math.round(runningADL);
  }

  return history;
}

/**
 * Generates intraday hourly/15m OHLCV data for charting.
 * NEPSE session is 11:00 to 15:00.
 * Guarantees that the final candle closes at EXACTLY basePrice (LTP).
 */
export function generateHourlyHistory(symbol, basePrice, resolution = '15m', options = {}) {
  const isNepse = symbol === 'NEPSE' || symbol === 'NEPSE Index';
  
  if (isNepse) {
    const currentClose = Number(basePrice) > 1000 ? Number(basePrice) : 2557.31;
    const scaleFactor = currentClose / 2557.31;

    // Real high-definition NEPSE trading session trajectory matching StockYan
    const rawTemplate = [
      { time: '10:51 AM', close: 2555.20, open: 2555.20, high: 2555.50, low: 2554.80, volume: 18400 },
      { time: '10:58 AM', close: 2555.00, open: 2555.20, high: 2555.30, low: 2554.60, volume: 22100 },
      { time: '11:05 AM', close: 2542.10, open: 2555.00, high: 2555.00, low: 2541.50, volume: 38500 },
      { time: '11:12 AM', close: 2531.40, open: 2542.10, high: 2542.50, low: 2530.80, volume: 49200 },
      { time: '11:18 AM', close: 2524.80, open: 2531.40, high: 2532.00, low: 2523.50, volume: 56100 },
      { time: '11:24 AM', close: 2520.10, open: 2524.80, high: 2525.20, low: 2519.50, volume: 62400 },
      { time: '11:28 AM', close: 2519.00, open: 2520.10, high: 2520.50, low: 2518.80, volume: 71000 },
      { time: '11:32 AM', close: 2528.50, open: 2519.00, high: 2529.20, low: 2519.00, volume: 58400 },
      { time: '11:36 AM', close: 2541.20, open: 2528.50, high: 2542.00, low: 2528.00, volume: 54100 },
      { time: '11:41 AM', close: 2553.00, open: 2541.20, high: 2553.80, low: 2540.80, volume: 68900 },
      { time: '11:47 AM', close: 2551.40, open: 2553.00, high: 2553.20, low: 2550.50, volume: 42300 },
      { time: '11:53 AM', close: 2547.80, open: 2551.40, high: 2551.80, low: 2546.90, volume: 36700 },
      { time: '12:00 PM', close: 2549.10, open: 2547.80, high: 2549.80, low: 2547.20, volume: 31200 },
      { time: '12:10 PM', close: 2552.30, open: 2549.10, high: 2552.90, low: 2548.80, volume: 28400 },
      { time: '12:20 PM', close: 2551.80, open: 2552.30, high: 2552.50, low: 2551.00, volume: 24900 },
      { time: '12:31 PM', close: 2554.40, open: 2551.80, high: 2555.00, low: 2551.50, volume: 29800 },
      { time: '12:42 PM', close: 2558.10, open: 2554.40, high: 2558.90, low: 2554.00, volume: 34500 },
      { time: '12:52 PM', close: 2562.90, open: 2558.10, high: 2563.50, low: 2557.80, volume: 39800 },
      { time: '01:03 PM', close: 2566.20, open: 2562.90, high: 2567.00, low: 2562.50, volume: 46200 },
      { time: '01:14 PM', close: 2568.00, open: 2566.20, high: 2568.60, low: 2565.80, volume: 51200 },
      { time: '01:21 PM', close: 2568.80, open: 2568.00, high: 2569.20, low: 2567.80, volume: 58900 },
      { time: '01:30 PM', close: 2566.10, open: 2568.80, high: 2568.90, low: 2565.50, volume: 44100 },
      { time: '01:38 PM', close: 2563.40, open: 2566.10, high: 2566.50, low: 2562.80, volume: 38700 },
      { time: '01:46 PM', close: 2560.80, open: 2563.40, high: 2563.80, low: 2560.10, volume: 35200 },
      { time: '01:54 PM', close: 2559.50, open: 2560.80, high: 2561.20, low: 2559.00, volume: 31800 },
      { time: '02:02 PM', close: 2557.80, open: 2559.50, high: 2559.90, low: 2557.20, volume: 30100 },
      { time: '02:11 PM', close: 2556.20, open: 2557.80, high: 2558.10, low: 2555.50, volume: 33400 },
      { time: '02:20 PM', close: 2552.90, open: 2556.20, high: 2556.50, low: 2552.10, volume: 37900 },
      { time: '02:29 PM', close: 2550.40, open: 2552.90, high: 2553.20, low: 2549.80, volume: 41200 },
      { time: '02:37 PM', close: 2551.10, open: 2550.40, high: 2551.80, low: 2550.00, volume: 39600 },
      { time: '02:45 PM', close: 2552.30, open: 2551.10, high: 2553.00, low: 2551.00, volume: 44800 },
      { time: '02:53 PM', close: 2554.80, open: 2552.30, high: 2555.40, low: 2552.00, volume: 49500 },
      { time: '03:00 PM', close: currentClose, open: 2554.80, high: Math.max(currentClose, 2555.20), low: Math.min(currentClose, 2554.50), volume: 68400 }
    ];

    return rawTemplate.map(p => ({
      ...p,
      close: Number((p.close * scaleFactor).toFixed(2)),
      open: Number((p.open * scaleFactor).toFixed(2)),
      high: Number((p.high * scaleFactor).toFixed(2)),
      low: Number((p.low * scaleFactor).toFixed(2))
    }));
  }

  const ltp = Number(basePrice) || 100;
  const opt = typeof options === 'object' && options !== null ? options : {};
  const prevClose = Number(opt.prevClose || (opt.change ? ltp - opt.change : ltp * 0.99));
  const openPrice = Number(opt.open || prevClose);
  const highPrice = Number(opt.high || Math.max(openPrice, ltp) * 1.015);
  const lowPrice = Number(opt.low || Math.min(openPrice, ltp) * 0.985);

  const history = [];
  const intervals = resolution === '15m' ? 16 : 4;
  const stepMs = resolution === '15m' ? 15 * 60000 : 60 * 60000;
  
  const now = new Date();
  const lastTradingDay = getLastValidTradingDay(now);
  const startTime = new Date(lastTradingDay.getFullYear(), lastTradingDay.getMonth(), lastTradingDay.getDate(), 11, 0, 0).getTime();
  
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed = symbol.charCodeAt(i) + ((seed << 5) - seed);
  const pseudoRand = (offset) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < intervals; i++) {
    const currentTime = new Date(startTime + i * stepMs);
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const progress = intervals > 1 ? i / (intervals - 1) : 1;

    // Linear trend connecting Open to LTP
    const trend = openPrice + (ltp - openPrice) * progress;
    // Bell curve wave: 0 at open, peaks in middle, fades to 0 at closing
    const damp = Math.sin(progress * Math.PI);
    const wave = (pseudoRand(i) * 2 - 1) * ((highPrice - lowPrice) * 0.28) * damp;

    let closeVal = i === intervals - 1 ? ltp : Number((trend + wave).toFixed(2));
    closeVal = Math.max(lowPrice, Math.min(highPrice, closeVal));

    const prevCloseVal = i === 0 ? openPrice : history[i - 1].close;
    const openVal = prevCloseVal;
    const ptHigh = i === intervals - 1 ? Math.max(openVal, ltp) : Math.min(highPrice, Math.max(openVal, closeVal) + 0.4);
    const ptLow = i === intervals - 1 ? Math.min(openVal, ltp) : Math.max(lowPrice, Math.min(openVal, closeVal) - 0.4);

    history.push({
      time: timeStr,
      timestamp: currentTime.getTime(),
      open: Number(openVal.toFixed(2)),
      high: Number(ptHigh.toFixed(2)),
      low: Number(ptLow.toFixed(2)),
      close: Number(closeVal.toFixed(2)),
      volume: Math.floor(1000 + pseudoRand(i * 4) * 5000)
    });
  }

  // GUARANTEE: Final candle is strictly at the stock's actual LTP
  if (history.length > 0) {
    history[history.length - 1].close = ltp;
    history[history.length - 1].high = Math.max(history[history.length - 1].open, ltp);
    history[history.length - 1].low = Math.min(history[history.length - 1].open, ltp);
  }

  return history;
}

/**
 * Generates sparkline price points for mini charts.
 */
export function generateSparkline(ltp, pChange) {
  const steps = 12;
  const points = [];
  let p = ltp - (ltp * (pChange / 100));
  const stepChange = (ltp - p) / steps;
  for (let i = 0; i <= steps; i++) {
    const osc = (Math.random() - 0.5) * ltp * 0.008;
    points.push(Number((p + i * stepChange + osc).toFixed(2)));
  }
  points[steps] = ltp;
  return points;
}

/**
 * Calculates Classic Pivot Points from OHLC data.
 */
export function calculatePivotPoints(highOrStock, low, close) {
  let h, l, c;
  if (typeof highOrStock === 'object' && highOrStock !== null) {
    const ltp = Number(highOrStock.ltp || 100);
    h = Number(highOrStock.high || ltp * 1.02);
    l = Number(highOrStock.low || ltp * 0.98);
    c = Number(highOrStock.close || highOrStock.ltp || ltp);
  } else {
    h = Number(highOrStock || 100);
    l = Number(low || h * 0.98);
    c = Number(close || h);
  }
  const P  = Number(((h + l + c) / 3).toFixed(2));
  const R1 = Number((2 * P - l).toFixed(2));
  const S1 = Number((2 * P - h).toFixed(2));
  const R2 = Number((P + (h - l)).toFixed(2));
  const S2 = Number((P - (h - l)).toFixed(2));
  const R3 = Number((h + 2 * (P - l)).toFixed(2));
  const S3 = Number((l - 2 * (h - P)).toFixed(2));
  return { P, pp: P, R1, r1: R1, R2, r2: R2, R3, r3: R3, S1, s1: S1, S2, s2: S2, S3, s3: S3 };
}

/**
 * Calculates Fibonacci Retracement levels from 52-week High/Low.
 */
export function calculateFibonacci(high52wOrStock, low52w) {
  let h, l;
  if (typeof high52wOrStock === 'object' && high52wOrStock !== null) {
    const ltp = Number(high52wOrStock.ltp || 100);
    h = Number(high52wOrStock.high52w || high52wOrStock.high || ltp * 1.25);
    l = Number(high52wOrStock.low52w || high52wOrStock.low || ltp * 0.75);
  } else {
    h = Number(high52wOrStock || 100);
    l = Number(low52w || h * 0.75);
  }
  const diff = h - l || 1;
  return {
    level_0:    Number(h.toFixed(2)),
    level_236:  Number((h - diff * 0.236).toFixed(2)),
    level_382:  Number((h - diff * 0.382).toFixed(2)),
    level_500:  Number((h - diff * 0.500).toFixed(2)),
    level_618:  Number((h - diff * 0.618).toFixed(2)),
    level_786:  Number((h - diff * 0.786).toFixed(2)),
    level_1000: Number(l.toFixed(2)),
  };
}

/**
 * Mock CDSC API responses for IPO allotment checking.
 */
export function checkIpoAllotmentMock(companyShareId, boid) {
  return new Promise(resolve => {
    setTimeout(() => {
      if (!boid || boid.length !== 16 || !/^\d+$/.test(boid)) {
        resolve({ success: false, message: 'BOID must be a 16-digit number.' });
        return;
      }
      const issue = MOCK_IPOS.find(i => i.shareId === companyShareId || i.id.toString() === companyShareId);
      if (!issue) {
        resolve({ success: false, message: 'Company share issue not found.' });
        return;
      }
      const lastDigits = parseInt(boid.slice(-4), 10);
      const isAllotted = lastDigits % 3 === 0;
      if (isAllotted) {
        resolve({ success: true, status: 'Allotted',     units: issue.units, message: `Congratulations! You have been allotted ${issue.units} units of ${issue.name}.` });
      } else {
        resolve({ success: true, status: 'Not Allotted', units: 0,           message: `Sorry, you were not allotted shares for ${issue.name}.` });
      }
    }, 800);
  });
}

// Helper to generate a realistic, stable Demat portfolio based on BOID
export function generateMockDematPortfolio(boid, stocksList) {
  if (!stocksList || stocksList.length === 0) return [];
  
  // Create a simple deterministic hash from the 16-digit BOID
  let hash = 0;
  for (let i = 0; i < boid.length; i++) {
    hash = boid.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  // Number of stocks: 4 to 8 holdings deterministically
  const count = 4 + (hash % 5);
  const holdings = [];
  const selectedSymbols = new Set();

  for (let i = 0; i < count; i++) {
    let index = (hash + i * 37) % stocksList.length;
    let stock = stocksList[index];
    
    // Avoid duplicates
    let attempts = 0;
    while (selectedSymbols.has(stock.symbol) && attempts < stocksList.length) {
      index = (index + 1) % stocksList.length;
      stock = stocksList[index];
      attempts++;
    }
    
    selectedSymbols.add(stock.symbol);

    // Units: deterministic between 10 and 350, multiples of 10
    const units = (1 + ((hash + i * 17) % 35)) * 10; 
    
    // WACC: deterministic price variance around current price (0.75 to 1.15)
    const varianceFactor = 0.75 + (((hash + i * 13) % 40) / 100); 
    const wacc = Number((stock.ltp * varianceFactor).toFixed(2));

    holdings.push({
      symbol: stock.symbol,
      name: stock.name,
      units,
      wacc
    });
  }

  return holdings;
}

// ── Top NEPSE Stock Brokers Directory ──
export const NEPSE_BROKERS = [
  { no: 58, name: "Naasa Securities Co. Ltd." },
  { no: 45, name: "Imperial Securities Co. Pvt. Ltd." },
  { no: 34, name: "Vision Securities Pvt. Ltd." },
  { no: 49, name: "Online Securities Ltd." },
  { no: 28, name: "Shree Krishna Securities Ltd." },
  { no: 38, name: "Dipshikha Dhitopatra Karobar Co." },
  { no: 57, name: "Aryatara Investment & Securities" },
  { no: 44, name: "Dynamic Money Managers Securities" },
  { no: 14, name: "Nepal Stock House Pvt. Ltd." },
  { no: 33, name: "Dakshinkali Investment & Securities" },
  { no: 19, name: "Nepal Investment & Securities Pvt." },
  { no: 64, name: "Sani Securities Company Ltd." },
  { no: 4,  name: "Opal Securities Investment Pvt." },
  { no: 32, name: "Premier Securities Company Ltd." },
  { no: 47, name: "Nivana Capital Market Pvt. Ltd." },
  { no: 10, name: "Pragyan Securities Pvt. Ltd." },
  { no: 22, name: "Siprabi Securities Pvt. Ltd." }
];

/**
 * Generates Level 2 Market Depth (Order Book) for any NEPSE stock.
 */
export function generateMarketDepth(stock) {
  const ltp = stock.ltp || stock.basePrice || 100;
  const isBull = (stock.pChange || 0) >= 0;
  
  // Deterministic seed based on symbol & ltp
  let seed = 0;
  for (let i = 0; i < (stock.symbol || '').length; i++) seed += stock.symbol.charCodeAt(i);
  seed = Math.floor((seed + ltp) * 100);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const buyBias = isBull ? 0.65 : 0.40;
  const totalBaseQty = (stock.volume && stock.volume > 1000) ? Math.floor(stock.volume * 0.8) : 50000;
  
  const buyOrders = [];
  const sellOrders = [];
  let totalBuyQty = 0;
  let totalSellQty = 0;

  for (let i = 0; i < 5; i++) {
    // Buy prices slightly below LTP
    const buyPrice = Number((ltp - (i + 1) * (ltp * 0.003 * (0.8 + rand() * 0.4))).toFixed(1));
    const buyQty = Math.floor(totalBaseQty * buyBias * (0.15 + rand() * 0.25) / (i + 1));
    const buyOrderCount = 1 + Math.floor(rand() * 8);
    buyOrders.push({ order: i + 1, orders: buyOrderCount, qty: buyQty, price: buyPrice });
    totalBuyQty += buyQty;

    // Sell prices slightly above LTP
    const sellPrice = Number((ltp + (i + 1) * (ltp * 0.003 * (0.8 + rand() * 0.4))).toFixed(1));
    const sellQty = Math.floor(totalBaseQty * (1 - buyBias) * (0.15 + rand() * 0.25) / (i + 1));
    const sellOrderCount = 1 + Math.floor(rand() * 8);
    sellOrders.push({ order: i + 1, orders: sellOrderCount, qty: sellQty, price: sellPrice });
    totalSellQty += sellQty;
  }

  const grandTotal = totalBuyQty + totalSellQty || 1;
  const buyPercent = Number(((totalBuyQty / grandTotal) * 100).toFixed(1));
  const sellPercent = Number((100 - buyPercent).toFixed(1));
  const qtyDiff = totalBuyQty - totalSellQty;
  const demandStatus = qtyDiff >= 0 
    ? `Demand High by ${qtyDiff.toLocaleString()} units (${buyPercent}% vs ${sellPercent}%)`
    : `Supply High by ${Math.abs(qtyDiff).toLocaleString()} units (${sellPercent}% vs ${buyPercent}%)`;

  return {
    bids: buyOrders,
    asks: sellOrders,
    buyOrders,
    sellOrders,
    totalBuyQty,
    totalSellQty,
    buyPercent,
    sellPercent,
    demandStatus,
    isDemandHigh: qtyDiff >= 0
  };
}

/**
 * Generates Broker Accumulation & Distribution analysis for a stock.
 */
export function generateBrokerAnalysis(stockOrStocks) {
  // If called with an array of stocks (Services tab Broker Activity 1-60)
  if (Array.isArray(stockOrStocks)) {
    const stockList = stockOrStocks.length > 0 ? stockOrStocks : [];
    
    return NEPSE_BROKERS.map((b, idx) => {
      let seed = b.no * 9301 + 49297;
      const rand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      // Base turnover proportional to broker tier
      const tierFactor = b.no === 58 ? 1.8 : b.no === 45 ? 1.5 : b.no === 34 ? 1.4 : b.no === 49 ? 1.3 : b.no === 28 ? 1.25 : (0.4 + rand() * 0.7);
      const buyTurnover = Math.round((28000000 + rand() * 95000000) * tierFactor);
      const sellTurnover = Math.round((25000000 + rand() * 90000000) * tierFactor);
      const netTurnover = buyTurnover - sellTurnover;

      // Top bought and sold scrips for this broker
      const shuffled = [...stockList].sort(() => rand() - 0.5);
      const topBought = shuffled.slice(0, 4).map(s => ({
        symbol: s.symbol,
        qty: Math.round(5000 + rand() * 45000)
      }));
      const topSold = shuffled.slice(4, 8).map(s => ({
        symbol: s.symbol,
        qty: Math.round(4000 + rand() * 38000)
      }));

      return {
        brokerNo: b.no,
        name: b.name,
        code: b.code || `TMS-${b.no}`,
        buyTurnover,
        sellTurnover,
        netTurnover,
        topBought,
        topSold
      };
    });
  }

  // Single stock analysis
  const stock = typeof stockOrStocks === 'object' && stockOrStocks !== null ? stockOrStocks : { symbol: 'NEPSE', ltp: 100, volume: 10000 };
  const ltp = stock.ltp || 100;
  const vol = stock.volume || 10000;
  let seed = 0;
  for (let i = 0; i < (stock.symbol || '').length; i++) seed += stock.symbol.charCodeAt(i);
  seed = Math.floor((seed + ltp) * 10);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const shuffledBrokers = [...NEPSE_BROKERS].sort(() => rand() - 0.5);
  
  const topBuyers = [];
  const topSellers = [];
  let totalBought = 0;
  let totalSold = 0;

  shuffledBrokers.slice(0, 8).forEach((b, idx) => {
    const buyQty = Math.floor((vol * 0.45) * (0.28 / (idx + 1)) * (0.8 + rand() * 0.4));
    const avgBuyRate = Number((ltp * (0.99 + rand() * 0.02)).toFixed(2));
    totalBought += buyQty;
    topBuyers.push({
      broker: b.no,
      brokerNo: b.no,
      brokerName: b.name,
      shares: buyQty,
      qty: buyQty,
      avgRate: avgBuyRate,
      amount: Math.floor(buyQty * avgBuyRate),
      sharePct: 0
    });

    const sellQty = Math.floor((vol * 0.45) * (0.28 / (idx + 1)) * (0.8 + rand() * 0.4));
    const avgSellRate = Number((ltp * (0.99 + rand() * 0.02)).toFixed(2));
    totalSold += sellQty;
    topSellers.push({
      broker: b.no,
      brokerNo: b.no,
      brokerName: b.name,
      shares: sellQty,
      qty: sellQty,
      avgRate: avgSellRate,
      amount: Math.floor(sellQty * avgSellRate),
      sharePct: 0
    });
  });

  topBuyers.forEach(b => { b.sharePct = totalBought > 0 ? Number(((b.qty / totalBought) * 100).toFixed(1)) : 0; });
  topSellers.forEach(s => { s.sharePct = totalSold > 0 ? Number(((s.qty / totalSold) * 100).toFixed(1)) : 0; });

  const topBuyerQty = topBuyers.slice(0, 3).reduce((acc, b) => acc + b.qty, 0);
  const topSellerQty = topSellers.slice(0, 3).reduce((acc, s) => acc + s.qty, 0);
  const isAccumulating = topBuyerQty >= topSellerQty;
  const netBrokerFlow = topBuyerQty - topSellerQty;

  return {
    topBuyers,
    topSellers,
    totalBought,
    totalSold,
    isAccumulating,
    netBrokerFlow,
    summary: isAccumulating 
      ? `Institutional Accumulation Detected — Top 3 brokers absorbed ${((topBuyerQty/totalBought)*100).toFixed(0)}% of buy volume.`
      : `Institutional Distribution Detected — Top 3 sellers offloaded ${((topSellerQty/totalSold)*100).toFixed(0)}% of supply.`
  };
}

/**
 * Generates Real-time Floorsheet entries for any NEPSE stock.
 */
export function generateFloorsheet(stock, count = 25) {
  const ltp = stock.ltp || 100;
  let seed = 0;
  for (let i = 0; i < (stock.symbol || '').length; i++) seed += stock.symbol.charCodeAt(i);
  seed = Math.floor((seed + ltp) * 10);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const rows = [];
  const startMinutes = 11 * 60 + 5; // 11:05
  for (let i = 0; i < count; i++) {
    const min = startMinutes + Math.floor(i * (230 / count));
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const ss = String(Math.floor(rand() * 59)).padStart(2, '0');
    
    const bb = NEPSE_BROKERS[Math.floor(rand() * NEPSE_BROKERS.length)].no;
    let sb = NEPSE_BROKERS[Math.floor(rand() * NEPSE_BROKERS.length)].no;
    if (sb === bb) sb = (bb + 7) % 65 || 34;

    const rate = Number((ltp + (rand() * 0.03 * ltp - 0.015 * ltp)).toFixed(1));
    const qty = Math.floor((10 + rand() * 45) * 10);
    const amount = Number((rate * qty).toFixed(2));

    rows.push({
      id: count - i,
      time: `${hh}:${mm}:${ss}`,
      symbol: stock.symbol,
      buyerBroker: bb,
      sellerBroker: sb,
      qty,
      rate,
      amount
    });
  }

  return rows.sort((a, b) => b.id - a.id);
}

/**
 * Generates 8 Full Quarters (2 Years) of Fundamentals for any stock.
 */
export function generateQuarterlyReports(stock) {
  const eps = Number(stock?.eps) || 18.5;
  const bookVal = Number(stock?.bookValue) || 150;
  const ltp = Number(stock?.ltp) || 350;
  const paidUp = Number(stock?.paidUpCapital) || 2500;

  const quarters = [
    { q: "082/083 Q4", fy: "2025/2026", mult: 1.00, audited: true },
    { q: "082/083 Q3", fy: "2025/2026", mult: 0.96, audited: false },
    { q: "082/083 Q2", fy: "2025/2026", mult: 0.93, audited: false },
    { q: "082/083 Q1", fy: "2025/2026", mult: 0.90, audited: false },
    { q: "081/082 Q4", fy: "2024/2025", mult: 0.88, audited: true },
    { q: "081/082 Q3", fy: "2024/2025", mult: 0.84, audited: false },
    { q: "081/082 Q2", fy: "2024/2025", mult: 0.80, audited: false },
    { q: "081/082 Q1", fy: "2024/2025", mult: 0.77, audited: false },
  ];

  return quarters.map(item => {
    const qEps = Number((eps * item.mult).toFixed(2));
    const qBv = Number((bookVal * item.mult).toFixed(1));
    const qProfit = Number((paidUp * 0.18 * item.mult).toFixed(2));
    const qOp = Number((paidUp * 0.25 * item.mult).toFixed(2));
    const qCap = Number((paidUp * item.mult / 100).toFixed(2));

    return {
      quarter: item.q,
      fiscalYear: item.fy,
      eps: qEps,
      epsAnnualized: (qEps * 1.1).toFixed(2),
      pe: qEps > 0 ? (ltp / qEps).toFixed(2) : 'N/A',
      bookValue: qBv,
      netProfit: `${qProfit} Cr`,
      operatingIncome: `${qOp} Cr`,
      netWorth: qBv,
      paidUpCapital: `${qCap} Arba`,
      depreciation: `${(paidUp * 0.012 * item.mult).toFixed(2)} Cr`,
      status: item.audited ? "Audited" : "Unaudited"
    };
  });
}

/**
 * Generates 12-Month Accumulation & Distribution Cycle Analytics
 */
export function generateAccumulationDistributionHistory12M(stock) {
  const ltp = Number(stock?.ltp) || 350;
  const pChg = Number(stock?.pChange) || 0;
  const rsi = Number(stock?.rsi) || 52;
  const sym = stock?.symbol || 'NEPSE';

  // Wyckoff Phase Determination
  let wyckoffPhase = 'Phase D: Sign of Strength (SOS) & Markup Expansion';
  let phaseDescription = 'Institutional accumulation complete. Price making higher lows above 200 SMA.';
  let accumulationScore = 78;
  let status = 'Strong Accumulation';

  if (rsi <= 36) {
    wyckoffPhase = 'Phase C: Spring / Final Liquidity Shakeout';
    phaseDescription = 'Smart money absorbing retail stop-losses before initiating markup phase.';
    accumulationScore = 92;
    status = 'Aggressive Absorption';
  } else if (rsi >= 70) {
    wyckoffPhase = 'Phase B: Institutional Distribution at Resistance';
    phaseDescription = 'Large block sellers offloading inventory into high volume retail spikes.';
    accumulationScore = 28;
    status = 'Heavy Distribution';
  } else if (pChg < -2.5) {
    wyckoffPhase = 'Phase A: Stopping Volume & Preliminary Support';
    phaseDescription = 'Slowing downward momentum with institutional buy orders filling on dips.';
    accumulationScore = 84;
    status = 'Dip Accumulation';
  }

  // 12 Monthly Snapshots
  const months = ['Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026'];
  const monthlyFlow = months.map((m, idx) => {
    const buyCr = (12.5 + (idx * 2.8) + (Math.random() * 8)).toFixed(2);
    const sellCr = (8.2 + (idx * 1.6) + (Math.random() * 6)).toFixed(2);
    const net = (parseFloat(buyCr) - parseFloat(sellCr)).toFixed(2);
    return {
      month: m,
      instBuy: `Rs. ${buyCr} Cr`,
      instSell: `Rs. ${sellCr} Cr`,
      netFlow: `${net >= 0 ? '+' : ''}${net} Cr`,
      phase: net >= 0 ? 'Accumulation' : 'Distribution',
      flowScore: Math.min(95, Math.max(20, Math.round(50 + parseFloat(net) * 3)))
    };
  });

  return {
    symbol: sym,
    wyckoffPhase,
    phaseDescription,
    accumulationScore,
    status,
    chaikinMoneyFlow: '+0.24 (Bullish Institutional Inflow)',
    obvTrend: 'Bullish Volume Accumulation Divergence',
    smartMoneyDominance: '71.8% Institutional Holding',
    twelveMonthNetInflow: 'Rs. +148.60 Cr',
    monthlyFlow
  };
}

/**
 * Generates 12-Month Quarterly Broker Accumulation History
 */
export function generateBroker12MHistory(stock) {
  const ltp = Number(stock?.ltp) || 350;
  const sym = stock?.symbol || 'NEPSE';

  const topBrokers = [
    { brokerNo: 58, name: 'Naasa Securities', q1Holding: '210K', q2Holding: '340K', q3Holding: '480K', q4Holding: '620K', avgRate: (ltp * 0.91).toFixed(1), changeYoY: '+195.2%', action: 'Heavy Accumulator' },
    { brokerNo: 45, name: 'Imperial Securities', q1Holding: '180K', q2Holding: '220K', q3Holding: '310K', q4Holding: '450K', avgRate: (ltp * 0.93).toFixed(1), changeYoY: '+150.0%', action: 'Steady Accumulator' },
    { brokerNo: 34, name: 'Vision Securities', q1Holding: '120K', q2Holding: '190K', q3Holding: '260K', q4Holding: '380K', avgRate: (ltp * 0.94).toFixed(1), changeYoY: '+216.7%', action: 'Whale Position' },
    { brokerNo: 49, name: 'Online Securities', q1Holding: '95K', q2Holding: '140K', q3Holding: '200K', q4Holding: '290K', avgRate: (ltp * 0.92).toFixed(1), changeYoY: '+205.3%', action: 'Strategic Buyer' },
    { brokerNo: 28, name: 'Shree Krishna Securities', q1Holding: '80K', q2Holding: '110K', q3Holding: '170K', q4Holding: '240K', avgRate: (ltp * 0.95).toFixed(1), changeYoY: '+200.0%', action: 'Accumulator' },
    { brokerNo: 42, name: 'Kumari Securities', q1Holding: '60K', q2Holding: '90K', q3Holding: '130K', q4Holding: '190K', avgRate: (ltp * 0.89).toFixed(1), changeYoY: '+216.7%', action: 'Growth Buyer' }
  ];

  return {
    symbol: sym,
    timeframe: '12 Months (4 Quarters YoY)',
    topBrokers,
    total12mNetAccumulation: '2.17M shares (Rs. 78.4 Cr)',
    institutionalAvgPrice: `Rs. ${(ltp * 0.92).toFixed(1)}`
  };
}

/**
 * Calculates Accumulation & Distribution for all stocks based on
 * HIGHEST BUYING vs HIGHEST SELLING volume, turnover, and net cash flow
 * (Where investors and smart money are actively buying and selling the most).
 */
export function calculateStocksAccumulationDistribution(stocks = []) {
  if (!stocks || stocks.length === 0) return { topAccumulated: [], topDistributed: [], allRanked: [] };

  const analyzed = stocks.map(s => {
    const ltp = Number(s.ltp) || 100;
    const vol = Number(s.volume) || 10000;
    const turnover = Number(s.turnover) || (ltp * vol);
    const rsi = Number(s.rsi) || 50;
    const pChg = Number(s.pChange) || 0;

    // Buying vs Selling Distribution formula based on order flow & volume absorption
    let buyRatio = 0.5;
    if (rsi < 40) buyRatio = 0.68 + (Math.random() * 0.15); // Dip buying absorption
    else if (rsi > 65) buyRatio = 0.32 - (Math.random() * 0.12); // Smart money dumping into retail
    else if (pChg > 0) buyRatio = 0.55 + Math.min(0.25, pChg * 0.03);
    else buyRatio = 0.45 + Math.max(-0.25, pChg * 0.03);

    buyRatio = Math.max(0.15, Math.min(0.92, buyRatio));
    const sellRatio = 1 - buyRatio;

    const buyVolume = Math.round(vol * buyRatio);
    const sellVolume = vol - buyVolume;
    const buyTurnoverCr = Number(((turnover * buyRatio) / 10000000).toFixed(2));
    const sellTurnoverCr = Number(((turnover * sellRatio) / 10000000).toFixed(2));
    const netCashFlowCr = Number((buyTurnoverCr - sellTurnoverCr).toFixed(2));
    const accumulationScore = Math.round(buyRatio * 100);

    let phase = 'Neutral Base';
    if (accumulationScore >= 75) phase = 'Heavy Smart Money Accumulation';
    else if (accumulationScore >= 60) phase = 'Moderate Institutional Buying';
    else if (accumulationScore <= 30) phase = 'Aggressive Institutional Distribution';
    else if (accumulationScore <= 45) phase = 'Moderate Seller Offloading';

    return {
      ...s,
      buyVolume,
      sellVolume,
      buyTurnoverCr,
      sellTurnoverCr,
      netCashFlowCr,
      buyDominancePct: Math.round(buyRatio * 100),
      sellDominancePct: Math.round(sellRatio * 100),
      accumulationScore,
      phase
    };
  });

  // Top Accumulated: Sorted strictly by HIGHEST BUYING TURNOVER (highest capital buying)
  const topAccumulated = [...analyzed]
    .filter(s => s.netCashFlowCr > 0 || s.buyDominancePct >= 52)
    .sort((a, b) => (b.buyTurnoverCr - a.buyTurnoverCr) || (b.netCashFlowCr - a.netCashFlowCr))
    .slice(0, 25);

  // Top Distributed: Sorted strictly by HIGHEST SELLING TURNOVER (highest capital dumping)
  const topDistributed = [...analyzed]
    .filter(s => s.netCashFlowCr < 0 || s.sellDominancePct >= 52)
    .sort((a, b) => (b.sellTurnoverCr - a.sellTurnoverCr) || (a.netCashFlowCr - b.netCashFlowCr))
    .slice(0, 25);

  return {
    topAccumulated,
    topDistributed,
    allRanked: analyzed
  };
}

/**
 * Returns comparable peer stocks within the same sector.
 */
export function getPeerStocks(currentStock, allStocks = []) {
  if (!currentStock || !allStocks || allStocks.length === 0) return [];
  const sym = currentStock.symbol || '';
  const sector = currentStock.sector || '';
  const ltp = Number(currentStock.ltp || 100);

  const sameSector = allStocks.filter(s => s && s.symbol !== sym && s.sector === sector);
  if (sameSector.length >= 3) return sameSector.slice(0, 5);
  // fallback to closest price peers
  return allStocks
    .filter(s => s && s.symbol !== sym)
    .sort((a, b) => Math.abs((a.ltp || 100) - ltp) - Math.abs((b.ltp || 100) - ltp))
    .slice(0, 5);
}

/**
 * Scans stocks based on ShareHub & StockYan scanner rules.
 */
export function runStockScanners(stocks = [], filterKey) {
  if (!stocks || stocks.length === 0) return [];
  switch (filterKey) {
    // ── Trader's Zone & Subscription Features ──
    case 'breakout':
    case 'breakout_stocks':
    case 'trendline_breakout':
      return stocks.filter(s => s.pChange >= 1.8 && (s.volumeSurgeRatio >= 1.4 || s.floatTurnoverPct >= 0.8 || s.isBreakout)).sort((a,b) => b.pChange - a.pChange).slice(0, 20);
    
    case 'volume_shockers':
      return stocks.filter(s => (s.volumeZScore >= 1.8 || s.isVolumeShocker || s.volumeSurgeRatio >= 1.8 || s.floatTurnoverPct >= 2.0)).sort((a,b) => (b.volumeZScore || b.volumeSurgeRatio || 0) - (a.volumeZScore || a.volumeSurgeRatio || 0)).slice(0, 20);

    case 'technical_ratings':
    case 'technical_rating':
      return [...stocks].sort((a, b) => (b.technicalScore || 50) - (a.technicalScore || 50)).slice(0, 20);

    case 'players_choices':
    case 'players_choice':
    case 'broker_favourites':
      return stocks.filter(s => (s.turnover >= 12000000 || s.floatTurnoverPct >= 1.2) && s.pChange > 0).sort((a,b) => (b.floatTurnoverPct || 0) - (a.floatTurnoverPct || 0)).slice(0, 20);

    case 'circuit_setup':
    case 'circuit_radar':
      return stocks.filter(s => (s.pChange >= 6.0 && s.pChange <= 9.95) || (s.pChange <= -6.0 && s.pChange >= -9.95)).sort((a,b) => Math.abs(b.pChange) - Math.abs(a.pChange)).slice(0, 20);

    case 'candlestick_patterns':
    case 'candlestick':
    case 'candlestick_pattern':
      return stocks.filter(s => s.pChange >= 1.0).slice(0, 20);

    case 'consolidating_stocks':
    case 'consolidating':
    case 'consolidating_picks':
      return stocks.filter(s => Math.abs(s.pChange) <= 0.9 && (s.high - s.low) <= (s.ltp || 1) * 0.018 || s.isSqueeze).slice(0, 20);

    case 'fresh_indicator_signals':
    case 'fresh_signals':
      return stocks.filter(s => (s.rsi <= 40 && s.pChange > 0) || (s.macd && s.macd.line > s.macd.signal && s.pChange > 0.4)).slice(0, 20);

    case 'support_and_resistance':
    case 'support_res':
    case 'support_resistance':
      return stocks.filter(s => s.low52w && (s.ltp <= s.low52w * 1.12)).slice(0, 20);

    case 'unusual_trades':
      return stocks.filter(s => s.volume >= 22000 && (s.floatTurnoverPct >= 1.2 || s.volumeSurgeRatio >= 1.6 || s.volumeZScore >= 1.8)).slice(0, 20);

    case 'relative_strength':
    case 'relative_strength_ranking':
      return [...stocks].sort((a,b) => (b.relativeStrength || 50) - (a.relativeStrength || 50)).slice(0, 20);

    // ── Benjamin Graham Valuation & Quantitative Filters ──
    case 'graham_valuation':
    case 'graham_undervalued':
    case 'undervalued_stocks':
      return stocks.filter(s => s.isUndervalued && s.marginOfSafetyPct >= 10).sort((a, b) => (b.marginOfSafetyPct || 0) - (a.marginOfSafetyPct || 0)).slice(0, 25);

    // ── Machine Learning Operational Action Zones ──
    case 'buying_zone':
    case 'buying_zone_stocks':
      return stocks.filter(s => s.zone === 'Buying Zone' || (s.actionZone && s.actionZone.zone === 'Buying Zone')).slice(0, 20);

    case 'entry_zone':
    case 'entry_zone_stocks':
      return stocks.filter(s => s.zone === 'Entry Zone' || (s.actionZone && s.actionZone.zone === 'Entry Zone')).slice(0, 20);

    case 'holding_zone':
    case 'holding_zone_stocks':
      return stocks.filter(s => s.zone === 'Holding Zone' || (s.actionZone && s.actionZone.zone === 'Holding Zone')).slice(0, 20);

    case 'exit_zone':
    case 'exit_zone_stocks':
      return stocks.filter(s => s.zone === 'Exit Zone' || (s.actionZone && s.actionZone.zone === 'Exit Zone')).slice(0, 20);

    case 'selling_zone':
    case 'selling_zone_stocks':
      return stocks.filter(s => s.zone === 'Selling Zone' || (s.actionZone && s.actionZone.zone === 'Selling Zone')).slice(0, 20);

    // ── StockYan Smart Money & Predictive Engine Screeners ──
    case 'stealth_accumulation':
    case 'slow_accumulation':
      return stocks.filter(s => s.isStealthAccumulation || (s.bcr3 && s.bcr3 >= 0.35)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);

    case 'broker_dominance':
    case 'aggressive_accumulators':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.30) || s.floatTurnoverPct >= 1.5).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);

    case 'matching_trades':
    case 'matching_buy_sell':
      return stocks.filter(s => s.volume >= 25000 && (s.floatTurnoverPct >= 1.2 || s.volumeSurgeRatio >= 1.5)).slice(0, 20);

    case 'decision_probability':
    case 'dpi_strong_buy':
      return stocks.filter(s => (s.dpi?.dpi || 50) >= 65).sort((a, b) => (b.dpi?.dpi || 50) - (a.dpi?.dpi || 50)).slice(0, 25);

    case 'dpi_strong_sell':
      return stocks.filter(s => (s.dpi?.dpi || 50) <= 35).sort((a, b) => (a.dpi?.dpi || 50) - (b.dpi?.dpi || 50)).slice(0, 25);

    case 'order_book_depth':
    case 'order_book_imbalance':
      return stocks.filter(s => (s.obir?.obir || 0) >= 0.20).sort((a, b) => (b.obir?.obir || 0) - (a.obir?.obir || 0)).slice(0, 25);

    case 'lockin_shock_risk':
    case 'ilsi_risk':
      return stocks.filter(s => (s.ilsi || 0) >= 20).sort((a, b) => (b.ilsi || 0) - (a.ilsi || 0)).slice(0, 25);

    // ── AD FREE + PREMIUM Features ──
    case 'hot_stocks':
    case 'hot_trending':
      return stocks.filter(s => s.floatTurnoverPct >= 1.5 && s.pChange >= 1.2).sort((a,b) => (b.floatTurnoverPct || 0) - (a.floatTurnoverPct || 0)).slice(0, 20);


    case 'large_cap':
      return stocks.filter(s => (s.marketCap || 0) >= 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);
    
    case 'mid_cap':
      return stocks.filter(s => (s.marketCap || 0) >= 4000 && (s.marketCap || 0) < 15000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

    case 'small_cap':
      return stocks.filter(s => (s.marketCap || 0) < 4000).sort((a,b) => (b.marketCap || 0) - (a.marketCap || 0)).slice(0, 20);

    case 'price_vs_volume':
      return stocks.filter(s => s.pChange >= 1.5 && (s.volumeSurgeRatio >= 1.2 || s.floatTurnoverPct >= 1.0)).slice(0, 20);

    case 'dividend_kings':
      return stocks.filter(s => (s.bonusShare >= 10 || s.cashDiv >= 5 || s.divYield >= 3.0)).sort((a,b) => (b.bonusShare || 0) - (a.bonusShare || 0)).slice(0, 20);

    case 'fundamentals_pro':
    case 'fundamental':
    case 'fundamental_scanner':
      return stocks.filter(s => (s.eps >= 15 && s.pe > 0 && s.pe <= 25) || (s.roe && s.roe >= 12)).sort((a,b) => (b.eps || 0) - (a.eps || 0)).slice(0, 20);


    // ── Classic & Video Scanners ──
    case 'rsi':
    case 'rsi_filter':
      return stocks.filter(s => (s.rsi && (s.rsi <= 35 || s.rsi >= 68)) || s.pChange >= 2.5).slice(0, 20);
    case 'ema':
    case 'ema_scanner':
      return stocks.filter(s => s.ltp >= (s.avg120 || s.ltp * 0.98) && s.pChange > 0.5).slice(0, 20);
    case 'bollinger':
    case 'bollinger_scanner':
      return stocks.filter(s => Math.abs(s.pChange) >= 2.0 || (s.high - s.low) / (s.ltp || 1) >= 0.035).slice(0, 20);
    case 'volume':
    case 'volume_scanner':
      return stocks.filter(s => (s.volume || 0) >= 30000).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 20);
    case 'pivot_points':
      return stocks.filter(s => s.ltp >= (s.high * 0.98)).slice(0, 20);
    case 'macd':
    case 'macd_signal':
      return stocks.filter(s => s.macd ? s.macd.line > s.macd.signal : s.pChange > 0).slice(0, 20);
    case 'ema_sma':
      return stocks.filter(s => s.pChange >= 1.0 && s.ltp > (s.avg120 || s.ltp)).slice(0, 20);
    case 'fibonacci':
    case 'fibonacci_levels':
      return stocks.filter(s => s.pChange >= 0.8 && s.high52w && s.low52w).slice(0, 20);
    case 'dow_signals':
      return stocks.filter(s => s.pChange > 0 && s.high >= s.open).slice(0, 20);
    case 'parallel_channel':
      return stocks.filter(s => s.pChange >= 0.5 && s.pChange <= 3.5).slice(0, 20);
    case 'trend_continuation':
      return stocks.filter(s => s.pChange >= 1.2 && (s.turnover || 0) > 10000000).slice(0, 20);
    case 'strong_trend':
      return stocks.filter(s => s.pChange >= 3.0 && (s.volume || 0) > 25000).slice(0, 20);
    case 'stock_cap':
    case 'stock_capitalization':
      return [...stocks].sort((a, b) => (b.marketCap || (b.ltp * 100)) - (a.marketCap || (a.ltp * 100))).slice(0, 20);
    case 'comparable':
    case 'comparable_stock':
      return stocks.slice(0, 20);
    case 'smart_money':
    case 'smart_money_scanner':
      return stocks.filter(s => (s.turnover || 0) >= 15000000 && s.pChange > 0).slice(0, 20);

    // ── Trade Lab Scanners (S_rank >= 80, RVOL >= 2.0, BBW Squeeze) ──
    case 'support_setups':
      return stocks.filter(s => (s.low52w && s.ltp <= s.low52w * 1.15) || s.zone === 'Buying Zone' || (s.rsi && s.rsi <= 42 && s.pChange >= 0)).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'next_breakouts':
      return stocks.filter(s => (s.isSqueeze || (s.bbw && s.bbw <= 0.045)) && (s.sRank >= 65 || s.pChange >= 0.5)).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'breakout_tradable':
      return stocks.filter(s => s.isHighProbabilityBreakout || (s.sRank >= 75 && s.pChange >= 2.0 && (s.volumeSurgeRatio >= 1.4 || s.volume >= 25000))).sort((a, b) => (b.sRank || 0) - (a.sRank || 0)).slice(0, 25);
    case 'consolidating_picks':
      return stocks.filter(s => (s.isSqueeze || Math.abs(s.pChange) <= 1.0) && (s.bbwPct <= 5.0 || (s.bbw && s.bbw <= 0.04))).sort((a, b) => (a.bbw || 0) - (b.bbw || 0)).slice(0, 25);
    case 'investment_picks':
      return stocks.filter(s => (s.isUndervalued && s.roe >= 12 && s.pe > 0 && s.pe <= 25) || (s.marginOfSafetyPct && s.marginOfSafetyPct >= 15)).sort((a, b) => (b.marginOfSafetyPct || 0) - (a.marginOfSafetyPct || 0)).slice(0, 25);
    case 'sip_picks':
    case 'sip_in_stocks':
      return stocks.filter(s => (s.eps && s.eps >= 15) && (s.bookValue && s.bookValue >= 140) && ((s.marginOfSafetyPct || 0) >= 0)).sort((a, b) => (b.eps || 0) - (a.eps || 0)).slice(0, 25);

    // ── Smart Money Categories ──
    case 'aggressive_accumulators':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.35) || (s.pChange >= 2.0 && (s.volumeSurgeRatio >= 1.5 || s.turnover > 15000000))).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);
    case 'distribution_leaders':
      return stocks.filter(s => s.pChange <= -1.8 && (s.turnover || 0) > 12000000).sort((a, b) => a.pChange - b.pChange).slice(0, 25);
    case 'broker_dominance':
      return stocks.filter(s => (s.bcr3 && s.bcr3 >= 0.30) || (s.volume || 0) > 35000).sort((a, b) => (b.bcr3 || 0) - (a.bcr3 || 0)).slice(0, 25);
    case 'aggressive_holdings':
      return stocks.filter(s => s.pChange > 0 && s.pe > 0 && s.pe < 28 && (s.bcr3 || 0) >= 0.25).slice(0, 25);
    case 'matching_trades':
      return stocks.filter(s => (s.volume || 0) > 30000 && (s.floatTurnoverPct >= 1.0 || s.volumeSurgeRatio >= 1.3)).slice(0, 25);
    case 'slow_accumulation':
      return stocks.filter(s => s.isStealthAccumulation || (s.pChange >= 0.1 && s.pChange <= 1.8 && (s.bcr3 || 0) >= 0.30)).sort((a, b) => (b.sai || 0) - (a.sai || 0)).slice(0, 25);


    // ── Fast Circuits & Signals ──
    case 'circuit_up':
      return stocks.filter(s => s.pChange >= 9.0).sort((a, b) => b.pChange - a.pChange);
    case 'circuit_down':
      return stocks.filter(s => s.pChange <= -9.0).sort((a, b) => a.pChange - b.pChange);
    case 'buyers_choice':
      return stocks.filter(s => s.volume > 50000 && s.pChange > 0).sort((a, b) => (b.turnover || 0) - (a.turnover || 0)).slice(0, 20);
    default:
      return stocks.slice(0, 20);
  }
}

/**
 * Curated NEPSE Mutual Funds Intelligence Data
 */
export const MUTUAL_FUNDS_DATA = [
  { symbol: "NIBLPF", name: "NIBL Pragati Fund", type: "Closed-End", nav: 11.45, ltp: 9.80, discountPct: 14.41, sizeCr: 75, topHoldings: ["NABIL", "HDL", "CIT"], maturityDate: "2027-11-20" },
  { symbol: "NICBF", name: "NIC Asia Balanced Fund", type: "Closed-End", nav: 12.10, ltp: 10.42, discountPct: 13.88, sizeCr: 125, topHoldings: ["NICA", "SHIVM", "GBIME"], maturityDate: "2029-08-15" },
  { symbol: "GIMES1", name: "Global IME Samunnat Scheme-1", type: "Closed-End", nav: 10.95, ltp: 9.60, discountPct: 12.33, sizeCr: 100, topHoldings: ["GBIME", "CHCL", "EBL"], maturityDate: "2028-03-10" },
  { symbol: "SIGS2", name: "Siddhartha Investment Growth Scheme-2", type: "Closed-End", nav: 11.85, ltp: 10.25, discountPct: 13.50, sizeCr: 120, topHoldings: ["SCB", "NTC", "BPCL"], maturityDate: "2029-04-25" },
  { symbol: "CMF2", name: "Citizens Mutual Fund-2", type: "Closed-End", nav: 11.02, ltp: 9.55, discountPct: 13.34, sizeCr: 56, topHoldings: ["CZBIL", "RHPL", "SANIMA"], maturityDate: "2028-06-18" },
  { symbol: "NIBLGF", name: "NIBL Growth Fund", type: "Closed-End", nav: 12.40, ltp: 10.80, discountPct: 12.90, sizeCr: 160, topHoldings: ["NABIL", "HDL", "UNL"], maturityDate: "2032-12-14" },
  { symbol: "SFMF", name: "Sanima Flexi Balanced Fund", type: "Open-End", nav: 11.20, ltp: 11.20, discountPct: 0.00, sizeCr: 80, topHoldings: ["SANIMA", "UPPER", "NLIC"], maturityDate: "Open-Ended" },
];

/**
 * Top NEPSE Dividend Kings History
 */
export const DIVIDEND_KINGS_DATA = [
  { symbol: "SCB", name: "Standard Chartered Bank Nepal", sector: "Commercial Banks", bonusShare: 0, cashDiv: 25.5, divYield: 4.88, yearsConsistent: 15, avg5YrPayout: "92%" },
  { symbol: "HDL", name: "Himalayan Distillery Limited", sector: "Manufacturing", bonusShare: 15, cashDiv: 10.0, divYield: 3.20, yearsConsistent: 12, avg5YrPayout: "78%" },
  { symbol: "NABIL", name: "Nabil Bank Limited", sector: "Commercial Banks", bonusShare: 10, cashDiv: 5.0, divYield: 3.12, yearsConsistent: 20, avg5YrPayout: "85%" },
  { symbol: "UNL", name: "Unilever Nepal Limited", sector: "Manufacturing", bonusShare: 0, cashDiv: 1580.0, divYield: 3.45, yearsConsistent: 25, avg5YrPayout: "95%" },
  { symbol: "NTC", name: "Nepal Doorsanchar Company (NTC)", sector: "Others", bonusShare: 0, cashDiv: 30.0, divYield: 5.42, yearsConsistent: 14, avg5YrPayout: "80%" },
  { symbol: "CIT", name: "Citizen Investment Trust", sector: "Investment", bonusShare: 5, cashDiv: 5.0, divYield: 2.10, yearsConsistent: 10, avg5YrPayout: "65%" },
  { symbol: "CBBL", name: "Chhimek Laghubitta Bittiya Sanstha", sector: "Microfinance", bonusShare: 20, cashDiv: 5.0, divYield: 4.60, yearsConsistent: 11, avg5YrPayout: "72%" },
  { symbol: "EBL", name: "Everest Bank Limited", sector: "Commercial Banks", bonusShare: 0, cashDiv: 10.5, divYield: 3.80, yearsConsistent: 18, avg5YrPayout: "70%" },
];

/**
 * Generates Zero-Sum Floorsheet Bilateral Broker Trade Matching
 */
export function generateZeroSumFloorsheet(stock, count = 15) {
  const ltp = stock.ltp || 100;
  let seed = 0;
  for (let i = 0; i < (stock.symbol || '').length; i++) seed += stock.symbol.charCodeAt(i);
  seed = Math.floor((seed + ltp) * 10);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const rows = [];
  for (let i = 0; i < count; i++) {
    const buyerBroker = NEPSE_BROKERS[Math.floor(rand() * 5)].no; // Concentrated top buyers
    let sellerBroker = NEPSE_BROKERS[Math.floor(5 + rand() * (NEPSE_BROKERS.length - 5))].no; // Dispersed sellers
    if (sellerBroker === buyerBroker) sellerBroker = 28;

    const rate = Number((ltp + (rand() * 0.02 * ltp - 0.01 * ltp)).toFixed(1));
    const qty = Math.floor((20 + rand() * 80) * 10);
    const amount = Number((rate * qty).toFixed(2));
    const isInstitutionBuy = [58, 45, 34, 49, 28].includes(buyerBroker);

    rows.push({
      id: count - i,
      buyer: buyerBroker,
      seller: sellerBroker,
      qty,
      rate,
      amount,
      isInstitutionBuy,
      time: `11:${String(15 + i * 8).padStart(2, '0')}:24`
    });
  }

  return rows;
}

/**
 * Curated Lock-In Period Expiration Data for Promoters, Local Residents, and Mutual Funds
 */
export const LOCK_IN_DATA = [
  {
    id: 1,
    symbol: "HATHY",
    name: "Hathway Investment Nepal Ltd.",
    category: "Promoter & Local",
    unlockDate: "2026-09-15",
    daysLeft: 20,
    units: 14625000,
    pctOfTotal: "62.5%",
    currentPrice: 1045,
    impact: "High",
    remarks: "3-year lock-in period for promoter shares ending."
  },
  {
    id: 2,
    symbol: "SONA",
    name: "Sonapur Minerals and Oil Ltd.",
    category: "Promoter & Mutual Fund",
    unlockDate: "2026-10-02",
    daysLeft: 37,
    units: 12300000,
    pctOfTotal: "40.0%",
    currentPrice: 480,
    impact: "High",
    remarks: "Lock-in period for anchor investors & promoters expiring."
  },
  {
    id: 3,
    symbol: "SARBTM",
    name: "Sarbottam Cement Limited",
    category: "Book Building Local & Mutual Fund",
    unlockDate: "2026-11-12",
    daysLeft: 78,
    units: 9600000,
    pctOfTotal: "35.2%",
    currentPrice: 790,
    impact: "Medium",
    remarks: "Local affected shares eligible for secondary trading."
  },
  {
    id: 4,
    symbol: "MKHL",
    name: "Mai Khola Hydropower Limited",
    category: "Local Residents",
    unlockDate: "2026-12-05",
    daysLeft: 101,
    units: 3921570,
    pctOfTotal: "30.0%",
    currentPrice: 320,
    impact: "Low",
    remarks: "Project-affected local shares unlocking."
  },
  {
    id: 5,
    symbol: "CIT",
    name: "Citizen Investment Trust",
    category: "Right Shares Lock-in",
    unlockDate: "2027-01-18",
    daysLeft: 145,
    units: 5400000,
    pctOfTotal: "12.0%",
    currentPrice: 1850,
    impact: "Low",
    remarks: "Institutional rights quota lock-in expiration."
  },
  {
    id: 6,
    symbol: "UPPER",
    name: "Upper Tamakoshi Hydropower",
    category: "Rights & Employee Quota",
    unlockDate: "2027-03-20",
    daysLeft: 206,
    units: 24500000,
    pctOfTotal: "22.5%",
    currentPrice: 190,
    impact: "High",
    remarks: "Employee & lender lock-in completion."
  }
];

/**
 * Sector-Wise Accumulation and Distribution Institutional Flow
 */
export const SECTOR_AD_DATA = [
  { sector: "Commercial Banks", accumulationCr: 124.5, distributionCr: 88.2, netCr: 36.3, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Hydropower", accumulationCr: 215.8, distributionCr: 242.1, netCr: -26.3, status: "Distribution", sentiment: "Bearish" },
  { sector: "Microfinance", accumulationCr: 94.2, distributionCr: 65.4, netCr: 28.8, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Life Insurance", accumulationCr: 68.4, distributionCr: 52.1, netCr: 16.3, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Non Life Insurance", accumulationCr: 54.2, distributionCr: 41.6, netCr: 12.6, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Development Banks", accumulationCr: 82.1, distributionCr: 91.4, netCr: -9.3, status: "Distribution", sentiment: "Neutral" },
  { sector: "Finance", accumulationCr: 112.5, distributionCr: 135.8, netCr: -23.3, status: "Distribution", sentiment: "Bearish" },
  { sector: "Hotels And Tourism", accumulationCr: 38.6, distributionCr: 32.1, netCr: 6.5, status: "Accumulation", sentiment: "Neutral" },
  { sector: "Manufacturing", accumulationCr: 45.2, distributionCr: 38.9, netCr: 6.3, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Investment", accumulationCr: 28.4, distributionCr: 22.0, netCr: 6.4, status: "Accumulation", sentiment: "Bullish" },
  { sector: "Others", accumulationCr: 62.1, distributionCr: 49.3, netCr: 12.8, status: "Accumulation", sentiment: "Bullish" }
];

/**
 * SEBON Official IPO Pipeline Data
 */
export const SEBON_IPO_PIPELINE = [
  {
    id: 1,
    company: "Reliance Spinning Mills Limited",
    sector: "Manufacturing",
    units: 1155960,
    amountCr: 95.2,
    issueManager: "Global IME Capital Ltd.",
    status: "Approved",
    stage: "SEBON Approved (Issuance Pending)",
    method: "Book Building"
  },
  {
    id: 2,
    company: "Trade Tower Limited",
    sector: "Others",
    units: 1169690,
    amountCr: 11.69,
    issueManager: "Laxmi Capital Market Ltd.",
    status: "Under Review",
    stage: "Review by SEBON Committee",
    method: "Fixed Price (Rs. 100)"
  },
  {
    id: 3,
    company: "Bhatbhateni Supermarket and Departmental Store",
    sector: "Trading",
    units: 15000000,
    amountCr: 150.0,
    issueManager: "Nabil Investment Banking Ltd.",
    status: "Preliminary",
    stage: "Application Submitted to Board",
    method: "Premium Issue"
  },
  {
    id: 4,
    company: "Chandra Giri Hills Limited (FPO)",
    sector: "Hotels And Tourism",
    units: 825000,
    amountCr: 8.25,
    issueManager: "NIC Asia Capital Ltd.",
    status: "Under Review",
    stage: "Documentation Verification",
    method: "FPO"
  },
  {
    id: 5,
    company: "Sanima Middle Tamor Hydropower Ltd.",
    sector: "Hydropower",
    units: 3332500,
    amountCr: 33.32,
    issueManager: "Sanima Capital Ltd.",
    status: "Approved",
    stage: "Issue Date to be Announced",
    method: "Fixed Price (Rs. 100)"
  }
];

/**
 * Historical 10-Year Monthly NEPSE Seasonality Matrix (% Returns)
 */
export const NEPSE_SEASONALITY = [
  { month: "Baisakh (Apr-May)", avgReturn: "+4.2%", winRate: "70%", trend: "Bullish", desc: "Fiscal year kick-off rally, new capital deployment." },
  { month: "Jestha (May-Jun)", avgReturn: "+2.8%", winRate: "60%", trend: "Bullish", desc: "Pre-budget speculation & commercial bank positioning." },
  { month: "Ashadh (Jun-Jul)", avgReturn: "-3.5%", winRate: "30%", trend: "Bearish", desc: "Tax clearance & fiscal year-end profit booking." },
  { month: "Shrawan (Jul-Aug)", avgReturn: "+7.8%", winRate: "80%", trend: "Strong Bull", desc: "Monetary Policy release by NRB, liquidity expansion." },
  { month: "Bhadra (Aug-Sep)", avgReturn: "+3.4%", winRate: "60%", trend: "Bullish", desc: "Post-monetary policy momentum & dividend speculation." },
  { month: "Ashwin (Sep-Oct)", avgReturn: "-1.8%", winRate: "40%", trend: "Neutral", desc: "Dashain festival withdrawal & holiday volume lull." },
  { month: "Kartik (Oct-Nov)", avgReturn: "+1.5%", winRate: "50%", trend: "Neutral", desc: "Post-Tihar festival resumption & Q1 earnings season." },
  { month: "Mangsir (Nov-Dec)", avgReturn: "+4.6%", winRate: "70%", trend: "Bullish", desc: "AGM season, bonus share book closures & dividends." },
  { month: "Poush (Dec-Jan)", avgReturn: "-2.4%", winRate: "30%", trend: "Bearish", desc: "Mid-year interest payment obligations to banks." },
  { month: "Magh (Jan-Feb)", avgReturn: "+3.1%", winRate: "60%", trend: "Bullish", desc: "Mid-term monetary review & Q2 corporate results." },
  { month: "Falgun (Feb-Mar)", avgReturn: "+1.2%", winRate: "50%", trend: "Neutral", desc: "Spring range-bound market behavior." },
  { month: "Chaitra (Mar-Apr)", avgReturn: "-1.9%", winRate: "40%", trend: "Bearish", desc: "Quarterly tax advance installments & credit squeeze." }
];

/**
 * Curated Thematic Stock Baskets for SIP in Stocks
 */
export const SIP_BASKETS = [
  {
    id: "dividend_kings",
    name: "Dividend Champions Basket",
    cagr: "18.4%",
    risk: "Low Risk",
    minMonthly: 5000,
    desc: "Blue-chip leaders with consistent >15% cash/bonus payout track record over the last 7 years.",
    stocks: [
      { symbol: "NABIL", weight: "30%", name: "Nabil Bank Ltd." },
      { symbol: "SCB", weight: "25%", name: "Standard Chartered Bank" },
      { symbol: "NTC", weight: "25%", name: "Nepal Telecom" },
      { symbol: "HDL", weight: "20%", name: "Himalayan Distillery" }
    ]
  },
  {
    id: "banking_power",
    name: "Banking Titans Basket",
    cagr: "15.8%",
    risk: "Low-Medium",
    minMonthly: 3000,
    desc: "Top capitalized commercial banks with high tier-1 capital and strong loan book resilience.",
    stocks: [
      { symbol: "EBL", weight: "35%", name: "Everest Bank Ltd." },
      { symbol: "NABIL", weight: "35%", name: "Nabil Bank Ltd." },
      { symbol: "GBIME", weight: "30%", name: "Global IME Bank Ltd." }
    ]
  },
  {
    id: "hydro_compounders",
    name: "Hydropower Compounders",
    cagr: "22.5%",
    risk: "Medium-High",
    minMonthly: 4000,
    desc: "Operational run-of-river projects with low debt-to-equity and power purchase agreements (PPA).",
    stocks: [
      { symbol: "CHCL", weight: "40%", name: "Chilime Hydropower Ltd." },
      { symbol: "BPCL", weight: "35%", name: "Butwal Power Company" },
      { symbol: "AHPC", weight: "25%", name: "Arun Valley Hydropower" }
    ]
  },
  {
    id: "defensive_growth",
    name: "Defensive Multi-Cap Basket",
    cagr: "19.2%",
    risk: "Medium",
    minMonthly: 5000,
    desc: "Balanced portfolio across Insurance, Microfinance, Manufacturing and Telecom.",
    stocks: [
      { symbol: "NLIC", weight: "25%", name: "Nepal Life Insurance" },
      { symbol: "CBBL", weight: "25%", name: "Chhimek Laghubitta" },
      { symbol: "CIT", weight: "25%", name: "Citizen Investment Trust" },
      { symbol: "NTC", weight: "25%", name: "Nepal Telecom" }
    ]
  }
];

/**
 * Curated live news and announcements from Nepalese financial portals.
 */
export function getMarketNews() {
  return [
    {
      id: 1,
      title: "बजार घट्ने क्रम नरोकिँदा सडकदेखि सदनसम्म आक्रोश, मौद्रिक नीतिको समीक्षा पर्खिँदै लगानीकर्ता",
      source: "Mero Lagani",
      time: "25 mins ago",
      category: "Market News",
      likes: 54,
      comments: 18,
      sentiment: "neutral"
    },
    {
      id: 2,
      title: "नेपाल राष्ट्र बैंकद्वारा ब्याजदर करिडोरको पुनरावलोकन, तरलता सहज बनाउने नीति जारी",
      source: "ShareSansar",
      time: "1 hour ago",
      category: "Economy",
      likes: 82,
      comments: 24,
      sentiment: "bullish"
    },
    {
      id: 3,
      title: "जलविद्युत समूहमा खरिद चाप बढ्यो, ५ कम्पनीको सेयर मूल्यमा सकारात्मक सर्किट",
      source: "Bizmandu",
      time: "2 hours ago",
      category: "Sector Focus",
      likes: 41,
      comments: 9,
      sentiment: "bullish"
    },
    {
      id: 4,
      title: "नेप्से परिसूचकमा सामान्य उतारचढाव, कुल कारोबार रकम ४ अर्ब १० करोड नाघ्यो",
      source: "Arthakendra",
      time: "3 hours ago",
      category: "NEPSE Update",
      likes: 67,
      comments: 14,
      sentiment: "neutral"
    }
  ];
}

