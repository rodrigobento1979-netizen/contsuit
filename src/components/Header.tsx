import React from 'react';
import { 
  Building2, 
  ShieldCheck, 
  LogOut, 
  ChevronDown, 
  Sparkles, 
  Menu,
  Bot
} from 'lucide-react';
import { User, Company } from '../types';

interface HeaderProps {
  currentUser: User;
  currentCompany?: Company;
  allCompanies: Company[];
  activeTab: 'home' | 'assets' | 'companies' | 'accounts' | 'ofx' | 'documents' | 'fees' | 'database' | 'admin' | 'depreciation';
  onSwitchCompany: (companyId: string) => void;
  onOpenUserModal: () => void;
  onLogout: () => void;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  currentCompany,
  allCompanies,
  activeTab,
  onSwitchCompany,
  onOpenUserModal,
  onLogout,
  onToggleMobileMenu,
}) => {
  const isAdmin = currentUser.role === 'admin';

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    home: { title: 'Visão Geral & Assistente', subtitle: 'Mostre-me como fazer rotinas contábeis' },
    companies: { title: 'Cadastro de Empresas', subtitle: 'Carteira de Clientes & Parâmetros' },
    assets: { title: 'Ativo Imobilizado (CPC 27)', subtitle: 'Inventário, Depreciação, Baixas e Integração NG/Domínio' },
    depreciation: { title: 'Apuração de Depreciação', subtitle: 'Quotas Mensais, Trimestrais e Anuais' },
    ofx: { title: 'Conversor OFX com IA', subtitle: 'Extratos Bancários para ERP Contábil' },
    documents: { title: 'Arquivos & Documentos Contábeis', subtitle: 'Classificação por Tipo com IA e Organização em Kanban' },
    accounts: { title: 'Plano de Contas Contábil', subtitle: 'Estrutura & Parâmetros do Sistema' },
    fees: { title: 'Controle de Honorários', subtitle: 'Gestão Financeira do Escritório' },
    database: { title: 'Banco de Dados & Backup', subtitle: 'Configuração, Sincronização & Limpeza' },
    admin: { title: 'Gestão de Usuários & Convites', subtitle: 'Acessos com Senha Padrão e Isolamento de Dados' },
  };

  const currentInfo = tabTitles[activeTab] || tabTitles.home;

  return (
    // Exact green/teal color from the login screen (#00897b / #009688)
    <header className="bg-gradient-to-r from-[#00796b] via-[#00897b] to-[#00695c] text-white shadow-md z-20 border-b border-[#004d40]">
      <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        
        {/* Left: Mobile Menu Toggle + Current Section Breadcrumb */}
        <div className="flex items-center gap-3">
          {onToggleMobileMenu && (
            <button
              onClick={onToggleMobileMenu}
              className="md:hidden p-1.5 rounded-lg bg-black/15 text-white hover:bg-black/25 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-tight">
                {currentInfo.title}
              </h2>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-[#e0f2f1] border border-white/20">
                ContSuite
              </span>
            </div>
            <p className="text-[11px] text-[#b2dfdb] hidden sm:block">
              {currentInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Company Switcher, Cloud Status & User Session */}
        <div className="flex items-center gap-3 text-xs">
          {/* Active Company Selector (for Admin) */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-xl border border-white/15">
              <Building2 className="w-3.5 h-3.5 text-[#80cbc4]" />
              <label htmlFor="top-company-select" className="text-[#e0f2f1] font-medium hidden md:inline text-[11px]">
                Empresa:
              </label>
              <select
                id="top-company-select"
                value={currentCompany?.id || ''}
                onChange={(e) => onSwitchCompany(e.target.value)}
                className="bg-[#004d40] text-white font-bold border border-[#00bfa5]/40 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#80cbc4] cursor-pointer"
              >
                {allCompanies.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    {c.fantasyName || c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Firebase Cloud Status Chip */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/15 border border-white/10 text-[11px] text-[#e0f2f1]">
            <span className="w-2 h-2 rounded-full bg-[#00e676] animate-pulse"></span>
            <span>Nuvem Firestore</span>
          </div>

          {/* User profile dropdown button */}
          <button
            onClick={onOpenUserModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 transition cursor-pointer"
            title="Ver perfil e dados da sessão"
          >
            <div className="w-5 h-5 rounded-full bg-[#00bfa5] text-[#004d40] font-black text-[10px] flex items-center justify-center">
              {currentUser.name.charAt(0)}
            </div>
            <span className="font-bold text-white text-xs hidden sm:inline">
              {currentUser.name.split(' ')[0]}
            </span>
            <ChevronDown className="w-3 h-3 text-[#b2dfdb]" />
          </button>

          {/* Logout button */}
          <button
            onClick={onLogout}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/30 text-[#e0f2f1] hover:text-white transition cursor-pointer"
            title="Encerrar sessão"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
