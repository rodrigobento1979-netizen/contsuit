import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Building2, 
  DollarSign, 
  Calendar, 
  Tag, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Loader2
} from 'lucide-react';
import { Asset, Company } from '../types';

interface AssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assetData: Partial<Asset>) => Promise<void>;
  assetToEdit?: Asset | null;
  company: Company;
}

const CATEGORIES = [
  { value: 'veiculos', label: 'Veículos e Automotores', defaultRate: 20, defaultMonths: 60 },
  { value: 'ti', label: 'Equipamentos de Informática (TI)', defaultRate: 20, defaultMonths: 60 },
  { value: 'maquinas', label: 'Máquinas e Equipamentos', defaultRate: 10, defaultMonths: 120 },
  { value: 'moveis', label: 'Móveis e Utensílios de Escritório', defaultRate: 10, defaultMonths: 120 },
  { value: 'edificacoes', label: 'Edificações e Construções Civis', defaultRate: 4, defaultMonths: 300 },
  { value: 'software', label: 'Sistemas e Softwares / Intangíveis', defaultRate: 20, defaultMonths: 60 },
  { value: 'ferramentas', label: 'Ferramentas Industriais e Fabris', defaultRate: 15, defaultMonths: 80 },
  { value: 'instalacoes', label: 'Instalações Comerciais e Prediais', defaultRate: 10, defaultMonths: 120 },
  { value: 'outro', label: 'Outros Bens do Ativo Permanente', defaultRate: 10, defaultMonths: 120 },
];

export const AssetModal: React.FC<AssetModalProps> = ({
  isOpen,
  onClose,
  onSave,
  assetToEdit,
  company,
}) => {
  const [description, setDescription] = useState('');
  const [tagNumber, setTagNumber] = useState('');
  const [category, setCategory] = useState<'edificacoes' | 'maquinas' | 'veiculos' | 'moveis' | 'ti' | 'software' | 'ferramentas' | 'instalacoes' | 'outro'>('ti');
  const [categoryLabel, setCategoryLabel] = useState('Equipamentos de Informática (TI)');
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10));
  const [depreciationStartDate, setDepreciationStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [acquisitionValue, setAcquisitionValue] = useState<number>(0);
  const [residualValue, setResidualValue] = useState<number>(0);
  const [annualRate, setAnnualRate] = useState<number>(20);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState<number>(60);
  const [costCenter, setCostCenter] = useState('Administrativo');
  const [location, setLocation] = useState('Sede');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [debitAccount, setDebitAccount] = useState('3.1.2.04.0010');
  const [creditAccount, setCreditAccount] = useState('1.2.3.09.0001');
  const [assetAccount, setAssetAccount] = useState('1.2.3.01.0001');
  const [notes, setNotes] = useState('');

  // AI state
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [aiJustification, setAiJustification] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (assetToEdit) {
      setDescription(assetToEdit.description);
      setTagNumber(assetToEdit.tagNumber);
      setCategory(assetToEdit.category);
      setCategoryLabel(assetToEdit.categoryLabel);
      setAcquisitionDate(assetToEdit.acquisitionDate);
      setDepreciationStartDate(assetToEdit.depreciationStartDate);
      setAcquisitionValue(assetToEdit.acquisitionValue);
      setResidualValue(assetToEdit.residualValue || 0);
      setAnnualRate(assetToEdit.annualRate);
      setUsefulLifeMonths(assetToEdit.usefulLifeMonths);
      setCostCenter(assetToEdit.costCenter || 'Administrativo');
      setLocation(assetToEdit.location || 'Sede');
      setSupplier(assetToEdit.supplier || '');
      setInvoiceNumber(assetToEdit.invoiceNumber || '');
      setDebitAccount(assetToEdit.debitAccount || company.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010');
      setCreditAccount(assetToEdit.creditAccount || company.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001');
      setAssetAccount(assetToEdit.assetAccount || company.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001');
      setNotes(assetToEdit.notes || '');
      setAiJustification(null);
    } else {
      // Defaults for new asset
      const randNum = Math.floor(1000 + Math.random() * 9000);
      setDescription('');
      setTagNumber(`PAT-${randNum}`);
      setCategory('ti');
      setCategoryLabel('Equipamentos de Informática (TI)');
      setAcquisitionDate(new Date().toISOString().slice(0, 10));
      setDepreciationStartDate(new Date().toISOString().slice(0, 10));
      setAcquisitionValue(0);
      setResidualValue(0);
      setAnnualRate(20);
      setUsefulLifeMonths(60);
      setCostCenter('Administrativo');
      setLocation('Sede');
      setSupplier('');
      setInvoiceNumber('');
      setDebitAccount(company.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010');
      setCreditAccount(company.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001');
      setAssetAccount(company.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001');
      setNotes('');
      setAiJustification(null);
    }
    setFormError(null);
  }, [assetToEdit, isOpen, company]);

  if (!isOpen) return null;

  const handleCategoryChange = (val: string) => {
    const found = CATEGORIES.find(c => c.value === val);
    if (found) {
      setCategory(found.value as any);
      setCategoryLabel(found.label);
      setAnnualRate(found.defaultRate);
      setUsefulLifeMonths(found.defaultMonths);
    }
  };

  const handleAiSuggest = async () => {
    if (!description.trim()) {
      setFormError('Por favor, informe a descrição do bem antes de acionar a Inteligência Artificial.');
      return;
    }
    setFormError(null);
    setIsAiSuggesting(true);

    try {
      const res = await fetch('/api/assets/suggest-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao classificar com IA');
      }

      if (data.category) {
        setCategory(data.category);
        setCategoryLabel(data.categoryLabel || data.category);
      }
      if (data.annualRate) setAnnualRate(data.annualRate);
      if (data.usefulLifeMonths) setUsefulLifeMonths(data.usefulLifeMonths);
      if (data.suggestedDebitAccount) setDebitAccount(data.suggestedDebitAccount);
      if (data.suggestedCreditAccount) setCreditAccount(data.suggestedCreditAccount);
      if (data.suggestedAssetAccount) setAssetAccount(data.suggestedAssetAccount);

      if (data.suggestedResidualPercent && acquisitionValue > 0) {
        setResidualValue(Number(((acquisitionValue * data.suggestedResidualPercent) / 100).toFixed(2)));
      }

      setAiJustification(data.accountingJustification || 'Classificação sugerida conforme IN RFB 1.700/2017 e NBC TG 27.');
    } catch (err: any) {
      setFormError(err.message || 'Falha ao conectar com o serviço de IA.');
    } finally {
      setIsAiSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setFormError('A descrição do bem é obrigatória.');
      return;
    }
    if (acquisitionValue <= 0) {
      setFormError('O valor de aquisição deve ser maior que zero.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await onSave({
        companyId: company.id,
        tagNumber,
        description,
        category,
        categoryLabel,
        acquisitionDate,
        depreciationStartDate,
        acquisitionValue: Number(acquisitionValue),
        residualValue: Number(residualValue || 0),
        annualRate: Number(annualRate),
        usefulLifeMonths: Number(usefulLifeMonths),
        costCenter,
        location,
        supplier,
        invoiceNumber,
        debitAccount,
        creditAccount,
        assetAccount,
        notes,
      });
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar ativo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const depreciableValueCalc = Math.max(0, acquisitionValue - (residualValue || 0));
  const monthlyRatePercent = (annualRate / 12).toFixed(4);
  const monthlyQuotaCalc = (depreciableValueCalc * (annualRate / 100) / 12).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sticky top-0 z-10 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {assetToEdit ? 'Editar Ativo Permanente' : 'Novo Ativo Imobilizado'}
              </h2>
              <p className="text-xs text-slate-400">
                Empresa: <strong>{company.fantasyName || company.name}</strong> • Cálculo CPC 27
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="m-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* AI Assistance Box */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-900">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  Assistente Contábil com Inteligência Artificial
                </span>
                <p className="text-xs text-teal-800 mt-0.5">
                  Digite a descrição do bem abaixo e clique em classificar. A IA define categoria, vida útil e taxa oficial da Receita Federal.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={isAiSuggesting}
                className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {isAiSuggesting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Classificando com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-teal-200" />
                    Classificar com IA
                  </>
                )}
              </button>
            </div>

            {aiJustification && (
              <div className="mt-3 pt-3 border-t border-teal-200/60 text-xs text-teal-950 flex items-start gap-2 bg-white/70 p-2.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-950">Parecer da Inteligência Artificial:</p>
                  <p className="text-slate-700 mt-0.5">{aiJustification}</p>
                </div>
              </div>
            )}
          </div>

          {/* Basic Info Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              1. Identificação do Bem
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Completa do Bem *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Servidor Dell PowerEdge R750 2x Xeon 256GB RAM"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Plaqueta / Tag Patrimonial *
                </label>
                <input
                  type="text"
                  required
                  placeholder="PAT-00101"
                  value={tagNumber}
                  onChange={(e) => setTagNumber(e.target.value)}
                  className="w-full text-xs sm:text-sm font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Categoria Contábil *
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.defaultRate}% a.a.)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fornecedor
                </label>
                <input
                  type="text"
                  placeholder="Nome do fornecedor / revenda"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nota Fiscal (NF-e)
                </label>
                <input
                  type="text"
                  placeholder="Ex: NF-e 88921"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Centro de Custo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Produção, Administrativo, TI, Vendas"
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Localização Física / Filial
                </label>
                <input
                  type="text"
                  placeholder="Ex: Galpão 1, Matriz SP, Sala 4"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Financial & Depreciation Parameters */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              2. Valores Financeiros e Regras de Depreciação
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Data de Aquisição *
                </label>
                <input
                  type="date"
                  required
                  value={acquisitionDate}
                  onChange={(e) => {
                    setAcquisitionDate(e.target.value);
                    if (!assetToEdit) setDepreciationStartDate(e.target.value);
                  }}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Início Depreciação *
                </label>
                <input
                  type="date"
                  required
                  value={depreciationStartDate}
                  onChange={(e) => setDepreciationStartDate(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor Aquisição (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={acquisitionValue || ''}
                  onChange={(e) => setAcquisitionValue(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs sm:text-sm font-semibold p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Valor Residual (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={residualValue || ''}
                  onChange={(e) => setResidualValue(parseFloat(e.target.value) || 0)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Taxa Anual (% a.a.) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={annualRate || ''}
                  onChange={(e) => {
                    const r = parseFloat(e.target.value) || 0;
                    setAnnualRate(r);
                    if (r > 0) setUsefulLifeMonths(Math.round((100 / r) * 12));
                  }}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vida Útil (Meses) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={usefulLifeMonths || ''}
                  onChange={(e) => {
                    const m = parseInt(e.target.value) || 1;
                    setUsefulLifeMonths(m);
                    if (m > 0) setAnnualRate(Number(((12 / m) * 100).toFixed(2)));
                  }}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Live calculation box */}
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-500 font-semibold block">Simulação da Quota Mensal:</span>
                <div className="text-emerald-700 font-extrabold text-sm mt-0.5">
                  R$ {monthlyQuotaCalc} / mês
                </div>
                <div className="text-[10px] text-slate-400">
                  Base Depreciável: R$ {depreciableValueCalc.toFixed(2)} ({monthlyRatePercent}% a.m.)
                </div>
              </div>
            </div>
          </div>

          {/* Accounting Chart of Accounts */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              3. Contas Contábeis (Integração com {company.accountingSystem.toUpperCase()})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conta Ativo (Imobilizado)
                </label>
                <input
                  type="text"
                  placeholder="1.2.3.01.0001"
                  value={assetAccount}
                  onChange={(e) => setAssetAccount(e.target.value)}
                  className="w-full text-xs sm:text-sm font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conta Débito (Despesa Deprec.)
                </label>
                <input
                  type="text"
                  placeholder="3.1.2.04.0010"
                  value={debitAccount}
                  onChange={(e) => setDebitAccount(e.target.value)}
                  className="w-full text-xs sm:text-sm font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conta Crédito (Deprec. Acum.)
                </label>
                <input
                  type="text"
                  placeholder="1.2.3.09.0001"
                  value={creditAccount}
                  onChange={(e) => setCreditAccount(e.target.value)}
                  className="w-full text-xs sm:text-sm font-mono p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observações / Histórico Contábil Complementar
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Aquisição com garantia estendida de 3 anos. Utilizado na linha de produção."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full text-xs sm:text-sm p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Salvando...' : assetToEdit ? 'Atualizar Ativo' : 'Gravar no Imobilizado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
