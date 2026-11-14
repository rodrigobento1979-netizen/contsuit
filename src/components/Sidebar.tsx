import React, { useState } from 'react';
import { 
  Building2, 
  Sparkles, 
  Coins, 
  FolderTree,
  Database,
  PlusCircle, 
  Users, 
  Bot, 
  LogOut, 
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  CheckCircle2,
  Boxes,
  Wrench,
  Settings,
  Landmark,
  FolderOpen
} from 'lucide-react';
import { User, Company } from '../types';
import { ContSuiteLogo } from './ContSuiteLogo';

export type AppNavTab = 'home' | 'assets' | 'companies' | 'accounts' | 'ofx' | 'documents' | 'fees' | 'database' | 'admin' | 'depreciation';

interface SidebarProps {
  currentUser: User;
  currentCompany: Company;
  activeTab: AppNavTab;
  setActiveTab: (tab: AppNavTab) => void;
  onOpenCompanyModal: () => void;
  onOpenUserModal: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  currentCompany,
  activeTab,
  setActiveTab,
  onOpenCompanyModal,
  onOpenUserModal,
  onLogout,
}) => {
  const isAdmin = currentUser.role === 'admin';

  // Accordion state: todas as seções iniciam fechadas e abrir uma recolhe as demais
  type SidebarGroup = 'cadastros' | 'patrimonio' | 'ferramentas' | 'configuracoes';
  const [openGroup, setOpenGroup] = useState<SidebarGroup | null>(null);

  const toggleGroup = (group: SidebarGroup) => {
    setOpenGroup((prev) => (prev === group ? null : group));
  };

  return (
    <aside className="w-64 bg-gradient-to-b from-[#004d40] via-[#00695c] to-[#004d40] text-white flex flex-col shrink-0 border-r border-[#00332c] shadow-xl z-30 select-none overflow-x-hidden">
      
      {/* Brand Header */}
      <div className="p-4 border-b border-teal-800/40">
        <button
          onClick={() => setActiveTab('home')}
          className="w-full text-left cursor-pointer focus:outline-none"
        >
          <ContSuiteLogo size="md" variant="white" showSubtitle={true} />
        </button>

        {/* Current Company Context Badge */}
        <div className="mt-3 p-2.5 rounded-xl bg-black/20 border border-white/10 text-xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-teal-300 block">
              Empresa em Gestão:
            </span>
            <p className="font-bold text-white text-xs truncate">
              {currentCompany.fantasyName || currentCompany.name}
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 ml-1"></span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
        
        {/* INÍCIO */}
        <div>
          <button
            onClick={() => setActiveTab('home')}
            className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
              activeTab === 'home'
                ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                : 'text-teal-100/90 hover:text-white hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Bot className={`w-4 h-4 shrink-0 ${activeTab === 'home' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
              <div className="truncate">
                <span className="block truncate font-bold">Início & Assistente</span>
                <span className="text-[10px] opacity-75 font-normal block truncate">
                  Orientação Inteligente
                </span>
              </div>
            </div>
            {activeTab === 'home' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
          </button>
        </div>

        {/* GRUPO 1: CADASTROS */}
        <div className="space-y-1">
          <button
            onClick={() => toggleGroup('cadastros')}
            className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-300/90 hover:text-white transition cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Boxes className="w-3.5 h-3.5 text-teal-300" />
              <span>Cadastros</span>
            </div>
            {openGroup === 'cadastros' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {openGroup === 'cadastros' && (
            <div className="space-y-1 pl-1">
              {/* Empresas */}
              <button
                onClick={() => setActiveTab('companies')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'companies'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Landmark className={`w-4 h-4 shrink-0 ${activeTab === 'companies' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Empresas</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Clientes & Parâmetros
                    </span>
                  </div>
                </div>
                {activeTab === 'companies' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>

              {/* Plano de Contas */}
              <button
                onClick={() => setActiveTab('accounts')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'accounts'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FolderTree className={`w-4 h-4 shrink-0 ${activeTab === 'accounts' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Plano de Contas</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Cadastrar & Importar
                    </span>
                  </div>
                </div>
                {activeTab === 'accounts' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>
            </div>
          )}
        </div>

        {/* GRUPO 2: PATRIMÔNIO (ATIVO IMOBILIZADO UNIFICADO - INICIA FECHADO) */}
        <div className="space-y-1">
          <button
            onClick={() => toggleGroup('patrimonio')}
            className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-300/90 hover:text-white transition cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-300" />
              <span>Patrimônio</span>
            </div>
            {openGroup === 'patrimonio' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {openGroup === 'patrimonio' && (
            <div className="pl-1">
              <button
                onClick={() => setActiveTab('assets')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'assets' || activeTab === 'depreciation'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
                title="Módulo completo de Ativo Imobilizado: Inventário, Depreciação, Relatório, Projeção, Baixa e Integração NG/Domínio"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Building2 className={`w-4 h-4 shrink-0 ${activeTab === 'assets' || activeTab === 'depreciation' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate font-bold">Ativo Imobilizado</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Deprec., Baixas & Integração
                    </span>
                  </div>
                </div>
                {(activeTab === 'assets' || activeTab === 'depreciation') && (
                  <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* GRUPO 3: FERRAMENTAS (CONVERSOR OFX, ARQUIVOS & HONORÁRIOS) */}
        <div className="space-y-1">
          <button
            onClick={() => toggleGroup('ferramentas')}
            className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-300/90 hover:text-white transition cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-teal-300" />
              <span>Ferramentas</span>
            </div>
            {openGroup === 'ferramentas' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {openGroup === 'ferramentas' && (
            <div className="space-y-1 pl-1">
              {/* Conversor OFX */}
              <button
                onClick={() => setActiveTab('ofx')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'ofx'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className={`w-4 h-4 shrink-0 ${activeTab === 'ofx' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Conversor OFX</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Extratos com IA
                    </span>
                  </div>
                </div>
                {activeTab === 'ofx' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>

              {/* Arquivos */}
              <button
                onClick={() => setActiveTab('documents')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'documents'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FolderOpen className={`w-4 h-4 shrink-0 ${activeTab === 'documents' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Arquivos</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Documentos & Kanban IA
                    </span>
                  </div>
                </div>
                {activeTab === 'documents' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>

              {/* Honorários */}
              <button
                onClick={() => setActiveTab('fees')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'fees'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Coins className={`w-4 h-4 shrink-0 ${activeTab === 'fees' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Honorários</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Controle Financeiro
                    </span>
                  </div>
                </div>
                {activeTab === 'fees' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>
            </div>
          )}
        </div>

        {/* GRUPO 4: CONFIGURAÇÕES (BANCO DE DADOS & USUÁRIOS/CONVITES) */}
        <div className="space-y-1">
          <button
            onClick={() => toggleGroup('configuracoes')}
            className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-300/90 hover:text-white transition cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-teal-300" />
              <span>Configurações</span>
            </div>
            {openGroup === 'configuracoes' ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {openGroup === 'configuracoes' && (
            <div className="space-y-1 pl-1">
              {/* Banco de Dados */}
              <button
                onClick={() => setActiveTab('database')}
                className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                  activeTab === 'database'
                    ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                    : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Database className={`w-4 h-4 shrink-0 ${activeTab === 'database' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                  <div className="truncate">
                    <span className="block truncate">Banco de Dados</span>
                    <span className="text-[10px] opacity-75 font-normal block truncate">
                      Backup, Restore & Limpeza
                    </span>
                  </div>
                </div>
                {activeTab === 'database' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
              </button>

              {/* Usuários & Convites */}
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs font-semibold ${
                    activeTab === 'admin'
                      ? 'bg-[#00897b] text-white shadow-md shadow-teal-950/20 font-bold border-l-4 border-[#00bfa5]'
                      : 'text-teal-100/90 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Users className={`w-4 h-4 shrink-0 ${activeTab === 'admin' ? 'text-[#a7ffeb]' : 'text-teal-300'}`} />
                    <div className="truncate">
                      <span className="block truncate">Usuários & Convites</span>
                      <span className="text-[10px] opacity-75 font-normal block truncate">
                        Acessos com Senha Padrão
                      </span>
                    </div>
                  </div>
                  {activeTab === 'admin' && <ChevronRight className="w-3.5 h-3.5 text-[#a7ffeb] shrink-0" />}
                </button>
              )}
            </div>
          )}
        </div>

      </nav>

      {/* Footer / User Profile in Sidebar */}
      <div className="p-3 border-t border-teal-800/40 bg-black/15 space-y-2">
        <button
          onClick={onOpenUserModal}
          className="w-full text-left p-2 rounded-xl hover:bg-white/10 transition cursor-pointer flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-[#00bfa5] text-[#004d40] font-black text-xs flex items-center justify-center shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-xs truncate leading-tight">
                {currentUser.name.split(' ')[0]}
              </p>
              <p className="text-[10px] text-teal-300 truncate">
                {isAdmin ? 'Admin Master' : 'Cliente'}
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={onLogout}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-teal-200 hover:text-white hover:bg-rose-500/20 transition cursor-pointer flex items-center gap-2 text-[11px]"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-300" />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </aside>
  );
};
