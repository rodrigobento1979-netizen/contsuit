import React from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReportColumnLike {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (val: any, row?: any) => React.ReactNode;
  isMonetary?: boolean;
  getNumericValue?: (row: any) => number;
}

export interface ReportPage<T = any> {
  pageNumber: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  rows: T[];
  pageTotals: Record<string, number>;
}

const NON_MONETARY_KEY_REGEX =
  /^(id|tagNumber|code|cnpj|cpf|date|acquisitionDate|depreciationStartDate|competenceMonth|annualRate|monthlyRate|usefulLifeMonths|usefulLifeYears|dueDay|transactionsCount|status|type|nature|group|category|categoryLabel|categoryTag|description|name|fantasyName|email|contactEmail|createdByEmail|phone|agency|accountNumber|accountingSystem|costCenter|location|supplier|invoiceNumber|fitid|memo|history|period|lastPaymentStatus)$/i;

const NON_MONETARY_KEY_SUBSTR_REGEX =
  /rate|taxa|percent|dueDay|vencimento|count|usefulLife|months|tagNumber|cnpj|cpf/i;

const NON_MONETARY_LABEL_REGEX =
  /%|taxa|vencimento|\bdia\b|\bqtd\b|lan[çc]amentos|vida\s*[úu]til|meses|\bano\b/i;

const MONETARY_KEY_REGEX =
  /acquisitionValue|residualValue|depreciableValue|monthlyDepreciation|periodDepreciation|previousAccumulatedDepreciation|currentAccumulatedDepreciation|accumulatedDepreciation|netBookValue|monthlyFee|totalCredits|totalDebits|openingBalance|closingBalance|salePrice|gainOrLoss|amount|valor|value|price|fee|honorario|saldo|cota|quota|deprec|debit|credit|balance|acumulada|vcl/i;

const MONETARY_LABEL_REGEX =
  /\(R\$\)|R\$|\bvalor\b|\bvlr\b|aquisi[çc][ãa]o|deprec|acumulad|residual|\bvcl\b|cota|quota|mensalidade|entrada|sa[íi]da|saldo|d[ée]bito|cr[ée]dito|pre[çc]o/i;

export function roundCurrency(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 0.005 ? 0 : rounded;
}

export function formatCurrencyBRL(value: number): string {
  const normalized = roundCurrency(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(normalized);
}

export function parseMonetaryValue(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val !== 'string') return null;

  const trimmed = val.trim();
  if (!trimmed || trimmed === '-' || trimmed === 'N/D') return null;

  const isNegative = /^-|^\(|-\s*R\$|R\$\s*-/.test(trimmed);
  let cleaned = trimmed.replace(/[^0-9.,]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -parsed : parsed;
}

export function isMonetaryColumn(col: ReportColumnLike, rows?: any[]): boolean {
  if (col.isMonetary !== undefined) return col.isMonetary;
  if (col.getNumericValue) return true;

  if (
    NON_MONETARY_KEY_REGEX.test(col.key) ||
    NON_MONETARY_KEY_SUBSTR_REGEX.test(col.key) ||
    NON_MONETARY_LABEL_REGEX.test(col.label)
  ) {
    return false;
  }

  const matchesName =
    MONETARY_KEY_REGEX.test(col.key) || MONETARY_LABEL_REGEX.test(col.label);
  if (!matchesName) return false;

  if (rows && rows.length > 0) {
    return rows.some((row) => extractRowColumnNumericValue(row, col) !== null);
  }
  return true;
}

export function extractRowColumnNumericValue(
  row: any,
  col: ReportColumnLike
): number | null {
  if (!row) return null;
  if (col.getNumericValue) {
    const val = col.getNumericValue(row);
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
  }

  let raw = row[col.key];
  if (
    raw === undefined &&
    col.key === 'periodDepreciation' &&
    row.monthlyDepreciation !== undefined
  ) {
    raw = row.monthlyDepreciation;
  }

  return parseMonetaryValue(raw);
}

export function calculateMonetaryTotals(
  rows: any[],
  columns: ReportColumnLike[],
  monetaryColKeys?: Set<string>
): Record<string, number> {
  const totals: Record<string, number> = {};
  if (!Array.isArray(rows) || rows.length === 0) return totals;

  columns.forEach((col) => {
    const isMon = monetaryColKeys
      ? monetaryColKeys.has(col.key)
      : isMonetaryColumn(col, rows);
    if (!isMon) return;

    let sum = 0;
    let validCount = 0;
    for (const row of rows) {
      const num = extractRowColumnNumericValue(row, col);
      if (num !== null) {
        sum += num;
        validCount++;
      }
    }
    totals[col.key] = validCount > 0 ? roundCurrency(sum) : 0;
  });

  return totals;
}

export function paginateReportData<T = any>(
  data: T[],
  columns: ReportColumnLike[],
  rowsPerPage: number
): {
  pages: ReportPage<T>[];
  grandTotals: Record<string, number>;
  monetaryKeys: Set<string>;
} {
  const safeRowsPerPage = Math.max(1, Math.floor(rowsPerPage || 12));
  const safeData = Array.isArray(data) ? data : [];

  const monetaryKeys = new Set<string>();
  columns.forEach((col) => {
    if (isMonetaryColumn(col, safeData)) {
      monetaryKeys.add(col.key);
    }
  });

  const grandTotals = calculateMonetaryTotals(safeData, columns, monetaryKeys);

  if (safeData.length === 0) {
    return {
      pages: [
        {
          pageNumber: 1,
          totalPages: 1,
          startIndex: 0,
          endIndex: 0,
          rows: [],
          pageTotals: {},
        },
      ],
      grandTotals,
      monetaryKeys,
    };
  }

  const totalPages = Math.ceil(safeData.length / safeRowsPerPage);
  const pages: ReportPage<T>[] = [];

  for (let i = 0; i < totalPages; i++) {
    const startIndex = i * safeRowsPerPage;
    const endIndex = Math.min(startIndex + safeRowsPerPage, safeData.length);
    const pageRows = safeData.slice(startIndex, endIndex);
    const pageTotals = calculateMonetaryTotals(pageRows, columns, monetaryKeys);

    pages.push({
      pageNumber: i + 1,
      totalPages,
      startIndex,
      endIndex,
      rows: pageRows,
      pageTotals,
    });
  }

  return { pages, grandTotals, monetaryKeys };
}

export function reactNodeToPlainText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(reactNodeToPlainText).join('');
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } | null;
    return reactNodeToPlainText(props?.children);
  }
  return String(node);
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PrintHtmlOptions {
  documentTitle: string;
  orientation?: 'portrait' | 'landscape';
  bodyHtml: string;
  extraCss?: string;
}

/**
 * Prints an isolated, paginated A4 HTML document via an offscreen full-size iframe,
 * replacing raw browser screen printing (window.print() over app chrome).
 */
export function printCleanHtmlDocument({
  documentTitle,
  orientation = 'landscape',
  bodyHtml,
  extraCss = '',
}: PrintHtmlOptions): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.getElementById('contsuite-isolated-print-frame');
    if (existing) {
      existing.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'contsuite-isolated-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.left = '-20000px';
    iframe.style.top = '0';
    iframe.style.width = orientation === 'landscape' ? '1122px' : '794px';
    iframe.style.height = orientation === 'landscape' ? '794px' : '1122px';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    iframe.style.pointerEvents = 'none';

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 8mm 8mm 10mm 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.3;
    }
    .report-page {
      width: 100%;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .report-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .report-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .brand-badge {
      background: #0f172a;
      color: #ffffff;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 9.5px;
      font-weight: 700;
      color: #334155;
    }
    .report-title {
      margin: 4px 0 2px 0;
      font-size: 13.5px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      color: #0f172a;
    }
    .report-subtitle {
      margin: 0;
      font-size: 9.5px;
      font-weight: 600;
      color: #475569;
    }
    .company-meta {
      text-align: right;
      font-size: 9px;
      color: #334155;
      white-space: nowrap;
    }
    .company-name {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 1px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 4px;
      padding: 4px 7px;
    }
    .summary-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      display: block;
    }
    .summary-value {
      font-size: 10.5px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 1px;
      display: block;
    }
    .table-wrap {
      border: 1px solid #94a3b8;
      border-radius: 4px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th {
      background: #e2e8f0;
      color: #0f172a;
      font-weight: 800;
      font-size: 8.5px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      padding: 5px 6px;
      border-bottom: 2px solid #94a3b8;
      border-right: 1px solid #cbd5e1;
    }
    th:last-child, td:last-child {
      border-right: none;
    }
    td {
      padding: 4px 6px;
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      color: #0f172a;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td {
      background: #f8fafc;
    }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    tfoot tr.subtotal-row td {
      background: #f1f5f9;
      font-weight: 800;
      color: #0f172a;
      border-top: 2px solid #475569;
      border-bottom: 1px solid #94a3b8;
      padding: 5px 6px;
      font-size: 9px;
    }
    tfoot tr.grand-total-row td {
      background: #0f172a;
      color: #ffffff;
      font-weight: 900;
      border-top: 1px solid #0f172a;
      padding: 5.5px 6px;
      font-size: 9px;
    }
    .page-footer-totals {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 8.5px;
      color: #0f172a;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: space-between;
      align-items: center;
    }
    .page-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #475569;
    }
    ${extraCss}
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 400);
    };

    document.body.appendChild(iframe);

    const triggerPrint = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.onafterprint = cleanup;
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } finally {
            setTimeout(cleanup, 3000);
          }
        }, 80);
      } catch {
        cleanup();
      }
    };

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(fullHtml);
      doc.close();
      triggerPrint();
    } else {
      iframe.onload = triggerPrint;
      iframe.srcdoc = fullHtml;
    }
  });
}

function toPdfSafeText(input: string): string {
  return String(input || '')
    .replace(/[•·]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateTextToFit(
  text: string,
  maxWidth: number,
  font: any,
  fontSize: number
): string {
  const safe = toPdfSafeText(text);
  if (!safe) return '';
  if (font.widthOfTextAtSize(safe, fontSize) <= maxWidth) return safe;
  let trimmed = safe;
  while (
    trimmed.length > 1 &&
    font.widthOfTextAtSize(trimmed + '...', fontSize) > maxWidth
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.length > 0 ? trimmed + '...' : '';
}

export interface GenerateReportPdfOptions {
  title: string;
  subtitle?: string;
  companyName: string;
  companyCnpj: string;
  generatedAt: string;
  userEmail?: string;
  orientation: 'portrait' | 'landscape';
  summaryMetrics?: { label: string; value: string | number }[];
  columns: ReportColumnLike[];
  pages: ReportPage[];
  grandTotals: Record<string, number>;
  monetaryKeys: Set<string>;
  totalRecords: number;
}

/**
 * Generates and downloads a real multi-page A4 PDF with automatic per-page
 * monetary subtotals in the footer of every page.
 */
export async function generateAndDownloadReportPdf(
  opts: GenerateReportPdfOptions
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 dimensions in PDF points (72 dpi)
  const pageWidth = opts.orientation === 'landscape' ? 841.89 : 595.28;
  const pageHeight = opts.orientation === 'landscape' ? 595.28 : 841.89;
  const marginX = 24;
  const marginTop = 24;
  const marginBottom = 24;
  const contentWidth = pageWidth - marginX * 2;

  // Compute proportional column widths
  const rawWeights = opts.columns.map((col) => {
    if (opts.monetaryKeys.has(col.key)) return 1.15;
    if (/description|name|memo|history|companyName/i.test(col.key)) return 2.1;
    if (/date|tagNumber|status|type|annualRate|dueDay/i.test(col.key)) return 0.85;
    return 1.1;
  });
  const totalWeight = rawWeights.reduce((acc, w) => acc + w, 0) || 1;
  const colWidths = rawWeights.map((w) => (w / totalWeight) * contentWidth);

  const hasMonetary = opts.monetaryKeys.size > 0;

  for (const pageData of opts.pages) {
    const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let cursorY = pageHeight - marginTop;

    // Header Badge + Title
    pdfPage.drawRectangle({
      x: marginX,
      y: cursorY - 14,
      width: 56,
      height: 14,
      color: rgb(0.06, 0.09, 0.16),
    });
    pdfPage.drawText('CONTSUITE', {
      x: marginX + 6,
      y: cursorY - 10,
      size: 7.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
    pdfPage.drawText(
      toPdfSafeText('Sistema Contábil Corporativo (CPC 27)'),
      {
        x: marginX + 62,
        y: cursorY - 10,
        size: 8,
        font: fontBold,
        color: rgb(0.2, 0.25, 0.33),
      }
    );

    // Company metadata (right)
    const compName = truncateTextToFit(
      opts.companyName,
      230,
      fontBold,
      9
    );
    const compW = fontBold.widthOfTextAtSize(compName, 9);
    pdfPage.drawText(compName, {
      x: pageWidth - marginX - compW,
      y: cursorY - 9,
      size: 9,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    const cnpjText = toPdfSafeText(`CNPJ: ${opts.companyCnpj}`);
    const cnpjW = fontRegular.widthOfTextAtSize(cnpjText, 7.5);
    pdfPage.drawText(cnpjText, {
      x: pageWidth - marginX - cnpjW,
      y: cursorY - 20,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.28, 0.33, 0.41),
    });

    const pageInfoText = toPdfSafeText(
      `Emissão: ${opts.generatedAt} | Pág. ${pageData.pageNumber} de ${pageData.totalPages}`
    );
    const pageInfoW = fontBold.widthOfTextAtSize(pageInfoText, 7.5);
    pdfPage.drawText(pageInfoText, {
      x: pageWidth - marginX - pageInfoW,
      y: cursorY - 30,
      size: 7.5,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16),
    });

    // Title & subtitle (left)
    cursorY -= 26;
    pdfPage.drawText(
      truncateTextToFit(opts.title.toUpperCase(), contentWidth - 240, fontBold, 11.5),
      {
        x: marginX,
        y: cursorY,
        size: 11.5,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16),
      }
    );

    if (opts.subtitle) {
      cursorY -= 12;
      pdfPage.drawText(
        truncateTextToFit(opts.subtitle, contentWidth - 240, fontRegular, 8),
        {
          x: marginX,
          y: cursorY,
          size: 8,
          font: fontRegular,
          color: rgb(0.28, 0.33, 0.41),
        }
      );
    }

    cursorY -= 8;
    pdfPage.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: pageWidth - marginX, y: cursorY },
      thickness: 1.5,
      color: rgb(0.06, 0.09, 0.16),
    });
    cursorY -= 10;

    // Summary metrics on page 1
    if (
      pageData.pageNumber === 1 &&
      opts.summaryMetrics &&
      opts.summaryMetrics.length > 0
    ) {
      const cardCount = Math.min(4, opts.summaryMetrics.length);
      const cardGap = 6;
      const cardWidth = (contentWidth - cardGap * (cardCount - 1)) / cardCount;
      const cardHeight = 28;

      opts.summaryMetrics.slice(0, 4).forEach((m, idx) => {
        const cx = marginX + idx * (cardWidth + cardGap);
        pdfPage.drawRectangle({
          x: cx,
          y: cursorY - cardHeight,
          width: cardWidth,
          height: cardHeight,
          color: rgb(0.97, 0.98, 0.99),
          borderColor: rgb(0.8, 0.84, 0.88),
          borderWidth: 0.7,
        });
        pdfPage.drawText(
          truncateTextToFit(m.label.toUpperCase(), cardWidth - 10, fontBold, 6.5),
          {
            x: cx + 5,
            y: cursorY - 10,
            size: 6.5,
            font: fontBold,
            color: rgb(0.39, 0.45, 0.55),
          }
        );
        pdfPage.drawText(
          truncateTextToFit(String(m.value), cardWidth - 10, fontBold, 8.5),
          {
            x: cx + 5,
            y: cursorY - 22,
            size: 8.5,
            font: fontBold,
            color: rgb(0.06, 0.09, 0.16),
          }
        );
      });
      cursorY -= cardHeight + 10;
    }

    // Table Header
    const headerHeight = 20;
    pdfPage.drawRectangle({
      x: marginX,
      y: cursorY - headerHeight,
      width: contentWidth,
      height: headerHeight,
      color: rgb(0.89, 0.91, 0.94),
      borderColor: rgb(0.58, 0.64, 0.72),
      borderWidth: 0.8,
    });

    let colX = marginX;
    opts.columns.forEach((col, cIdx) => {
      const cw = colWidths[cIdx];
      const label = truncateTextToFit(col.label.toUpperCase(), cw - 6, fontBold, 7);
      const textW = fontBold.widthOfTextAtSize(label, 7);
      const drawX =
        col.align === 'right'
          ? colX + cw - textW - 4
          : col.align === 'center'
          ? colX + Math.max(3, (cw - textW) / 2)
          : colX + 4;
      pdfPage.drawText(label, {
        x: drawX,
        y: cursorY - 13,
        size: 7,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16),
      });
      colX += cw;
    });
    cursorY -= headerHeight;

    // Table Rows
    const rowHeight = 18;
    if (pageData.rows.length === 0) {
      pdfPage.drawRectangle({
        x: marginX,
        y: cursorY - 26,
        width: contentWidth,
        height: 26,
        borderColor: rgb(0.8, 0.84, 0.88),
        borderWidth: 0.6,
      });
      pdfPage.drawText('Nenhum registro encontrado para emissao do relatorio.', {
        x: marginX + 10,
        y: cursorY - 16,
        size: 8,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.55),
      });
      cursorY -= 26;
    } else {
      pageData.rows.forEach((row, rIdx) => {
        const isEven = rIdx % 2 === 1;
        pdfPage.drawRectangle({
          x: marginX,
          y: cursorY - rowHeight,
          width: contentWidth,
          height: rowHeight,
          color: isEven ? rgb(0.98, 0.985, 0.995) : rgb(1, 1, 1),
          borderColor: rgb(0.86, 0.89, 0.92),
          borderWidth: 0.5,
        });

        let rx = marginX;
        opts.columns.forEach((col, cIdx) => {
          const cw = colWidths[cIdx];
          let rawVal = row[col.key];
          if (
            rawVal === undefined &&
            col.key === 'periodDepreciation' &&
            row.monthlyDepreciation !== undefined
          ) {
            rawVal = row.monthlyDepreciation;
          }
          const formatted = col.format
            ? reactNodeToPlainText(col.format(rawVal, row))
            : rawVal !== undefined && rawVal !== null
            ? String(rawVal)
            : '-';
          const cellText = truncateTextToFit(
            formatted || '-',
            cw - 6,
            fontRegular,
            7.5
          );
          const textW = fontRegular.widthOfTextAtSize(cellText, 7.5);
          const drawX =
            col.align === 'right'
              ? rx + cw - textW - 4
              : col.align === 'center'
              ? rx + Math.max(3, (cw - textW) / 2)
              : rx + 4;
          pdfPage.drawText(cellText, {
            x: drawX,
            y: cursorY - 12,
            size: 7.5,
            font: fontRegular,
            color: rgb(0.06, 0.09, 0.16),
          });
          rx += cw;
        });
        cursorY -= rowHeight;
      });
    }

    // Automatic Per-Page Subtotal Footer Row (Directly under table rows)
    if (hasMonetary && pageData.rows.length > 0) {
      const subHeight = 19;
      pdfPage.drawRectangle({
        x: marginX,
        y: cursorY - subHeight,
        width: contentWidth,
        height: subHeight,
        color: rgb(0.94, 0.96, 0.98),
        borderColor: rgb(0.39, 0.45, 0.55),
        borderWidth: 0.9,
      });

      let sx = marginX;
      opts.columns.forEach((col, cIdx) => {
        const cw = colWidths[cIdx];
        const isMon = opts.monetaryKeys.has(col.key);
        let txt = '';
        if (cIdx === 0 && !isMon) {
          txt = truncateTextToFit(
            `SUBTOTAL PAG. ${pageData.pageNumber} (${pageData.rows.length})`,
            cw - 4,
            fontBold,
            7.2
          );
        } else if (isMon && pageData.pageTotals[col.key] !== undefined) {
          txt = truncateTextToFit(
            formatCurrencyBRL(pageData.pageTotals[col.key]),
            cw - 6,
            fontBold,
            7.3
          );
        }
        if (txt) {
          const tw = fontBold.widthOfTextAtSize(txt, 7.3);
          const drawX =
            col.align === 'right' || isMon
              ? sx + cw - tw - 4
              : sx + 4;
          pdfPage.drawText(txt, {
            x: drawX,
            y: cursorY - 13,
            size: 7.3,
            font: fontBold,
            color: rgb(0.06, 0.09, 0.16),
          });
        }
        sx += cw;
      });
      cursorY -= subHeight;

      // Grand Total row on final page if > 1 page
      if (
        pageData.pageNumber === pageData.totalPages &&
        pageData.totalPages > 1
      ) {
        const grandHeight = 20;
        pdfPage.drawRectangle({
          x: marginX,
          y: cursorY - grandHeight,
          width: contentWidth,
          height: grandHeight,
          color: rgb(0.06, 0.09, 0.16),
        });
        let gx = marginX;
        opts.columns.forEach((col, cIdx) => {
          const cw = colWidths[cIdx];
          const isMon = opts.monetaryKeys.has(col.key);
          let txt = '';
          if (cIdx === 0 && !isMon) {
            txt = truncateTextToFit(
              `TOTAL GERAL (${opts.totalRecords})`,
              cw - 4,
              fontBold,
              7.3
            );
          } else if (isMon && opts.grandTotals[col.key] !== undefined) {
            txt = truncateTextToFit(
              formatCurrencyBRL(opts.grandTotals[col.key]),
              cw - 6,
              fontBold,
              7.3
            );
          }
          if (txt) {
            const tw = fontBold.widthOfTextAtSize(txt, 7.3);
            const drawX =
              col.align === 'right' || isMon
                ? gx + cw - tw - 4
                : gx + 4;
            pdfPage.drawText(txt, {
              x: drawX,
              y: cursorY - 13,
              size: 7.3,
              font: fontBold,
              color: rgb(1, 1, 1),
            });
          }
          gx += cw;
        });
        cursorY -= grandHeight;
      }
    }

    // Bottom Page Footer (anchored cleanly at page bottom)
    const footerY = marginBottom + 14;
    if (hasMonetary && pageData.rows.length > 0) {
      const summaryParts = opts.columns
        .filter(
          (col) =>
            opts.monetaryKeys.has(col.key) &&
            pageData.pageTotals[col.key] !== undefined
        )
        .map(
          (col) =>
            `${col.label.replace(/\s*\(R\$\)/gi, '')}: ${formatCurrencyBRL(
              pageData.pageTotals[col.key]
            )}`
        );
      if (summaryParts.length > 0) {
        const barText = truncateTextToFit(
          `Rodape Pag. ${pageData.pageNumber} - Subtotais: ${summaryParts.join(' | ')}`,
          contentWidth - 12,
          fontBold,
          7
        );
        pdfPage.drawRectangle({
          x: marginX,
          y: footerY + 6,
          width: contentWidth,
          height: 15,
          color: rgb(0.95, 0.97, 0.98),
          borderColor: rgb(0.78, 0.83, 0.88),
          borderWidth: 0.6,
        });
        pdfPage.drawText(barText, {
          x: marginX + 6,
          y: footerY + 11,
          size: 7,
          font: fontBold,
          color: rgb(0.06, 0.09, 0.16),
        });
      }
    }

    pdfPage.drawLine({
      start: { x: marginX, y: marginBottom + 11 },
      end: { x: pageWidth - marginX, y: marginBottom + 11 },
      thickness: 0.6,
      color: rgb(0.78, 0.83, 0.88),
    });

    pdfPage.drawText(
      toPdfSafeText(
        `ContSuite - Relatorio Contabil Oficial${
          opts.userEmail ? ` - Operador: ${opts.userEmail}` : ''
        }`
      ),
      {
        x: marginX,
        y: marginBottom,
        size: 7,
        font: fontRegular,
        color: rgb(0.35, 0.41, 0.5),
      }
    );

    const rightFooter = toPdfSafeText(
      `Itens na pagina: ${pageData.rows.length} (Total: ${opts.totalRecords}) - Pagina ${pageData.pageNumber} de ${pageData.totalPages}`
    );
    const rfWidth = fontBold.widthOfTextAtSize(rightFooter, 7);
    pdfPage.drawText(rightFooter, {
      x: pageWidth - marginX - rfWidth,
      y: marginBottom,
      size: 7,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.23),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio_${opts.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_|_$/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
