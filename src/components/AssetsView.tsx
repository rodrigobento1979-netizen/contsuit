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
  Printer,
  Upload,
  Loader2
} from 'lucide-react';
import { 
  Asset, 
  Company, 
  DepreciationSummary, 
  DepreciationPeriodType, 
  AssetDisposalCalculation 
} from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';
import { AssetFichaModal } from './AssetFichaModal';

interface AssetsViewProps {
  assets: Asset[];
  currentCompany: Company;
  onOpenNewAsset: () => void;
  onOpenSmartImport: () => void;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => Promise<void>;
  onDeleteAssetsBatch?: (ids: string[]) => Promise<void>;
  onUpdateAssetStatus: (id: string, status: Asset['status'], notes?: string) => Promise<void>;
  onAssetUpdated?: (asset: Asset) => Promise<void> | void;
  onRefreshAssets?: () => void;
  initialSubTab?: 'inventario' | 'depreciacao' | 'relatorio_estatistica' | 'baixas' | 'integracao';
}

const GENERIC_STATUS_DESCRIPTION_RE =
  /^(em deprecia[cç][aã]o|totalmente depreciad[oa]s?|depreciad[oa]s?|baixad[oa]s?|alienad[oa]s?|ativ[oa]s?|inativ[oa]s?|em uso|em manuten[cç][aã]o|sim|n[aã]o|total|total geral|subtotal)$/i;

export function auditAssetInconsistencies(asset: Asset, tagCounts: Map<string, number>): string[] {
  const issues: string[] = [];
  const desc = String(asset.description || '').trim();
  const tag = String(asset.tagNumber || '').trim();
  const acqVal = Number(asset.acquisitionValue || 0);
  const resVal = Number(asset.residualValue || 0);
  const rate = Number(asset.annualRate || 0);
  const life = Number(asset.usefulLifeMonths || 0);
  const initDep = asset.initialAccumulatedDepreciation;
  const depreciable = Math.max(0, acqVal - resVal);

  if (desc.length < 3 || GENERIC_STATUS_DESCRIPTION_RE.test(desc)) {
    issues.push('Descrição genérica de status/título em vez do nome do bem');
  }
  if (!Number.isFinite(acqVal) || acqVal <= 10) {
    issues.push(`Valor de aquisição inválido ou simbólico (R$ ${acqVal.toFixed(2)})`);
  }
  if (acqVal > 0 && resVal >= acqVal) {
    issues.push('Valor residual maior ou igual ao valor de aquisição');
  }
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    issues.push(`Taxa anual fora da faixa contábil (${rate}%)`);
  }
  if (!Number.isFinite(life) || life <= 0) {
    issues.push('Vida útil em meses inválida');
  }

  const acqDate = String(asset.acquisitionDate || '').slice(0, 10);
  const depStart = String(asset.depreciationStartDate || acqDate).slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acqDate)) {
    issues.push('Data de aquisição inválida');
  } else if (acqDate > todayIso) {
    issues.push(`Data de aquisição no futuro (${acqDate.split('-').reverse().join('/')})`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(acqDate) && /^\d{4}-\d{2}-\d{2}$/.test(depStart) && depStart < acqDate) {
    issues.push('Início da depreciação anterior à data de aquisição');
  }

  if (initDep !== undefined && Number(initDep) > 0) {
    if (Number(initDep) > depreciable + 0.01) {
      issues.push('Depreciação acumulada inicial maior que o valor depreciável');
    }
    if (!asset.initialAccumulatedDepreciationDate) {
      issues.push('Depreciação acumulada inicial sem data de corte');
    }
  }

  if (tag && (tagCounts.get(tag.toLowerCase()) || 0) > 1) {
    issues.push(`Plaqueta duplicada (${tag})`);
  }

  return issues;
}

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  currentCompany,
  onOpenNewAsset,
  onOpenSmartImport,
  onEditAsset,
  onDeleteAsset,
  onDeleteAssetsBatch,
  onUpdateAssetStatus,
  onAssetUpdated,
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
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
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

  // Feedback Toast, Batch Selection & Delete Confirmation
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [activeReportModal, setActiveReportModal] = useState<'inventario' | 'posicao_atualizada' | 'mapa_depreciacao' | null>(null);
  const [showFichaModal, setShowFichaModal] = useState(false);
  const [fichaAssetId, setFichaAssetId] = useState<string | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

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

  const posicaoAtualizadaReportColumns: ReportColumn[] = [
    { key: 'tagNumber', label: 'Patrimônio', align: 'left' },
    { key: 'description', label: 'Nome / Descrição do Bem', align: 'left' },
    { key: 'acquisitionDate', label: 'Aquisição', align: 'center', format: (val) => val ? String(val).split('-').reverse().join('/') : '-' },
    { key: 'acquisitionValue', label: 'Valor Original Compra (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'currentAccumulatedDepreciation', label: 'Deprec. Acumulada (Até Emissão) (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'netBookValue', label: 'Saldo Residual (VCL) (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'annualRate', label: 'Taxa Deprec. (% a.a.)', align: 'center', format: (val) => `${val}% a.a.` },
  ];

  const mapaDepreciacaoReportColumns: ReportColumn[] = [
    { key: 'tagNumber', label: 'Patrimônio', align: 'left' },
    { key: 'description', label: 'Descrição do Bem', align: 'left' },
    { key: 'acquisitionValue', label: 'Valor Aquisição (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'depreciableValue', label: 'Valor a Depreciar (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'previousAccumulatedDepreciation', label: 'Deprec. Acum. Anterior (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'periodDepreciation', label: `Cota do Período (${periodType.toUpperCase()}) (R$)`, align: 'right', format: (val, row) => `R$ ${Number(val || row.monthlyDepreciation || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'currentAccumulatedDepreciation', label: 'Deprec. Acum. Atual (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
    { key: 'netBookValue', label: 'Saldo Final a Depreciar (R$)', align: 'right', format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
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

  // Inconsistency audit across inventory
  const { issuesByAssetId, inconsistentAssetIds } = useMemo(() => {
    const tagCounts = new Map<string, number>();
    assets.forEach((a) => {
      const t = String(a.tagNumber || '').trim().toLowerCase();
      if (t && a.status !== 'baixado') {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    });
    const map = new Map<string, string[]>();
    const badIds: string[] = [];
    assets.forEach((a) => {
      const issues = auditAssetInconsistencies(a, tagCounts);
      if (issues.length > 0) {
        map.set(a.id, issues);
        badIds.push(a.id);
      }
    });
    return { issuesByAssetId: map, inconsistentAssetIds: badIds };
  }, [assets]);

  // Keep selectedAssetIds pruned to existing assets
  useEffect(() => {
    const validIds = new Set(assets.map((a) => a.id));
    setSelectedAssetIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [assets]);

  // Inventory filtering
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch = 
        asset.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.tagNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.supplier || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.costCenter || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || asset.category === selectedCategory;
      const matchesStatus =
        selectedStatus === 'all'
          ? true
          : selectedStatus === 'inconsistentes'
            ? issuesByAssetId.has(asset.id)
            : asset.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [assets, searchTerm, selectedCategory, selectedStatus, issuesByAssetId]);

  const handleToggleSelectAllVisible = () => {
    const visibleIds = filteredAssets.map((a) => a.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedAssetIds.includes(id));
    if (allVisibleSelected) {
      setSelectedAssetIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedAssetIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
    setConfirmBatchDelete(false);
  };

  const handleToggleAssetSelection = (id: string) => {
    setSelectedAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setConfirmBatchDelete(false);
  };

  const handleExecuteBatchDelete = async () => {
    if (selectedAssetIds.length === 0 || isBatchDeleting) return;
    setIsBatchDeleting(true);
    try {
      const toDelete = [...selectedAssetIds];
      if (onDeleteAssetsBatch) {
        await onDeleteAssetsBatch(toDelete);
      } else {
        for (const id of toDelete) {
          await onDeleteAsset(id);
        }
      }
      setSelectedAssetIds([]);
      setConfirmBatchDelete(false);
      showMsg(`${toDelete.length} bem(ns) excluído(s) definitivamente. Você já pode reimportar a planilha limpa.`);
    } catch (err: any) {
      showMsg(err?.message || 'Erro ao excluir bens selecionados.', 'error');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // Inventory statistics
  const activeCount = assets.filter(a => a.status === 'ativo').length;
  const depreciatedCount = assets.filter(a => a.status === 'totalmente_depreciado').length;
  const disposedCount = assets.filter(a => a.status === 'baixado').length;
  const totalValue = assets.reduce((s, a) => s + (a.status !== 'baixado' ? a.acquisitionValue : 0), 0);

  // Real-time disposal calculation preview in modal
  const disposalPreview = useMemo(() => {
    if (!assetToDispose) return null;
    const price = parseFloat(disposalSalePrice.replace(',', '.')) || 0;
    const [dispYear, dispMonth] = disposalDate.slice(0, 10).split('-').map(Number);
    const rawStartStr = (assetToDispose.depreciationStartDate || assetToDispose.acquisitionDate || '').slice(0, 10);
    const startParts = rawStartStr.split('-').map(Number);
    const startYear = startParts[0] || dispYear;
    const startMonth = startParts[1] || dispMonth;

    const monthsElapsed = Math.max(0, (dispYear - startYear) * 12 + (dispMonth - startMonth) + 1);
    const depreciable = Math.max(0, assetToDispose.acquisitionValue - (assetToDispose.residualValue || 0));
    const monthlyRateDec = (assetToDispose.annualRate / 100) / 12;
    const standardMonthlyDeprec = depreciable * monthlyRateDec;

    let accumulatedDeprec = 0;
    if (
      assetToDispose.status === 'totalmente_depreciado' &&
      (assetToDispose.initialAccumulatedDepreciation ?? depreciable) >= depreciable - 0.01
    ) {
      accumulatedDeprec = depreciable;
    } else if (
      assetToDispose.initialAccumulatedDepreciation !== undefined &&
      assetToDispose.initialAccumulatedDepreciation >= 0 &&
      assetToDispose.initialAccumulatedDepreciationDate
    ) {
      const [cutY, cutM] = assetToDispose.initialAccumulatedDepreciationDate.slice(0, 10).split('-').map(Number);
      const openingAccum = Math.min(depreciable, Math.max(0, Number(assetToDispose.initialAccumulatedDepreciation)));
      const monthsAfterCutoff = (dispYear - cutY) * 12 + (dispMonth - cutM);
      if (monthsAfterCutoff <= 0) {
        accumulatedDeprec = openingAccum;
      } else {
        accumulatedDeprec = Math.min(depreciable, openingAccum + monthsAfterCutoff * standardMonthlyDeprec);
      }
    } else {
      accumulatedDeprec = Math.min(depreciable, monthsElapsed * standardMonthlyDeprec);
    }

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
        if (data.asset && onAssetUpdated) {
          await onAssetUpdated(data.asset);
        }
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
            {actionMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
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
            onClick={() => setActiveReportModal('inventario')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Emitir relatório geral do inventário de bens"
          >
            <Printer className="w-4 h-4 text-teal-700" />
            <span>Emitir Inventário</span>
          </button>

          <button
            onClick={() => setActiveReportModal('posicao_atualizada')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Posição Atualizada de Bens (Nome, Patrimônio, Aquisição, Valor Original, Deprec. Acumulada, Saldo Residual e Taxa)"
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-700" />
            <span>Posição Atualizada de Bens</span>
          </button>

          <button
            onClick={() => setActiveReportModal('mapa_depreciacao')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Mapa de Depreciação com período, valor a depreciar, cota do período e saldo final"
          >
            <Layers className="w-4 h-4 text-indigo-700" />
            <span>Mapa de Depreciação</span>
          </button>

          <button
            onClick={() => {
              setFichaAssetId(filteredAssets[0]?.id || assets[0]?.id);
              setShowFichaModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Emitir Ficha Individual do Bem com dados cadastrais e histórico de movimentações"
          >
            <FileText className="w-4 h-4 text-teal-700" />
            <span>Ficha do Bem</span>
          </button>

          <button
            onClick={onOpenSmartImport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Anexar PDF, XLS ou documento do ativo para cadastro assistido por IA"
          >
            <Upload className="w-4 h-4 text-[#a7ffeb]" />
            <span>Anexar Arquivo p/ Cadastro IA</span>
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
            <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
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
              {inconsistentAssetIds.length > 0 && (
                <option value="inconsistentes">Com Inconsistências ({inconsistentAssetIds.length})</option>
              )}
            </select>
          </div>

          {/* Audit Alert Banner for previously inconsistent assets */}
          {inconsistentAssetIds.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Auditoria Contábil: {inconsistentAssetIds.length} bem(ns) com possível inconsistência cadastral/importação
                  </p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Itens com descrição genérica, valor simbólico, plaqueta duplicada ou depreciação acumulada inconsistente. Selecione-os para excluir em lote antes de reimportar a planilha.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedStatus(selectedStatus === 'inconsistentes' ? 'all' : 'inconsistentes')}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-[11px] transition cursor-pointer"
                >
                  {selectedStatus === 'inconsistentes' ? 'Mostrar Todos' : `Filtrar Inconsistentes (${inconsistentAssetIds.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAssetIds(inconsistentAssetIds);
                    setSelectedStatus('inconsistentes');
                    setConfirmBatchDelete(false);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition cursor-pointer"
                >
                  Selecionar Inconsistentes
                </button>
              </div>
            </div>
          )}

          {/* Batch Action Bar */}
          {selectedAssetIds.length > 0 && (
            <div className="bg-slate-900 text-white rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm">
              <span className="font-semibold">
                {selectedAssetIds.length} bem(ns) selecionado(s) no inventário
              </span>
              <div className="flex items-center gap-2">
                {confirmBatchDelete ? (
                  <>
                    <span className="text-amber-300 font-bold text-[11px]">
                      Excluir definitivamente do banco e Firebase?
                    </span>
                    <button
                      type="button"
                      onClick={handleExecuteBatchDelete}
                      disabled={isBatchDeleting}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      {isBatchDeleting && <Loader2 className="w-3 h-3 animate-spin" />}
                      Confirmar Exclusão ({selectedAssetIds.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(false)}
                      disabled={isBatchDeleting}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold text-[11px] transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssetIds([]);
                        setConfirmBatchDelete(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold text-[11px] transition cursor-pointer"
                    >
                      Limpar Seleção
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBatchDelete(true)}
                      className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Excluir Selecionados ({selectedAssetIds.length})
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 pl-3 pr-1 w-8 text-center">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os bens listados"
                      checked={filteredAssets.length > 0 && filteredAssets.every((a) => selectedAssetIds.includes(a.id))}
                      onChange={handleToggleSelectAllVisible}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                  </th>
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
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Nenhum bem patrimonial encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => {
                    const rowIssues = issuesByAssetId.get(asset.id) || [];
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                    <tr key={asset.id} className={`hover:bg-slate-50/70 transition ${isSelected ? 'bg-teal-50/40' : rowIssues.length > 0 ? 'bg-amber-50/30' : ''}`}>
                      <td className="py-2.5 pl-3 pr-1 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${asset.description}`}
                          checked={isSelected}
                          onChange={() => handleToggleAssetSelection(asset.id)}
                          className="mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                            {asset.description}
                          </span>
                          {rowIssues.length > 0 && (
                            <span
                              title={rowIssues.join(' • ')}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold shrink-0"
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                              Revisar
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-teal-700 font-mono flex flex-wrap items-center gap-x-2">
                          <span>Plaqueta: {asset.tagNumber}</span>
                          {asset.assetAccount && (
                            <span className="text-slate-500">Cta: {asset.assetAccount}</span>
                          )}
                          {(asset.initialAccumulatedDepreciation || 0) > 0 && (
                            <span className="text-amber-700 font-semibold">
                              Dep. Acum. Imp.: {formatMoney(asset.initialAccumulatedDepreciation || 0)}
                              {asset.initialAccumulatedDepreciationDate
                                ? ` (${asset.initialAccumulatedDepreciationDate.split('-').reverse().join('/')})`
                                : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2 hidden sm:table-cell text-slate-600 truncate max-w-[140px]">
                        {asset.assetGroup || asset.categoryLabel}
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
                          {confirmDeleteId === asset.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-1.5 py-0.5">
                              <span className="text-[10px] font-bold text-rose-800 mr-1">Excluir?</span>
                              <button
                                onClick={async () => {
                                  if (deletingAssetId) return;
                                  setDeletingAssetId(asset.id);
                                  try {
                                    await onDeleteAsset(asset.id);
                                    setConfirmDeleteId(null);
                                  } finally {
                                    setDeletingAssetId(null);
                                  }
                                }}
                                disabled={deletingAssetId === asset.id}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                {deletingAssetId === asset.id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                Sim
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={deletingAssetId === asset.id}
                                className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-[10px] font-semibold transition cursor-pointer"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <>
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
                                onClick={() => {
                                  setFichaAssetId(asset.id);
                                  setShowFichaModal(true);
                                }}
                                className="px-2 py-1 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 text-[10px] font-bold transition cursor-pointer"
                                title="Ver Ficha Individual do Bem"
                              >
                                Ficha
                              </button>
                              <button
                                onClick={() => onEditAsset(asset)}
                                className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                title="Editar bem"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(asset.id)}
                                disabled={deletingAssetId === asset.id}
                                className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer disabled:opacity-40"
                                title="Excluir bem"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );})
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
                onClick={async () => {
                  await fetchDepreciation();
                  showMsg(`Apuração de depreciação processada com sucesso para ${selectedMonth.split('-').reverse().join('/')}!`);
                }}
                disabled={loadingDepreciation}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 shadow-2xs"
                title="Processar apuração contábil da depreciação"
              >
                {loadingDepreciation ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>Processar Apuração</span>
              </button>

              <button
                onClick={fetchDepreciation}
                className="p-1.5 text-teal-700 hover:bg-teal-50 rounded-lg transition cursor-pointer border border-teal-200 bg-white"
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

          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
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
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92dvh] overflow-y-auto">
            
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Report Print Modals */}
      {activeReportModal === 'inventario' && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setActiveReportModal(null)}
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

      {activeReportModal === 'posicao_atualizada' && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setActiveReportModal(null)}
          title="Relatório: Posição Atualizada de Bens"
          subtitle={`Competência de Emissão: ${selectedMonth.split('-').reverse().join('/')} • Empresa: ${currentCompany.fantasyName || currentCompany.name}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Competência', value: selectedMonth.split('-').reverse().join('/') },
            { label: 'Total Ativos', value: depreciationSummary?.activeAssets || assets.length },
            { label: 'Deprec. Acumulada Total', value: formatMoney(depreciationSummary?.totalAccumulatedDepreciation || 0) },
            { label: 'Saldo Residual (VCL Total)', value: formatMoney(depreciationSummary?.totalNetBookValue || 0) },
          ]}
          columns={posicaoAtualizadaReportColumns}
          data={depreciationSummary?.items || []}
        />
      )}

      {activeReportModal === 'mapa_depreciacao' && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setActiveReportModal(null)}
          title={`Mapa de Depreciação do Ativo Imobilizado (${periodType.toUpperCase()})`}
          subtitle={`Período de Apuração: ${selectedMonth.split('-').reverse().join('/')} • Empresa: ${currentCompany.fantasyName || currentCompany.name}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Período / Competência', value: selectedMonth.split('-').reverse().join('/') + ` (${periodType.toUpperCase()})` },
            { label: 'Valor a Depreciar Total', value: formatMoney(depreciationSummary?.totalDepreciableValue || 0) },
            { label: `Cota do Período (${periodType.toUpperCase()})`, value: formatMoney(depreciationSummary?.totalPeriodDepreciation || depreciationSummary?.totalMonthlyDepreciation || 0) },
            { label: 'Saldo Final a Depreciar (VCL)', value: formatMoney(depreciationSummary?.totalNetBookValue || 0) },
          ]}
          columns={mapaDepreciacaoReportColumns}
          data={depreciationSummary?.items || []}
        />
      )}

      {showFichaModal && (
        <AssetFichaModal
          isOpen={true}
          onClose={() => setShowFichaModal(false)}
          assets={filteredAssets.length > 0 ? filteredAssets : assets}
          initialAssetId={fichaAssetId}
          company={currentCompany}
        />
      )}

    </div>
  );
};
