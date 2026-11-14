import React, { useState } from 'react';
import { 
  Building2, 
  Search, 
  Plus, 
  Check, 
  ArrowRight, 
  Mail, 
  Phone,
  Landmark,
  ShieldCheck,
  Printer
} from 'lucide-react';
import { Company, User } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

interface CompaniesViewProps {
  currentCompany: Company;
  allCompanies: Company[];
  currentUser: User;
  onSelectCompany: (company: Company) => void;
  onOpenNewCompanyModal: () => void;
  onEditCompany: (company: Company) => void;
}

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  currentCompany,
  allCompanies,
  currentUser,
  onSelectCompany,
  onOpenNewCompanyModal,
  onEditCompany,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  const companyReportColumns: ReportColumn[] = [
    { key: 'name', label: 'Razão Social', align: 'left' },
    { key: 'fantasyName', label: 'Nome Fantasia', align: 'left' },
    { key: 'cnpj', label: 'CNPJ', align: 'left' },
    { key: 'accountingSystem', label: 'Sistema Contábil', align: 'center', format: (val) => String(val || '').toUpperCase() },
    { key: 'contactEmail', label: 'E-mail de Contato', align: 'left' },
    { key: 'phone', label: 'Telefone', align: 'left' },
  ];

  const filteredCompanies = allCompanies.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.fantasyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cnpj.includes(searchTerm)
  );

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
              Total de {allCompanies.length} empresas cadastradas sob a administração de <strong>{currentUser.email}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
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
            placeholder="Buscar empresa por razão social, nome fantasia ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Structured List / Table (No Cards!) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
              <th className="py-2.5 px-3 sm:px-4">Empresa / Razão Social</th>
              <th className="py-2.5 px-3 hidden sm:table-cell">CNPJ</th>
              <th className="py-2.5 px-3 hidden md:table-cell">Sistema Contábil</th>
              <th className="py-2.5 px-3 hidden lg:table-cell">Contato / E-mail</th>
              <th className="py-2.5 px-2 text-center">Status</th>
              <th className="py-2.5 px-3 sm:px-4 text-right">Ação</th>
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
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                        {comp.name}
                      </div>
                      <div className="text-[10px] text-teal-700 font-mono sm:hidden">
                        CNPJ: {comp.cnpj}
                      </div>
                    </td>

                    <td className="py-3 px-3 hidden sm:table-cell font-mono text-slate-700 whitespace-nowrap">
                      {comp.cnpj}
                    </td>

                    <td className="py-3 px-3 hidden md:table-cell whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase border border-slate-200">
                        {comp.accountingSystem}
                      </span>
                    </td>

                    <td className="py-3 px-3 hidden lg:table-cell text-slate-600 truncate max-w-[180px]">
                      <div className="flex items-center gap-1 truncate text-[11px]">
                        <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{comp.contactEmail || '—'}</span>
                      </div>
                      {comp.phone && (
                        <div className="text-[10px] text-slate-400">
                          {comp.phone}
                        </div>
                      )}
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
                      <div className="inline-flex items-center gap-1.5 justify-end">
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
                        ) : (
                          <button
                            onClick={() => onSelectCompany(comp)}
                            className="px-3 py-1 rounded-xl bg-teal-50 hover:bg-teal-600 text-teal-800 hover:text-white border border-teal-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>Alternar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
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
          subtitle={`Relação de Empresas Sob Gestão • Administrador: ${currentUser.email}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Total de Empresas', value: allCompanies.length },
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
