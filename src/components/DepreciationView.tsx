import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Calendar, 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  FileText, 
  DollarSign, 
  TrendingDown, 
  ShieldCheck,
  Building2,
  HelpCircle,
  Printer
} from 'lucide-react';
import { DepreciationSummary, Company } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

interface DepreciationViewProps {
  summary: DepreciationSummary | null;
  currentCompany: Company;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onRefresh: () => void;
}

export const DepreciationView: React.FC<DepreciationViewProps> = ({
  summary,
  currentCompany,
  selectedMonth,
  onMonthChange,
  onRefresh,
}) => {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [activePreviewFormat, setActivePreviewFormat] = useState<'dominio' | 'csv' | 'ficha'>('dominio');
  const [showReportModal, setShowReportModal] = useState(false);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const [yearStr, monthStr] = selectedMonth.split('-');
  const monthName = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const depreciationReportColumns: ReportColumn[] = [
    { key: 'tagNumber', label: 'Plaqueta' },
    { key: 'description', label: 'Descrição do Bem' },
    { key: 'categoryLabel', label: 'Categoria' },
    { key: 'acquisitionValue', label: 'Vlr Aquisição', align: 'right', format: (val) => formatMoney(Number(val) || 0) },
    { key: 'annualRate', label: 'Taxa a.a.', align: 'center', format: (val) => `${val}%` },
    { key: 'monthlyDepreciation', label: 'Quota Mês', align: 'right', format: (val) => formatMoney(Number(val) || 0) },
    { key: 'currentAccumulatedDepreciation', label: 'Deprec. Acumulada', align: 'right', format: (val) => formatMoney(Number(val) || 0) },
    { key: 'netBookValue', label: 'VCL Residual', align: 'right', format: (val) => formatMoney(Number(val) || 0) },
    { key: 'status', label: 'Situação', align: 'center' },
  ];

  const depreciationReportData = (summary?.items || []).map(item => ({
    tagNumber: item.tagNumber,
    description: item.description,
    categoryLabel: item.categoryLabel,
    acquisitionValue: item.acquisitionValue,
    annualRate: item.annualRate,
    monthlyDepreciation: item.monthlyDepreciation,
    currentAccumulatedDepreciation: item.currentAccumulatedDepreciation,
    netBookValue: item.netBookValue,
    status: item.isFullyDepreciated ? '100% Amortizado' : 'Em Depreciação',
  }));

  const handleDownload = (format: 'dominio' | 'questor' | 'ficha') => {
    const url = `/api/assets/export?companyId=${currentCompany.id}&month=${selectedMonth}&format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyDominio = async () => {
    if (!summary) return;
    try {
      const res = await fetch(`/api/assets/export?companyId=${currentCompany.id}&month=${selectedMonth}&format=dominio`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedFormat('dominio');
      setTimeout(() => setCopiedFormat(null), 2500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-hidden">
      {/* Header and Competence Month Picker */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                Apuração de Depreciação & Exportação Contábil
              </h1>
              <p className="text-xs text-slate-500">
                Geração de quotas mensais e partidas dobradas para integração contábil da <strong>{currentCompany.fantasyName || currentCompany.name}</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Competence Selector */}
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <Calendar className="w-4 h-4 text-teal-600" />
            <div className="text-xs">
              <span className="text-slate-400 block font-semibold text-[10px]">Competência:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2 py-0.5 font-bold text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Emitir Relatório Button */}
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-xs transition"
            title="Emitir demonstrativo impresso de quotas e VCL do período"
          >
            <Printer className="w-4 h-4 text-teal-600" />
            Emitir Relatório
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Bens em Depreciação</span>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            {summary?.activeAssets || 0} / {summary?.totalAssets || 0} ativos
          </p>
          <span className="text-[11px] text-slate-400">Competência {monthName}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Quota do Mês (Despesa)</span>
          <p className="text-xl font-extrabold text-indigo-600 mt-1">
            {formatMoney(summary?.totalMonthlyDepreciation || 0)}
          </p>
          <span className="text-[11px] text-slate-400">Débito na DRE do período</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Depreciação Acumulada</span>
          <p className="text-xl font-extrabold text-amber-600 mt-1">
            {formatMoney(summary?.totalAccumulatedDepreciation || 0)}
          </p>
          <span className="text-[11px] text-slate-400">Total acumulado até {selectedMonth}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Valor Contábil Líquido (VCL)</span>
          <p className="text-xl font-extrabold text-emerald-600 mt-1">
            {formatMoney(summary?.totalNetBookValue || 0)}
          </p>
          <span className="text-[11px] text-slate-400">Saldo residual no Balanço</span>
        </div>
      </div>

      {/* Export Section with Layout Options */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 rounded-2xl text-white border border-slate-700 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-xs font-bold border border-teal-500/30">
                Integração Contábil Direta
              </span>
              <span className="text-xs text-slate-400">Layouts Oficiais Parametrizados</span>
            </div>
            <h2 className="text-lg font-bold mt-1">Exportar Lançamentos de Depreciação do Mês</h2>
            <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
              Gere o arquivo pronto para importação contábil no Domínio Sistemas, Questor, Fortes ou ERP com partidas dobradas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleDownload('dominio')}
              className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Domínio Sistemas (.TXT)
            </button>
            <button
              onClick={() => handleDownload('questor')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-600 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-teal-400" />
              Lançamentos (.CSV / Questor)
            </button>
            <button
              onClick={() => handleDownload('ficha')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-600 transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Ficha Patrimonial (.CSV)
            </button>
            <button
              onClick={handleCopyDominio}
              className="bg-teal-900/50 hover:bg-teal-900 text-teal-300 font-semibold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 border border-teal-700/60 transition cursor-pointer"
              title="Copiar texto formatado do Domínio Sistemas"
            >
              {copiedFormat === 'dominio' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar Layout
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Double Entry Table (Partidas Dobradas) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-sm">
              Lançamentos Contábeis de Depreciação - Competência {monthName}
            </h2>
            <p className="text-xs text-slate-500">
              Partidas dobradas automáticas: Débito (Despesa) e Crédito (Depreciação Acumulada)
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-100">
            {summary?.journalEntries.length || 0} lançamentos contábeis gerados
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Plaqueta</th>
                <th className="py-3 px-4">Conta Débito (Despesa)</th>
                <th className="py-3 px-4">Conta Crédito (Deprec.)</th>
                <th className="py-3 px-4 text-right">Valor (R$)</th>
                <th className="py-3 px-4">Centro de Custo</th>
                <th className="py-3 px-4">Histórico Contábil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {summary?.journalEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-sans text-slate-700 whitespace-nowrap">
                    {entry.date.split('-').reverse().join('/')}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                    {entry.assetTag}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-bold text-rose-700">{entry.debitAccount}</span>
                    <span className="block text-[10px] font-sans text-slate-400">{entry.debitAccountName}</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-bold text-emerald-700">{entry.creditAccount}</span>
                    <span className="block text-[10px] font-sans text-slate-400">{entry.creditAccountName}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-sans font-bold text-slate-900 whitespace-nowrap">
                    {formatMoney(entry.amount)}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-700 whitespace-nowrap">
                    {entry.costCenter}
                  </td>
                  <td className="py-3 px-4 font-sans text-slate-600 max-w-xs truncate" title={entry.historyText}>
                    {entry.historyText}
                  </td>
                </tr>
              ))}
              {(!summary?.journalEntries || summary.journalEntries.length === 0) && (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-sans text-slate-400">
                    Nenhum lançamento gerado para este mês de competência. Verifique se há bens ativos com data de início de depreciação anterior a {selectedMonth}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Items Table (Apuração Item a Item) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Detalhamento dos Ativos e VCL no Período</h3>
            <p className="text-xs text-slate-500">Valores apurados individualmente conforme quota e vida útil</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Plaqueta</th>
                <th className="py-2.5 px-4">Descrição</th>
                <th className="py-2.5 px-4 text-right">Valor Original</th>
                <th className="py-2.5 px-4 text-center">Taxa a.a.</th>
                <th className="py-2.5 px-4 text-center">Meses Dec.</th>
                <th className="py-2.5 px-4 text-right">Quota Mês</th>
                <th className="py-2.5 px-4 text-right">Deprec. Acumulada</th>
                <th className="py-2.5 px-4 text-right">VCL Residual</th>
                <th className="py-2.5 px-4 text-center">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary?.items.map((item) => (
                <tr key={item.assetId} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                    {item.tagNumber}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900">{item.description}</span>
                    <span className="block text-[11px] text-slate-400">{item.categoryLabel}</span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-800 whitespace-nowrap">
                    {formatMoney(item.acquisitionValue)}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                      {item.annualRate}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-slate-600 whitespace-nowrap">
                    {item.monthsElapsed} / {item.usefulLifeMonths} m
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-indigo-700 whitespace-nowrap">
                    {formatMoney(item.monthlyDepreciation)}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-amber-700 whitespace-nowrap">
                    {formatMoney(item.currentAccumulatedDepreciation)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-700 whitespace-nowrap">
                    {formatMoney(item.netBookValue)}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {item.isFullyDepreciated ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        100% Amortizado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Em Depreciação
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Report Modal */}
      <ReportPrintModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="Demonstrativo Mensal de Depreciação e Amortização"
        subtitle={`Apuração de quotas, depreciação acumulada e valor residual - Competência ${monthName}`}
        company={currentCompany}
        columns={depreciationReportColumns}
        data={depreciationReportData}
        summaryMetrics={[
          { label: 'Bens em Depreciação', value: `${summary?.activeAssets || 0} / ${summary?.totalAssets || 0}` },
          { label: 'Quota Total do Mês', value: formatMoney(summary?.totalMonthlyDepreciation || 0) },
          { label: 'Depreciação Acumulada', value: formatMoney(summary?.totalAccumulatedDepreciation || 0) },
          { label: 'VCL Residual Total', value: formatMoney(summary?.totalNetBookValue || 0) },
        ]}
      />
    </div>
  );
};
