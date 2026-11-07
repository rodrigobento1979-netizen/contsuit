import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, 
  Search, 
  Plus, 
  Filter, 
  Download, 
  Edit3, 
  Trash2, 
  FileText, 
  Sparkles, 
  AlertTriangle,
  CheckCircle,
  Archive,
  RefreshCw,
  Calendar,
  Layers,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
  Percent,
  Clock,
  ArrowRight,
  ShieldCheck,
  Check,
  DollarSign,
  Copy,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  X,
  Printer
} from 'lucide-react';
import { 
  Asset, 
  Company, 
  DepreciationSummary, 
  DepreciationPeriodType, 
  AssetDisposalCalculation 
} from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

interface AssetsViewProps {
  assets: Asset[];
  currentCompany: Company;
  onOpenNewAsset: () => void;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => Promise<void>;
  onUpdateAssetStatus: (id: string, status: Asset['status'], notes?: string) => Promise<void>;
  onRefreshAssets?: () => void;
  initialSubTab?: 'inventario' | 'depreciacao' | 'relatorio_estatistica' | 'baixas' | 'integracao';
}

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  currentCompany,
  onOpenNewAsset,
  onEditAsset,
  onDeleteAsset,
  onUpdateAssetStatus,
  onRefreshAssets,
  initialSubTab = 'inventario',
}) => {
  // Main Sub-tabs inside Ativo Imobilizado
  const [activeSubTab, setActiveSubTab] = useState<'inventario' | 'depreciacao' | 'relatorio_estatistica' | 'baixas' | 'integracao'>(initialSubTab);

  // Search & Filters for Inventory
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAssetForDetails, setSelectedAssetForDetails] = useState<Asset | null>(null);

  // Depreciation Calculation State
  const [periodType, setPeriodType] = useState<DepreciationPeriodType>('mensal');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [depreciationSummary, setDepreciationSummary] = useState<DepreciationSummary | null>(null);
  const [loadingDepreciation, setLoadingDepreciation] = useState(false);

  // Disposal Modal State
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [assetToDispose, setAssetToDispose] = useState<Asset | null>(null);
  const [disposalDate, setDisposalDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [disposalSalePrice, setDisposalSalePrice] = useState<string>('0');
  const [disposalReason, setDisposalReason] = useState<'venda' | 'sucata' | 'descarte' | 'perda' | 'sinistro'>('venda');
  const [disposalNotes, setDisposalNotes] = useState('');
  const [isSubmittingDisposal, setIsSubmittingDisposal] = useState(false);
  const [disposalResult, setDisposalResult] = useState<AssetDisposalCalculation | null>(null);

  // Feedback Toast
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const inventoryReportColumns: ReportColumn[] = [
    { key: 'tagNumber', label: 'Plaqueta', align: 'left' },
    { key: 'description', label: 'Descrição do Bem', align: 'left' },
    { key: 'categoryLabel', label: 'Categoria', align: 'left' },
    { key: 'acquisitionDate', label: 'Data Aquisição', align: 'center', format: (val) => val ? String(val).split('-').reverse().join('/') : '-' },
    { key: 'acquisitionValue', label: 'Valor Aquisição (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'annualRate', label: 'Taxa a.a.', align: 'center', format: (val) => `${val}%` },
    { key: 'costCenter', label: 'Centro de Custo', align: 'left' },
    { 
      key: 'status', 
      label: 'Status', 
      align: 'center',
      format: (val) => (
        <span className={val === 'ativo' ? 'font-bold text-emerald-700' : val === 'baixado' ? 'font-bold text-rose-700' : 'font-bold text-amber-700'}>
          {val === 'ativo' ? 'ATIVO' : val === 'baixado' ? 'BAIXADO' : 'DEPRECIADO'}
        </span>
      )
    },
  ];

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // Fetch Depreciation for current company, month, and periodType
  const fetchDepreciation = useCallback(async () => {
    if (!currentCompany.id) return;
    try {
      setLoadingDepreciation(true);
      const res = await fetch(`/api/assets/depreciation?companyId=${currentCompany.id}&month=${selectedMonth}&periodType=${periodType}`);
      if (res.ok) {
        const data = await res.json();
        setDepreciationSummary(data);
      }
    } catch (err) {
      console.error('Erro ao calcular depreciação:', err);
    } finally {
      setLoadingDepreciation(false);
    }
  }, [currentCompany.id, selectedMonth, periodType]);

  useEffect(() => {
    fetchDepreciation();
  }, [fetchDepreciation]);

  // Inventory filtering
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch = 
        asset.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.supplier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.costCenter || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || asset.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [assets, searchTerm, selectedCategory, selectedStatus]);

  // Inventory statistics
  const activeCount = assets.filter(a => a.status === 'ativo').length;
  const depreciatedCount = assets.filter(a => a.status === 'totalmente_depreciado').length;
  const disposedCount = assets.filter(a => a.status === 'baixado').length;
  const totalValue = assets.reduce((s, a) => s + (a.status !== 'baixado' ? a.acquisitionValue : 0), 0);

  // Real-time disposal calculation preview in modal
  const disposalPreview = useMemo(() => {
    if (!assetToDispose) return null;
    const price = parseFloat(disposalSalePrice.replace(',', '.')) || 0;
    const [dispYear, dispMonth] = disposalDate.split('-').map(Number);
    const startDate = new Date(assetToDispose.depreciationStartDate || assetToDispose.acquisitionDate);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    const monthsElapsed = Math.max(0, (dispYear - startYear) * 12 + (dispMonth - startMonth) + 1);
    const depreciable = Math.max(0, assetToDispose.acquisitionValue - (assetToDispose.residualValue || 0));
    const monthlyRateDec = (assetToDispose.annualRate / 100) / 12;
    const standardMonthlyDeprec = depreciable * monthlyRateDec;

    const accumulatedDeprec = Math.min(depreciable, monthsElapsed * standardMonthlyDeprec);
    const vcl = Math.max(0, assetToDispose.acquisitionValue - accumulatedDeprec);
    const gainOrLoss = price - vcl;

    return {
      acquisitionValue: assetToDispose.acquisitionValue,
      accumulatedDeprec,
      vcl,
      salePrice: price,
      gainOrLoss,
      isGain: gainOrLoss >= 0,
    };
  }, [assetToDispose, disposalDate, disposalSalePrice]);

  // Handle Submit Disposal
  const handleConfirmDisposal = async () => {
    if (!assetToDispose) return;
    setIsSubmittingDisposal(true);
    try {
      const price = parseFloat(disposalSalePrice.replace(',', '.')) || 0;
      const res = await fetch(`/api/assets/${assetToDispose.id}/disposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposalDate,
          salePrice: price,
          disposalReason,
          notes: disposalNotes,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDisposalResult(data.calculation);
        showMsg(data.message || 'Baixa registrada com sucesso!');
        if (onRefreshAssets) onRefreshAssets();
        fetchDepreciation();
      } else {
        showMsg(data.error || 'Erro ao efetuar baixa do bem.', 'error');
      }
    } catch {
      showMsg('Falha de conexão ao registrar baixa.', 'error');
    } finally {
      setIsSubmittingDisposal(false);
    }
  };

  // Export handlers
  const handleDownloadExport = (format: 'ng' | 'dominio' | 'questor' | 'ficha') => {
    const url = `/api/assets/export?companyId=${currentCompany.id}&month=${selectedMonth}&periodType=${periodType}&format=${format}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMsg(`Arquivo de integração para ${format.toUpperCase()} baixado com sucesso!`);
  };

  const handleCopyLayout = async (format: 'ng' | 'dominio') => {
    try {
      const res = await fetch(`/api/assets/export?companyId=${currentCompany.id}&month=${selectedMonth}&periodType=${periodType}&format=${format}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2500);
      showMsg(`Conteúdo formatado copiado para a área de transferência!`);
    } catch {
      showMsg('Erro ao copiar dados.', 'error');
    }
  };

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      
      {/* Alert / Notification */}
      {actionMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-[11px] underline font-bold cursor-pointer">
            Fechar
          </button>
        </div>
      )}

      {/* Module Title Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60">
            <Building2 className="w-5 h-5 text-[#00897b]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
              Módulo de Ativo Imobilizado & Depreciação (CPC 27)
            </h1>
            <p className="text-xs text-slate-500 truncate">
              Empresa: <strong>{currentCompany.fantasyName || currentCompany.name}</strong> • Layout Padrão: {currentCompany.accountingSystem.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Emitir relatório geral do inventário de bens"
          >
            <Printer className="w-4 h-4 text-teal-700" />
            <span>Emitir Relatório</span>
          </button>

          <button
            onClick={onOpenNewAsset}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Novo Bem com IA</span>
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation Bar */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto select-none">
        <button
          onClick={() => setActiveSubTab('inventario')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'inventario'
              ? 'bg-[#00897b] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Inventário de Bens ({assets.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('depreciacao')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'depreciacao'
              ? 'bg-[#00897b] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Apuração de Depreciação</span>
        </button>

        <button
          onClick={() => setActiveSubTab('relatorio_estatistica')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'relatorio_estatistica'
              ? 'bg-[#00897b] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Relatório & Projeção Estatística</span>
        </button>

        <button
          onClick={() => setActiveSubTab('baixas')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'baixas'
              ? 'bg-[#00897b] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Baixa de Bens & Ganho/Perda</span>
        </button>

        <button
          onClick={() => setActiveSubTab('integracao')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeSubTab === 'integracao'
              ? 'bg-[#00897b] text-white shadow-2xs'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Integração ERP (NG Keevo / Domínio)</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 1: INVENTÁRIO DE BENS                                */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'inventario' && (
        <div className="space-y-3">
          {/* Summary Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Bens Ativos</span>
              <div className="text-base font-bold text-slate-900 mt-0.5">{activeCount}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">100% Depreciados</span>
              <div className="text-base font-bold text-amber-600 mt-0.5">{depreciatedCount}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Bens Baixados</span>
              <div className="text-base font-bold text-slate-400 mt-0.5">{disposedCount}</div>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Patrimônio Bruto</span>
              <div className="text-base font-bold text-teal-700 mt-0.5">{formatMoney(totalValue)}</div>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por descrição, plaqueta ou centro de custo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">Todas Categorias</option>
              <option value="ti">TI & Informática</option>
              <option value="maquinas">Máquinas & Equipamentos</option>
              <option value="veiculos">Veículos</option>
              <option value="moveis">Móveis & Utensílios</option>
              <option value="edificacoes">Edificações</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">Todos os Status</option>
              <option value="ativo">Ativo</option>
              <option value="totalmente_depreciado">100% Depreciado</option>
              <option value="baixado">Baixado / Alienado</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Plaqueta / Bem</th>
                  <th className="py-2.5 px-2 hidden sm:table-cell">Categoria</th>
                  <th className="py-2.5 px-2">Aquisição</th>
                  <th className="py-2.5 px-2 text-right">Valor Aquisição</th>
                  <th className="py-2.5 px-2 text-center">Taxa a.a.</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum bem patrimonial encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                          {asset.description}
                        </div>
                        <div className="text-[10px] text-teal-700 font-mono">
                          Plaqueta: {asset.tagNumber}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 hidden sm:table-cell text-slate-600 truncate max-w-[140px]">
                        {asset.categoryLabel}
                      </td>

                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {asset.acquisitionDate.split('-').reverse().join('/')}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {formatMoney(asset.acquisitionValue)}
                      </td>

                      <td className="py-2.5 px-2 text-center font-bold text-slate-700">
                        {asset.annualRate}%
                      </td>

                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {asset.status === 'ativo' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                            Ativo
                          </span>
                        )}
                        {asset.status === 'totalmente_depreciado' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold">
                            100% Depreciado
                          </span>
                        )}
                        {asset.status === 'baixado' && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                            Baixado
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {asset.status !== 'baixado' && (
                            <button
                              onClick={() => {
                                setAssetToDispose(asset);
                                setShowDisposalModal(true);
                                setDisposalResult(null);
                              }}
                              className="px-2 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold transition cursor-pointer"
                              title="Efetuar baixa do bem e calcular ganho/perda de capital"
                            >
                              Baixar
                            </button>
                          )}
                          <button
                            onClick={() => onEditAsset(asset)}
                            className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                            title="Editar bem"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteAsset(asset.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Excluir bem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 2: APURAÇÃO DE DEPRECIAÇÃO (MENSAL, TRIMESTRAL, ANUAL) */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'depreciacao' && (
        <div className="space-y-4">
          {/* Controls: Periodicidade (Mensal, Trimestral, Anual) & Competência */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">Periodicidade da Apuração:</span>
              <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
                <button
                  onClick={() => setPeriodType('mensal')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                    periodType === 'mensal' ? 'bg-[#00897b] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mensal (1 Mês)
                </button>
                <button
                  onClick={() => setPeriodType('trimestral')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                    periodType === 'trimestral' ? 'bg-[#00897b] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Trimestral (3 Meses)
                </button>
                <button
                  onClick={() => setPeriodType('anual')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                    periodType === 'anual' ? 'bg-[#00897b] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Anual (12 Meses)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-slate-600">Competência Final:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs font-bold text-slate-800 cursor-pointer"
              />
              <button
                onClick={fetchDepreciation}
                className="p-1 text-teal-700 hover:bg-teal-50 rounded transition cursor-pointer"
                title="Recalcular"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDepreciation ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Results Summary Cards (Compact) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Bens em Apuração</span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">
                {depreciationSummary?.activeAssets || 0} / {depreciationSummary?.totalAssets || 0}
              </p>
              <span className="text-[10px] text-slate-400">Ativos no período</span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-indigo-500 uppercase">
                Quota {periodType.toUpperCase()}
              </span>
              <p className="text-sm font-bold text-indigo-700 mt-0.5">
                {formatMoney(depreciationSummary?.totalPeriodDepreciation || depreciationSummary?.totalMonthlyDepreciation || 0)}
              </p>
              <span className="text-[10px] text-slate-400">Débito no Resultado (DRE)</span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-500 uppercase">Deprec. Acumulada</span>
              <p className="text-sm font-bold text-amber-700 mt-0.5">
                {formatMoney(depreciationSummary?.totalAccumulatedDepreciation || 0)}
              </p>
              <span className="text-[10px] text-slate-400">Total até {selectedMonth}</span>
            </div>

            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-500 uppercase">Valor Contábil Líquido</span>
              <p className="text-sm font-bold text-emerald-700 mt-0.5">
                {formatMoney(depreciationSummary?.totalNetBookValue || 0)}
              </p>
              <span className="text-[10px] text-slate-400">Saldo residual no Balanço</span>
            </div>
          </div>

          {/* Table of Calculated Items */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Demonstrativo da Quota de Depreciação ({periodType.toUpperCase()})</span>
              <span className="text-[11px] text-slate-500 font-normal">
                Partidas Dobradas: Débito em Despesa (3.x) / Crédito em Deprec. Acumulada (1.2.3.09)
              </span>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Plaqueta / Descrição</th>
                  <th className="py-2.5 px-2 text-right">Depreciável</th>
                  <th className="py-2.5 px-2 text-center">Taxa Anual</th>
                  <th className="py-2.5 px-2 text-right text-indigo-700 font-bold">Quota Período</th>
                  <th className="py-2.5 px-2 text-right text-amber-700">Deprec. Acumulada</th>
                  <th className="py-2.5 px-2 text-right text-emerald-700 font-bold">VCL</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!depreciationSummary || depreciationSummary.items.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum bem para apuração neste período.
                    </td>
                  </tr>
                ) : (
                  depreciationSummary.items.map((item) => (
                    <tr key={item.assetId} className="hover:bg-slate-50/70 transition">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900 truncate max-w-[220px]">
                          {item.description}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.tagNumber} • Centro: {item.costCenter}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-right font-mono text-slate-600 whitespace-nowrap">
                        {formatMoney(item.depreciableValue)}
                      </td>

                      <td className="py-2 px-2 text-center font-bold text-slate-700">
                        {item.annualRate}%
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-black text-indigo-700 whitespace-nowrap">
                        {formatMoney(item.periodDepreciation || item.monthlyDepreciation)}
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-semibold text-amber-700 whitespace-nowrap">
                        {formatMoney(item.currentAccumulatedDepreciation)}
                      </td>

                      <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        {formatMoney(item.netBookValue)}
                      </td>

                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {item.isFullyDepreciated ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold">
                            100% Depreciado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                            Em quota
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 3: RELATÓRIO & PROJEÇÃO ESTATÍSTICA (SIMULAÇÃO FIM)   */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'relatorio_estatistica' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Projeção Estatística de Vida Útil e Término da Depreciação
              </h3>
              <p className="text-slate-500 text-[11px]">
                Simulação baseada na taxa da Receita Federal / CPC 27 demonstrando a data estimada de encerramento da depreciação de cada bem.
              </p>
            </div>

            <button
              onClick={() => handleDownloadExport('ficha')}
              className="px-3.5 py-1.5 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Ficha Patrimonial (.CSV)</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Plaqueta / Bem</th>
                  <th className="py-2.5 px-2">Início Deprec.</th>
                  <th className="py-2.5 px-2 text-center">Vida Útil (Meses)</th>
                  <th className="py-2.5 px-2 text-center">Meses Decorridos</th>
                  <th className="py-2.5 px-2 text-center">Meses Restantes</th>
                  <th className="py-2.5 px-2 text-center text-teal-800 font-bold">Data Final Projetada</th>
                  <th className="py-2.5 px-3 text-center">Progresso Vida Útil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(!depreciationSummary || depreciationSummary.items.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum item calculado.
                    </td>
                  </tr>
                ) : (
                  depreciationSummary.items.map((item) => {
                    const pct = Math.min(100, Math.round((item.monthsElapsed / (item.usefulLifeMonths || 60)) * 100));
                    return (
                      <tr key={item.assetId} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 truncate max-w-[200px]">
                            {item.description}
                          </div>
                          <div className="text-[10px] text-teal-700 font-mono">
                            {item.tagNumber}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                          {item.depreciationStartDate ? item.depreciationStartDate.split('-').reverse().join('/') : item.acquisitionDate.split('-').reverse().join('/')}
                        </td>

                        <td className="py-2.5 px-2 text-center font-mono font-semibold text-slate-700">
                          {item.usefulLifeMonths} meses
                        </td>

                        <td className="py-2.5 px-2 text-center font-mono text-slate-600">
                          {item.monthsElapsed}
                        </td>

                        <td className="py-2.5 px-2 text-center font-mono font-bold text-amber-700">
                          {item.monthsRemaining}
                        </td>

                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            {item.projectedZeroDate || 'Concluído'}
                          </span>
                        </td>

                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden max-w-[120px]">
                              <div
                                className={`h-2 rounded-full ${pct >= 100 ? 'bg-amber-500' : 'bg-teal-600'}`}
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-600 w-8 text-right">
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 4: BAIXA DE BENS & GANHO OU PERDA DE CAPITAL          */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'baixas' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Baixa de Bens Patrimoniais & Apuração de Resultado (CPC 27)
              </h3>
              <p className="text-slate-500 text-[11px]">
                Efetue baixas por venda, sucata, descarte ou perda com apuração automática de Ganho ou Perda de Capital: <code>Valor da Alienação - VCL</code>.
              </p>
            </div>

            <button
              onClick={() => {
                const active = assets.find(a => a.status === 'ativo');
                if (active) {
                  setAssetToDispose(active);
                  setShowDisposalModal(true);
                  setDisposalResult(null);
                } else {
                  showMsg('Nenhum bem ativo disponível para baixa.', 'error');
                }
              }}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>+ Registrar Baixa de Bem</span>
            </button>
          </div>

          {/* List of Disposed Assets */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
              Histórico de Bens Baixados da Empresa
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Plaqueta / Bem</th>
                  <th className="py-2.5 px-2">Data da Baixa</th>
                  <th className="py-2.5 px-2">Motivo</th>
                  <th className="py-2.5 px-2 text-right">Valor Aquisição</th>
                  <th className="py-2.5 px-2 text-right">Valor Alienação</th>
                  <th className="py-2.5 px-3 text-center">Resultado Apurado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assets.filter(a => a.status === 'baixado').length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Nenhum bem baixado registrado até o momento.
                    </td>
                  </tr>
                ) : (
                  assets.filter(a => a.status === 'baixado').map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 truncate max-w-[220px]">
                          {asset.description}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {asset.tagNumber}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                        {asset.disposalDate ? asset.disposalDate.split('-').reverse().join('/') : '—'}
                      </td>

                      <td className="py-2.5 px-2 text-slate-700 capitalize">
                        {asset.disposalReason || 'venda'}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                        {formatMoney(asset.acquisitionValue)}
                      </td>

                      <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                        {formatMoney(asset.salePrice || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {(asset.gainOrLoss || 0) >= 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold">
                            Ganho: +{formatMoney(asset.gainOrLoss || 0)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 text-[10px] font-bold">
                            Perda: {formatMoney(asset.gainOrLoss || 0)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SUB-TAB 5: INTEGRAÇÃO COM ERP (NG KEEVO, DOMÍNIO, QUESTOR)   */}
      {/* ------------------------------------------------------------- */}
      {activeSubTab === 'integracao' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-sm mb-1">
              Exportação e Integração Contábil Automática
            </h3>
            <p className="text-slate-500 text-xs">
              Gere os arquivos com partidas dobradas prontos para importação direta no seu software contábil para a competência <strong>{selectedMonth}</strong> ({periodType.toUpperCase()}).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Opção 1: Mastermaq NG / Keevo */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    Mastermaq NG / Keevo
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">.TXT</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Layout NG (Keevo)</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Padrão com delimitador ponto e vírgula, código de histórico 50 e centros de custo estruturados.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleDownloadExport('ng')}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo NG Keevo</span>
                </button>
                <button
                  onClick={() => handleCopyLayout('ng')}
                  className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedFormat === 'ng' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFormat === 'ng' ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>
              </div>
            </div>

            {/* Opção 2: Domínio Sistemas */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Domínio Sistemas
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">.TXT</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Layout Domínio</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Padrão oficial delimitado por barras verticais <code>DATA|CONTA_D|CONTA_C|VALOR</code> com código de histórico 100.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleDownloadExport('dominio')}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo Domínio</span>
                </button>
                <button
                  onClick={() => handleCopyLayout('dominio')}
                  className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {copiedFormat === 'dominio' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedFormat === 'dominio' ? 'Copiado!' : 'Copiar Texto'}</span>
                </button>
              </div>
            </div>

            {/* Opção 3: Questor / Fortes / Universal CSV */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Questor / Fortes / Universal
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">.CSV</span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Planilha Universal</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  Lançamentos completos com nome das contas, partidas dobradas e histórico detalhado por bem.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleDownloadExport('questor')}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Planilha CSV</span>
                </button>
                <button
                  onClick={() => handleDownloadExport('ficha')}
                  className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Baixar Ficha Patrimonial</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: BAIXA DO BEM COM APURAÇÃO DE GANHO OU PERDA            */}
      {/* ------------------------------------------------------------- */}
      {showDisposalModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Baixa de Bem Patrimonial</h3>
                  <p className="text-xs text-slate-500">Cálculo e contabilização de Ganho ou Perda de Capital</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDisposalModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Bem Selector */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Selecione o Bem a Baixar *</label>
                <select
                  value={assetToDispose?.id || ''}
                  onChange={(e) => {
                    const found = assets.find(a => a.id === e.target.value);
                    if (found) setAssetToDispose(found);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium cursor-pointer"
                >
                  {assets.filter(a => a.status !== 'baixado').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.tagNumber} - {a.description} ({formatMoney(a.acquisitionValue)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Data da Baixa *</label>
                  <input
                    type="date"
                    value={disposalDate}
                    onChange={(e) => setDisposalDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Motivo da Baixa *</label>
                  <select
                    value={disposalReason}
                    onChange={(e) => setDisposalReason(e.target.value as any)}
                    className="w-full p-2 rounded-lg border border-slate-300 bg-white cursor-pointer"
                  >
                    <option value="venda">Venda / Alienação</option>
                    <option value="sucata">Sucata / Fim de Vida</option>
                    <option value="descarte">Descarte / Obsolescência</option>
                    <option value="perda">Perda / Sinistro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Valor da Alienação / Venda (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={disposalSalePrice}
                  onChange={(e) => setDisposalSalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 rounded-lg border border-slate-300 font-mono text-xs font-bold"
                />
                <span className="text-[10px] text-slate-400">Informe 0 caso seja sucata ou descarte sem valor financeiro.</span>
              </div>

              {/* Real-time Calculation Card */}
              {disposalPreview && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Valor de Aquisição:</span>
                    <span>{formatMoney(disposalPreview.acquisitionValue)}</span>
                  </div>
                  <div className="flex justify-between text-amber-700">
                    <span>(-) Deprec. Acumulada:</span>
                    <span>-{formatMoney(disposalPreview.accumulatedDeprec)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1">
                    <span>(=) Valor Contábil Líquido (VCL):</span>
                    <span>{formatMoney(disposalPreview.vcl)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Valor da Venda / Alienação:</span>
                    <span>{formatMoney(disposalPreview.salePrice)}</span>
                  </div>
                  <div className={`flex justify-between font-black text-sm pt-1 border-t border-slate-300 ${
                    disposalPreview.isGain ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    <span>Resultado ({disposalPreview.isGain ? 'GANHO DE CAPITAL' : 'PERDA DE CAPITAL'}):</span>
                    <span>{disposalPreview.isGain ? '+' : ''}{formatMoney(disposalPreview.gainOrLoss)}</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observações ou Nota Fiscal</label>
                <input
                  type="text"
                  placeholder="Ex: NF-e de venda nº 88214 emitida para Comprador XYZ"
                  value={disposalNotes}
                  onChange={(e) => setDisposalNotes(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300"
                />
              </div>

              {/* Result Notice if already submitted */}
              {disposalResult && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Lançamentos Contábeis de Baixa Gerados:</span>
                  </div>
                  <div className="space-y-1 text-[11px] font-mono">
                    {disposalResult.accountingEntries.map((e, idx) => (
                      <div key={idx} className="bg-white p-2 rounded border border-emerald-100">
                        <div><strong>D:</strong> {e.debitAccount} - {e.debitAccountName}</div>
                        <div><strong>C:</strong> {e.creditAccount} - {e.creditAccountName}</div>
                        <div><strong>Valor:</strong> {formatMoney(e.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDisposalModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  {disposalResult ? 'Concluir' : 'Cancelar'}
                </button>
                {!disposalResult && (
                  <button
                    type="button"
                    onClick={handleConfirmDisposal}
                    disabled={isSubmittingDisposal}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingDisposal ? 'Processando...' : 'Confirmar Baixa do Bem'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Print Modal */}
      {showReportModal && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          title="Inventário de Ativo Imobilizado & Posição Patrimonial"
          subtitle={`Controle de Bens e Quotas de Depreciação (CPC 27) • Empresa: ${currentCompany.fantasyName || currentCompany.name}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Bens Ativos', value: activeCount },
            { label: '100% Depreciados', value: depreciatedCount },
            { label: 'Bens Baixados', value: disposedCount },
            { label: 'Patrimônio Bruto', value: formatMoney(totalValue) },
          ]}
          columns={inventoryReportColumns}
          data={filteredAssets}
        />
      )}

    </div>
  );
};
