import React, { useState } from 'react';
import { X, Building2, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { Company } from '../types';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (companyData: Partial<Company>) => Promise<void>;
  companyToEdit?: Company | null;
  adminEmail?: string;
  prefillData?: {
    name?: string;
    cnpj?: string;
    fantasyName?: string;
  } | null;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  companyToEdit,
  adminEmail,
  prefillData,
}) => {
  const [name, setName] = useState(companyToEdit?.name || prefillData?.name || '');
  const [fantasyName, setFantasyName] = useState(companyToEdit?.fantasyName || prefillData?.fantasyName || '');
  const [cnpj, setCnpj] = useState(companyToEdit?.cnpj || prefillData?.cnpj || '');
  const [contactEmail, setContactEmail] = useState(companyToEdit?.contactEmail || '');
  const [phone, setPhone] = useState(companyToEdit?.phone || '');
  const [accountingSystem, setAccountingSystem] = useState<Company['accountingSystem']>(companyToEdit?.accountingSystem || 'dominio');

  // Sync if prefillData changes while opening modal
  React.useEffect(() => {
    if (prefillData && !companyToEdit) {
      if (prefillData.name) setName(prefillData.name);
      if (prefillData.cnpj) setCnpj(prefillData.cnpj);
      if (prefillData.fantasyName) setFantasyName(prefillData.fantasyName);
    }
  }, [prefillData, companyToEdit]);

  const [assetDefaultAccount, setAssetDefaultAccount] = useState(companyToEdit?.chartOfAccounts?.assetDefaultAccount || '1.2.3.01.0001');
  const [depreciationExpenseAccount, setDepreciationExpenseAccount] = useState(companyToEdit?.chartOfAccounts?.depreciationExpenseAccount || '3.1.2.04.0010');
  const [accumulatedDepreciationAccount, setAccumulatedDepreciationAccount] = useState(companyToEdit?.chartOfAccounts?.accumulatedDepreciationAccount || '1.2.3.09.0001');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cnpj.trim()) {
      setFormError('Razão Social e CNPJ são obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      await onSave({
        name,
        fantasyName: fantasyName || name,
        cnpj,
        contactEmail,
        phone,
        accountingSystem,
        chartOfAccounts: {
          assetDefaultAccount,
          depreciationExpenseAccount,
          accumulatedDepreciationAccount,
        },
      });
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-teal-100 text-teal-800">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {companyToEdit ? 'Editar Dados da Empresa' : 'Cadastrar Nova Empresa'}
              </h3>
              <p className="text-xs text-slate-500">Parâmetros cadastrais e contas padrão de integração</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Administrator Anchorage Badge */}
        <div className="p-3 bg-teal-50/80 border border-teal-200/80 rounded-xl text-xs flex items-center justify-between text-teal-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00897b] shrink-0" />
            <span>
              Vinculada ao Administrador Master: <strong>Rodrigo Bento</strong> ({adminEmail || 'rodrigobento1979@gmail.com'})
            </span>
          </div>
          <span className="text-[10px] font-bold bg-[#00897b] text-white px-2 py-0.5 rounded-md shrink-0">
            Escritório Ativo
          </span>
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Razão Social *</label>
            <input
              type="text"
              required
              placeholder="Ex: Alfa Soluções Comerciais Ltda"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia</label>
              <input
                type="text"
                placeholder="Ex: Alfa Soluções"
                value={fantasyName}
                onChange={(e) => setFantasyName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">CNPJ *</label>
              <input
                type="text"
                required
                placeholder="00.000.000/0001-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">E-mail Financeiro</label>
              <input
                type="email"
                placeholder="financeiro@empresa.com.br"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sistema Contábil</label>
              <select
                value={accountingSystem}
                onChange={(e) => setAccountingSystem(e.target.value as any)}
                className="w-full p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="dominio">Domínio Sistemas</option>
                <option value="questor">Questor Contábil</option>
                <option value="fortes">Fortes Tecnologia</option>
                <option value="alterdata">Alterdata</option>
                <option value="totvs">TOTVS Protheus</option>
                <option value="sci">SCI Sistemas Contábeis</option>
                <option value="outro">Outro Sistema Contábil (CSV)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="font-bold text-slate-700 block">Contas Contábeis Padrão da Empresa:</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Conta Ativo:</label>
                <input
                  type="text"
                  value={assetDefaultAccount}
                  onChange={(e) => setAssetDefaultAccount(e.target.value)}
                  className="w-full p-1.5 rounded border border-slate-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Despesa Deprec.:</label>
                <input
                  type="text"
                  value={depreciationExpenseAccount}
                  onChange={(e) => setDepreciationExpenseAccount(e.target.value)}
                  className="w-full p-1.5 rounded border border-slate-300 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Deprec. Acum.:</label>
                <input
                  type="text"
                  value={accumulatedDepreciationAccount}
                  onChange={(e) => setAccumulatedDepreciationAccount(e.target.value)}
                  className="w-full p-1.5 rounded border border-slate-300 font-mono text-[11px]"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
