import React, { useState } from 'react';
import { 
  Building2, 
  Search, 
  Plus, 
  ArrowRight, 
  Mail, 
  Landmark,
  ShieldCheck,
  Printer,
  RefreshCw,
  FolderOpen,
  Sparkles,
  Users,
  UserCheck
} from 'lucide-react';
import { Company, User } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';
import { AppNavTab } from './Sidebar';
import { isMasterUser, filterCompaniesForUser } from '../utils/auth';

interface CompaniesViewProps {
  currentCompany: Company;
  allCompanies: Company[];
  allUsers?: (User & { company?: Company })[];
  currentUser: User;
  onSelectCompany: (company: Company) => void;
  onQuickNavigate?: (company: Company, tab: AppNavTab) => void;
  onRefreshCompanies?: () => Promise<void> | void;
  onOpenNewCompanyModal: () => void;
  onEditCompany: (company: Company) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  currentCompany,
  allCompanies,
  allUsers = [],
  currentUser,
  onSelectCompany,
  onQuickNavigate,
  onRefreshCompanies,
  onOpenNewCompanyModal,
  onEditCompany,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [showReportModal, setShowReportModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isMaster = isMasterUser(currentUser);
  const visibleCompanies = filterCompaniesForUser(allCompanies, currentUser);

  const doesUserOwnCompany = (u: User, c: Company) => {
    const uEmail = (u.email || '').toLowerCase().trim();
    const cEmail = (c.createdByEmail || '').toLowerCase().trim();
    return (
      u.companyId === c.id ||
      (c.createdByUserId && u.id === c.createdByUserId) ||
      (uEmail && cEmail && uEmail === cEmail)
    );
  };

  // Build user filter summary for Master Admin so Master can jump directly to any user's companies
  const userFilterBuckets = React.useMemo(() => {
    if (!isMaster) return [];
    const buckets: { key: string; label: string; email: string; count: number }[] = [];
    const seenKeys = new Set<string>();

    allUsers.forEach((u) => {
      const email = (u.email || '').toLowerCase().trim();
      const key = email || u.id;
      if (!key || seenKeys.has(key)) return;
      const owned = visibleCompanies.filter((c) => doesUserOwnCompany(u, c));
      if (owned.length > 0) {
        seenKeys.add(key);
        buckets.push({
          key,
          label: u.name || email.split('@')[0],
          email: u.email,
          count: owned.length,
        });
      }
    });

    // Also capture companies created by emails not present in allUsers
    visibleCompanies.forEach((c) => {
      const cEmail = (c.createdByEmail || '').toLowerCase().trim();
      if (cEmail && !seenKeys.has(cEmail)) {
        const owned = visibleCompanies.filter(
          (x) => (x.createdByEmail || '').toLowerCase().trim() === cEmail
        );
        seenKeys.add(cEmail);
        buckets.push({
          key: cEmail,
          label: c.createdByName || cEmail.split('@')[0],
          email: c.createdByEmail || cEmail,
          count: owned.length,
        });
      }
    });

    return buckets;
  }, [isMaster, allUsers, visibleCompanies]);

  const handleRefresh = async () => {
    if (!onRefreshCompanies) return;
    setRefreshing(true);
    try {
      await onRefreshCompanies();
    } finally {
      setRefreshing(false);
    }
  };

  const companyReportColumns: ReportColumn[] = [
    { key: 'name', label: 'Razão Social', align: 'left' },
    { key: 'fantasyName', label: 'Nome Fantasia', align: 'left' },
    { key: 'cnpj', label: 'CNPJ', align: 'left' },
    { key: 'accountingSystem', label: 'Sistema Contábil', align: 'center', format: (val) => String(val || '').toUpperCase() },
    { key: 'contactEmail', label: 'E-mail de Contato', align: 'left' },
    { key: 'createdByEmail', label: 'Cadastrada Por', align: 'left', format: (val) => val ? String(val) : 'Administrador' },
  ];

  const filteredCompanies = visibleCompanies.filter(c => {
    if (isMaster && selectedUserFilter !== 'all') {
      const matchedUser = allUsers.find(
        (u) => ((u.email || '').toLowerCase().trim() || u.id) === selectedUserFilter
      );
      const matchesUser = matchedUser
        ? doesUserOwnCompany(matchedUser, c)
        : (c.createdByEmail || '').toLowerCase().trim() === selectedUserFilter;
      if (!matchesUser) return false;
    }

    const q = searchTerm.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.fantasyName || '').toLowerCase().includes(q) ||
      (c.cnpj || '').includes(searchTerm) ||
      (c.createdByEmail || '').toLowerCase().includes(q) ||
      (c.createdByName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60">
            <Landmark className="w-5 h-5 text-[#00897b]" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Cadastro de Empresas & Carteira de Clientes
            </h1>
            <p className="text-xs text-slate-500">
              {isMaster
                ? `Total global de ${visibleCompanies.length} ${visibleCompanies.length === 1 ? 'empresa cadastrada' : 'empresas cadastradas'} entre todos os usuários`
                : `Total de ${visibleCompanies.length} ${visibleCompanies.length === 1 ? 'empresa vinculada' : 'empresas vinculadas'} ao usuário ${currentUser.email}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
          {onRefreshCompanies && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-60"
              title="Sincronizar empresas do servidor e da nuvem"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-teal-700 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
          )}

          <button
            onClick={() => setShowReportModal(true)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Emitir relatório da carteira de empresas"
          >
            <Printer className="w-3.5 h-3.5 text-teal-700" />
            <span>Emitir Relatório</span>
          </button>

          <button
            onClick={onOpenNewCompanyModal}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Cadastrar Empresa</span>
          </button>
        </div>
      </div>

      {/* Master Admin Broad Access Indicator + Filter by User */}
      {isMaster && (
        <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 space-y-2.5 text-xs text-indigo-950">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Navegação Master por Todos os Usuários:</strong> Você acessa e navega livremente por <strong>todas</strong> as empresas de qualquer usuário (Arquivos, OFX, Ativo Imobilizado, Plano de Contas e Honorários).
              </span>
            </div>
            <span className="text-[10px] font-bold bg-indigo-600 text-white px-2.5 py-1 rounded-full shrink-0 self-start sm:self-auto">
              {visibleCompanies.length} {visibleCompanies.length === 1 ? 'Empresa Global' : 'Empresas Globais'}
            </span>
          </div>

          {userFilterBuckets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-indigo-200/60">
              <span className="text-[11px] font-bold text-indigo-800 mr-1">Filtrar por Usuário:</span>
              <button
                type="button"
                onClick={() => setSelectedUserFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  selectedUserFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                Todos ({visibleCompanies.length})
              </button>
              {userFilterBuckets.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setSelectedUserFilter(b.key)}
                  title={b.email}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                    selectedUserFilter === b.key
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <span>{b.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] ${
                    selectedUserFilter === b.key ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {b.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Company Highlight Banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-teal-50/80 via-emerald-50/60 to-white border border-teal-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
          <div className="text-xs">
            <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">
              Empresa Ativa em Gestão no Momento:
            </span>
            <span className="font-extrabold text-slate-900 text-sm">
              {currentCompany.fantasyName || currentCompany.name}
            </span>
            <span className="text-slate-500 font-mono text-[11px] ml-2">
              (CNPJ: {currentCompany.cnpj})
            </span>
          </div>
        </div>

        <span className="text-[10px] font-semibold text-teal-900 bg-white px-2.5 py-1 rounded-lg border border-teal-200 shadow-2xs self-start sm:self-auto">
          Sistema Contábil: {currentCompany.accountingSystem.toUpperCase()}
        </span>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar empresa por razão social, nome fantasia, CNPJ ou usuário que cadastrou..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Structured List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
              <th className="py-2.5 px-3 sm:px-4">Empresa / Razão Social</th>
              <th className="py-2.5 px-3 hidden sm:table-cell">CNPJ</th>
              <th className="py-2.5 px-3 hidden md:table-cell">Sistema Contábil</th>
              <th className="py-2.5 px-3 hidden lg:table-cell">Usuário Vinculado & Origem</th>
              <th className="py-2.5 px-2 text-center">Status</th>
              <th className="py-2.5 px-3 sm:px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCompanies.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                  Nenhuma empresa encontrada com os filtros aplicados.
                </td>
              </tr>
            ) : (
              filteredCompanies.map((comp) => {
                const isActive = comp.id === currentCompany.id;
                const linkedUsers = allUsers.filter((u) => doesUserOwnCompany(u, comp));
                const creatorLabel = comp.createdByName || comp.createdByEmail;
                return (
                  <tr key={comp.id} className={`hover:bg-slate-50/70 transition ${isActive ? 'bg-teal-50/30' : ''}`}>
                    <td className="py-3 px-3 sm:px-4">
                      <div className="font-bold text-slate-900 truncate max-w-[200px] sm:max-w-xs flex items-center gap-1.5">
                        <span>{comp.fantasyName || comp.name}</span>
                        {isActive && (
                          <span className="text-[9px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded shrink-0">
                            Ativa
                          </span>
                        )}
                        {comp.id === 'comp-master' && (
                          <span className="text-[9px] font-bold bg-[#00897b] text-white px-1.5 py-0.2 rounded shrink-0">
                            Master
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                        {comp.name}
                      </div>
                      <div className="text-[10px] text-teal-700 font-mono sm:hidden">
                        CNPJ: {comp.cnpj}
                      </div>
                      {isMaster && (linkedUsers.length > 0 || creatorLabel) && (
                        <div className="text-[10px] text-indigo-700 font-semibold lg:hidden truncate max-w-[210px] mt-0.5">
                          Usuário: {linkedUsers.map((u) => u.name).join(', ') || creatorLabel}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 hidden sm:table-cell font-mono text-slate-700 whitespace-nowrap">
                      {comp.cnpj}
                    </td>

                    <td className="py-3 px-3 hidden md:table-cell whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase border border-slate-200">
                        {comp.accountingSystem}
                      </span>
                    </td>

                    <td className="py-3 px-3 hidden lg:table-cell text-slate-600 max-w-[250px]">
                      {linkedUsers.length > 0 && (
                        <div className="text-[11px] text-indigo-800 font-bold flex items-center gap-1 truncate">
                          <Users className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span className="truncate" title={linkedUsers.map((u) => `${u.name} (${u.email})`).join(', ')}>
                            {linkedUsers.map((u) => `${u.name} (${u.email})`).join(', ')}
                          </span>
                        </div>
                      )}
                      {creatorLabel && (
                        <div className="text-[10px] text-slate-600 font-medium flex items-center gap-1 truncate mt-0.5">
                          <UserCheck className="w-3 h-3 text-teal-600 shrink-0" />
                          <span className="truncate">Por: {creatorLabel}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 truncate text-[10px] text-slate-400 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{comp.contactEmail || '—'}</span>
                      </div>
                    </td>

                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Em Gestão
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium text-[10px]">
                          Cadastrada
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        {isMaster && onQuickNavigate && (
                          <>
                            <button
                              onClick={() => onQuickNavigate(comp, 'documents')}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-teal-100 text-slate-600 hover:text-teal-800 transition cursor-pointer"
                              title={`Abrir Arquivos de ${comp.fantasyName || comp.name}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onQuickNavigate(comp, 'ofx')}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-teal-100 text-slate-600 hover:text-teal-800 transition cursor-pointer"
                              title={`Abrir Conversor OFX de ${comp.fantasyName || comp.name}`}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onQuickNavigate(comp, 'assets')}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-teal-100 text-slate-600 hover:text-teal-800 transition cursor-pointer"
                              title={`Abrir Ativo Imobilizado de ${comp.fantasyName || comp.name}`}
                            >
                              <Building2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => onEditCompany(comp)}
                          className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                          title="Editar cadastro e e-mail de contato"
                        >
                          Editar
                        </button>
                        {isActive ? (
                          <span className="text-[11px] font-semibold text-teal-700 px-2">
                            Selecionada
                          </span>
                        ) : isMaster ? (
                          <button
                            onClick={() => onSelectCompany(comp)}
                            className="px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>Alternar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Report Print Modal */}
      {showReportModal && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          title="Relatório da Carteira de Empresas & Clientes"
          subtitle={`Relação de Empresas Sob Gestão • Usuário: ${currentUser.email}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Total de Empresas', value: visibleCompanies.length },
            { label: 'Empresa Ativa', value: currentCompany.fantasyName || currentCompany.name },
            { label: 'Sistema Ativo', value: currentCompany.accountingSystem.toUpperCase() },
          ]}
          columns={companyReportColumns}
          data={filteredCompanies}
        />
      )}
    </div>
  );
};
