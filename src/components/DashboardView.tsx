import React from 'react';
import { 
  Building2, 
  DollarSign, 
  TrendingDown, 
  FileText, 
  PlusCircle, 
  Sparkles, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  HardDrive,
  Car,
  Laptop,
  Cpu,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { Asset, Company, DepreciationSummary, ConvertedStatement } from '../types';

interface DashboardViewProps {
  currentUser?: { name: string; email: string; role: string };
  currentCompany?: Company;
  assets: Asset[];
  depreciationSummary: DepreciationSummary | null;
  recentStatements: ConvertedStatement[];
  onOpenNewAsset: () => void;
  onNavigateTab: (tab: 'dashboard' | 'assets' | 'depreciation' | 'ofx' | 'admin') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  currentCompany,
  assets,
  depreciationSummary,
  recentStatements,
  onOpenNewAsset,
  onNavigateTab,
}) => {
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Group assets by category
  const categoryStats = React.useMemo(() => {
    const map: Record<string, { count: number; totalValue: number; label: string }> = {};
    for (const a of assets) {
      if (a.status === 'baixado') continue;
      if (!map[a.category]) {
        map[a.category] = { count: 0, totalValue: 0, label: a.categoryLabel };
      }
      map[a.category].count += 1;
      map[a.category].totalValue += a.acquisitionValue;
    }
    return Object.values(map).sort((a, b) => b.totalValue - a.totalValue);
  }, [assets]);

  const totalAcquisition = depreciationSummary?.totalAcquisitionValue || assets.reduce((s, a) => s + (a.status !== 'baixado' ? a.acquisitionValue : 0), 0);
  const totalAccumulated = depreciationSummary?.totalAccumulatedDepreciation || 0;
  const totalNetBookValue = depreciationSummary?.totalNetBookValue || totalAcquisition - totalAccumulated;
  const currentMonthlyDeprec = depreciationSummary?.totalMonthlyDepreciation || 0;

  return (
    <div className="space-y-6">
      {/* Soft Welcoming Banner */}
      <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-white p-6 sm:p-7 rounded-3xl border border-emerald-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/80">
              Ambiente Contábil Inteligente
            </span>
            <span className="text-xs text-slate-400">
              Competência: <strong>{depreciationSummary?.competenceMonth || 'Atual'}</strong>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Olá, {currentUser?.name?.split(' ')[0] || 'Usuário'}! Seja bem-vindo.
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Painel da empresa <strong>{currentCompany?.fantasyName || currentCompany?.name || 'sua empresa'}</strong>. Controle do imobilizado, quotas automáticas de depreciação (CPC 27) e conversão de extratos para OFX com IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onOpenNewAsset}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-emerald-700/20 transition text-xs sm:text-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Cadastrar Ativo com IA
          </button>
          <button
            onClick={() => onNavigateTab('ofx')}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 font-bold px-4 py-2.5 rounded-xl shadow-2xs transition text-xs sm:text-sm cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Converter Extrato OFX
          </button>
        </div>
      </div>

      {/* KPI Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Valor Bruto */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Custo Histórico (Aquisição)</p>
            <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {formatMoney(totalAcquisition)}
          </p>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
            <span className="font-semibold text-slate-700">{assets.filter(a => a.status !== 'baixado').length} bens</span> ativos no patrimônio
          </p>
        </div>

        {/* Card 2: Depreciação Acumulada */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Depreciação Acumulada</p>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-amber-600 mt-2">
            {formatMoney(totalAccumulated)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {totalAcquisition > 0 
              ? `${((totalAccumulated / totalAcquisition) * 100).toFixed(1)}% do valor já amortizado`
              : 'Sem ativos depreciados'}
          </p>
        </div>

        {/* Card 3: Valor Contábil Líquido */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Valor Contábil Líquido (VCL)</p>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600 mt-2">
            {formatMoney(totalNetBookValue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Saldo real de balanço patrimonial
          </p>
        </div>

        {/* Card 4: Quota do Mês */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Quota Depreciação / Mês</p>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-indigo-600 mt-2">
            {formatMoney(currentMonthlyDeprec)}
          </p>
          <button
            onClick={() => onNavigateTab('depreciation')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1"
          >
            Ver lançamentos contábeis <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content 2-Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Asset Distribution & Shortcuts */}
        <div className="lg:col-span-1 space-y-6">
          {/* Category breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                Composição do Imobilizado
              </h2>
              <span className="text-xs text-slate-400 font-medium">Por Categoria</span>
            </div>

            {categoryStats.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Nenhum bem cadastrado para esta empresa.</p>
            ) : (
              <div className="space-y-3">
                {categoryStats.map((cat, idx) => {
                  const percent = totalAcquisition > 0 ? (cat.totalValue / totalAcquisition) * 100 : 0;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 flex items-center gap-1.5">
                          {cat.label} ({cat.count})
                        </span>
                        <span className="font-bold text-slate-900">{formatMoney(cat.totalValue)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-teal-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, percent))}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Integration Status Card */}
          <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white p-5 rounded-2xl text-slate-800 border border-emerald-200/80 shadow-xs">
            <div className="flex items-center gap-2 text-emerald-800 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold uppercase tracking-wider">Integração Contábil Pronta</span>
            </div>
            <h3 className="font-bold text-sm text-slate-900">
              Sistema Contábil: {currentCompany?.accountingSystem.toUpperCase() || 'DOMÍNIO'}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Gere os lançamentos mensais com partidas dobradas em formato oficial pronto para importação direta no software contábil.
            </p>
            <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Plano de Contas configurado</span>
              <button
                onClick={() => onNavigateTab('depreciation')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                Exportar Arquivo <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Assets List Preview & OFX Recent conversions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Assets Table Preview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900 text-sm">Bens do Ativo Permanente Recentes</h2>
                <p className="text-xs text-slate-500">Últimos itens cadastrados e sob controle de depreciação</p>
              </div>
              <button
                onClick={() => onNavigateTab('assets')}
                className="text-xs font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
              >
                Ver todos os {assets.length} bens <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Plaqueta / Tag</th>
                    <th className="py-2.5 px-4">Descrição do Bem</th>
                    <th className="py-2.5 px-4">Aquisição</th>
                    <th className="py-2.5 px-4 text-right">Valor Original</th>
                    <th className="py-2.5 px-4 text-center">Taxa a.a.</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assets.slice(0, 5).map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {asset.tagNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{asset.description}</div>
                        <div className="text-[11px] text-slate-400">{asset.categoryLabel} • {asset.costCenter}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {asset.acquisitionDate.split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatMoney(asset.acquisitionValue)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                          {asset.annualRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {asset.status === 'ativo' ? 'Ativo' : asset.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {assets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Nenhum bem cadastrado ainda. Clique em "Cadastrar Ativo com IA" acima para começar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* OFX Converter Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Conversor de Extratos Bancários para OFX com IA
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Converta PDFs, fotos ou comprovantes de qualquer banco (Itaú, Bradesco, BB, Caixa, Santander, Nubank) em arquivo .OFX padrão para importação contábil.
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('ofx')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition whitespace-nowrap cursor-pointer"
              >
                Abrir Ferramenta OFX <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recentStatements.length > 0 ? (
              <div className="space-y-2 mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700">Últimos extratos convertidos:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recentStatements.slice(0, 2).map((stmt, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>{stmt.bankName}</span>
                        <span className="text-[10px] bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                          {stmt.transactionsCount} lançamentos
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Período: {stmt.startDate} até {stmt.endDate}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  O conversor utiliza visão computacional do <strong>Gemini 3.8 Flash</strong> para extrair débitos, créditos, datas e memos com fidelidade total.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
