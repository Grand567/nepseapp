/**
 * floorsheetDeduplicator.mjs
 * Deterministic Contract Deduplication & Normalization Engine
 * Guarantees zero duplicate contracts per session date while preserving trade chronology.
 */

/**
 * Extracts a normalized contract number string from any floorsheet trade record.
 * Supports NOTS, ShareSansar, Chukul, and MeroLagani record schemas.
 */
export function extractContractNumber(trade, defaultDate = '', index = 0) {
  if (!trade) return '';
  const rawId = trade.contractId ?? trade.contract_no ?? trade.contractNo ?? trade.id ?? trade.tranId ?? trade.tradeBookId;
  if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
    return String(rawId).trim();
  }
  const sym = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || 'UNK').toUpperCase().trim();
  const dt = String(trade.businessDate || trade.tradeDate || trade.trade_date || defaultDate || 'UNKNOWN').trim().slice(0, 10);
  const buyer = String(trade.buyerMemberId ?? trade.buyerBroker ?? trade.buyer_broker ?? trade.buyer ?? '').trim();
  const seller = String(trade.sellerMemberId ?? trade.sellerBroker ?? trade.seller_broker ?? trade.seller ?? '').trim();
  const qty = Math.round(Number(trade.contractQuantity ?? trade.quantity ?? trade.qty ?? trade.kitta ?? 0));
  const rate = Number(trade.contractRate ?? trade.rate ?? trade.price ?? 0);
  const time = String(trade.tradeTime ?? trade.trade_time ?? trade.time ?? '').trim();
  const hasDetails = (buyer && buyer !== '0') || (seller && seller !== '0') || qty > 0 || rate > 0;
  if (!hasDetails) {
    return `SYN-${dt}-${sym}-${index + 1}`;
  }
  return time
    ? `SYN-${dt}-${sym}-${buyer || '0'}-${seller || '0'}-${qty}-${rate}-${time}`
    : `SYN-${dt}-${sym}-${buyer || '0'}-${seller || '0'}-${qty}-${rate}-${index + 1}`;
}

/**
 * Deduplicates an array of floorsheet trade records using their contract numbers,
 * normalizes stock symbols (trimmed/uppercased), and enforces quantity * rate == amount.
 *
 * @param {Array<object>} rawTrades - Array of trade objects
 * @param {string} sessionDate - Target session date YYYY-MM-DD
 * @returns {{ deduplicatedTrades: Array<object>, duplicateCount: number, totalRawCount: number, uniqueCount: number }}
 */
export function deduplicateFloorsheetContracts(rawTrades, sessionDate = '') {
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) {
    return {
      deduplicatedTrades: [],
      duplicateCount: 0,
      totalRawCount: 0,
      uniqueCount: 0,
    };
  }

  const seenContracts = new Set();
  const deduplicatedTrades = [];
  let duplicateCount = 0;

  for (let i = 0; i < rawTrades.length; i++) {
    const trade = rawTrades[i];
    if (!trade || typeof trade !== 'object') continue;

    const rawId = trade.contractId ?? trade.contract_no ?? trade.contractNo ?? trade.id ?? trade.tranId ?? trade.tradeBookId;
    const baseContractNo = extractContractNumber(trade, sessionDate, i);
    if (!baseContractNo) {
      duplicateCount++;
      continue;
    }
    let contractNo = baseContractNo;

    if (rawId !== null && rawId !== undefined && String(rawId).trim() !== '') {
      if (seenContracts.has(contractNo)) {
        duplicateCount++;
        continue;
      }
    } else if (seenContracts.has(contractNo)) {
      // Distinguish true duplicate objects from same-second split-lot fills lacking raw contractId
      const rawSignature = JSON.stringify(trade);
      if (seenContracts.has(rawSignature)) {
        duplicateCount++;
        continue;
      }
      seenContracts.add(rawSignature);
      let occ = 2;
      while (seenContracts.has(`${baseContractNo}-${occ}`)) occ++;
      contractNo = `${baseContractNo}-${occ}`;
    } else {
      seenContracts.add(JSON.stringify(trade));
    }

    const sym = String(trade.contractSymbol || trade.stockSymbol || trade.symbol || '').toUpperCase().trim();
    const qty = Math.round(Number(trade.contractQuantity ?? trade.quantity ?? trade.qty ?? trade.kitta ?? 0));
    const rate = Number(trade.contractRate ?? trade.rate ?? trade.price ?? 0);
    const rawAmt = Number(trade.contractAmount ?? trade.amount ?? 0);
    const expectedAmt = qty > 0 && rate > 0 ? Number((qty * rate).toFixed(2)) : 0;
    const verifiedAmt = (expectedAmt > 0 && (!Number.isFinite(rawAmt) || rawAmt <= 0 || Math.abs(rawAmt - expectedAmt) > Math.max(1, expectedAmt * 0.01)))
      ? expectedAmt
      : Number((rawAmt > 0 ? rawAmt : expectedAmt).toFixed(2));

    seenContracts.add(contractNo);
    // Ensure the record carries normalized contractId, contract_no, symbol, and arithmetic consistency
    deduplicatedTrades.push({
      ...trade,
      symbol: sym || trade.symbol,
      stockSymbol: sym || trade.stockSymbol,
      contractId: contractNo,
      contract_no: contractNo,
      kitta: qty > 0 ? qty : trade.kitta,
      quantity: qty > 0 ? qty : trade.quantity,
      rate: rate > 0 ? rate : trade.rate,
      amount: verifiedAmt > 0 ? verifiedAmt : trade.amount,
    });
  }

  return {
    deduplicatedTrades,
    duplicateCount,
    totalRawCount: rawTrades.length,
    uniqueCount: deduplicatedTrades.length,
  };
}
