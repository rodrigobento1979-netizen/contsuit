import React from 'react';

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
      // pt-BR: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // en-US: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only comma: treat as decimal separator (pt-BR)
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
    if (validCount > 0) {
      totals[col.key] = roundCurrency(sum);
    } else {
      totals[col.key] = 0;
    }
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
  const safeRowsPerPage = Math.max(1, Math.floor(rowsPerPage || 15));
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
 * Prints an isolated, paginated A4 HTML document via a hidden iframe,
 * completely avoiding raw screen printing (window.print() over app chrome)
 * and avoiding window.open() popup blockers inside iframes.
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
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 10mm 10mm 12mm 10mm;
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
      font-size: 11px;
      line-height: 1.35;
    }
    .report-page {
      width: 100%;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .report-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .report-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-badge {
      background: #0f172a;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 10px;
      font-weight: 700;
      color: #334155;
    }
    .report-title {
      margin: 6px 0 2px 0;
      font-size: 15px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      color: #0f172a;
    }
    .report-subtitle {
      margin: 0;
      font-size: 10.5px;
      font-weight: 600;
      color: #475569;
    }
    .company-meta {
      text-align: right;
      font-size: 10px;
      color: #334155;
      white-space: nowrap;
    }
    .company-name {
      font-size: 11.5px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .summary-card {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 5px;
      padding: 6px 8px;
    }
    .summary-label {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      display: block;
    }
    .summary-value {
      font-size: 11.5px;
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
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
      font-size: 10px;
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
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 6px 7px;
      border-bottom: 2px solid #94a3b8;
      border-right: 1px solid #cbd5e1;
    }
    th:last-child, td:last-child {
      border-right: none;
    }
    td {
      padding: 5px 7px;
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
      border-top: 2px solid #64748b;
      border-bottom: 1px solid #94a3b8;
      padding: 6px 7px;
      font-size: 10px;
    }
    tfoot tr.grand-total-row td {
      background: #0f172a;
      color: #ffffff;
      font-weight: 900;
      border-top: 1px solid #0f172a;
      padding: 6.5px 7px;
      font-size: 10px;
    }
    .page-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
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
      }, 300);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.onafterprint = cleanup;
        // Slight delay ensures layout/fonts settle before print dialog captures pages
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } finally {
            // Fallback cleanup in case onafterprint doesn't fire in some browsers
            setTimeout(cleanup, 2500);
          }
        }, 60);
      } catch {
        cleanup();
      }
    };

    document.body.appendChild(iframe);
    iframe.srcdoc = fullHtml;
  });
}
