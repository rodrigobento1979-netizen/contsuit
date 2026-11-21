import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  DollarSign,
  Percent,
  SkipForward,
  Check,
  Loader2,
  Layers,
  Info,
  Building2,
  RotateCcw,
  Plus,
  Calendar,
  BookOpen,
  CheckCheck,
} from 'lucide-react';
import {
  Asset,
  Company,
  ExtractedAssetCandidate,
  AssetExtractionResponse,
} from '../types';

interface AssetSmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCompany: Company;
  onSaveAsset: (assetData: Partial<Asset>) => Promise<void>;
  onSaveAssetsBatch?: (assetsData: Partial<Asset>[]) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const CATEGORIES: Array<{
  value: Asset['category'];
  label: string;
  rate: number;
  months: number;
}> = [
  { value: 'ti', label: 'Equipamentos de Informática (TI)', rate: 20, months: 60 },
  { value: 'veiculos', label: 'Veículos e Automotores', rate: 20, months: 60 },
  { value: 'maquinas', label: 'Máquinas e Equipamentos', rate: 10, months: 120 },
  { value: 'moveis', label: 'Móveis e Utensílios de Escritório', rate: 10, months: 120 },
  { value: 'edificacoes', label: 'Edificações e Construções Civis', rate: 4, months: 300 },
  { value: 'software', label: 'Sistemas e Softwares / Intangíveis', rate: 20, months: 60 },
  { value: 'ferramentas', label: 'Ferramentas Industriais e Fabris', rate: 15, months: 80 },
  { value: 'instalacoes', label: 'Instalações Comerciais e Prediais', rate: 10, months: 120 },
  { value: 'outro', label: 'Outros Bens do Ativo Permanente', rate: 10, months: 120 },
];

type CandidateDecision = 'pending' | 'registered' | 'skipped';

interface ReviewItem extends ExtractedAssetCandidate {
  decision: CandidateDecision;
}

const formatMoney = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatBrDate = (iso?: string) =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '—';

export const AssetSmartImportModal: React.FC<AssetSmartImportModalProps> = ({
  isOpen,
  onClose,
  currentCompany,
  onSaveAsset,
  onSaveAssetsBatch,
  showToast,
}) => {
  const [stage, setStage] = useState<'upload' | 'review' | 'summary'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [extractionMeta, setExtractionMeta] = useState<Omit<AssetExtractionResponse, 'candidates'> | null>(null);

  // Queue state ("um a um")
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetAll = () => {
    setStage('upload');
    setSelectedFile(null);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setExtractionMeta(null);
    setItems([]);
    setCurrentIndex(0);
    setIsSavingCurrent(false);
    setIsSavingAll(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const currentItem = items[currentIndex] || null;

  const stats = useMemo(() => {
    const registered = items.filter((i) => i.decision === 'registered');
    const skipped = items.filter((i) => i.decision === 'skipped');
    const pending = items.filter((i) => i.decision === 'pending');
    const registeredValue = registered.reduce((acc, i) => acc + Number(i.acquisitionValue || 0), 0);
    const registeredAccDep = registered.reduce((acc, i) => acc + Number(i.accumulatedDepreciation || 0), 0);
    return { registered, skipped, pending, registeredValue, registeredAccDep };
  }, [items]);

  if (!isOpen) return null;

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const b64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(b64);
      };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo selecionado.'));
      reader.readAsDataURL(file);
    });

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const base64Data = await readFileAsBase64(file);
      const res = await fetch('/api/assets/analyze-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64Data,
        }),
      });

      const data = (await res.json()) as AssetExtractionResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao analisar o arquivo com IA.');
      }

      setExtractionMeta({
        fileName: data.fileName,
        fileType: data.fileType,
        sheetsAnalyzed: data.sheetsAnalyzed || [],
        usedAi: data.usedAi,
        usedFallback: data.usedFallback,
        aiWarning: data.aiWarning,
        summaryText: data.summaryText,
      });

      const reviewQueue: ReviewItem[] = (data.candidates || []).map((c) => ({
        ...c,
        debitAccount:
          c.debitAccount ||
          currentCompany.chartOfAccounts?.depreciationExpenseAccount ||
          '3.1.2.04.0010',
        creditAccount:
          c.creditAccount ||
          currentCompany.chartOfAccounts?.accumulatedDepreciationAccount ||
          '1.2.3.09.0001',
        assetAccount:
          c.assetAccount ||
          currentCompany.chartOfAccounts?.assetDefaultAccount ||
          '1.2.3.01.0001',
        decision: 'pending',
      }));

      setItems(reviewQueue);
      setCurrentIndex(0);
      setStage('review');
    } catch (err: any) {
      setAnalysisError(err?.message || 'Não foi possível ler o arquivo enviado.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateCurrentItem = (patch: Partial<ReviewItem>) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === currentIndex ? { ...item, ...patch } : item))
    );
  };

  const handleCategoryChange = (catValue: Asset['category']) => {
    const found = CATEGORIES.find((c) => c.value === catValue);
    if (!found) return;
    updateCurrentItem({
      category: found.value,
      categoryLabel: found.label,
      annualRate: found.rate,
      usefulLifeMonths: found.months,
      usefulLifeYears: Math.round((found.months / 12) * 10) / 10,
    });
  };

  const handleRateChange = (rate: number) => {
    const validRate = Math.max(0.1, Math.min(100, Number(rate) || 10));
    const months = Math.max(12, Math.round((100 / validRate) * 12));
    updateCurrentItem({
      annualRate: validRate,
      usefulLifeMonths: months,
      usefulLifeYears: Math.round((months / 12) * 10) / 10,
    });
  };

  const buildAssetPayload = (item: ReviewItem): Partial<Asset> => {
    const notesParts = [
      item.notes,
      item.sourceSheet ? `Origem: ${item.sourceSheet}${item.sourceRow ? ` (Linha ${item.sourceRow})` : ''}` : '',
      item.marking ? `Marcação: ${item.marking}` : '',
      item.depreciationHistoryNote ? `Histórico Dep.: ${item.depreciationHistoryNote}` : '',
      item.lastPeriodQuota ? `Última Quota: ${formatMoney(item.lastPeriodQuota)}` : '',
    ].filter(Boolean);

    const accDep = Number(item.accumulatedDepreciation || 0);
    const acqVal = Number(item.acquisitionValue || 0);
    const resVal = Number(item.residualValue || 0);
    const depreciable = Math.max(0, acqVal - resVal);
    const derivedStatus: Asset['status'] =
      item.status ||
      (accDep > 0 && depreciable > 0 && accDep >= depreciable - 0.01
        ? 'totalmente_depreciado'
        : 'ativo');

    return {
      companyId: currentCompany.id,
      description: item.description.trim(),
      tagNumber: item.tagNumber.trim() || `PAT-${Math.floor(1000 + Math.random() * 9000)}`,
      category: item.category,
      categoryLabel: item.categoryLabel,
      assetGroup: item.assetGroup,
      assetClass: item.assetClass,
      postToTrialBalance: item.postToTrialBalance,
      status: derivedStatus,
      acquisitionDate: item.acquisitionDate || item.depreciationStartDate || new Date().toISOString().slice(0, 10),
      depreciationStartDate: item.depreciationStartDate || item.acquisitionDate || new Date().toISOString().slice(0, 10),
      acquisitionValue: acqVal,
      residualValue: resVal,
      initialAccumulatedDepreciation: accDep > 0 ? Number(accDep.toFixed(2)) : 0,
      initialAccumulatedDepreciationDate:
        accDep > 0
          ? item.accumulatedDepreciationDate || item.depreciationStartDate || item.acquisitionDate
          : undefined,
      annualRate: Number(item.annualRate || 10),
      usefulLifeMonths: Number(item.usefulLifeMonths || 120),
      costCenter: item.costCenter || item.marking || 'Administrativo',
      location: item.location || 'Sede Principal',
      supplier: item.supplier || '',
      invoiceNumber: item.invoiceNumber || '',
      debitAccount:
        item.debitAccount ||
        currentCompany.chartOfAccounts?.depreciationExpenseAccount ||
        '3.1.2.04.0010',
      creditAccount:
        item.creditAccount ||
        currentCompany.chartOfAccounts?.accumulatedDepreciationAccount ||
        '1.2.3.09.0001',
      assetAccount:
        item.assetAccount ||
        currentCompany.chartOfAccounts?.assetDefaultAccount ||
        '1.2.3.01.0001',
      notes: notesParts.join(' • '),
    };
  };

  const advanceToNextOrSummary = (updatedItems: ReviewItem[], fromIdx: number) => {
    const nextPendingAfter = updatedItems.findIndex(
      (item, idx) => idx > fromIdx && item.decision === 'pending'
    );
    if (nextPendingAfter !== -1) {
      setCurrentIndex(nextPendingAfter);
      return;
    }
    const anyPending = updatedItems.findIndex((item) => item.decision === 'pending');
    if (anyPending !== -1) {
      setCurrentIndex(anyPending);
      return;
    }
    if (fromIdx + 1 < updatedItems.length) {
      setCurrentIndex(fromIdx + 1);
      return;
    }
    setStage('summary');
  };

  const handleRegisterCurrent = async () => {
    if (!currentItem || isSavingCurrent || isSavingAll) return;
    if (!currentItem.description.trim()) {
      showToast('Informe a descrição do bem antes de cadastrar.', 'error');
      return;
    }
    if (Number(currentItem.acquisitionValue) <= 0) {
      showToast('Informe um valor de aquisição maior que zero.', 'error');
      return;
    }

    setIsSavingCurrent(true);
    try {
      await onSaveAsset(buildAssetPayload(currentItem));

      const nextList: ReviewItem[] = items.map((item, idx) =>
        idx === currentIndex ? { ...item, decision: 'registered' } : item
      );
      setItems(nextList);
      advanceToNextOrSummary(nextList, currentIndex);
    } catch (err: any) {
      showToast(err?.message || 'Erro ao cadastrar bem no ativo.', 'error');
    } finally {
      setIsSavingCurrent(false);
    }
  };

  const handleRegisterAllPending = async () => {
    if (isSavingAll || isSavingCurrent || stats.pending.length === 0) return;
    setIsSavingAll(true);
    let savedCount = 0;
    const nextItems = [...items];

    try {
      const validIndices: number[] = [];
      const payloads: Partial<Asset>[] = [];

      for (let i = 0; i < nextItems.length; i++) {
        const it = nextItems[i];
        if (it.decision !== 'pending') continue;
        if (!it.description.trim() || Number(it.acquisitionValue) <= 0) continue;
        validIndices.push(i);
        payloads.push(buildAssetPayload(it));
      }

      if (payloads.length === 0) {
        showToast('Nenhum item pendente possui descrição e valor válido (> 0) para cadastrar.', 'error');
        setIsSavingAll(false);
        return;
      }

      if (onSaveAssetsBatch) {
        await onSaveAssetsBatch(payloads);
        validIndices.forEach((idx) => {
          nextItems[idx] = { ...nextItems[idx], decision: 'registered' };
        });
        savedCount = payloads.length;
      } else {
        for (const idx of validIndices) {
          await onSaveAsset(buildAssetPayload(nextItems[idx]));
          nextItems[idx] = { ...nextItems[idx], decision: 'registered' };
          savedCount++;
        }
        showToast(`${savedCount} bem(ns) cadastrado(s) com sucesso no inventário!`, 'success');
      }

      setItems(nextItems);
      setStage('summary');
    } catch (err: any) {
      setItems(nextItems);
      showToast(
        err?.message || `Importação interrompida após ${savedCount} cadastro(s).`,
        'error'
      );
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSkipCurrent = () => {
    if (!currentItem || isSavingAll) return;
    const nextList: ReviewItem[] = items.map((item, idx) =>
      idx === currentIndex ? { ...item, decision: 'skipped' } : item
    );
    setItems(nextList);
    advanceToNextOrSummary(nextList, currentIndex);
  };

  const handleAddBlankCandidate = () => {
    const newItem: ReviewItem = {
      tempId: `manual-${Date.now().toString(36)}`,
      description: '',
      tagNumber: `PAT-${String(items.length + 1).padStart(3, '0')}`,
      category: 'maquinas',
      categoryLabel: 'Máquinas e Equipamentos',
      acquisitionDate: new Date().toISOString().slice(0, 10),
      depreciationStartDate: new Date().toISOString().slice(0, 10),
      acquisitionValue: 0,
      residualValue: 0,
      accumulatedDepreciation: 0,
      annualRate: 10,
      usefulLifeMonths: 120,
      usefulLifeYears: 10,
      status: 'ativo',
      costCenter: 'Administrativo',
      location: 'Sede Principal',
      supplier: '',
      invoiceNumber: '',
      debitAccount: currentCompany.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010',
      creditAccount: currentCompany.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001',
      assetAccount: currentCompany.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001',
      sourceSheet: 'Inclusão Manual',
      confidence: 100,
      decision: 'pending',
    };
    const next = [...items, newItem];
    setItems(next);
    setCurrentIndex(next.length - 1);
  };

  const progressPct =
    items.length > 0
      ? Math.round(
          ((stats.registered.length + stats.skipped.length) / items.length) * 100
        )
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94dvh]">
        {/* Header */}
        <div className="bg-[#004d40] px-4 sm:px-5 py-3.5 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-[#a7ffeb]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base leading-tight truncate">
                Leitura Completa de Planilhas & Documentos (Um a Um)
              </h2>
              <p className="text-[11px] text-teal-100 truncate">
                {currentCompany.fantasyName || currentCompany.name} • Lê 100% da 1ª aba, Depreciação Acumulada e Contas Contábeis
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* STAGE 1: UPLOAD */}
          {stage === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition cursor-pointer group ${
                  isAnalyzing
                    ? 'border-teal-400 bg-teal-50/40'
                    : 'border-slate-300 bg-slate-50 hover:bg-teal-50/30 hover:border-teal-500'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.ods,.csv,.pdf,.xml,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileUpload(file);
                  }}
                  className="hidden"
                />

                {isAnalyzing ? (
                  <div className="space-y-3 py-2">
                    <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-md">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        Extraindo todas as colunas da planilha e saldos de depreciação...
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Arquivo: <strong className="text-slate-700">{selectedFile?.name}</strong>
                      </p>
                      <p className="text-[11px] text-teal-700 mt-1">
                        Mapeando Custo Base, Depreciação Acumulada, Contas Contábeis, Vida Útil e Situação.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center mx-auto group-hover:scale-105 transition">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">
                        Enviar Planilha de Controle de Ativo, PDF, XML ou Foto de Nota
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Suporta <strong>.XLSX, .XLS, .ODS, .CSV</strong> (importação integral da 1ª aba + Dep. Acumulada), <strong>NF-e .XML, .PDF e Imagens</strong>.
                      </p>
                    </div>
                    <div className="pt-2">
                      <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold shadow-xs">
                        <FileSpreadsheet className="w-4 h-4" />
                        Selecionar Arquivo do Computador / Celular
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {analysisError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Falha ao analisar arquivo</p>
                    <p className="mt-0.5">{analysisError}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1">
                    <Layers className="w-3.5 h-3.5 text-teal-600" />
                    <span>1ª Aba Integral</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Lê todos os bens sem truncamento, capturando Grupo, Classe, Marcação, Vida Útil (anos) e Contas Contábeis.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Depreciação Acumulada</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Preserva o saldo de <strong>Dep. Acumulada</strong> já existente na planilha e continua a apuração a partir da data de corte.
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Revisão Um a Um</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Confira cada item individualmente ou aprove os pendentes em lote direto para o inventário CPC 27.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 2: ONE-BY-ONE REVIEW */}
          {stage === 'review' && (
            <div className="space-y-3.5">
              {/* Top Analysis Summary Banner */}
              {extractionMeta && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="font-bold text-slate-900 truncate">
                        {extractionMeta.fileName}
                      </span>
                      <span className="text-[10px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                        {extractionMeta.usedAi ? 'Extração Integral + IA' : 'Leitor Contábil Completo'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 font-mono tabular-nums text-[11px]">
                      <span className="text-emerald-700 font-bold">
                        {stats.registered.length} cadastrado(s)
                      </span>
                      <span className="text-slate-500">
                        {stats.skipped.length} pulado(s)
                      </span>
                      {stats.pending.length > 1 && (
                        <button
                          type="button"
                          onClick={handleRegisterAllPending}
                          disabled={isSavingAll || isSavingCurrent}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-sans font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                        >
                          {isSavingAll ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCheck className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isSavingAll
                              ? 'Cadastrando...'
                              : `Cadastrar Todos (${stats.pending.length})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {extractionMeta.summaryText && (
                    <p className="text-[11px] text-slate-600">{extractionMeta.summaryText}</p>
                  )}

                  {extractionMeta.sheetsAnalyzed.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-700">Abas detectadas:</span>
                      {extractionMeta.sheetsAnalyzed.map((s, idx) => (
                        <span
                          key={`${s.name}-${idx}`}
                          className={`px-2 py-0.5 rounded border text-[10px] font-medium ${
                            s.isSummarySheet
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {s.name} ({s.rowCount} lin.{s.isSummarySheet ? ' • Resumida' : ''})
                        </span>
                      ))}
                    </div>
                  )}

                  {extractionMeta.aiWarning && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>{extractionMeta.aiWarning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* No items found fallback */}
              {items.length === 0 ? (
                <div className="p-6 rounded-2xl border border-slate-200 bg-white text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Nenhum bem com valor foi encontrado automaticamente
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {extractionMeta?.summaryText ||
                        'Verifique se o arquivo possui colunas ou linhas preenchidas com descrição e valor.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={resetAll}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Enviar Outro Arquivo
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBlankCandidate}
                      className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Preencher Bem Manualmente
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Step-by-Step Progress Bar & Queue Navigator */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-800 font-mono tabular-nums shrink-0">
                          Bem {currentIndex + 1} de {items.length}
                        </span>
                        {items.length > 3 && (
                          <select
                            value={currentIndex}
                            onChange={(e) => setCurrentIndex(Number(e.target.value))}
                            className="max-w-[200px] sm:max-w-[280px] px-2 py-1 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 truncate cursor-pointer"
                            aria-label="Ir para o bem"
                          >
                            {items.map((it, idx) => (
                              <option key={it.tempId} value={idx}>
                                #{idx + 1} {it.decision === 'registered' ? '✓ ' : it.decision === 'skipped' ? '— ' : ''}
                                {it.tagNumber ? `[${it.tagNumber}] ` : ''}{it.description || `Item ${idx + 1}`}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                          disabled={currentIndex === 0}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentIndex((i) => Math.min(items.length - 1, i + 1))
                          }
                          disabled={currentIndex >= items.length - 1}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1"
                        >
                          Próximo
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-600 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    {/* Quick index dots */}
                    {items.length > 1 && (
                      <div className="flex items-center gap-1 overflow-x-auto pb-1">
                        {items.map((it, idx) => {
                          const active = idx === currentIndex;
                          const color =
                            it.decision === 'registered'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : it.decision === 'skipped'
                                ? 'bg-slate-200 text-slate-600 border-slate-300'
                                : active
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-teal-400';
                          return (
                            <button
                              key={it.tempId}
                              type="button"
                              onClick={() => setCurrentIndex(idx)}
                              className={`min-w-7 h-7 px-1.5 rounded-lg border text-[11px] font-bold font-mono tabular-nums transition cursor-pointer shrink-0 ${color} ${
                                active ? 'ring-2 ring-teal-500/40' : ''
                              }`}
                              title={`${it.description || `Item ${idx + 1}`} (${it.decision})`}
                            >
                              {it.decision === 'registered' ? '✓' : it.decision === 'skipped' ? '—' : idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Current Asset Editable Card */}
                  {currentItem && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3.5 shadow-2xs">
                      {/* Origin & Decision Status Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {currentItem.sourceSheet && (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                              Aba: {currentItem.sourceSheet}
                              {currentItem.sourceRow ? ` (Linha ${currentItem.sourceRow})` : ''}
                            </span>
                          )}
                          {currentItem.assetGroup && (
                            <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold border border-teal-200">
                              Grupo: {currentItem.assetGroup}
                            </span>
                          )}
                          {currentItem.assetClass && (
                            <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-700 font-medium border border-slate-200">
                              Classe: {currentItem.assetClass}
                            </span>
                          )}
                          {currentItem.marking && (
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold border border-indigo-200">
                              Marcação: {currentItem.marking}
                            </span>
                          )}
                          {typeof currentItem.postToTrialBalance === 'boolean' && (
                            <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200">
                              Balancete: <strong>{currentItem.postToTrialBalance ? 'Sim' : 'Não'}</strong>
                            </span>
                          )}
                        </div>

                        <div>
                          {currentItem.decision === 'registered' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Já Cadastrado
                            </span>
                          )}
                          {currentItem.decision === 'skipped' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              Não Cadastrado (Pulado)
                            </span>
                          )}
                          {currentItem.decision === 'pending' && (
                            <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                              Aguardando Decisão
                            </span>
                          )}
                        </div>
                      </div>

                      {currentItem.aiReason && (
                        <div className="p-2.5 rounded-xl bg-teal-50/60 border border-teal-100 text-[11px] text-teal-950 flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                          <span>{currentItem.aiReason}</span>
                        </div>
                      )}

                      {/* Primary Identification & Rules Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                        <div className="sm:col-span-6">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Descrição do Bem *
                          </label>
                          <input
                            type="text"
                            value={currentItem.description}
                            onChange={(e) =>
                              updateCurrentItem({ description: e.target.value })
                            }
                            placeholder="Ex: Empilhadeira Elétrica Toyota 2.5T"
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Nº / Plaqueta
                          </label>
                          <input
                            type="text"
                            value={currentItem.tagNumber}
                            onChange={(e) =>
                              updateCurrentItem({ tagNumber: e.target.value })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Situação do Bem
                          </label>
                          <select
                            value={currentItem.status || 'ativo'}
                            onChange={(e) =>
                              updateCurrentItem({ status: e.target.value as Asset['status'] })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="ativo">Em Depreciação (Ativo)</option>
                            <option value="totalmente_depreciado">Totalmente Depreciado</option>
                            <option value="baixado">Baixado / Alienado</option>
                            <option value="em_manutencao">Em Manutenção</option>
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Categoria Contábil (CPC 27)
                          </label>
                          <select
                            value={currentItem.category}
                            onChange={(e) =>
                              handleCategoryChange(e.target.value as Asset['category'])
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label} ({c.rate}% a.a.)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Início da Depreciação
                          </label>
                          <input
                            type="date"
                            value={currentItem.depreciationStartDate || currentItem.acquisitionDate}
                            onChange={(e) =>
                              updateCurrentItem({
                                depreciationStartDate: e.target.value,
                                acquisitionDate: e.target.value,
                              })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Vida Útil (Meses)
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={currentItem.usefulLifeMonths}
                            onChange={(e) => {
                              const m = Math.max(1, parseInt(e.target.value, 10) || 12);
                              updateCurrentItem({
                                usefulLifeMonths: m,
                                usefulLifeYears: Math.round((m / 12) * 10) / 10,
                                annualRate: Number(((12 / m) * 100).toFixed(2)),
                              });
                            }}
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Taxa Anual (%)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.5"
                              min="0.5"
                              max="100"
                              value={currentItem.annualRate}
                              onChange={(e) => handleRateChange(Number(e.target.value))}
                              className="w-full p-2.5 pr-7 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                            <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3" />
                          </div>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Custo Base / Aquisição (R$) *
                          </label>
                          <div className="relative">
                            <DollarSign className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={currentItem.acquisitionValue}
                              onChange={(e) =>
                                updateCurrentItem({
                                  acquisitionValue: Number(e.target.value),
                                })
                              }
                              className="w-full p-2.5 pl-7 rounded-xl border border-slate-300 bg-white font-mono tabular-nums font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Valor Residual Final (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={currentItem.residualValue || 0}
                            onChange={(e) =>
                              updateCurrentItem({
                                residualValue: Number(e.target.value),
                              })
                            }
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-mono tabular-nums text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="block font-semibold text-slate-700 mb-1">
                            Centro de Custo / Marcação
                          </label>
                          <input
                            type="text"
                            value={currentItem.costCenter}
                            onChange={(e) =>
                              updateCurrentItem({ costCenter: e.target.value })
                            }
                            placeholder="Administrativo / AVR / MV"
                            className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      </div>

                      {/* Highlighted Accumulated Depreciation Section */}
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-amber-950">
                            <Calendar className="w-3.5 h-3.5 text-amber-700" />
                            <span>Depreciação Acumulada & Saldo Contábil Importado</span>
                          </div>
                          {typeof currentItem.accumulatedDepreciationMonths === 'number' && (
                            <span className="text-[11px] font-mono font-bold text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-200">
                              {currentItem.accumulatedDepreciationMonths} meses decorridos
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-amber-950 mb-1">
                              Deprec. Acumulada Inicial (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={currentItem.accumulatedDepreciation ?? 0}
                              onChange={(e) =>
                                updateCurrentItem({
                                  accumulatedDepreciation: Number(e.target.value),
                                })
                              }
                              className="w-full p-2 rounded-lg border border-amber-300 bg-white font-mono tabular-nums font-bold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-amber-950 mb-1">
                              Data de Corte do Saldo
                            </label>
                            <input
                              type="date"
                              value={currentItem.accumulatedDepreciationDate || ''}
                              onChange={(e) =>
                                updateCurrentItem({
                                  accumulatedDepreciationDate: e.target.value,
                                })
                              }
                              className="w-full p-2 rounded-lg border border-amber-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>

                          <div className="sm:col-span-4 bg-white rounded-lg border border-amber-200 px-2.5 py-1.5 flex flex-col justify-center">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">
                              Valor Contábil Líquido (Saldo)
                            </span>
                            <span className="font-mono tabular-nums font-extrabold text-sm text-emerald-700">
                              {formatMoney(
                                currentItem.netBookValueImported !== undefined
                                  ? currentItem.netBookValueImported
                                  : Math.max(
                                      0,
                                      Number(currentItem.acquisitionValue || 0) -
                                        Number(currentItem.accumulatedDepreciation || 0)
                                    )
                              )}
                            </span>
                            {currentItem.lastPeriodQuota !== undefined && (
                              <span className="text-[10px] text-slate-500 font-mono tabular-nums">
                                Última Quota: {formatMoney(currentItem.lastPeriodQuota)}
                              </span>
                            )}
                          </div>
                        </div>

                        {currentItem.depreciationHistoryNote && (
                          <div className="text-[11px] text-amber-900 bg-white/80 rounded-lg px-2.5 py-1.5 border border-amber-200/70 font-mono tabular-nums">
                            <strong>Marcos da planilha:</strong> {currentItem.depreciationHistoryNote}
                          </div>
                        )}
                      </div>

                      {/* Accounting Chart of Accounts & Supplier/NF */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5 text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <BookOpen className="w-3.5 h-3.5 text-teal-700" />
                          <span>Contas Contábeis & Origem</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-slate-700 mb-1">
                              Conta do Imobilizado
                            </label>
                            <input
                              type="text"
                              value={currentItem.assetAccount || ''}
                              onChange={(e) =>
                                updateCurrentItem({ assetAccount: e.target.value })
                              }
                              placeholder="1.2.3.01.0001"
                              className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-slate-700 mb-1">
                              Conta Dep. Acumulada
                            </label>
                            <input
                              type="text"
                              value={currentItem.creditAccount || ''}
                              onChange={(e) =>
                                updateCurrentItem({ creditAccount: e.target.value })
                              }
                              placeholder="1.2.3.09.0001"
                              className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-slate-700 mb-1">
                              Conta Despesa Deprec.
                            </label>
                            <input
                              type="text"
                              value={currentItem.debitAccount || ''}
                              onChange={(e) =>
                                updateCurrentItem({ debitAccount: e.target.value })
                              }
                              placeholder="3.1.2.04.0010"
                              className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          <div className="sm:col-span-6">
                            <label className="block font-semibold text-slate-700 mb-1">
                              Fornecedor / Emitente
                            </label>
                            <input
                              type="text"
                              value={currentItem.supplier}
                              onChange={(e) =>
                                updateCurrentItem({ supplier: e.target.value })
                              }
                              placeholder="Opcional"
                              className="w-full p-2 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>

                          <div className="sm:col-span-6">
                            <label className="block font-semibold text-slate-700 mb-1">
                              Nota Fiscal / Documento
                            </label>
                            <input
                              type="text"
                              value={currentItem.invoiceNumber}
                              onChange={(e) =>
                                updateCurrentItem({ invoiceNumber: e.target.value })
                              }
                              placeholder="Ex: NF-e 12450"
                              className="w-full p-2 rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quick Rate Shortcuts & Computed Depreciation Preview */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 font-semibold">Taxas rápidas:</span>
                          {[4, 10, 15, 20, 25].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleRateChange(r)}
                              className={`px-2 py-0.5 rounded border font-mono font-bold transition cursor-pointer ${
                                Number(currentItem.annualRate) === r
                                  ? 'bg-teal-600 text-white border-teal-600'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                        <div className="font-mono tabular-nums text-slate-700">
                          Quota mensal estimada:{' '}
                          <strong className="text-teal-800">
                            {formatMoney(
                              (Math.max(
                                0,
                                Number(currentItem.acquisitionValue || 0) -
                                  Number(currentItem.residualValue || 0)
                              ) *
                                (Number(currentItem.annualRate || 0) / 100)) /
                                12
                            )}
                            /mês
                          </strong>{' '}
                          ({currentItem.usefulLifeMonths} meses •{' '}
                          {currentItem.usefulLifeYears || Math.round((currentItem.usefulLifeMonths / 12) * 10) / 10} anos)
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* STAGE 3: FINAL SUMMARY */}
          {stage === 'summary' && (
            <div className="space-y-4">
              <div className="text-center py-2 space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Revisão Concluída
                </h3>
                <p className="text-xs text-slate-500">
                  Confira abaixo os bens cadastrados no inventário com seus saldos iniciais e os itens pulados.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                  <span className="text-emerald-800 font-semibold">Cadastrados</span>
                  <div className="text-lg font-extrabold text-emerald-700 font-mono tabular-nums mt-0.5">
                    {stats.registered.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-slate-600 font-semibold">Não Cadastrados</span>
                  <div className="text-lg font-extrabold text-slate-700 font-mono tabular-nums mt-0.5">
                    {stats.skipped.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-teal-200 bg-teal-50/50">
                  <span className="text-teal-800 font-semibold">Custo Base Total</span>
                  <div className="text-sm sm:text-base font-extrabold text-teal-800 font-mono tabular-nums mt-0.5">
                    {formatMoney(stats.registeredValue)}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                  <span className="text-amber-800 font-semibold">Dep. Acum. Importada</span>
                  <div className="text-sm sm:text-base font-extrabold text-amber-800 font-mono tabular-nums mt-0.5">
                    {formatMoney(stats.registeredAccDep)}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                {items.map((item, idx) => (
                  <div
                    key={item.tempId}
                    className="px-3 py-2 flex items-center justify-between gap-3 bg-white"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {item.description || `Item ${idx + 1}`}
                      </div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                        <span className="font-mono">{item.tagNumber}</span>
                        {item.assetAccount && <span>• Cta: {item.assetAccount}</span>}
                        {(item.accumulatedDepreciation || 0) > 0 && (
                          <span className="text-amber-700 font-mono">
                            • Dep. Acum ({formatBrDate(item.accumulatedDepreciationDate)}):{' '}
                            {formatMoney(item.accumulatedDepreciation || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono tabular-nums font-bold text-slate-800">
                        {formatMoney(item.acquisitionValue)}
                      </span>
                      {item.decision === 'registered' ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Cadastrado
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentIndex(idx);
                            setStage('review');
                          }}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 text-[10px] font-bold cursor-pointer"
                        >
                          Revisar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer Bar (Always reachable on Mobile & Desktop) */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {stage === 'upload' && (
            <>
              <span className="text-[11px] text-slate-500">
                Leitura estruturada completa + IA ContSuite
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
            </>
          )}

          {stage === 'review' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAll}
                  disabled={isSavingCurrent || isSavingAll}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Trocar Arquivo
                </button>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStage('summary')}
                    disabled={isSavingCurrent || isSavingAll}
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Ver Resumo
                  </button>
                )}
              </div>

              {currentItem && (
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleSkipCurrent}
                    disabled={isSavingCurrent || isSavingAll}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <SkipForward className="w-3.5 h-3.5 text-slate-500" />
                    <span>Não Cadastrar (Pular)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRegisterCurrent}
                    disabled={isSavingCurrent || isSavingAll || currentItem.decision === 'registered'}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSavingCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isSavingCurrent
                        ? 'Cadastrando...'
                        : currentItem.decision === 'registered'
                          ? 'Bem Já Cadastrado'
                          : 'Cadastrar este Bem'}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {stage === 'summary' && (
            <>
              <button
                type="button"
                onClick={resetAll}
                className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                Analisar Outro Arquivo
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Concluir e Ver Inventário
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
