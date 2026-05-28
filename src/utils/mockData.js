/**
 * Mock Data Engine for Nepal Stock Exchange (NEPSE)
 * Contains 60+ real NEPSE company tickers with fundamentals
 */

export const SECTORS = [
  "Banking",
  "Development Bank",
  "Finance",
  "Microfinance",
  "Life Insurance",
  "Non-Life Insurance",
  "Hydropower",
  "Manufacturing",
  "Hotels",
  "Trading",
  "Investment",
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
  { symbol: "SHINE",  name: "Shine Resunga Development Bank",  sector: "Development Bank", basePrice: 165,   eps: 9.2,  bookValue: 110,  divYield: 2.0,  roe: 8.2,  listedShares: 30.00,  paidUpCapital: 3000,  bonusShare: 10, cashDiv: 0,  avg120: 163 },
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
  { id: 11, name: "Snow Rivers Ltd. (For Foreign Employment)",            type: "IPO", status: "Alloted", units: 10, shareId: "111" },
  { id: 10, name: "Sopan Pharmaceuticals Limited (For Foreign Employment)", type: "IPO", status: "Alloted", units: 10, shareId: "110" },
  { id: 9,  name: "Beni Hydropower Project Limited (For Foreign Employment)", type: "IPO", status: "Alloted", units: 10, shareId: "109" },
  { id: 8,  name: "Appolo Hydropower Limited (For Foreign Employment)",   type: "IPO", status: "Alloted", units: 10, shareId: "108" },
  { id: 7,  name: "Shikhar Power Development Limited (General Public)",   type: "IPO", status: "Alloted", units: 10, shareId: "107" },
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

/**
 * Initialize stock database with baseline stats and technical indicators.
 */
export function initializeMarket() {
  return INITIAL_COMPANIES.map(company => {
    const ltp = company.basePrice;
    const pe = company.eps > 0 ? Number((ltp / company.eps).toFixed(2)) : 0;
    const pb = company.bookValue > 0 ? Number((ltp / company.bookValue).toFixed(2)) : 0;
    const marketCap = Number((ltp * company.listedShares).toFixed(2)); // in millions

    // Generate technical indicators
    const rsi = 30 + Math.random() * 40;
    const ema20 = ltp * (0.98 + Math.random() * 0.04);
    const ema50 = ltp * (0.97 + Math.random() * 0.06);
    const ema200 = ltp * (0.92 + Math.random() * 0.1);
    const macdLine = (Math.random() - 0.5) * (ltp * 0.02);
    const macdSignal = macdLine * 0.8;
    const macdHist = macdLine - macdSignal;

    const high52w = Number((ltp * (1.25 + Math.random() * 0.15)).toFixed(2));
    const low52w  = Number((ltp * (0.72 + Math.random() * 0.15)).toFixed(2));

    return {
      ...company,
      ltp,
      prevClose: ltp,
      change: 0,
      pChange: 0,
      high: ltp,
      low: ltp,
      open: ltp,
      volume: Math.floor(1000 + Math.random() * 50000),
      turnover: 0,
      pe,
      pb,
      marketCap,
      rsi: Number(rsi.toFixed(2)),
      ema20: Number(ema20.toFixed(2)),
      ema50: Number(ema50.toFixed(2)),
      ema200: Number(ema200.toFixed(2)),
      macd: { line: Number(macdLine.toFixed(4)), signal: Number(macdSignal.toFixed(4)), hist: Number(macdHist.toFixed(4)) },
      high52w,
      low52w,
    };
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
 * Generates historical OHLCV data for charting.
 */
export function generateHistory(symbol, basePrice, days = 30) {
  const history = [];
  let price = basePrice;
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date    = new Date(now.getTime() - i * 86400000);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const change  = price * (Math.random() * 0.06 - 0.03);
    const close   = Number(Math.max(10, price + change).toFixed(2));
    const open    = price;
    const high    = Number((Math.max(open, close) * (1 + Math.random() * 0.02)).toFixed(2));
    const low     = Number((Math.min(open, close) * (1 - Math.random() * 0.02)).toFixed(2));
    history.push({ date: dateStr, dateObj: date, open, high, low, close, volume: Math.floor(5000 + Math.random() * 40000) });
    price = close;
  }
  return history;
}

/**
 * Generates intraday hourly/15m OHLCV data for charting.
 * NEPSE session is 11:00 to 15:00.
 */
export function generateHourlyHistory(symbol, basePrice, resolution = '15m') {
  const history = [];
  const intervals = resolution === '15m' ? 16 : 4;
  const stepMs = resolution === '15m' ? 15 * 60000 : 60 * 60000;
  
  let price = basePrice;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  
  // Create a simple deterministic random sequence based on symbol
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  const random = () => {
    hash = Math.sin(hash) * 10000;
    return hash - Math.floor(hash);
  };
  
  const startTime = new Date(year, month, date, 11, 0, 0).getTime();
  
  for (let i = 0; i < intervals; i++) {
    const currentTime = new Date(startTime + i * stepMs);
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    const maxChange = price * 0.015; // 1.5% max swing per interval
    const change = (random() * maxChange * 2) - maxChange;
    
    const close = Number(Math.max(10, price + change).toFixed(2));
    const open = price;
    const high = Number((Math.max(open, close) * (1 + random() * 0.005)).toFixed(2));
    const low = Number((Math.min(open, close) * (1 - random() * 0.005)).toFixed(2));
    
    history.push({
      time: timeStr,
      timestamp: currentTime.getTime(),
      open,
      high,
      low,
      close,
      volume: Math.floor(1000 + random() * 5000)
    });
    
    price = close;
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
export function calculatePivotPoints(high, low, close) {
  const P  = Number(((high + low + close) / 3).toFixed(2));
  const R1 = Number((2 * P - low).toFixed(2));
  const S1 = Number((2 * P - high).toFixed(2));
  const R2 = Number((P + (high - low)).toFixed(2));
  const S2 = Number((P - (high - low)).toFixed(2));
  const R3 = Number((high + 2 * (P - low)).toFixed(2));
  const S3 = Number((low - 2 * (high - P)).toFixed(2));
  return { P, R1, R2, R3, S1, S2, S3 };
}

/**
 * Calculates Fibonacci Retracement levels from 52-week High/Low.
 */
export function calculateFibonacci(high52w, low52w) {
  const diff = high52w - low52w;
  return {
    level_0:    Number(high52w.toFixed(2)),
    level_236:  Number((high52w - diff * 0.236).toFixed(2)),
    level_382:  Number((high52w - diff * 0.382).toFixed(2)),
    level_500:  Number((high52w - diff * 0.500).toFixed(2)),
    level_618:  Number((high52w - diff * 0.618).toFixed(2)),
    level_786:  Number((high52w - diff * 0.786).toFixed(2)),
    level_1000: Number(low52w.toFixed(2)),
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
      const issue = MOCK_IPOS.find(i => i.shareId === companyShareId);
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
