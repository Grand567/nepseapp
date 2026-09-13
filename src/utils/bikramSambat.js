/**
 * Bikram Sambat (BS) Nepali Calendar Engine & NEPSE Holiday Engine
 * Accurate date conversion from Gregorian (AD) to Bikram Sambat (BS) for 2000 BS – 2090 BS.
 * Includes official Nepal Public Holidays and NEPSE close days.
 */

export const NEPALI_MONTH_NAMES_NP = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन',
  'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुण', 'चैत्र'
];

export const NEPALI_MONTH_NAMES_EN = [
  'Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

export const NEPALI_DAYS_NP = [
  'आइतबार', 'सोमबार', 'मंगलबार', 'बुधबार', 'बिहिबार', 'शुक्रबार', 'शनिबार'
];

export const NEPALI_DAYS_EN = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export const NEPALI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toNepaliDigits(num) {
  if (num === null || num === undefined) return '';
  return String(num).split('').map(char => {
    const digit = parseInt(char, 10);
    return isNaN(digit) ? char : NEPALI_DIGITS[digit];
  }).join('');
}

// Month lengths for years 2000 BS to 2090 BS (91 years)
export const BS_MONTH_DAYS = [
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2000
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2001
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2002
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2003
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2004
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2005
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2006
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2007
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2008
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2009
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2010
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2011
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2012
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2013
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2014
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2015
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2016
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2017
  [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2018
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2019
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2020
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2021
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2022
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2023
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2024
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2025
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2026
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2027
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2028
  [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2029
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2030
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2031
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2032
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2033
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2034
  [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2035
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2036
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2037
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2038
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2039
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2040
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2041
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2042
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2043
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2044
  [31, 32, 31, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2045
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2046
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2047
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2048
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2049
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2050
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2051
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2052
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2053
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2054
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2055
  [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30], // 2056
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2057
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2058
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2059
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2060
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2061
  [30, 32, 31, 32, 31, 31, 29, 30, 30, 29, 29, 31], // 2062
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2063
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2064
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2065
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2066
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2067
  [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], // 2068
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2069
  [31, 31, 31, 32, 31, 31, 29, 30, 30, 29, 30, 30], // 2070
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2071
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2072
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2073
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2074
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2075
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2076
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2077
  [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], // 2078
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2079
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], // 2080
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2081
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2082
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2083
  [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31], // 2084
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], // 2085
  [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], // 2086
  [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30], // 2087
  [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30], // 2088
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30], // 2089
  [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30]  // 2090
];

// Precompute cumulative days mapping
const YEAR_DAYS_MAP = [];
const MONTH_DAYS_MAP = [];
let _totalDaysPassed = 0;

for (let y = 0; y < BS_MONTH_DAYS.length; y++) {
  let daysInYear = 0;
  const mArr = [];
  for (let m = 0; m < 12; m++) {
    const md = BS_MONTH_DAYS[y][m];
    mArr.push({ days: md, passed: daysInYear });
    daysInYear += md;
  }
  YEAR_DAYS_MAP.push({ days: daysInYear, passed: _totalDaysPassed });
  MONTH_DAYS_MAP.push(mArr);
  _totalDaysPassed += daysInYear;
}

/**
 * Convert Gregorian (AD) Date object into Bikram Sambat (BS) date
 * @param {Date|string|number} date 
 * @returns {{ year: number, month: number, day: number, dayOfWeek: number }}
 */
export function adToBs(date = new Date()) {
  const d = new Date(date);
  
  // Calculate NPT date (UTC + 5:45)
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const nptTime = new Date(utc + (5.75 * 60 * 60000));
  
  const epoch = Date.UTC(1943, 3, 13); // 1943-04-13 AD = 2000-01-01 BS
  const target = Date.UTC(nptTime.getFullYear(), nptTime.getMonth(), nptTime.getDate());
  const diffDays = Math.round((target - epoch) / 86400000);

  if (diffDays < 1 || diffDays > _totalDaysPassed) {
    return { year: 2083, month: 1, day: 1, dayOfWeek: nptTime.getDay() };
  }

  let yearIdx = -1;
  for (let y = 0; y < YEAR_DAYS_MAP.length; y++) {
    if (diffDays > YEAR_DAYS_MAP[y].passed && diffDays <= YEAR_DAYS_MAP[y].passed + YEAR_DAYS_MAP[y].days) {
      yearIdx = y;
      break;
    }
  }

  if (yearIdx === -1) {
    return { year: 2083, month: 1, day: 1, dayOfWeek: nptTime.getDay() };
  }

  const monthRemainder = diffDays - YEAR_DAYS_MAP[yearIdx].passed;
  let monthIdx = -1;
  for (let m = 0; m < 12; m++) {
    const entry = MONTH_DAYS_MAP[yearIdx][m];
    if (monthRemainder > entry.passed && monthRemainder <= entry.passed + entry.days) {
      monthIdx = m;
      break;
    }
  }

  if (monthIdx === -1) {
    return { year: 2000 + yearIdx, month: 1, day: 1, dayOfWeek: nptTime.getDay() };
  }

  const day = monthRemainder - MONTH_DAYS_MAP[yearIdx][monthIdx].passed;
  return {
    year: 2000 + yearIdx,
    month: monthIdx + 1,
    day,
    dayOfWeek: nptTime.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  };
}

/**
 * Official Bikram Sambat Annual Public Holidays Database
 * Key format: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
 */
export const BS_PUBLIC_HOLIDAYS = {
  // ── Fixed Solar / National Calendar Holidays (Recurring every BS Year) ──
  // Month 1 (Baisakh):
  '01-01': { np: 'नयाँ वर्ष (नेपाली नयाँ वर्ष)', en: 'Nepali New Year' },
  '01-18': { np: 'अन्तर्राष्ट्रिय मजदुर दिवस', en: 'International Labour Day' },
  // Month 2 (Jestha):
  '02-15': { np: 'गणतन्त्र दिवस', en: 'Republic Day (Ganatantra Diwas)' },
  // Month 6 (Ashwin):
  '06-03': { np: 'राष्ट्रिय संविधान दिवस', en: 'National Constitution Day' },
  // Month 9 (Poush):
  '09-10': { np: 'क्रिसमस डे', en: 'Christmas Day' },
  '09-15': { np: 'तमु ल्होसार', en: 'Tamu Lhosar' },
  '09-27': { np: 'पृथ्वी जयन्ती / राष्ट्रिय एकता दिवस', en: 'Prithvi Jayanti / National Unity Day' },
  // Month 10 (Magh):
  '10-01': { np: 'माघे संक्रान्ति', en: 'Maghe Sankranti' },
  '10-16': { np: 'शहिद दिवस', en: "Martyr's Day (Shahid Diwas)" },
  // Month 11 (Falgun):
  '11-07': { np: 'राष्ट्रिय प्रजातन्त्र दिवस', en: 'National Democracy Day' },
  '11-24': { np: 'अन्तर्राष्ट्रिय महिला दिवस', en: "International Women's Day" },

  // ── Year 2081 BS Lunar & Festival Holidays ──
  '2081-02-10': { np: 'बुद्ध जयन्ती / उभौली', en: 'Buddha Jayanti / Ubhauli' },
  '2081-05-03': { np: 'जनै पूर्णिमा / रक्षाबन्धन', en: 'Janai Purnima / Raksha Bandhan' },
  '2081-05-04': { np: 'गाईजात्रा', en: 'Gai Jatra' },
  '2081-05-10': { np: 'श्रीकृष्ण जन्माष्टमी', en: 'Krishna Janmashtami' },
  '2081-05-21': { np: 'हरितालिका तीज', en: 'Haritalika Teej' },
  '2081-05-23': { np: 'ऋषि पञ्चमी', en: 'Rishi Panchami' },
  '2081-06-01': { np: 'इन्द्रजात्रा', en: 'Indra Jatra' },
  '2081-06-17': { np: 'घटस्थापना', en: 'Ghatasthapana' },
  '2081-06-24': { np: 'दशैं (फूलपाती)', en: 'Dashain (Phulpati)' },
  '2081-06-25': { np: 'दशैं (महाअष्टमी)', en: 'Dashain (Maha Ashtami)' },
  '2081-06-26': { np: 'दशैं (महानवमी)', en: 'Dashain (Maha Navami)' },
  '2081-06-27': { np: 'दशैं (विजया दशमी)', en: 'Dashain (Vijaya Dashami)' },
  '2081-06-28': { np: 'दशैं (एकादशी)', en: 'Dashain (Papankusha Ekadashi)' },
  '2081-06-29': { np: 'दशैं (कोजाग्रत पूर्णिमा)', en: 'Dashain (Kojagrat Purnima)' },
  '2081-07-15': { np: 'तिहार (लक्ष्मी पूजा)', en: 'Tihar (Laxmi Puja)' },
  '2081-07-16': { np: 'तिहार (गोवर्धन पूजा / म्ह पूजा)', en: 'Tihar (Gobardhan Puja / Mha Puja)' },
  '2081-07-17': { np: 'तिहार (भाइटीका)', en: 'Tihar (Bhai Tika)' },
  '2081-07-22': { np: 'छठ पर्व', en: 'Chhath Parva' },
  '2081-10-17': { np: 'सोनाम ल्होसार', en: 'Sonam Lhosar' },
  '2081-11-14': { np: 'महाशिवरात्रि', en: 'Maha Shivaratri' },
  '2081-11-17': { np: 'ग्याल्पो ल्होसार', en: 'Gyalpo Lhosar' },
  '2081-11-29': { np: 'फागु पूर्णिमा (होली पहाड)', en: 'Fagu Purnima (Holi - Hilly)' },
  '2081-12-01': { np: 'होली (तराई)', en: 'Holi (Terai)' },
  '2081-12-16': { np: 'घोडे जात्रा', en: 'Ghode Jatra' },

  // ── Year 2082 BS Lunar & Festival Holidays ──
  '2082-01-29': { np: 'बुद्ध जयन्ती / उभौली', en: 'Buddha Jayanti / Ubhauli' },
  '2082-04-24': { np: 'जनै पूर्णिमा / रक्षाबन्धन', en: 'Janai Purnima / Raksha Bandhan' },
  '2082-04-25': { np: 'गाईजात्रा', en: 'Gai Jatra' },
  '2082-04-31': { np: 'श्रीकृष्ण जन्माष्टमी', en: 'Krishna Janmashtami' },
  '2082-05-11': { np: 'हरितालिका तीज', en: 'Haritalika Teej' },
  '2082-05-21': { np: 'इन्द्रजात्रा', en: 'Indra Jatra' },
  '2082-06-06': { np: 'घटस्थापना', en: 'Ghatasthapana' },
  '2082-06-13': { np: 'दशैं (फूलपाती)', en: 'Dashain (Phulpati)' },
  '2082-06-14': { np: 'दशैं (महाअष्टमी)', en: 'Dashain (Maha Ashtami)' },
  '2082-06-15': { np: 'दशैं (महानवमी)', en: 'Dashain (Maha Navami)' },
  '2082-06-16': { np: 'दशैं (विजया दशमी)', en: 'Dashain (Vijaya Dashami)' },
  '2082-06-17': { np: 'दशैं (एकादशी)', en: 'Dashain (Ekadashi)' },
  '2082-07-03': { np: 'तिहार (लक्ष्मी पूजा)', en: 'Tihar (Laxmi Puja)' },
  '2082-07-04': { np: 'तिहार (गोवर्धन पूजा)', en: 'Tihar (Gobardhan Puja)' },
  '2082-07-05': { np: 'तिहार (भाइटीका)', en: 'Tihar (Bhai Tika)' },
  '2082-07-10': { np: 'छठ पर्व', en: 'Chhath Parva' },
  '2082-11-14': { np: 'महाशिवरात्रि', en: 'Maha Shivaratri' },
  '2082-11-29': { np: 'फागु पूर्णिमा (होली)', en: 'Fagu Purnima (Holi)' },
  '2082-12-01': { np: 'होली (तराई)', en: 'Holi (Terai)' },
  '2082-12-16': { np: 'घोडे जात्रा', en: 'Ghode Jatra' },

  // ── Year 2083 BS Lunar & Festival Holidays (Current Year) ──
  '2083-01-18': { np: 'बुद्ध जयन्ती / मजदुर दिवस', en: 'Buddha Jayanti / Labour Day' },
  '2083-05-11': { np: 'जनै पूर्णिमा / रक्षाबन्धन', en: 'Janai Purnima / Raksha Bandhan' },
  '2083-05-12': { np: 'गाईजात्रा', en: 'Gai Jatra' },
  '2083-05-19': { np: 'श्रीकृष्ण जन्माष्टमी', en: 'Krishna Janmashtami' },
  '2083-05-29': { np: 'हरितालिका तीज', en: 'Haritalika Teej' },
  '2083-06-09': { np: 'इन्द्रजात्रा', en: 'Indra Jatra' },
  '2083-06-24': { np: 'घटस्थापना', en: 'Ghatasthapana' },
  '2083-07-01': { np: 'दशैं (फूलपाती)', en: 'Dashain (Phulpati)' },
  '2083-07-02': { np: 'दशैं (महाअष्टमी)', en: 'Dashain (Maha Ashtami)' },
  '2083-07-03': { np: 'दशैं (महानवमी)', en: 'Dashain (Maha Navami)' },
  '2083-07-04': { np: 'दशैं (विजया दशमी)', en: 'Dashain (Vijaya Dashami)' },
  '2083-07-05': { np: 'दशैं (एकादशी)', en: 'Dashain (Ekadashi)' },
  '2083-07-22': { np: 'तिहार (लक्ष्मी पूजा)', en: 'Tihar (Laxmi Puja)' },
  '2083-07-23': { np: 'तिहार (गोवर्धन पूजा)', en: 'Tihar (Gobardhan Puja)' },
  '2083-07-24': { np: 'तिहार (भाइटीका)', en: 'Tihar (Bhai Tika)' },
  '2083-07-29': { np: 'छठ पर्व', en: 'Chhath Parva' },
  '2083-11-03': { np: 'महाशिवरात्रि', en: 'Maha Shivaratri' },
  '2083-11-05': { np: 'सोनाम ल्होसार', en: 'Sonam Lhosar' },
  '2083-11-19': { np: 'फागु पूर्णिमा (होली पहाड)', en: 'Fagu Purnima (Holi - Hilly)' },
  '2083-11-20': { np: 'होली (तराई)', en: 'Holi (Terai)' },
  '2083-12-05': { np: 'घोडे जात्रा', en: 'Ghode Jatra' },
  '2083-12-13': { np: 'रामनवमी', en: 'Ram Navami' },

  // ── Year 2084 BS Lunar & Festival Holidays ──
  '2084-01-06': { np: 'बुद्ध जयन्ती', en: 'Buddha Jayanti' },
  '2084-05-14': { np: 'जनै पूर्णिमा', en: 'Janai Purnima' },
  '2084-05-15': { np: 'गाईजात्रा', en: 'Gai Jatra' },
  '2084-05-22': { np: 'श्रीकृष्ण जन्माष्टमी', en: 'Krishna Janmashtami' },
  '2084-06-03': { np: 'संविधान दिवस / हरितालिका तीज', en: 'Constitution Day / Teej' },
  '2084-06-25': { np: 'घटस्थापना', en: 'Ghatasthapana' },
  '2084-07-02': { np: 'दशैं (फूलपाती)', en: 'Dashain (Phulpati)' },
  '2084-07-03': { np: 'दशैं (महाअष्टमी)', en: 'Dashain (Maha Ashtami)' },
  '2084-07-04': { np: 'दशैं (महानवमी)', en: 'Dashain (Maha Navami)' },
  '2084-07-05': { np: 'दशैं (विजया दशमी)', en: 'Dashain (Vijaya Dashami)' },
  '2084-07-23': { np: 'तिहार (लक्ष्मी पूजा)', en: 'Tihar (Laxmi Puja)' },
  '2084-07-24': { np: 'तिहार (गोवर्धन पूजा)', en: 'Tihar (Gobardhan Puja)' },
  '2084-07-25': { np: 'तिहार (भाइटीका)', en: 'Tihar (Bhai Tika)' },
  '2084-08-01': { np: 'छठ पर्व', en: 'Chhath Parva' },
  '2084-11-11': { np: 'महाशिवरात्रि', en: 'Maha Shivaratri' },
  '2084-11-26': { np: 'फागु पूर्णिमा (होली)', en: 'Fagu Purnima (Holi)' }
};

/**
 * Check if a Bikram Sambat date is an official public holiday
 * @param {number} year 
 * @param {number} month 
 * @param {number} day 
 * @returns {{ isHoliday: boolean, holidayNameNp: string|null, holidayNameEn: string|null }}
 */
export function getBikramSambatHoliday(year, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  
  // 1. Check year-specific key
  const fullKey = `${year}-${mm}-${dd}`;
  if (BS_PUBLIC_HOLIDAYS[fullKey]) {
    const h = BS_PUBLIC_HOLIDAYS[fullKey];
    return { isHoliday: true, holidayNameNp: h.np, holidayNameEn: h.en, key: fullKey };
  }

  // 2. Check fixed annual recurring key
  const recurringKey = `${mm}-${dd}`;
  if (BS_PUBLIC_HOLIDAYS[recurringKey]) {
    const h = BS_PUBLIC_HOLIDAYS[recurringKey];
    return { isHoliday: true, holidayNameNp: h.np, holidayNameEn: h.en, key: fullKey };
  }

  return { isHoliday: false, holidayNameNp: null, holidayNameEn: null, key: fullKey };
}

/**
 * Complete Nepali Date Information from any Gregorian Date
 * @param {Date|string|number} date 
 */
export function getNepaliDate(date = new Date()) {
  const bs = adToBs(date);
  const holiday = getBikramSambatHoliday(bs.year, bs.month, bs.day);
  const monthNameNp = NEPALI_MONTH_NAMES_NP[bs.month - 1];
  const monthNameEn = NEPALI_MONTH_NAMES_EN[bs.month - 1];
  const dayOfWeekNp = NEPALI_DAYS_NP[bs.dayOfWeek];
  const dayOfWeekEn = NEPALI_DAYS_EN[bs.dayOfWeek];

  const formattedNp = `${toNepaliDigits(bs.day)} ${monthNameNp} ${toNepaliDigits(bs.year)} (${dayOfWeekNp})`;
  const formattedEn = `${bs.day} ${monthNameEn} ${bs.year} (${dayOfWeekEn})`;
  const shortNp = `${toNepaliDigits(bs.day)} ${monthNameNp}`;
  const shortEn = `${bs.day} ${monthNameEn}`;

  return {
    year: bs.year,
    month: bs.month,
    day: bs.day,
    dayOfWeek: bs.dayOfWeek,
    monthNameNp,
    monthNameEn,
    dayOfWeekNp,
    dayOfWeekEn,
    digitsDay: toNepaliDigits(bs.day),
    digitsYear: toNepaliDigits(bs.year),
    formattedNp,
    formattedEn,
    shortNp,
    shortEn,
    isHoliday: holiday.isHoliday,
    holidayNameNp: holiday.holidayNameNp,
    holidayNameEn: holiday.holidayNameEn
  };
}

/**
 * Convert Bikram Sambat date back to Gregorian (AD) Date object
 */
export function bsToAd(bsYear, bsMonth, bsDay) {
  const yIdx = bsYear - 2000;
  if (yIdx < 0 || yIdx >= YEAR_DAYS_MAP.length) return null;
  const pastYearDays = YEAR_DAYS_MAP[yIdx].passed;
  const pastMonthDays = MONTH_DAYS_MAP[yIdx][bsMonth - 1]?.passed || 0;
  const daysPassed = pastYearDays + pastMonthDays + (bsDay - 1);
  const epoch = Date.UTC(1943, 3, 14); // 2000-01-01 BS = 1943-04-14 AD
  return new Date(epoch + (daysPassed * 86400000));
}

/**
 * Get the number of days in a specific BS month
 */
export function getDaysInBsMonth(bsYear, bsMonth) {
  const yIdx = bsYear - 2000;
  if (yIdx < 0 || yIdx >= BS_MONTH_DAYS.length) return 30;
  return BS_MONTH_DAYS[yIdx][bsMonth - 1] || 30;
}

/**
 * In-memory cache for live fetched months
 */
const LIVE_MONTH_CACHE = new Map();

/**
 * Fetch calendar data for a specific BS month from GitHub open dataset with local fallback
 */
export async function fetchLiveCalendarMonth(bsYear, bsMonth) {
  const cacheKey = `${bsYear}_${bsMonth}`;
  if (LIVE_MONTH_CACHE.has(cacheKey)) {
    return LIVE_MONTH_CACHE.get(cacheKey);
  }

  const daysInMonth = getDaysInBsMonth(bsYear, bsMonth);
  const monthNameNp = NEPALI_MONTH_NAMES_NP[bsMonth - 1];
  const monthNameEn = NEPALI_MONTH_NAMES_EN[bsMonth - 1];

  let remoteDays = null;
  try {
    const url = `https://raw.githubusercontent.com/S4NKALP/nepali-calendar-api/main/data/${bsYear}/${bsMonth}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.days)) {
        remoteDays = json.days;
      }
    }
  } catch (_) {
    // Network failure or offline — will use offline built-in database
  }

  // Construct full month day array
  const days = [];
  const holidays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const adDate = bsToAd(bsYear, bsMonth, d);
    const dayOfWeek = adDate ? adDate.getUTCDay() : ((d % 7));
    const dayOfWeekNp = NEPALI_DAYS_NP[dayOfWeek];
    const dayOfWeekEn = NEPALI_DAYS_EN[dayOfWeek];
    const digitsDay = toNepaliDigits(d);

    // Check offline holiday database
    const localHoliday = getBikramSambatHoliday(bsYear, bsMonth, d);

    // Remote data match if available
    let remoteEntry = null;
    if (remoteDays) {
      remoteEntry = remoteDays.find(r => {
        const parsedDay = parseInt(r.e, 10);
        const matchNepali = r.n === digitsDay;
        return matchNepali || (adDate && parsedDay === adDate.getUTCDate());
      });
    }

    const tithi = remoteEntry?.t || '';
    const festival = remoteEntry?.f || localHoliday.holidayNameNp || '';
    const isRemoteHoliday = Boolean(remoteEntry?.h);
    const isHoliday = localHoliday.isHoliday || isRemoteHoliday;
    const holidayName = localHoliday.holidayNameNp || festival || null;

    // National weekend holidays: Saturday (6) and Sunday (0). Friday is open trading.
    const isWeekend = (dayOfWeek === 6 || dayOfWeek === 0);
    const isTradingDay = !isWeekend && !isHoliday; // Monday to Friday

    const dayObj = {
      bsYear,
      bsMonth,
      bsDay: d,
      digitsDay,
      adDate: adDate ? adDate.toISOString().split('T')[0] : '',
      dayOfWeek,
      dayOfWeekNp,
      dayOfWeekEn,
      tithi,
      festival,
      isHoliday,
      isWeekend,
      isTradingDay,
      holidayName: isHoliday ? holidayName : null
    };

    days.push(dayObj);
    if (isHoliday) {
      holidays.push(dayObj);
    }
  }

  const result = {
    bsYear,
    bsMonth,
    monthNameNp,
    monthNameEn,
    daysInMonth,
    days,
    holidays,
    totalHolidays: holidays.length
  };

  LIVE_MONTH_CACHE.set(cacheKey, result);
  return result;
}

/**
 * Get all holidays in a BS month (sync offline or cached)
 */
export function getHolidaysForMonth(bsYear, bsMonth) {
  const cacheKey = `${bsYear}_${bsMonth}`;
  if (LIVE_MONTH_CACHE.has(cacheKey)) {
    return LIVE_MONTH_CACHE.get(cacheKey).holidays;
  }

  const daysInMonth = getDaysInBsMonth(bsYear, bsMonth);
  const holidays = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const h = getBikramSambatHoliday(bsYear, bsMonth, d);
    if (h.isHoliday) {
      const adDate = bsToAd(bsYear, bsMonth, d);
      const dayOfWeek = adDate ? adDate.getUTCDay() : 0;
      holidays.push({
        bsYear,
        bsMonth,
        bsDay: d,
        digitsDay: toNepaliDigits(d),
        adDate: adDate ? adDate.toISOString().split('T')[0] : '',
        dayOfWeek,
        dayOfWeekNp: NEPALI_DAYS_NP[dayOfWeek],
        dayOfWeekEn: NEPALI_DAYS_EN[dayOfWeek],
        nameNp: h.holidayNameNp,
        nameEn: h.holidayNameEn,
        isHoliday: true
      });
    }
  }
  return holidays;
}

/**
 * Get next upcoming holidays from any reference date
 */
export function getUpcomingHolidays(referenceDate = new Date(), count = 10) {
  const currentBs = adToBs(referenceDate);
  const upcoming = [];

  let curYear = currentBs.year;
  let curMonth = currentBs.month;
  let curDay = currentBs.day;

  for (let mOffset = 0; mOffset < 12 && upcoming.length < count; mOffset++) {
    let checkMonth = curMonth + mOffset;
    let checkYear = curYear;
    if (checkMonth > 12) {
      checkMonth -= 12;
      checkYear += 1;
    }

    const monthHolidays = getHolidaysForMonth(checkYear, checkMonth);
    for (const h of monthHolidays) {
      if (checkYear === curYear && checkMonth === curMonth && h.bsDay < curDay) {
        continue; // Already passed
      }
      upcoming.push(h);
      if (upcoming.length >= count) break;
    }
  }

  return upcoming;
}

