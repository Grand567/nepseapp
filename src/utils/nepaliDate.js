export const bsDaysInMonths = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2084: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 30, 30],
  2085: [31, 32, 31, 32, 30, 31, 30, 30, 29, 30, 30, 30],
  2086: [30, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 30, 29, 30, 30, 30],
  2088: [30, 31, 32, 32, 30, 31, 30, 30, 29, 30, 30, 30],
};

export const bsMonths = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// Start date of BS 2078 Baisakh 1 in AD is April 14, 2021
const startAdDate = new Date(Date.UTC(2021, 3, 14)); // April 14, 2021
const startBsYear = 2078;
const startBsMonth = 0; // Baisakh
const startBsDay = 1;

/**
 * Convert an AD Date object to BS date.
 */
export function adToBS(date) {
  const targetDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  let daysDiff = Math.floor((targetDate - startAdDate) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    const fallbackYear = date.getFullYear() + 57;
    return { year: fallbackYear, month: 0, day: 1, monthName: 'Baisakh' };
  }

  let year = startBsYear;
  let month = startBsMonth;
  
  while (daysDiff >= bsDaysInMonths[year]?.[month] ?? 30) {
    daysDiff -= bsDaysInMonths[year]?.[month] ?? 30;
    month++;
    if (month > 11) {
      month = 0;
      year++;
      if (!bsDaysInMonths[year]) {
         return { year: 2088, month: 11, day: 30, monthName: 'Chaitra' };
      }
    }
  }

  const day = startBsDay + daysDiff;
  
  return {
    year,
    month,
    day,
    monthName: bsMonths[month]
  };
}

/**
 * Format an AD date into a BS date string
 * fmt: 'short' -> "Jes 14", 'long' -> "Jestha 14, 2081"
 */
export function formatBS(date, fmt = 'long') {
  const bs = adToBS(date);
  if (fmt === 'short') {
    return `${bs.monthName.slice(0, 3)} ${bs.day}`;
  }
  return `${bs.monthName} ${bs.day}, ${bs.year}`;
}
