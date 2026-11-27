import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Printer,
  Download,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Columns,
  Loader2,
} from 'lucide-react';
import { Company } from '../types';
import {
  ReportColumnLike,
  escapeHtml,
  formatCurrencyBRL,
  paginateReportData,
  printCleanHtmlDocument,
  reactNodeToPlainText,
} from '../utils/reportPrint';

export interface ReportColumn extends ReportColumnLike {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (val: any, row?: any) => React.ReactNode;
  isMonetary?: boolean;
  getNumericValue?: (row: any) => number;
}

export interface ReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  company: Company;
  summaryMetrics?: { label: string; value: string | number }[];
  columns: ReportColumn[];
  data: any[];
  userEmail?: string;
}

export const ReportPrintModal: React.FC<ReportPrintModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  company,
  summaryMetrics,
  columns,
  data,
  userEmail,
}) => {
  const [rowsPerPage, setRowsPerPage] = useState<number>(() =>
    columns.length >= 7 ? 15 : 20
  );
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    columns.length >= 6 ? 'landscape' : 'portrait'
  );
  const [activePage, setActivePage] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});

  const generatedAt = useMemo(
    () =>
      new Date().toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [isOpen, data.length, title]
  );

  // Paginate dataset & calculate automatic per-page monetary subtotals + grand totals
  const { pages, grandTotals, monetaryKeys } = useMemo(
    () => paginateReportData(data, columns, rowsPerPage),
    [data, columns, rowsPerPage]
  );

  const hasMonetaryColumns = monetaryKeys.size > 0;

  useEffect(() => {
    setActivePage(1);
  }, [rowsPerPage, data.length, title, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('contsuite-report-modal-open');
    return () => {
      document.body.classList.remove('contsuite-report-modal-open');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const jumpToPage = (pageNum: number) => {
    const clamped = Math.max(1, Math.min(pages.length, pageNum));
    setActivePage(clamped);
    const el = pageRefs.current[clamped];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderCellDisplay = (col: ReportColumn, row: any): React.ReactNode => {
    let cellVal = row[col.key];
    if (
      cellVal === undefined &&
      col.key === 'periodDepreciation' &&
      row.monthlyDepreciation !== undefined
    ) {
      cellVal = row.monthlyDepreciation;
    }
    if (col.format) {
      return col.format(cellVal, row);
    }
    return cellVal !== undefined && cellVal !== null ? String(cellVal) : '-';
  };

  const buildPrintableHtml = (): string => {
    const companyTitle = escapeHtml(company.fantasyName || company.name || '');
    const companyCnpj = escapeHtml(company.cnpj || '');
    const safeTitle = escapeHtml(title);
    const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';
    const safeUserEmail = userEmail ? escapeHtml(userEmail) : '';

    const summaryHtml =
      summaryMetrics && summaryMetrics.length > 0
        ? `<div class="summary-grid">
            ${summaryMetrics
              .map(
                (m) => `<div class="summary-card">
                  <span class="summary-label">${escapeHtml(m.label)}</span>
                  <span class="summary-value">${escapeHtml(String(m.value))}</span>
                </div>`
              )
              .join('')}
          </div>`
        : '';

    const theadHtml = `<thead>
      <tr>
        ${columns
          .map((col) => {
            const alignClass =
              col.align === 'right'
                ? 'text-right'
                : col.align === 'center'
                ? 'text-center'
                : 'text-left';
            return `<th class="${alignClass}">${escapeHtml(col.label)}</th>`;
          })
          .join('')}
      </tr>
    </thead>`;

    return pages
      .map((page) => {
        const tbodyRowsHtml =
          page.rows.length === 0
            ? `<tr><td colspan="${columns.length}" class="text-center" style="padding: 20px; color: #64748b; font-style: italic;">Nenhum registro encontrado para emissão do relatório.</td></tr>`
            : page.rows
                .map(
                  (row) => `<tr>
                    ${columns
                      .map((col) => {
                        const alignClass =
                          col.align === 'right'
                            ? 'text-right mono'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left';
                        const rendered = renderCellDisplay(col, row);
                        const plainText = reactNodeToPlainText(rendered);
                        return `<td class="${alignClass}">${escapeHtml(
                          plainText || '-'
                        )}</td>`;
                      })
                      .join('')}
                  </tr>`
                )
                .join('');

        let tfootHtml = '';
        if (hasMonetaryColumns && page.rows.length > 0) {
          const subtotalCells = columns
            .map((col, idx) => {
              const isMon = monetaryKeys.has(col.key);
              const val = page.pageTotals[col.key];
              if (idx === 0 && !isMon) {
                return `<td class="text-left" style="text-transform: uppercase;">SUBTOTAL PÁG. ${page.pageNumber} (${page.rows.length} ${
                  page.rows.length === 1 ? 'item' : 'itens'
                })</td>`;
              }
              return `<td class="${
                col.align === 'right' || isMon ? 'text-right mono' : 'text-left'
              }">${isMon && val !== undefined ? escapeHtml(formatCurrencyBRL(val)) : ''}</td>`;
            })
            .join('');

          let grandTotalRowHtml = '';
          if (page.pageNumber === page.totalPages && page.totalPages > 1) {
            const grandCells = columns
              .map((col, idx) => {
                const isMon = monetaryKeys.has(col.key);
                const val = grandTotals[col.key];
                if (idx === 0 && !isMon) {
                  return `<td class="text-left" style="text-transform: uppercase;">TOTAL GERAL (${data.length} registros)</td>`;
                }
                return `<td class="${
                  col.align === 'right' || isMon ? 'text-right mono' : 'text-left'
                }">${isMon && val !== undefined ? escapeHtml(formatCurrencyBRL(val)) : ''}</td>`;
              })
              .join('');
            grandTotalRowHtml = `<tr class="grand-total-row">${grandCells}</tr>`;
          }

          tfootHtml = `<tfoot>
            <tr class="subtotal-row">${subtotalCells}</tr>
            ${grandTotalRowHtml}
          </tfoot>`;
        }

        return `<section class="report-page">
          <div class="report-header">
            <div>
              <div class="brand-row">
                <span class="brand-badge">CONTSUITE</span>
                <span class="brand-sub">Sistema Contábil Corporativo (CPC 27)</span>
              </div>
              <h1 class="report-title">${safeTitle}</h1>
              ${safeSubtitle ? `<p class="report-subtitle">${safeSubtitle}</p>` : ''}
            </div>
            <div class="company-meta">
              <div class="company-name">${companyTitle}</div>
              <div>CNPJ: ${companyCnpj}</div>
              <div>Emissão: ${escapeHtml(generatedAt)}</div>
              <div style="font-weight: 800; color: #0f172a; margin-top: 2px;">Página ${
                page.pageNumber
              } de ${page.totalPages}</div>
            </div>
          </div>

          ${page.pageNumber === 1 ? summaryHtml : ''}

          <div class="table-wrap">
            <table>
              ${theadHtml}
              <tbody>${tbodyRowsHtml}</tbody>
              ${tfootHtml}
            </table>
          </div>

          <div class="page-footer">
            <span>ContSuite • Relatório Contábil Oficial${
              safeUserEmail ? ` • Operador: ${safeUserEmail}` : ''
            }</span>
            <span>Registros nesta página: <strong>${page.rows.length}</strong> (Total: <strong>${
          data.length
        }</strong>)</span>
            <span>Página <strong>${page.pageNumber}</strong> de <strong>${
          page.totalPages
        }</strong></span>
          </div>
        </section>`;
      })
      .join('\n');
  };

  const handlePrint = async () => {
    try {
      setIsPrinting(true);
      const bodyHtml = buildPrintableHtml();
      await printCleanHtmlDocument({
        documentTitle: `${title} - ${company.fantasyName || company.name}`,
        orientation,
        bodyHtml,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportCsv = () => {
    if (!data || data.length === 0) return;
    const headers = columns
      .map((c) => `"${c.label.replace(/"/g, '""')}"`)
      .join(';');
    const rows = data.map((row) => {
      return columns
        .map((c) => {
          let val = row[c.key];
          if (
            val === undefined &&
            c.key === 'periodDepreciation' &&
            row.monthlyDepreciation !== undefined
          ) {
            val = row.monthlyDepreciation;
          }
          if (val === undefined || val === null) val = '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(';');
    });

    const csvLines = [headers, ...rows];
    if (hasMonetaryColumns) {
      const totalCsvRow = columns
        .map((c, idx) => {
          if (idx === 0 && !monetaryKeys.has(c.key)) {
            return '"TOTAL GERAL"';
          }
          if (monetaryKeys.has(c.key) && grandTotals[c.key] !== undefined) {
            return `"${grandTotals[c.key].toFixed(2).replace('.', ',')}"`;
          }
          return '""';
        })
        .join(';');
      csvLines.push(totalCsvRow);
    }

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${title
      .toLowerCase()
      .replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="contsuite-printable-report fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white print:static print:block">
      <div className="bg-slate-200/90 rounded-none sm:rounded-xl max-w-6xl w-full h-[100dvh] sm:h-[94dvh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden print:max-w-none print:h-auto print:shadow-none print:border-none print:rounded-none print:bg-white print:overflow-visible">
        {/* Modal Toolbar (Hidden during print) */}
        <div className="p-3 sm:p-4 border-b border-slate-300 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#004d40] text-white flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-[#a7ffeb]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                  Relatório Contábil Oficial
                </h3>
                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700">
                  {pages.length} {pages.length === 1 ? 'página' : 'páginas'} • {data.length}{' '}
                  {data.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 truncate">
                {hasMonetaryColumns
                  ? 'Totalização automática no rodapé de cada página e impressão A4 estruturada'
                  : 'Paginação A4 estruturada pronta para impressão e exportação'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Rows per page control */}
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1">
              <span>Linhas/pág:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value={12}>12</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={30}>30</option>
              </select>
            </label>

            {/* Page Orientation */}
            <button
              type="button"
              onClick={() =>
                setOrientation((prev) =>
                  prev === 'landscape' ? 'portrait' : 'landscape'
                )
              }
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer bg-slate-50"
              title="Alternar orientação de impressão A4"
            >
              <Columns className="w-3.5 h-3.5 text-slate-600" />
              <span>{orientation === 'landscape' ? 'Paisagem A4' : 'Retrato A4'}</span>
            </button>

            {/* Page Jumper */}
            {pages.length > 1 && (
              <div className="flex items-center border border-slate-300 rounded-lg bg-slate-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => jumpToPage(activePage - 1)}
                  disabled={activePage <= 1}
                  className="p-1.5 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[11px] font-mono font-bold text-slate-800 border-x border-slate-300">
                  Pág. {activePage}/{pages.length}
                </span>
                <button
                  type="button"
                  onClick={() => jumpToPage(activePage + 1)}
                  disabled={activePage >= pages.length}
                  className="p-1.5 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer"
                  title="Próxima página"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-white"
              title="Baixar como planilha CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-4 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>{isPrinting ? 'Preparando...' : 'Imprimir / Salvar PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer ml-0.5"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Paginated A4 Sheets Preview Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 print:p-0 print:overflow-visible print:space-y-0">
          {pages.map((page) => (
            <section
              key={page.pageNumber}
              ref={(el) => {
                pageRefs.current[page.pageNumber] = el;
              }}
              onMouseEnter={() => setActivePage(page.pageNumber)}
              className={`bg-white mx-auto shadow-lg border border-slate-300 rounded-md p-5 sm:p-8 space-y-5 text-slate-900 font-sans print:shadow-none print:border-none print:rounded-none print:p-4 print:break-after-page last:print:break-after-auto ${
                orientation === 'landscape' ? 'max-w-[1060px]' : 'max-w-[820px]'
              }`}
            >
              {/* Formal Report Header (Repeated on Every Page) */}
              <div className="border-b-2 border-slate-900 pb-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-900 text-white tracking-wider">
                      CONTSUITE
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      Sistema Contábil Corporativo (CPC 27)
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-black text-slate-900 mt-1.5 uppercase tracking-tight">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="text-xs text-slate-700 mt-0.5 font-semibold">
                      {subtitle}
                    </p>
                  )}
                </div>

                <div className="text-right text-[11px] space-y-0.5 text-slate-700 self-start sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 font-mono shrink-0">
                  <p className="font-bold text-slate-900 text-xs sm:text-sm font-sans">
                    {company.fantasyName || company.name}
                  </p>
                  <p>CNPJ: {company.cnpj}</p>
                  <p>Emissão: {generatedAt}</p>
                  <p className="font-bold text-slate-900">
                    Página {page.pageNumber} de {page.totalPages}
                  </p>
                </div>
              </div>

              {/* Executive Summary Metrics (Page 1 only) */}
              {page.pageNumber === 1 &&
                summaryMetrics &&
                summaryMetrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {summaryMetrics.map((metric, mIdx) => (
                      <div
                        key={mIdx}
                        className="bg-slate-50 border border-slate-300 rounded-md px-3 py-2"
                      >
                        <span className="block text-[10px] font-bold uppercase text-slate-500 tracking-wide">
                          {metric.label}
                        </span>
                        <span className="block text-xs sm:text-sm font-black text-slate-900 mt-0.5">
                          {metric.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

              {/* Page Data Table with Per-Page Automatic Totals Footer */}
              <div className="border border-slate-400 rounded-md overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-200 text-slate-900 font-black border-b-2 border-slate-400 text-[10px] uppercase tracking-wider">
                      {columns.map((col, idx) => (
                        <th
                          key={idx}
                          className={`py-2 px-2.5 border-r border-slate-300 last:border-r-0 ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-300 text-slate-900 font-normal">
                    {page.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className="py-8 text-center text-slate-500 italic text-xs"
                        >
                          Nenhum registro encontrado para emissão do relatório.
                        </td>
                      </tr>
                    ) : (
                      page.rows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="hover:bg-slate-50 print:hover:bg-transparent even:bg-slate-50/50"
                        >
                          {columns.map((col, colIdx) => (
                            <td
                              key={colIdx}
                              className={`py-1.5 px-2.5 border-r border-slate-200 last:border-r-0 text-[11px] ${
                                col.align === 'right'
                                  ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                  : col.align === 'center'
                                  ? 'text-center'
                                  : 'text-left'
                              }`}
                            >
                              {renderCellDisplay(col, row)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>

                  {/* Automatic Page Subtotal & Final Grand Total in Table Footer */}
                  {hasMonetaryColumns && page.rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-500 text-[11px]">
                        {columns.map((col, idx) => {
                          const isMon = monetaryKeys.has(col.key);
                          const totalVal = page.pageTotals[col.key];
                          if (idx === 0 && !isMon) {
                            return (
                              <td
                                key={idx}
                                className="py-2 px-2.5 border-r border-slate-300 text-left uppercase tracking-tight"
                              >
                                Subtotal Pág. {page.pageNumber} ({page.rows.length}{' '}
                                {page.rows.length === 1 ? 'item' : 'itens'})
                              </td>
                            );
                          }
                          return (
                            <td
                              key={idx}
                              className={`py-2 px-2.5 border-r border-slate-300 last:border-r-0 ${
                                col.align === 'right' || isMon
                                  ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                  : 'text-left'
                              }`}
                            >
                              {isMon && totalVal !== undefined
                                ? formatCurrencyBRL(totalVal)
                                : ''}
                            </td>
                          );
                        })}
                      </tr>

                      {page.pageNumber === page.totalPages &&
                        page.totalPages > 1 && (
                          <tr className="bg-slate-900 font-black text-white border-t border-slate-900 text-[11px]">
                            {columns.map((col, idx) => {
                              const isMon = monetaryKeys.has(col.key);
                              const grandVal = grandTotals[col.key];
                              if (idx === 0 && !isMon) {
                                return (
                                  <td
                                    key={idx}
                                    className="py-2 px-2.5 border-r border-slate-700 text-left uppercase tracking-tight"
                                  >
                                    Total Geral ({data.length} registros)
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={idx}
                                  className={`py-2 px-2.5 border-r border-slate-700 last:border-r-0 ${
                                    col.align === 'right' || isMon
                                      ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                      : 'text-left'
                                  }`}
                                >
                                  {isMon && grandVal !== undefined
                                    ? formatCurrencyBRL(grandVal)
                                    : ''}
                                </td>
                              );
                            })}
                          </tr>
                        )}
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Page Footer Bar */}
              <div className="pt-3 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-600 gap-2">
                <span>
                  ContSuite • Sistema de Gestão Contábil & Ativo Imobilizado
                </span>
                <span>
                  Registros na página: <strong>{page.rows.length}</strong> (de{' '}
                  <strong>{data.length}</strong> no total)
                </span>
                <span className="font-mono font-bold text-slate-800">
                  Página {page.pageNumber} de {page.totalPages}
                </span>
              </div>
            </section>
          ))}
        </div>

        {/* Modal Bottom Bar */}
        <div className="p-3 bg-white border-t border-slate-300 flex items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
            {pages.length > 1 &&
              pages.map((p) => (
                <button
                  key={p.pageNumber}
                  type="button"
                  onClick={() => jumpToPage(p.pageNumber)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold transition cursor-pointer shrink-0 ${
                    activePage === p.pageNumber
                      ? 'bg-[#004d40] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  Pág. {p.pageNumber}
                </button>
              ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer shrink-0"
          >
            Fechar Relatório
          </button>
        </div>
      </div>
    </div>
  );
};
