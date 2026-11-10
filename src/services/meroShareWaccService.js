// src/services/meroShareWaccService.js
/**
 * MeroShare WACC Details Service
 *
 * Implements strict extraction, mathematical verification, symbol normalization,
 * and cost-basis hierarchy for CDSC MeroShare "View your WACC details" records.
 */

/**
 * Normalizes scrip symbols across variations (casing, trailing symbols, whitespace, share classes).
 * Examples: ' akpl ' -> 'AKPL', 'NABIL.N0000' -> 'NABIL', 'GBIME_PO' -> 'GBIME'
 */
export function normalizeScripSymbol(rawSymbol) {
  if (!rawSymbol || typeof rawSymbol !== 'string') return '';
  let clean = rawSymbol.trim().toUpperCase();
  // Strip common NEPSE suffixes like .N0000, .P, _PO, _PR, etc.
  clean = clean.replace(/\.N[0-9]+$/i, '');
  clean = clean.replace(/[_\.](PO|PR|PROM|P)$/i, '');
  return clean.replace(/[^A-Z0-9]/g, '');
}

/**
 * Verifies mathematical relationship: totalCost = waccRate x waccCalculatedQuantity.
 * Flags discrepancies exceeding tolerance (default Rs. 0.05 / 5 paisa).
 */
export function verifyWaccMath({ rate, quantity, totalCost, tolerance = 0.05 }) {
  const numRate = Number(rate || 0);
  const numQty = Number(quantity || 0);
  const numTotal = Number(totalCost || 0);

  const expectedTotal = Number((numRate * numQty).toFixed(3));
  const difference = Number(Math.abs(numTotal - expectedTotal).toFixed(3));
  const isMismatch = difference > tolerance;

  return {
    isValid: !isMismatch,
    expectedTotal,
    actualTotal: numTotal,
    difference,
    isMismatch,
    mismatchNote: isMismatch
      ? `Mathematical mismatch: Total Cost Rs. ${numTotal.toFixed(2)} differs from Rate × Qty (Rs. ${expectedTotal.toFixed(2)}) by Rs. ${difference.toFixed(2)}.`
      : null
  };
}

/**
 * Parses raw CDSC MeroShare WACC response payload into structured records.
 * Supports direct arrays, Spring Pageable envelopes, or nested view arrays.
 * 
 * Required fields per scrip:
 * - SCRIP NAME (scripName, scrip, symbol)
 * - WACC RATE (waccRate, wacc, rate)
 * - LAST MODIFICATION DATE (lastModifiedDate, lastModificationDate, modifiedDate)
 * - WACC CALCULATED QUANTITY (waccCalculatedQuantity, calculatedQuantity, quantity)
 * - TOTAL COST OF CAPITAL (totalCostOfCapital, totalCost, totalAmount)
 */
export function parseMeroShareWaccDetailsResponse(rawResponse) {
  if (!rawResponse) {
    return {
      success: false,
      error: 'Empty response payload received',
      totalRecords: 0,
      records: []
    };
  }

  // Detect list container
  let rawList = [];
  let page = 1;
  let totalPages = 1;
  let totalElements = 0;

  if (Array.isArray(rawResponse)) {
    rawList = rawResponse;
    totalElements = rawList.length;
  } else if (typeof rawResponse === 'object') {
    if (Array.isArray(rawResponse.content)) {
      rawList = rawResponse.content;
      page = (rawResponse.number ?? 0) + 1;
      totalPages = rawResponse.totalPages ?? 1;
      totalElements = rawResponse.totalElements ?? rawList.length;
    } else if (Array.isArray(rawResponse.meroShareWaccView)) {
      rawList = rawResponse.meroShareWaccView;
      totalElements = rawList.length;
    } else if (Array.isArray(rawResponse.meroShareViewArray)) {
      rawList = rawResponse.meroShareViewArray;
      totalElements = rawList.length;
    } else if (Array.isArray(rawResponse.data)) {
      rawList = rawResponse.data;
      totalElements = rawList.length;
    } else if (Array.isArray(rawResponse.object)) {
      rawList = rawResponse.object;
      totalElements = rawList.length;
    } else if (Array.isArray(rawResponse.waccDetails)) {
      rawList = rawResponse.waccDetails;
      totalElements = rawList.length;
    }
  }

  if (!Array.isArray(rawList)) {
    return {
      success: false,
      error: 'Unrecognized response format from CDSC WACC endpoint',
      totalRecords: 0,
      records: []
    };
  }

  const parsedRecords = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    const rawScrip = item.scripName || item.scrip || item.script || item.symbol || item.companyName || '';
    const normalizedSymbol = normalizeScripSymbol(rawScrip);
    if (!normalizedSymbol) continue;

    const waccRate = Number(item.waccRate ?? item.wacc ?? item.rate ?? item.userPrice ?? item.purchasePrice ?? 0);
    const waccCalculatedQuantity = Number(item.waccCalculatedQuantity ?? item.calculatedQuantity ?? item.quantity ?? item.kitta ?? item.units ?? 0);
    const totalCostOfCapital = Number(item.totalCostOfCapital ?? item.totalCost ?? item.totalAmount ?? item.totalPrice ?? (waccRate * waccCalculatedQuantity));
    const lastModifiedDate = String(item.lastModificationDate || item.lastModifiedDate || item.modifiedDate || item.updateDate || item.date || item.createdDate || '').trim();

    const mathCheck = verifyWaccMath({
      rate: waccRate,
      quantity: waccCalculatedQuantity,
      totalCost: totalCostOfCapital
    });

    parsedRecords.push({
      scripName: rawScrip,
      normalizedSymbol,
      waccRate,
      waccCalculatedQuantity,
      totalCostOfCapital,
      lastModifiedDate,
      mathCheck,
      source: 'CDSC_WACC',
      isCostMismatch: mathCheck.isMismatch,
      costMismatchNote: mathCheck.mismatchNote
    });
  }

  return {
    success: true,
    page,
    totalPages,
    totalRecords: totalElements || parsedRecords.length,
    count: parsedRecords.length,
    records: parsedRecords
  };
}

/**
 * Matches extracted WACC records against Demat portfolio holdings.
 * If held quantity differs from WACC calculated quantity:
 * - Notes the difference clearly.
 * - Does NOT silently apply the rate to the extra shares.
 * - Calculates effective cost basis preserving uncovered share boundaries.
 */
export function matchWaccRecordsToHoldings(waccRecords = [], holdings = []) {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return [];
  }

  const waccMap = new Map();
  (waccRecords || []).forEach(r => {
    if (r && r.normalizedSymbol) {
      waccMap.set(r.normalizedSymbol, r);
    }
  });

  return holdings.map(holding => {
    const rawSym = holding.symbol || holding.scrip || holding.script || '';
    const sym = normalizeScripSymbol(rawSym);
    const heldQty = Number(holding.units ?? holding.currentBalance ?? holding.dematQty ?? holding.totalUnits ?? 0);

    const waccRecord = waccMap.get(sym);

    if (!waccRecord) {
      // Retain existing cost basis if available, respecting hierarchy
      return {
        ...holding,
        symbol: sym || rawSym,
        waccSource: holding.waccSource || 'NOT_AVAILABLE'
      };
    }

    const waccQty = Number(waccRecord.waccCalculatedQuantity || 0);
    const rate = Number(waccRecord.waccRate || 0);
    const isQtyMismatch = heldQty !== waccQty;
    let quantityNote = null;
    let coveredQty = heldQty;
    let uncoveredQty = 0;

    if (heldQty > waccQty) {
      uncoveredQty = heldQty - waccQty;
      coveredQty = waccQty;
      quantityNote = `⚠️ WACC verified for ${waccQty} of ${heldQty} held shares. Rate Rs. ${rate.toFixed(2)} applies only to ${waccQty} shares; remaining ${uncoveredQty} shares require purchase confirmation.`;
    } else if (heldQty < waccQty) {
      quantityNote = `ℹ️ WACC calculated for ${waccQty} shares, but Demat currently holds ${heldQty} shares.`;
    }

    return {
      ...holding,
      symbol: sym || rawSym,
      wacc: rate,
      waccRate: rate,
      waccCalculatedQuantity: waccQty,
      heldQuantity: heldQty,
      totalCostOfCapital: waccRecord.totalCostOfCapital,
      lastModifiedDate: waccRecord.lastModifiedDate,
      waccSource: 'CDSC_WACC',
      isCustomWacc: true,
      hasQuantityMismatch: isQtyMismatch,
      coveredQuantity: coveredQty,
      uncoveredQuantity: uncoveredQty,
      quantityNote,
      mathCheck: waccRecord.mathCheck,
      hasCostMismatch: waccRecord.isCostMismatch,
      costMismatchNote: waccRecord.costMismatchNote
    };
  });
}

/**
 * Standardizes failure causes for UI feedback.
 */
export function classifyWaccSyncFailure(err, responseStatus = null) {
  if (!err && !responseStatus) {
    return {
      type: 'GENUINELY_NO_RECORD',
      userMessageEn: 'No WACC records found in CDSC for this Demat account.',
      userMessageNe: 'यस डिम्याट खाताको लागि सीडीएससीमा कुनै WACC रेकर्ड फेला परेन।'
    };
  }

  const errMsg = String(err?.message || err || '').toLowerCase();
  const status = Number(responseStatus || err?.status || err?.response?.status || 0);

  if (errMsg.includes('not logged in') || errMsg.includes('token required') || errMsg.includes('credentials required')) {
    return {
      type: 'NOT_LOGGED_IN',
      userMessageEn: 'MeroShare account is not linked or not logged in. Link your account in Account Manager.',
      userMessageNe: 'मेरोशेयर खाता लिंक वा लगइन गरिएको छैन। खाता व्यवस्थापकमा गएर लगइन गर्नुहोस्।'
    };
  }

  if (status === 401 || errMsg.includes('expired') || errMsg.includes('unauthorized') || errMsg.includes('session')) {
    return {
      type: 'SESSION_EXPIRED',
      userMessageEn: 'MeroShare session has expired. Please re-login to renew your CDSC session.',
      userMessageNe: 'मेरोशेयर सत्रको म्याद सकिएको छ। कृपया पुनः लगइन गर्नुहोस्।'
    };
  }

  if (status === 503 || status === 403 || errMsg.includes('waf') || errMsg.includes('firewall') || errMsg.includes('blocked')) {
    return {
      type: 'CDSC_BLOCKED_WAF',
      userMessageEn: 'CDSC security firewall blocked request. Please try again after 30 seconds.',
      userMessageNe: 'सीडीएससी सुरक्षा फायरवालले अनुरोध अस्वीकार गर्‍यो। कृपया ३० सेकेन्डपछि प्रयास गर्नुहोस्।'
    };
  }

  if (errMsg.includes('econnrefused') || errMsg.includes('timeout') || errMsg.includes('network') || errMsg.includes('unreachable') || status === 504) {
    return {
      type: 'CDSC_UNREACHABLE',
      userMessageEn: 'CDSC MeroShare server is unreachable. Please verify network connectivity or CDSC uptime.',
      userMessageNe: 'सीडीएससी मेरोशेयर सर्भरमा जडान हुन सकेन। कृपया इन्टरनेट जाँच गर्नुहोस्।'
    };
  }

  return {
    type: 'ENDPOINT_ERROR',
    userMessageEn: `CDSC returned an error (${status ? `HTTP ${status}` : 'Unknown error'}).`,
    userMessageNe: `सीडीएससीबाट त्रुटि प्राप्त भयो (${status ? `HTTP ${status}` : 'अज्ञात त्रुटि'})।`
  };
}
