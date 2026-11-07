import React from 'react';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';
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
  userEmail = 'rodrigobento1979@gmail.com',
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
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Toolbar (Hidden during print) */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#004d40] text-white flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#a7ffeb]" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">Emissão de Relatório</h3>
              <p className="text-[11px] text-slate-500">Visualização de impressão & PDF</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Baixar como planilha CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
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
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-5 text-slate-900 font-sans print:p-4 print:overflow-visible print:space-y-4">
          
          {/* Report Header */}
          <div className="border-b-2 border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-teal-900 text-white tracking-wider">
                  ContSuite
                </span>
                <span className="text-xs font-bold text-slate-700">Sistema Contábil Corporativo</span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 mt-1 uppercase tracking-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-600 mt-0.5 font-medium">{subtitle}</p>
              )}
            </div>

            <div className="text-right text-xs space-y-0.5 text-slate-600 self-start sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0">
              <p className="font-bold text-slate-900 text-sm">{company.fantasyName || company.name}</p>
              <p className="font-mono text-[11px]">CNPJ: {company.cnpj}</p>
              <p className="text-[10px] text-slate-500">
                Emitido em: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}
              </p>
              <p className="text-[10px] text-slate-500">Operador: {userEmail}</p>
            </div>
          </div>

          {/* Optional Summary Metric Badges */}
          {summaryMetrics && summaryMetrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {summaryMetrics.map((metric, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    {metric.label}
                  </span>
                  <span className="text-sm font-extrabold text-slate-900 block mt-0.5">
                    {metric.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Main Data Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
                  {columns.map((col, idx) => (
                    <th 
                      key={idx} 
                      className={`py-2 px-2.5 ${
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-8 text-center text-slate-400 italic text-xs">
                      Nenhum registro encontrado para emissão do relatório.
                    </td>
                  </tr>
                ) : (
                  data.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                      {columns.map((col, colIdx) => {
                        const cellVal = row[col.key];
                        return (
                          <td 
                            key={colIdx} 
                            className={`py-2 px-2.5 text-xs ${
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

          {/* Report Footer Note */}
          <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 gap-1">
            <span>ContSuite • Documento emitido para conferência e conciliação contábil</span>
            <span>Total de Registros: {data.length}</span>
          </div>

        </div>

        {/* Modal Bottom Close */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
