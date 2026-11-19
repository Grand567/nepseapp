/**
 * Neutralizes spreadsheet formula injection (CSV/Excel DDE) on string cells
 * while leaving real numbers and plain negative numbers intact.
 */
export function sanitizeSpreadsheetCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
  const str = String(val);
  if (/^[\t\r\n ]*[=+@-]/.test(str) && !/^\s*-\d+(\.\d+)?\s*$/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapes a single CSV cell value safely.
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = sanitizeSpreadsheetCell(val);
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
      lines.push(c.map(escapeCsvCell).join(','));
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
export function escapeXml(val) {
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
        return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetCell(cell))}</Data></Cell>`;
      }).join('');
      return `<Row ss:Height="18">${cells}</Row>`;
    }).join('\n');

    const spacerRowXml = (sheet.metaRows && sheet.metaRows.length > 0) ? '<Row ss:Height="10"></Row>' : '';

    const headerCellsXml = (sheet.headers || []).map(h => (
      `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetCell(h))}</Data></Cell>`
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
        return `<Cell ss:StyleID="${isTotalRow ? 'sTotalText' : 'sText'}"><Data ss:Type="String">${escapeXml(sanitizeSpreadsheetCell(cell))}</Data></Cell>`;
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
