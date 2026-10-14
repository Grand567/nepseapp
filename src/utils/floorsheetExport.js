import { fetchRealFloorsheet, fetchRealBrokerAnalysis } from './liveData';
import { getBrokerName } from './accumulationDistributionEngine';

/**
 * Triggers a file download on both Web browsers and Android APK WebView (via NepseAndroidDownloader).
 */
export function triggerFileDownload(content, filename, mimeType = 'text/csv;charset=utf-8;') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  // Native Android APK WebView direct save to Android Downloads folder
  try {
    if (window.NepseAndroidDownloader && typeof window.NepseAndroidDownloader.saveFile === 'function') {
      const strContent = typeof content === 'string' ? content : String(content ?? '');
      const ok = window.NepseAndroidDownloader.saveFile(strContent, filename, mimeType);
      if (ok) return true;
    }
  } catch (_) {}

  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/**
 * Escapes a single CSV cell value safely.
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Builds a UTF-8 BOM CSV string (so Excel opens it cleanly with proper encoding).
 */
export function buildCsvContent(headers, rows, metaComments = []) {
  const lines = [];
  if (Array.isArray(metaComments) && metaComments.length > 0) {
    metaComments.forEach(c => {
      lines.push( c.map(escapeCsvCell).join(',') );
    });
    lines.push('');
  }
  lines.push(headers.map(escapeCsvCell).join(','));
  rows.forEach(row => {
    lines.push(row.map(escapeCsvCell).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Escapes XML special characters for Excel SpreadsheetML.
 */
function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds a multi-worksheet Microsoft Excel XML SpreadsheetML (.xls) file.
 * Opens natively in Excel, LibreOffice Calc, and WPS Office with separate tabs,
 * styled headers, and native numeric columns for formulas/pivot tables.
 */
export function buildExcelWorkbookXml(worksheets = []) {
  const sheetsXml = worksheets.map((sheet, idx) => {
    const safeSheetName = escapeXml(
      String(sheet.name || `Sheet${idx + 1}`)
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31)
        .trim() || `Sheet${idx + 1}`
    );

    const metaRowsXml = (sheet.metaRows || []).map(mRow => {
      const cells = mRow.map((cell, cIdx) => {
        const styleId = cIdx === 0 ? 'sMetaLabel' : 'sMetaValue';
        return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
      }).join('');
      return `<Row ss:Height="18">${cells}</Row>`;
    }).join('\n');

    const spacerRowXml = (sheet.metaRows && sheet.metaRows.length > 0) ? '<Row ss:Height="10"></Row>' : '';

    const headerCellsXml = (sheet.headers || []).map(h => (
      `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`
    )).join('');
    const headerRowXml = `<Row ss:Height="22">${headerCellsXml}</Row>`;

    const dataRowsXml = (sheet.rows || []).map(row => {
      const isTotalRow = row[0] === 'TOTAL' || row[0] === 'SUMMARY';
      const cellsXml = row.map(cell => {
        if (cell === null || cell === undefined || cell === '') {
          return `<Cell ss:StyleID="${isTotalRow ? 'sTotalText' : 'sText'}"><Data ss:Type="String"></Data></Cell>`;
        }
        const isNumeric = typeof cell === 'number' && Number.isFinite(cell);
        if (isNumeric) {
          const style = isTotalRow ? 'sTotalNum' : (Number.isInteger(cell) ? 'sInt' : 'sDec');
          return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${cell}</Data></Cell>`;
        }
        return `<Cell ss:StyleID="${isTotalRow ? 'sTotalText' : 'sText'}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`;
      }).join('');
      return `<Row ss:Height="${isTotalRow ? 20 : 17}">${cellsXml}</Row>`;
    }).join('\n');

    return `
  <Worksheet ss:Name="${safeSheetName}">
    <Table>
      ${metaRowsXml}
      ${spacerRowXml}
      ${headerRowXml}
      ${dataRowsXml}
    </Table>
  </Worksheet>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="sHeader">
      <Alignment ss:Vertical="Center" ss:Horizontal="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0284C7"/>
      </Borders>
    </Style>
    <Style ss:ID="sMetaLabel">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0369A1"/>
    </Style>
    <Style ss:ID="sMetaValue">
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="sText">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1E293B"/>
    </Style>
    <Style ss:ID="sInt">
      <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
      <Font ss:FontName="Consolas" ss:Size="10" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="sDec">
      <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
      <Font ss:FontName="Consolas" ss:Size="10" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
    <Style ss:ID="sTotalText">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="sTotalNum">
      <Alignment ss:Vertical="Center" ss:Horizontal="Right"/>
      <Font ss:FontName="Consolas" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
  </Styles>
  ${sheetsXml}
</Workbook>`;
}

/**
 * Computes per-broker Buy/Sell/Hold/Matched summary from an array of floorsheet rows.
 */
export function computeBrokerSummaryFromRows(rows = []) {
  const map = {};
  let totalTradedQty = 0;
  let totalTradedAmt = 0;

  rows.forEach(r => {
    const qty = Number(r.qty || r.quantity || 0);
    const rate = Number(r.rate || 0);
    const amt = Number(r.amount || (qty * rate) || 0);
    if (qty <= 0) return;

    const bb = String(r.buyerBroker || r.buyer || '').trim();
    const sb = String(r.sellerBroker || r.seller || '').trim();
    const isSelf = Boolean(bb && sb && bb === sb);

    totalTradedQty += qty;
    totalTradedAmt += amt;

    if (bb) {
      if (!map[bb]) {
        map[bb] = {
          brokerId: bb,
          brokerName: r.buyerBrokerName || getBrokerName(bb),
          buyQty: 0,
          buyAmt: 0,
          buyTrades: 0,
          sellQty: 0,
          sellAmt: 0,
          sellTrades: 0,
          matchedQty: 0,
          matchedAmt: 0
        };
      }
      map[bb].buyQty += qty;
      map[bb].buyAmt += amt;
      map[bb].buyTrades += 1;
      if (isSelf) {
        map[bb].matchedQty += qty;
        map[bb].matchedAmt += amt;
      }
    }

    if (sb) {
      if (!map[sb]) {
        map[sb] = {
          brokerId: sb,
          brokerName: r.sellerBrokerName || getBrokerName(sb),
          buyQty: 0,
          buyAmt: 0,
          buyTrades: 0,
          sellQty: 0,
          sellAmt: 0,
          sellTrades: 0,
          matchedQty: 0,
          matchedAmt: 0
        };
      }
      map[sb].sellQty += qty;
      map[sb].sellAmt += amt;
      map[sb].sellTrades += 1;
    }
  });

  const safeVol = totalTradedQty || 1;
  return Object.values(map).map(b => {
    const totalQty = b.buyQty + b.sellQty;
    const holdQty = b.buyQty - b.sellQty;
    const holdAmt = +(b.buyAmt - b.sellAmt).toFixed(2);
    const avgBuyRate = b.buyQty > 0 ? +(b.buyAmt / b.buyQty).toFixed(2) : 0;
    const avgSellRate = b.sellQty > 0 ? +(b.sellAmt / b.sellQty).toFixed(2) : 0;
    const buyMktShare = +((b.buyQty / safeVol) * 100).toFixed(2);
    const sellMktShare = +((b.sellQty / safeVol) * 100).toFixed(2);
    const buyPct = totalQty > 0 ? Math.round((b.buyQty / totalQty) * 100) : 0;
    const sellPct = totalQty > 0 ? (100 - buyPct) : 0;
    const role = holdQty > 0 ? 'Net Buyer (Hold)' : holdQty < 0 ? 'Net Seller (Dist)' : 'Balanced / Matched';

    return {
      ...b,
      buyAmt: +b.buyAmt.toFixed(2),
      sellAmt: +b.sellAmt.toFixed(2),
      matchedAmt: +b.matchedAmt.toFixed(2),
      totalQty,
      holdQty,
      holdAmt,
      avgBuyRate,
      avgSellRate,
      buyMktShare,
      sellMktShare,
      buyPct,
      sellPct,
      role
    };
  }).sort((a, b) => b.totalQty - a.totalQty);
}

/**
 * Computes date-wise per-broker buying & selling breakdown from floorsheet rows.
 */
export function computeDateWiseBrokerRows(rows = [], fallbackSymbol = '') {
  const dateBrokerMap = {};

  rows.forEach(r => {
    const qty = Number(r.qty || r.quantity || 0);
    const rate = Number(r.rate || 0);
    const amt = Number(r.amount || (qty * rate) || 0);
    if (qty <= 0) return;

    const dt = String(r.businessDate || r.date || 'Latest').split('T')[0];
    const sym = String(r.symbol || r.stockSymbol || fallbackSymbol || '').toUpperCase();
    const bb = String(r.buyerBroker || r.buyer || '').trim();
    const sb = String(r.sellerBroker || r.seller || '').trim();
    const isSelf = Boolean(bb && sb && bb === sb);

    if (bb) {
      const key = `${dt}_${bb}`;
      if (!dateBrokerMap[key]) {
        dateBrokerMap[key] = {
          date: dt,
          symbol: sym,
          brokerId: bb,
          brokerName: r.buyerBrokerName || getBrokerName(bb),
          buyQty: 0,
          buyAmt: 0,
          buyTrades: 0,
          sellQty: 0,
          sellAmt: 0,
          sellTrades: 0,
          matchedQty: 0
        };
      }
      dateBrokerMap[key].buyQty += qty;
      dateBrokerMap[key].buyAmt += amt;
      dateBrokerMap[key].buyTrades += 1;
      if (isSelf) dateBrokerMap[key].matchedQty += qty;
    }

    if (sb) {
      const key = `${dt}_${sb}`;
      if (!dateBrokerMap[key]) {
        dateBrokerMap[key] = {
          date: dt,
          symbol: sym,
          brokerId: sb,
          brokerName: r.sellerBrokerName || getBrokerName(sb),
          buyQty: 0,
          buyAmt: 0,
          buyTrades: 0,
          sellQty: 0,
          sellAmt: 0,
          sellTrades: 0,
          matchedQty: 0
        };
      }
      dateBrokerMap[key].sellQty += qty;
      dateBrokerMap[key].sellAmt += amt;
      dateBrokerMap[key].sellTrades += 1;
    }
  });

  return Object.values(dateBrokerMap)
    .map(item => {
      const holdQty = item.buyQty - item.sellQty;
      const holdAmt = +(item.buyAmt - item.sellAmt).toFixed(2);
      const avgBuy = item.buyQty > 0 ? +(item.buyAmt / item.buyQty).toFixed(2) : 0;
      const avgSell = item.sellQty > 0 ? +(item.sellAmt / item.sellQty).toFixed(2) : 0;
      return {
        ...item,
        buyAmt: +item.buyAmt.toFixed(2),
        sellAmt: +item.sellAmt.toFixed(2),
        avgBuy,
        avgSell,
        holdQty,
        holdAmt,
        totalQty: item.buyQty + item.sellQty
      };
    })
    .sort((a, b) => {
      const dCmp = String(b.date).localeCompare(String(a.date));
      if (dCmp !== 0) return dCmp;
      return b.totalQty - a.totalQty;
    });
}

/**
 * Computes Price vs Volume breakdown from raw floorsheet rows.
 */
export function computePriceVolumeFromRows(rows = []) {
  const rateMap = {};
  let totalQty = 0;
  let totalAmt = 0;

  rows.forEach(r => {
    const qty = Number(r.qty || r.quantity || 0);
    const rate = Number(r.rate || 0);
    const amt = Number(r.amount || (qty * rate) || 0);
    if (qty <= 0) return;

    totalQty += qty;
    totalAmt += amt;
    const key = rate.toFixed(2);
    if (!rateMap[key]) {
      rateMap[key] = { rate, trades: 0, qty: 0, amount: 0 };
    }
    rateMap[key].trades += 1;
    rateMap[key].qty += qty;
    rateMap[key].amount += amt;
  });

  return Object.values(rateMap)
    .map(item => ({
      rate: item.rate,
      trades: item.trades,
      qty: item.qty,
      amount: +item.amount.toFixed(2),
      pct: totalQty > 0 ? +((item.qty / totalQty) * 100).toFixed(2) : 0,
      pctQty: totalQty > 0 ? +((item.qty / totalQty) * 100).toFixed(2) : 0
    }))
    .sort((a, b) => b.rate - a.rate);
}

/**
 * Fetches full unpaginated floorsheet data and downloads it in the requested dataset cut and file format.
 *
 * @param {Object} options
 * @param {string} options.symbol - Stock symbol (e.g. 'NABIL')
 * @param {string} [options.date] - Specific YYYY-MM-DD trading date
 * @param {number} [options.days] - Number of trading days (1, 3, 7, 15, 30)
 * @param {string} [options.fromDate] - Start date YYYY-MM-DD
 * @param {string} [options.toDate] - End date YYYY-MM-DD
 * @param {string} [options.buyer] - Buyer broker number filter
 * @param {string} [options.seller] - Seller broker number filter
 * @param {string} [options.broker] - Any-side broker number filter (buyer OR seller)
 * @param {string} [options.dataset] - 'transactions' | 'broker_summary' | 'date_wise_brokers' | 'bulk' | 'price_volume' | 'self_matched' | 'all_in_one'
 * @param {string} [options.format] - 'csv' | 'xls' | 'json'
 * @param {Array}  [options.fallbackRows] - Currently loaded rows as fallback
 */
export async function exportStockFloorsheet({
  symbol = '',
  date = '',
  days = 1,
  fromDate = '',
  toDate = '',
  buyer = '',
  seller = '',
  broker = '',
  dataset = 'transactions',
  format = 'csv',
  fallbackRows = []
} = {}) {
  const sym = String(symbol || 'NEPSE').toUpperCase().trim();
  const selfMatchedOnly = dataset === 'self_matched';

  // Fetch full unpaginated floorsheet rows (up to 25,000 rows) from vault
  const fullData = await fetchRealFloorsheet(sym, date, 1, 25000, {
    days,
    fromDate,
    toDate,
    buyer,
    seller,
    broker,
    selfMatchedOnly
  });

  let rows = Array.isArray(fullData?.rows) && fullData.rows.length > 0
    ? fullData.rows
    : (Array.isArray(fallbackRows) ? fallbackRows : []);

  if (selfMatchedOnly) {
    rows = rows.filter(r => {
      const bb = String(r.buyerBroker || r.buyer || '').trim();
      const sb = String(r.sellerBroker || r.seller || '').trim();
      return bb && sb && bb === sb;
    });
  }

  const effectiveDateLabel = date
    || (fromDate && toDate ? `${fromDate}_to_${toDate}` : '')
    || (days > 1 ? `${days}D_${fullData?.fromDate || ''}_to_${fullData?.toDate || ''}` : '')
    || fullData?.businessDate
    || new Date().toISOString().split('T')[0];

  const brokerTag = broker
    ? `_Broker-${broker}`
    : (buyer || seller ? `_BB-${buyer || 'ALL'}_SB-${seller || 'ALL'}` : '');

  const baseFilename = `${sym}_Floorsheet_${dataset.toUpperCase()}_${effectiveDateLabel}${brokerTag}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const metaRows = [
    ['Report Title', `${sym} Official NEPSE Floorsheet & Broker Export`],
    ['Symbol', sym],
    ['Session / Date Scope', effectiveDateLabel],
    ['Trading Days Included', String(fullData?.tradingDays || 1)],
    ['Broker Filter', broker ? `Broker #${broker} (Buy or Sell)` : (buyer || seller ? `Buyer: #${buyer || 'Any'} | Seller: #${seller || 'Any'}` : 'All Brokers')],
    ['Exported At', new Date().toISOString()]
  ];

  // JSON Export
  if (format === 'json') {
    const brokerSummary = computeBrokerSummaryFromRows(rows);
    const dateWiseBrokers = computeDateWiseBrokerRows(rows, sym);
    const priceVolume = computePriceVolumeFromRows(rows);
    const bulkRows = rows.filter(r => Number(r.qty || r.quantity || 0) >= 200 || Number(r.amount || 0) >= 100000);
    const payload = {
      meta: {
        symbol: sym,
        dateScope: effectiveDateLabel,
        tradingDays: fullData?.tradingDays || 1,
        buyerFilter: buyer || null,
        sellerFilter: seller || null,
        brokerFilter: broker || null,
        totalTrades: rows.length,
        totalQuantity: rows.reduce((s, r) => s + Number(r.qty || r.quantity || 0), 0),
        totalAmount: +rows.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2),
        exportedAt: new Date().toISOString()
      },
      transactions: rows,
      brokerSummary,
      dateWiseBrokers,
      bulkTransactions: bulkRows,
      priceVolumeBreakdown: priceVolume
    };
    triggerFileDownload(JSON.stringify(payload, null, 2), `${baseFilename}.json`, 'application/json;charset=utf-8;');
    return { count: rows.length, filename: `${baseFilename}.json` };
  }

  // Helper to build sheet objects for each dataset type
  const buildTransactionsSheet = (sourceRows, sheetTitle = 'Floorsheet Transactions') => {
    const headers = [
      'Contract ID',
      'Date',
      'Symbol',
      'Buyer Broker #',
      'Buyer Broker Name',
      'Seller Broker #',
      'Seller Broker Name',
      'Quantity',
      'Rate (Rs)',
      'Amount (Rs)',
      'Trade Type'
    ];
    let sumQty = 0;
    let sumAmt = 0;
    const tableRows = sourceRows.map((r, i) => {
      const qty = Number(r.qty || r.quantity || 0);
      const rate = Number(r.rate || 0);
      const amt = +Number(r.amount || (qty * rate) || 0).toFixed(2);
      const bb = String(r.buyerBroker || r.buyer || '').trim();
      const sb = String(r.sellerBroker || r.seller || '').trim();
      const bbName = r.buyerBrokerName || getBrokerName(bb);
      const sbName = r.sellerBrokerName || getBrokerName(sb);
      const isSelf = bb && sb && bb === sb;
      const isBulk = qty >= 500 || amt >= 250000;
      const tradeType = isSelf ? 'Self-Matched (Cross)' : isBulk ? 'Bulk / Block Deal' : 'Regular';
      sumQty += qty;
      sumAmt += amt;
      return [
        String(r.contractId || r.id || (i + 1)),
        String(r.businessDate || r.date || fullData?.businessDate || date || ''),
        String(r.symbol || r.stockSymbol || sym),
        bb,
        bbName,
        sb,
        sbName,
        qty,
        rate,
        amt,
        tradeType
      ];
    });
    const avgVwap = sumQty > 0 ? +(sumAmt / sumQty).toFixed(2) : 0;
    if (tableRows.length > 0) {
      tableRows.push(['TOTAL', `${tableRows.length} Trades`, sym, '', '', '', '', sumQty, avgVwap, +sumAmt.toFixed(2), 'VWAP / Session Total']);
    }
    return { name: sheetTitle, headers, rows: tableRows, metaRows };
  };

  const buildBrokerSummarySheet = (sourceRows) => {
    const brokers = computeBrokerSummaryFromRows(sourceRows);
    const headers = [
      'Broker #',
      'Broker Name',
      'Buy Qty',
      'Buy Amount (Rs)',
      'Avg Buy Price',
      'Buy Share %',
      'Sell Qty',
      'Sell Amount (Rs)',
      'Avg Sell Price',
      'Sell Share %',
      'Hold / Net Qty',
      'Hold / Net Amount (Rs)',
      'Matched (Self) Qty',
      'Total Traded Qty',
      'Buy %',
      'Sell %',
      'Position Role'
    ];
    let totBuyQ = 0, totBuyA = 0, totSellQ = 0, totSellA = 0, totMatchQ = 0;
    const tableRows = brokers.map(b => {
      totBuyQ += b.buyQty;
      totBuyA += b.buyAmt;
      totSellQ += b.sellQty;
      totSellA += b.sellAmt;
      totMatchQ += b.matchedQty;
      return [
        b.brokerId,
        b.brokerName,
        b.buyQty,
        b.buyAmt,
        b.avgBuyRate,
        b.buyMktShare,
        b.sellQty,
        b.sellAmt,
        b.avgSellRate,
        b.sellMktShare,
        b.holdQty,
        b.holdAmt,
        b.matchedQty,
        b.totalQty,
        b.buyPct,
        b.sellPct,
        b.role
      ];
    });
    if (tableRows.length > 0) {
      const vwapB = totBuyQ > 0 ? +(totBuyA / totBuyQ).toFixed(2) : 0;
      const vwapS = totSellQ > 0 ? +(totSellA / totSellQ).toFixed(2) : 0;
      tableRows.push([
        'TOTAL',
        `${brokers.length} Active Brokers`,
        totBuyQ,
        +totBuyA.toFixed(2),
        vwapB,
        100,
        totSellQ,
        +totSellA.toFixed(2),
        vwapS,
        100,
        totBuyQ - totSellQ,
        +(totBuyA - totSellA).toFixed(2),
        totMatchQ,
        totBuyQ + totSellQ,
        50,
        50,
        'Session Aggregate'
      ]);
    }
    return { name: 'Broker Summary', headers, rows: tableRows, metaRows };
  };

  const buildDateWiseBrokerSheet = (sourceRows) => {
    const dwRows = computeDateWiseBrokerRows(sourceRows, sym);
    const headers = [
      'Date',
      'Symbol',
      'Broker #',
      'Broker Name',
      'Buy Qty',
      'Buy Amount (Rs)',
      'Avg Buy Price',
      'Sell Qty',
      'Sell Amount (Rs)',
      'Avg Sell Price',
      'Hold / Net Qty',
      'Hold / Net Amount (Rs)',
      'Self-Matched Qty',
      'Total Volume'
    ];
    const tableRows = dwRows.map(d => [
      d.date,
      d.symbol,
      d.brokerId,
      d.brokerName,
      d.buyQty,
      d.buyAmt,
      d.avgBuy,
      d.sellQty,
      d.sellAmt,
      d.avgSell,
      d.holdQty,
      d.holdAmt,
      d.matchedQty,
      d.totalQty
    ]);
    return { name: 'Date-Wise Brokers', headers, rows: tableRows, metaRows };
  };

  const buildPriceVolumeSheet = (sourceRows) => {
    const pvRows = computePriceVolumeFromRows(sourceRows);
    const headers = ['Price (Rs)', 'Transactions', 'Traded Quantity', 'Turnover Amount (Rs)', '% of Total Volume'];
    let totT = 0, totQ = 0, totA = 0;
    const tableRows = pvRows.map(p => {
      totT += p.trades;
      totQ += p.qty;
      totA += p.amount;
      return [p.rate, p.trades, p.qty, p.amount, p.pctQty];
    });
    if (tableRows.length > 0) {
      const vwap = totQ > 0 ? +(totA / totQ).toFixed(2) : 0;
      tableRows.push(['TOTAL / VWAP', totT, totQ, +totA.toFixed(2), 100]);
      tableRows.push(['Session VWAP', '', '', vwap, '']);
    }
    return { name: 'Price vs Volume', headers, rows: tableRows, metaRows };
  };

  const bulkFilteredRows = rows.filter(r => Number(r.qty || r.quantity || 0) >= 200 || Number(r.amount || 0) >= 100000);

  // Multi-Sheet Excel (.xls) Export
  if (format === 'xls' || dataset === 'all_in_one') {
    let sheets = [];
    if (dataset === 'all_in_one' || format === 'xls') {
      const primarySheet =
        dataset === 'broker_summary' ? buildBrokerSummarySheet(rows) :
        dataset === 'date_wise_brokers' ? buildDateWiseBrokerSheet(rows) :
        dataset === 'bulk' ? buildTransactionsSheet(bulkFilteredRows, 'Bulk Block Deals') :
        dataset === 'price_volume' ? buildPriceVolumeSheet(rows) :
        buildTransactionsSheet(rows, 'Floorsheet Transactions');

      sheets = [
        primarySheet,
        ...(dataset !== 'broker_summary' ? [buildBrokerSummarySheet(rows)] : []),
        ...(dataset !== 'date_wise_brokers' ? [buildDateWiseBrokerSheet(rows)] : []),
        ...(dataset !== 'price_volume' ? [buildPriceVolumeSheet(rows)] : []),
        ...(dataset !== 'bulk' && bulkFilteredRows.length > 0 ? [buildTransactionsSheet(bulkFilteredRows, 'Bulk Block Deals')] : []),
        ...(dataset !== 'transactions' ? [buildTransactionsSheet(rows, 'Floorsheet Transactions')] : [])
      ];
    }
    const xml = buildExcelWorkbookXml(sheets);
    const filename = `${baseFilename}.xls`;
    triggerFileDownload(xml, filename, 'application/vnd.ms-excel;charset=utf-8;');
    return { count: rows.length, filename };
  }

  // Single-Dataset CSV Export
  let activeSheet;
  if (dataset === 'broker_summary') {
    activeSheet = buildBrokerSummarySheet(rows);
  } else if (dataset === 'date_wise_brokers') {
    activeSheet = buildDateWiseBrokerSheet(rows);
  } else if (dataset === 'bulk') {
    activeSheet = buildTransactionsSheet(bulkFilteredRows, 'Bulk Block Deals');
  } else if (dataset === 'price_volume') {
    activeSheet = buildPriceVolumeSheet(rows);
  } else {
    activeSheet = buildTransactionsSheet(rows, 'Floorsheet Transactions');
  }

  const csvContent = buildCsvContent(activeSheet.headers, activeSheet.rows, metaRows);
  const filename = `${baseFilename}.csv`;
  triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
  return { count: activeSheet.rows.length, filename };
}

/**
 * Exports Broker Analysis data (Broker Summary, Top Holdings/Buyers/Sellers, Date-Wise Sessions, Date-Wise Broker Matrix)
 * directly from StockBrokerAnalysisTab.
 */
export async function exportBrokerAnalysisReport({
  symbol = '',
  brokerData = null,
  selectedDays = 1,
  selectedDate = '',
  filterQuery = '',
  dataset = 'brokers', // 'brokers' | 'date_wise_brokers' | 'daily_sessions' | 'full_workbook'
  format = 'csv'       // 'csv' | 'xls' | 'json'
} = {}) {
  const sym = String(symbol || brokerData?.symbol || 'NEPSE').toUpperCase().trim();
  let data = brokerData;
  if (!data || (!Array.isArray(data.brokers) && !Array.isArray(data.topBuyers))) {
    data = await fetchRealBrokerAnalysis(sym, selectedDays, { date: selectedDate });
  }

  const dateScope = selectedDate
    || (data?.fromDate && data?.toDate && data.fromDate !== data.toDate
      ? `${data.fromDate}_to_${data.toDate}`
      : (data?.businessDate || `${selectedDays}D`));

  const filterSuffix = filterQuery ? `_Filter-${filterQuery.trim()}` : '';
  const baseFilename = `${sym}_BrokerAnalysis_${dataset.toUpperCase()}_${dateScope}${filterSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const q = filterQuery.trim().toLowerCase();
  const rawBrokers = Array.isArray(data?.brokers) ? data.brokers : [];
  const filteredBrokers = q
    ? rawBrokers.filter(b =>
        String(b.brokerId || b.broker || '').toLowerCase().includes(q) ||
        String(b.brokerName || getBrokerName(b.brokerId || b.broker)).toLowerCase().includes(q)
      )
    : rawBrokers;

  const dailyFlow = Array.isArray(data?.dailyFlow) ? data.dailyFlow : [];

  const metaRows = [
    ['Report Title', `${sym} Institutional Broker Analysis & Date-Wise Flow Report`],
    ['Symbol', sym],
    ['Date / Horizon', dateScope],
    ['Trading Days', String(data?.tradingDays || dailyFlow.length || selectedDays || 1)],
    ['Institutional Signal', `${data?.adSignal || 'Neutral'} (A/D Ratio: ${data?.adRatio ?? 0})`],
    ['Broker Filter', filterQuery ? filterQuery : 'All Active Brokers'],
    ['Exported At', new Date().toISOString()]
  ];

  if (format === 'json') {
    const payload = {
      meta: {
        symbol: sym,
        dateScope,
        tradingDays: data?.tradingDays || dailyFlow.length || 1,
        adSignal: data?.adSignal,
        adRatio: data?.adRatio,
        totalVolume: data?.totalVolume || 0,
        totalAmount: data?.totalAmount || 0,
        totalTrades: data?.totalTrades || 0,
        exportedAt: new Date().toISOString()
      },
      brokers: filteredBrokers,
      topHoldings: data?.topHoldings || [],
      topBuyers: data?.topBuyers || [],
      topSellers: data?.topSellers || [],
      dailyFlow
    };
    triggerFileDownload(JSON.stringify(payload, null, 2), `${baseFilename}.json`, 'application/json;charset=utf-8;');
    return { count: filteredBrokers.length, filename: `${baseFilename}.json` };
  }

  // Sheet 1: Broker Summary
  const brokerHeaders = [
    'Broker #',
    'Broker Name',
    'Buy Qty',
    'Buy Amount (Rs)',
    'Avg Buy Price',
    'Buy Market Share %',
    'Sell Qty',
    'Sell Amount (Rs)',
    'Avg Sell Price',
    'Sell Market Share %',
    'Hold / Net Qty',
    'Hold / Net Amount (Rs)',
    'Matched (Self-Trade) Qty',
    'Total Traded Qty',
    'Buy %',
    'Sell %',
    'Net Position'
  ];

  let sumBuyQ = 0, sumBuyA = 0, sumSellQ = 0, sumSellA = 0, sumMatchQ = 0;
  const brokerRows = filteredBrokers.map(b => {
    const id = String(b.brokerId || b.broker || '');
    const name = b.brokerName || getBrokerName(id);
    const buyQ = Number(b.buyQty || b.buyVolume || 0);
    const buyA = +Number(b.buyAmt || b.buyAmount || 0).toFixed(2);
    const avgB = buyQ > 0 ? +Number(b.avgBuyRate || (buyA / buyQ)).toFixed(2) : 0;
    const buySh = Number(b.buyMktShare || 0);
    const sellQ = Number(b.sellQty || b.sellVolume || 0);
    const sellA = +Number(b.sellAmt || b.sellAmount || 0).toFixed(2);
    const avgS = sellQ > 0 ? +Number(b.avgSellRate || (sellA / sellQ)).toFixed(2) : 0;
    const sellSh = Number(b.sellMktShare || 0);
    const holdQ = Number(b.holdQty !== undefined ? b.holdQty : (b.netQty !== undefined ? b.netQty : (buyQ - sellQ)));
    const holdA = +Number(b.holdAmt !== undefined ? b.holdAmt : (b.netAmt !== undefined ? b.netAmt : (buyA - sellA))).toFixed(2);
    const matchQ = Number(b.matchedQty || 0);
    const totQ = buyQ + sellQ;
    const buyP = totQ > 0 ? Math.round((buyQ / totQ) * 100) : 0;
    const sellP = totQ > 0 ? (100 - buyP) : 0;
    const pos = holdQ > 0 ? 'Accumulating (Hold)' : holdQ < 0 ? 'Distributing (Sell)' : 'Neutral';

    sumBuyQ += buyQ;
    sumBuyA += buyA;
    sumSellQ += sellQ;
    sumSellA += sellA;
    sumMatchQ += matchQ;

    return [id, name, buyQ, buyA, avgB, buySh, sellQ, sellA, avgS, sellSh, holdQ, holdA, matchQ, totQ, buyP, sellP, pos];
  });

  if (brokerRows.length > 0) {
    brokerRows.push([
      'TOTAL',
      `${brokerRows.length} Brokers`,
      sumBuyQ,
      +sumBuyA.toFixed(2),
      sumBuyQ > 0 ? +(sumBuyA / sumBuyQ).toFixed(2) : 0,
      100,
      sumSellQ,
      +sumSellA.toFixed(2),
      sumSellQ > 0 ? +(sumSellA / sumSellQ).toFixed(2) : 0,
      100,
      sumBuyQ - sumSellQ,
      +(sumBuyA - sumSellA).toFixed(2),
      sumMatchQ,
      sumBuyQ + sumSellQ,
      50,
      50,
      'Aggregate'
    ]);
  }

  // Sheet 2: Date-Wise Per-Broker Breakdown
  const dwHeaders = [
    'Date',
    'Symbol',
    'Broker #',
    'Broker Name',
    'Buy Qty',
    'Buy Amount (Rs)',
    'Avg Buy Price',
    'Sell Qty',
    'Sell Amount (Rs)',
    'Avg Sell Price',
    'Hold / Net Qty',
    'Hold / Net Amount (Rs)',
    'Matched Qty',
    'Session VWAP'
  ];
  const dwRows = [];
  dailyFlow.forEach(df => {
    const dayBrks = Array.isArray(df.brokers) ? df.brokers : [];
    const matchingDayBrks = q
      ? dayBrks.filter(b =>
          String(b.brokerId || '').toLowerCase().includes(q) ||
          String(b.brokerName || getBrokerName(b.brokerId)).toLowerCase().includes(q)
        )
      : dayBrks;

    matchingDayBrks.forEach(b => {
      const bq = Number(b.buyQty || 0);
      const ba = +Number(b.buyAmt || 0).toFixed(2);
      const sq = Number(b.sellQty || 0);
      const sa = +Number(b.sellAmt || 0).toFixed(2);
      const nq = Number(b.netQty !== undefined ? b.netQty : (bq - sq));
      const na = +Number(b.netAmt !== undefined ? b.netAmt : (ba - sa)).toFixed(2);
      dwRows.push([
        df.date || '',
        sym,
        String(b.brokerId || ''),
        b.brokerName || getBrokerName(b.brokerId),
        bq,
        ba,
        Number(b.avgBuyRate || (bq > 0 ? +(ba / bq).toFixed(2) : 0)),
        sq,
        sa,
        Number(b.avgSellRate || (sq > 0 ? +(sa / sq).toFixed(2) : 0)),
        nq,
        na,
        Number(b.matchedQty || 0),
        Number(df.vwap || 0)
      ]);
    });
  });

  // Sheet 3: Date-Wise Daily Session Summary
  const sessionHeaders = [
    'Date',
    'Symbol',
    'Traded Volume',
    'Turnover Amount (Rs)',
    'Total Transactions',
    'Session VWAP (Rs)',
    'Matched (Self) Volume',
    'Top Buyer Broker',
    'Top Buyer Qty',
    'Top Seller Broker',
    'Top Seller Qty',
    'Top Holder Broker',
    'Top Holder Net Qty',
    'Top-3 Net Institutional Flow'
  ];
  const sessionRows = dailyFlow.map(df => [
    df.date || '',
    sym,
    Number(df.buyVol || 0),
    +Number(df.turnover || 0).toFixed(2),
    Number(df.totalTrades || 0),
    Number(df.vwap || 0),
    Number(df.matchedVol || 0),
    df.topBuyer ? `#${df.topBuyer.brokerId} ${getBrokerName(df.topBuyer.brokerId)}` : '—',
    Number(df.topBuyer?.buyQty || 0),
    df.topSeller ? `#${df.topSeller.brokerId} ${getBrokerName(df.topSeller.brokerId)}` : '—',
    Number(df.topSeller?.sellQty || 0),
    df.topHolder ? `#${df.topHolder.brokerId} ${getBrokerName(df.topHolder.brokerId)}` : '—',
    Number(df.topHolder?.netQty || 0),
    Number(df.netFlow || 0)
  ]);

  if (format === 'xls' || dataset === 'full_workbook') {
    const sheets = [
      { name: 'Broker Summary', headers: brokerHeaders, rows: brokerRows, metaRows },
      { name: 'Date-Wise Broker Flow', headers: dwHeaders, rows: dwRows, metaRows },
      { name: 'Daily Session Summary', headers: sessionHeaders, rows: sessionRows, metaRows }
    ];
    const xml = buildExcelWorkbookXml(sheets);
    const filename = `${baseFilename}.xls`;
    triggerFileDownload(xml, filename, 'application/vnd.ms-excel;charset=utf-8;');
    return { count: brokerRows.length, filename };
  }

  let activeHeaders = brokerHeaders;
  let activeRows = brokerRows;
  if (dataset === 'date_wise_brokers') {
    activeHeaders = dwHeaders;
    activeRows = dwRows;
  } else if (dataset === 'daily_sessions') {
    activeHeaders = sessionHeaders;
    activeRows = sessionRows;
  }

  const csvContent = buildCsvContent(activeHeaders, activeRows, metaRows);
  const filename = `${baseFilename}.csv`;
  triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
  return { count: activeRows.length, filename };
}

/**
 * Exports Price History (Date-Wise OHLCV + Change % + Turnover) for a stock.
 */
export function exportStockPriceHistory({
  symbol = '',
  historyRows = [],
  timeframe = '1Y',
  filterDate = '',
  format = 'csv'
} = {}) {
  const sym = String(symbol || 'NEPSE').toUpperCase().trim();
  const scopeLabel = filterDate || timeframe || 'ALL';
  const baseFilename = `${sym}_PriceHistory_${scopeLabel}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const headers = ['Date', 'Symbol', 'Open (Rs)', 'High (Rs)', 'Low (Rs)', 'Close (Rs)', 'Change %', 'Volume (Qty)', 'Turnover (Rs)'];
  const reversed = [...(historyRows || [])].reverse();
  const display = filterDate
    ? reversed.filter(h => String(h.date || '').startsWith(filterDate))
    : reversed;

  const rows = display.map(h => {
    const prevRow = reversed[reversed.indexOf(h) + 1];
    const prevCl = Number(prevRow?.close || h.open || h.close || 0);
    const chPct = prevCl > 0 ? +(((Number(h.close) - prevCl) / prevCl) * 100).toFixed(2) : 0;
    const turnoverVal = +Number(h.turnover || (Number(h.close || 0) * Number(h.volume || 0))).toFixed(2);
    return [
      String(h.date || ''),
      sym,
      Number(h.open || 0),
      Number(h.high || 0),
      Number(h.low || 0),
      Number(h.close || 0),
      chPct,
      Number(h.volume || 0),
      turnoverVal
    ];
  });

  const metaRows = [
    ['Report Title', `${sym} Official Historical Price & Volume (OHLCV)`],
    ['Symbol', sym],
    ['Timeframe / Date Filter', scopeLabel],
    ['Total Sessions', String(rows.length)],
    ['Exported At', new Date().toISOString()]
  ];

  if (format === 'xls') {
    const xml = buildExcelWorkbookXml([{ name: `${sym} Price History`, headers, rows, metaRows }]);
    triggerFileDownload(xml, `${baseFilename}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
    return { count: rows.length, filename: `${baseFilename}.xls` };
  }

  const csvContent = buildCsvContent(headers, rows, metaRows);
  triggerFileDownload(csvContent, `${baseFilename}.csv`, 'text/csv;charset=utf-8;');
  return { count: rows.length, filename: `${baseFilename}.csv` };
}

/**
 * Exports Market-Wide Broker Surveillance data from BrokerFlowDominanceService.tsx
 * (Broker Flow Leaderboard, Specific Broker Scrip Breakdown, Stock Dominance, or Matching Block Deals).
 */
export function exportMarketBrokerSurveillance({
  mode = 'flow', // 'flow' | 'dominance' | 'top10' | 'matching' | 'broker_scrips'
  timeframe = '1D',
  sessionDate = '',
  brokerFlowList = [],
  dominanceList = [],
  matchingDeals = [],
  selectedBroker = null,
  format = 'csv'
} = {}) {
  const dtLabel = sessionDate || new Date().toISOString().split('T')[0];
  const baseFilename = `NEPSE_Market_${mode.toUpperCase()}_${timeframe}_${dtLabel}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const metaRows = [
    ['Report Title', `NEPSE Market-Wide Broker Surveillance (${mode.toUpperCase()})`],
    ['Timeframe', timeframe],
    ['Session Date', dtLabel],
    ['Exported At', new Date().toISOString()]
  ];

  const buildFlowSheet = () => {
    const headers = ['Broker #', 'Broker Name', 'Buy Amount (Rs)', 'Sell Amount (Rs)', 'Net Flow (Rs)', 'Total Trades', 'Top Traded Stock', 'Institutional Bias', 'Top Accumulated Scrips', 'Top Distributed Scrips'];
    const rows = (brokerFlowList || []).map(b => [
      b.brokerId,
      b.brokerName,
      Number(b.buyAmount || 0),
      Number(b.sellAmount || 0),
      Number(b.netFlow || 0),
      Number(b.totalTrades || 0),
      b.topStock || '—',
      b.bias || 'Neutral',
      (b.topAccumulation || []).slice(0, 5).map(s => `${s.symbol} (+Rs.${Math.round(s.netFlow / 100000)}L)`).join(' | '),
      (b.topDistribution || []).slice(0, 5).map(s => `${s.symbol} (Rs.${Math.round(s.netFlow / 100000)}L)`).join(' | ')
    ]);
    return { name: 'Market Broker Flow', headers, rows, metaRows };
  };

  const buildDominanceSheet = () => {
    const headers = ['Symbol', 'Company Name', 'LTP (Rs)', 'Change %', 'Turnover (Rs)', 'Lead Broker #', 'Lead Broker Name', 'Dominance %', 'Top-3 Buy %', 'Top-3 Sell %', 'Cornering Status', 'Smart Money Verdict', 'Top Buyers', 'Top Sellers'];
    const rows = (dominanceList || []).map(d => [
      d.symbol,
      d.name,
      Number(d.ltp || 0),
      Number(d.pChange || 0),
      Number(d.turnover || 0),
      d.topBrokerId,
      d.topBrokerName,
      Number(d.dominancePct || 0),
      Number(d.top3BuyPct || 0),
      Number(d.top3SellPct || 0),
      d.status || '',
      d.smartMoneyVerdict || '',
      (d.buyerBrokers || []).join(', '),
      (d.sellerBrokers || []).join(', ')
    ]);
    return { name: 'Stock Broker Dominance', headers, rows, metaRows };
  };

  const buildMatchingSheet = () => {
    const headers = ['Contract / Deal ID', 'Date', 'Time', 'Symbol', 'Buyer Broker #', 'Buyer Broker Name', 'Seller Broker #', 'Seller Broker Name', 'Quantity', 'Rate (Rs)', 'Amount (Rs)', 'Deal Classification'];
    const rows = (matchingDeals || []).map(m => [
      m.id,
      m.date || dtLabel,
      m.time || '',
      m.symbol,
      m.buyerBroker,
      getBrokerName(m.buyerBroker),
      m.sellerBroker,
      getBrokerName(m.sellerBroker),
      Number(m.quantity || 0),
      Number(m.rate || 0),
      Number(m.amount || 0),
      m.type || 'Block Deal'
    ]);
    return { name: 'Matching & Block Deals', headers, rows, metaRows };
  };

  const buildBrokerScripsSheet = (brk) => {
    const target = brk || selectedBroker;
    const headers = ['Broker #', 'Broker Name', 'Category', 'Symbol', 'Company Name', 'Buy Amount (Rs)', 'Sell Amount (Rs)', 'Net Flow (Rs)', 'Flow Bias'];
    const rows = [];
    if (target) {
      (target.topAccumulation || []).forEach(s => {
        rows.push([target.brokerId, target.brokerName, 'Accumulation', s.symbol, s.name || s.symbol, s.buyAmount, s.sellAmount, s.netFlow, s.bias]);
      });
      (target.topDistribution || []).forEach(s => {
        rows.push([target.brokerId, target.brokerName, 'Distribution', s.symbol, s.name || s.symbol, s.buyAmount, s.sellAmount, s.netFlow, s.bias]);
      });
    }
    return { name: target ? `Broker ${target.brokerId} Scrips` : 'Broker Scrips', headers, rows, metaRows };
  };

  if (format === 'xls') {
    const sheets = [
      ...(selectedBroker ? [buildBrokerScripsSheet(selectedBroker)] : []),
      buildFlowSheet(),
      buildDominanceSheet(),
      buildMatchingSheet()
    ];
    const xml = buildExcelWorkbookXml(sheets);
    triggerFileDownload(xml, `${baseFilename}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
    return { filename: `${baseFilename}.xls` };
  }

  let sheet;
  if (mode === 'broker_scrips' && selectedBroker) {
    sheet = buildBrokerScripsSheet(selectedBroker);
  } else if (mode === 'dominance') {
    sheet = buildDominanceSheet();
  } else if (mode === 'matching') {
    sheet = buildMatchingSheet();
  } else {
    sheet = buildFlowSheet();
  }

  const csvContent = buildCsvContent(sheet.headers, sheet.rows, metaRows);
  triggerFileDownload(csvContent, `${baseFilename}.csv`, 'text/csv;charset=utf-8;');
  return { filename: `${baseFilename}.csv` };
}
