import React from 'react';
import { Printer, Download, X, FileText } from 'lucide-react';
import { Company } from '../types';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  format?: (val: any, row?: any) => React.ReactNode;
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
  userEmail = 'secsscont@gmail.com',
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (!data || data.length === 0) return;
    const headers = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(';');
    const rows = data.map(row => {
      return columns.map(c => {
        let val = row[c.key];
        if (val === undefined || val === null) val = '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(';');
    });
    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-none sm:rounded-xl max-w-5xl w-full h-[100dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Toolbar (Hidden during print) */}
        <div className="p-3.5 sm:p-4 border-b border-slate-300 bg-slate-100 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#004d40] text-white flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#a7ffeb]" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Relatório Contábil Oficial</h3>
              <p className="text-[11px] text-slate-600">Formato pronto para impressão e exportação</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-white"
              title="Baixar como planilha CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Formal Accounting Report Body */}
        <div className="p-6 sm:p-10 overflow-y-auto flex-1 space-y-6 text-slate-900 font-sans print:p-4 print:overflow-visible print:space-y-4 bg-white">
          
          {/* Formal Report Header (Domínio / Questor / Professional Standard) */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-900 text-white tracking-wider">
                  CONTSUITE
                </span>
                <span className="text-xs font-bold text-slate-700">Sistema Contábil Corporativo (CPC 27)</span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 mt-2 uppercase tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-700 mt-1 font-semibold">{subtitle}</p>
              )}
            </div>

            <div className="text-right text-xs space-y-1 text-slate-700 self-start sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 font-mono">
              <p className="font-bold text-slate-900 text-sm font-sans">{company.fantasyName || company.name}</p>
              <p>CNPJ: {company.cnpj}</p>
            </div>
          </div>

          {/* Formal Summary Box (Instead of dashboard cards) */}
          {summaryMetrics && summaryMetrics.length > 0 && (
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {summaryMetrics.map((metric, idx) => (
                <div key={idx} className="space-y-0.5">
                  <span className="text-[10px] font-bold uppercase text-slate-600 block">
                    {metric.label}
                  </span>
                  <span className="text-sm font-black text-slate-900 block font-mono">
                    {metric.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Main Professional Accounting Table */}
          <div className="border border-slate-400 rounded-md overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-200 text-slate-900 font-black border-b-2 border-slate-400 text-[11px] uppercase tracking-wider">
                  {columns.map((col, idx) => (
                    <th 
                      key={idx} 
                      className={`py-2.5 px-3 border-r border-slate-300 last:border-r-0 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 text-slate-900 font-normal">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-8 text-center text-slate-500 italic text-xs">
                      Nenhum registro encontrado para emissão do relatório.
                    </td>
                  </tr>
                ) : (
                  data.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50 print:hover:bg-transparent even:bg-slate-50/40">
                      {columns.map((col, colIdx) => {
                        const cellVal = row[col.key];
                        return (
                          <td 
                            key={colIdx} 
                            className={`py-2 px-3 border-r border-slate-200 last:border-r-0 text-xs ${
                              col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : 'text-left'
                            }`}
                          >
                            {col.format ? col.format(cellVal, row) : cellVal !== undefined && cellVal !== null ? String(cellVal) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Report Footer / Authentication Block */}
          <div className="pt-4 border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-600 gap-2">
            <span>ContSuite • Sistema de Gestão de Ativo Imobilizado & Depreciação</span>
            <span>Total de Registros Listados: <strong>{data.length}</strong></span>
          </div>

        </div>

        {/* Modal Bottom Close */}
        <div className="p-3 bg-slate-100 border-t border-slate-300 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
          >
            Fechar Relatório
          </button>
        </div>

      </div>
    </div>
  );
};
