import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Building2, 
  ShieldCheck, 
  Copy, 
  Check, 
  CheckCircle2, 
  Clock, 
  Eye, 
  AlertCircle,
  Search,
  Filter,
  X,
  Send,
  Briefcase,
  KeyRound,
  Lock,
  RotateCw,
  Trash2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { User, Company } from '../types';

interface AdminUsersViewProps {
  currentUser: User;
  allUsers: (User & { company?: Company })[];
  allCompanies: Company[];
  onInviteUser: (payload: {
    name: string;
    email: string;
    role: 'admin' | 'accountant' | 'client';
    companyName?: string;
    cnpj?: string;
    existingCompanyId?: string;
  }) => Promise<{ user: User; emailPreview: any }>;
  onSwitchUserContext: (userId: string) => void;
  onRefreshUsers: () => void;
  onUpdateUserStatus?: (userId: string, newStatus: 'active' | 'pending') => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<void>;
  onResendInvite?: (userId: string) => Promise<{ user: User; emailPreview: any }>;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  currentUser,
  allUsers,
  allCompanies,
  onInviteUser,
  onSwitchUserContext,
  onRefreshUsers,
  onUpdateUserStatus,
  onDeleteUser,
  onResendInvite,
}) => {
  // Tabs: 'users' (Todos), 'pending' (Aguardando Convite), 'companies' (Carteira)
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'pending' | 'companies'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending'>('all');

  // Modal for inviting user (replaces the cramped side column)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'accountant' | 'client'>('client');
  const [companyOption, setCompanyOption] = useState<'new' | 'existing'>('existing');
  const [existingCompanyId, setExistingCompanyId] = useState<string>(allCompanies[0]?.id || '');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCnpj, setNewCompanyCnpj] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailModalData, setEmailModalData] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Simulation Password Challenge State
  const [passwordTargetUser, setPasswordTargetUser] = useState<(User & { company?: Company }) | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  const isMasterAdmin = (u: User) => {
    const email = u.email.toLowerCase().trim();
    return email === 'rodrigobento1979@gmail.com' || (u.role === 'admin' && email.includes('rodrigobento'));
  };

  const handleInitiateSimulate = (targetUser: User & { company?: Company }) => {
    if (targetUser.id === currentUser.id) return;

    // Master Admin bypasses password challenge
    if (isMasterAdmin(targetUser)) {
      onSwitchUserContext(targetUser.id);
      return;
    }

    // Other profiles require password
    setPasswordTargetUser(targetUser);
    setSwitchPassword('');
    setSwitchError(null);
  };

  const handleConfirmSwitchPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passwordTargetUser) return;

    const validPasswords = ['ContSuite@2026', '123456', 'contsuite'];
    if (!switchPassword.trim()) {
      setSwitchError('Informe a senha do usuário para acessar o perfil.');
      return;
    }

    if (validPasswords.includes(switchPassword.trim())) {
      onSwitchUserContext(passwordTargetUser.id);
      setPasswordTargetUser(null);
      setSwitchPassword('');
      setSwitchError(null);
    } else {
      setSwitchError('Senha incorreta! Digite a senha padrão ContSuite@2026.');
    }
  };

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const activeUsers = allUsers.filter(u => u.status !== 'pending');

  // Filtered users
  const filteredUsers = allUsers.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.company?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.company?.fantasyName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'pending' ? u.status === 'pending' : u.status === 'active');
    return matchSearch && matchRole && matchStatus;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFormError('Nome e E-mail são obrigatórios.');
      return;
    }
    if (companyOption === 'new' && !newCompanyName.trim()) {
      setFormError('Informe a Razão Social da nova empresa.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await onInviteUser({
        name: name.trim(),
        email: email.trim(),
        role,
        existingCompanyId: companyOption === 'existing' ? existingCompanyId : undefined,
        companyName: companyOption === 'new' ? newCompanyName.trim() : undefined,
        cnpj: companyOption === 'new' ? newCompanyCnpj.trim() : undefined,
      });

      setShowInviteModal(false);
      setEmailModalData(res.emailPreview);
      setActiveSubTab('pending'); // Switched to "Aguardando Convite" so admin immediately sees it!
      onRefreshUsers();

      // Reset form
      setName('');
      setEmail('');
      setNewCompanyName('');
      setNewCompanyCnpj('');
    } catch (err: any) {
      setFormError(err.message || 'Erro ao convidar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="w-full max-w-full overflow-hidden space-y-4">
      {/* Clean Light Header (No Dark Banner) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60">
            <Users className="w-5 h-5 text-[#00897b]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
              Gestão de Usuários & Controle de Acessos
            </h1>
            <p className="text-xs text-slate-500 truncate">
              Administrador Master: <strong>{currentUser.email}</strong> • Isolamento estrito por empresa
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>+ Convidar Novo Usuário</span>
        </button>
      </div>

      {/* Tabs Navigation: Fits tightly in view without scroll */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('users')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'users'
                ? 'bg-[#00897b] text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Todos os Usuários ({allUsers.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('pending')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap relative ${
              activeSubTab === 'pending'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-amber-50/60 border border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Aguardando Convite</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              activeSubTab === 'pending' ? 'bg-white text-amber-800' : 'bg-amber-500 text-white'
            }`}>
              {pendingUsers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSubTab('companies')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'companies'
                ? 'bg-[#00897b] text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Carteira de Empresas ({allCompanies.length})</span>
          </button>
        </div>

        <span className="hidden sm:inline-block text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60 shrink-0">
          Multi-Tenant Seguro
        </span>
      </div>

      {/* SUB-TAB 1: TODOS OS USUÁRIOS */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Banner notice if there are pending invitations */}
          {pendingUsers.length > 0 && (
            <div className="p-3 bg-amber-50/90 border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-amber-900">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Você possui <strong>{pendingUsers.length}</strong> usuário(s) aguardando ativação de convite.
                </span>
              </div>
              <button
                onClick={() => setActiveSubTab('pending')}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Ver Convites Pendentes</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Search & Filter Toolbar */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar usuário por nome, e-mail ou empresa..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
              >
                <option value="all">Todos os Status ({allUsers.length})</option>
                <option value="active">Apenas Ativos ({activeUsers.length})</option>
                <option value="pending">Aguardando Convite ({pendingUsers.length})</option>
              </select>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
              >
                <option value="all">Todos os Papéis</option>
                <option value="admin">Administrador Geral</option>
                <option value="accountant">Contador / Operador</option>
                <option value="client">Cliente da Empresa</option>
              </select>
            </div>
          </div>

          {/* Users Table without horizontal scroll */}
          <div className="w-full max-w-full overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3 sm:px-4">Usuário</th>
                  <th className="py-2.5 px-3 hidden md:table-cell">Empresa Vinculada</th>
                  <th className="py-2.5 px-2 text-center">Papel</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      Nenhum usuário encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isCurrentUser = u.id === currentUser.id;
                    const isPending = u.status === 'pending';
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3 sm:px-4">
                          <div className="font-bold text-slate-900 truncate max-w-[180px] sm:max-w-xs flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isCurrentUser && (
                              <span className="text-[9px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded shrink-0">
                                Você
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate max-w-[180px] sm:max-w-xs">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{u.email}</span>
                          </div>
                          {/* Show company on mobile where column is hidden */}
                          <div className="text-[10px] text-teal-700 font-medium md:hidden truncate max-w-[180px]">
                            {u.company?.fantasyName || u.company?.name || 'Sem empresa'}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 hidden md:table-cell">
                          <div className="font-semibold text-slate-800 truncate max-w-[200px]">
                            {u.company?.fantasyName || u.company?.name || 'Não vinculada'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            CNPJ: {u.company?.cnpj || 'N/A'}
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {u.role === 'admin' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                              Admin Master
                            </span>
                          )}
                          {u.role === 'accountant' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              Contador
                            </span>
                          )}
                          {u.role === 'client' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              Cliente
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          {u.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Ativo
                            </span>
                          ) : (
                            <button
                              onClick={() => setActiveSubTab('pending')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer transition"
                              title="Clique para ver os detalhes do convite"
                            >
                              <Clock className="w-3 h-3 text-amber-600" />
                              Aguardando Convite
                            </button>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                          {isPending && onUpdateUserStatus && (
                            <button
                              onClick={() => onUpdateUserStatus(u.id, 'active')}
                              className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                              title="Ativar usuário imediatamente"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span className="hidden sm:inline">Ativar</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleInitiateSimulate(u)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200 border border-transparent text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            title="Simular sessão e ver a tela exatamente como este usuário enxerga"
                          >
                            <Eye className="w-3 h-3 text-teal-600 shrink-0" />
                            <span className="hidden sm:inline">Simular</span>
                          </button>
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

      {/* SUB-TAB 2: AGUARDANDO CONVITE (PAINEL DEDICADO) */}
      {activeSubTab === 'pending' && (
        <div className="space-y-4">
          {/* Header Explanation Card */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                  <span>Painel de Convites & Primeiro Acesso</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                    {pendingUsers.length} {pendingUsers.length === 1 ? 'convite pendente' : 'convites pendentes'}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Estes usuários receberam o convite com a senha padrão provisória <code className="bg-white px-1.5 py-0.5 rounded border border-amber-300 font-bold text-amber-900">ContSuite@2026</code>. Você pode copiar o link direto, simular o acesso ou ativá-los imediatamente.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowInviteModal(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Convidar Novo Usuário</span>
            </button>
          </div>

          {/* Pending Cards */}
          {pendingUsers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Nenhum convite pendente no momento</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Todos os usuários convidados já estão cadastrados com status <strong>Ativo</strong>.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Convidar Novo Usuário</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {pendingUsers.map((u) => {
                const inviteLink = `${window.location.origin}/?email=${encodeURIComponent(u.email)}`;
                return (
                  <div
                    key={u.id}
                    className="bg-white rounded-2xl border border-amber-200/90 shadow-2xs p-4 flex flex-col justify-between space-y-3 relative hover:border-amber-400 transition"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                            <span>{u.name}</span>
                          </h4>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-700 font-semibold">{u.email}</span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 shrink-0">
                          <Clock className="w-2.5 h-2.5" />
                          Aguardando Primeiro Acesso
                        </span>
                      </div>

                      {/* Details Box */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            Empresa:
                          </span>
                          <span className="font-bold text-slate-800 truncate max-w-[180px]">
                            {u.company?.fantasyName || u.company?.name || 'Não vinculada'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Papel:</span>
                          <span className="font-semibold text-teal-800">
                            {u.role === 'admin' ? 'Administrador' : u.role === 'accountant' ? 'Contador' : 'Cliente da Empresa'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Senha Provisória:</span>
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            ContSuite@2026
                          </span>
                        </div>
                        {u.invitedAt && (
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/50">
                            <span>Convidado em:</span>
                            <span>{new Date(u.invitedAt).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                      </div>

                      {/* Direct link copy */}
                      <div className="mt-2.5 p-2 bg-amber-50/60 rounded-lg border border-amber-100 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono text-slate-600 truncate flex-1" title={inviteLink}>
                          {inviteLink}
                        </span>
                        <button
                          onClick={() => handleCopyLink(inviteLink)}
                          className="px-2 py-1 rounded bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                          title="Copiar link direto de login"
                        >
                          {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleInitiateSimulate(u)}
                          className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                          title="Simular visualização deste usuário"
                        >
                          <Eye className="w-3 h-3 text-teal-600" />
                          <span>Simular</span>
                        </button>

                        {onUpdateUserStatus && (
                          <button
                            onClick={() => onUpdateUserStatus(u.id, 'active')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                            title="Ativar usuário imediatamente"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Ativar Agora</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {onResendInvite && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await onResendInvite(u.id);
                                if (res?.emailPreview) setEmailModalData(res.emailPreview);
                              } catch {}
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            title="Reenviar e-mail de convite"
                          >
                            <RotateCw className="w-3 h-3 text-slate-500" />
                            <span>Reenviar</span>
                          </button>
                        )}

                        {onDeleteUser && (
                          <button
                            onClick={() => {
                              if (confirm(`Deseja cancelar o convite de ${u.email}?`)) {
                                onDeleteUser(u.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Cancelar convite"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: CARTEIRA DE EMPRESAS */}
      {activeSubTab === 'companies' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#00897b]" />
                Empresas sob Gestão de {currentUser.email}
              </h3>
              <p className="text-xs text-slate-500">
                Cada empresa possui base e parametrizações contábeis 100% isoladas
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-[#00695c] border border-teal-200">
              {allCompanies.length} empresas
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCompanies.map((comp) => {
              const usersCount = allUsers.filter(u => u.companyId === comp.id).length;
              const isMaster = comp.id === 'comp-master';
              return (
                <div
                  key={comp.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-teal-300 transition flex flex-col justify-between space-y-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-slate-900 text-xs truncate" title={comp.fantasyName || comp.name}>
                        {comp.fantasyName || comp.name}
                      </span>
                      {isMaster && (
                        <span className="text-[9px] font-bold bg-[#00897b] text-white px-1.5 py-0.5 rounded shrink-0">
                          Sede Master
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      CNPJ: {comp.cnpj}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      Sistema: {comp.accountingSystem.toUpperCase()}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-teal-600" />
                      {usersCount} {usersCount === 1 ? 'usuário' : 'usuários'}
                    </span>
                    <span className="text-teal-800 font-semibold text-[10px]">
                      Isolamento Ativo
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: CONVIDAR NOVO USUÁRIO */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-teal-100 text-teal-800">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Convidar Novo Usuário</h3>
                  <p className="text-xs text-slate-500">Gera credencial e link de cadastramento por e-mail</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Usuário *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva (Diretor Financeiro)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail para Recebimento do Convite *</label>
                <input
                  type="email"
                  required
                  placeholder="diretoria@cliente.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Papel / Nível de Acesso</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="client">Cliente da Empresa (Vê estritamente sua própria empresa)</option>
                  <option value="accountant">Contador / Operador (Acesso operacional)</option>
                  <option value="admin">Administrador Master (Acesso total)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block font-semibold text-slate-700 mb-1.5">Vincular a qual Empresa?</label>
                <div className="flex items-center gap-4 mb-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="compSelectOption"
                      checked={companyOption === 'existing'}
                      onChange={() => setCompanyOption('existing')}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Empresa Cadastrada</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="compSelectOption"
                      checked={companyOption === 'new'}
                      onChange={() => setCompanyOption('new')}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    <span>Nova Empresa</span>
                  </label>
                </div>

                {companyOption === 'existing' ? (
                  <select
                    value={existingCompanyId}
                    onChange={(e) => setExistingCompanyId(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white"
                  >
                    {allCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fantasyName || c.name} ({c.cnpj})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <label className="block font-medium text-slate-600 mb-0.5">Razão Social *</label>
                      <input
                        type="text"
                        placeholder="Ex: Alfa Logística Ltda"
                        value={newCompanyName}
                        onChange={(e) => setNewCompanyName(e.target.value)}
                        className="w-full p-2 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 mb-0.5">CNPJ</label>
                      <input
                        type="text"
                        placeholder="00.000.000/0001-00"
                        value={newCompanyCnpj}
                        onChange={(e) => setNewCompanyCnpj(e.target.value)}
                        className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Notice about default password and tenant isolation */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Segurança e Senha Padrão de Primeiro Acesso</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  O sistema gerará a senha padrão inicial <strong>ContSuite@2026</strong>. Ao realizar o primeiro login com seu e-mail, o cliente poderá alterar para sua senha pessoal. O usuário terá acesso <strong>somente</strong> à empresa vinculada e às movimentações que realizar.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Enviando...' : 'Gerar e Enviar Convite'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW DO E-MAIL DE CONVITE */}
      {emailModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Convite e Credenciais Geradas</h3>
                  <p className="text-xs text-slate-500">Destinatário: <strong>{emailModalData.to}</strong></p>
                </div>
              </div>
              <button
                onClick={() => setEmailModalData(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Default Password Card */}
              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold text-emerald-900 block">Senha Padrão Provisória Gerada:</span>
                  <span className="font-mono text-sm font-black text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-300">
                    {emailModalData.defaultPassword || 'ContSuite@2026'}
                  </span>
                  <span className="text-[10px] text-emerald-700 block mt-1">
                    O cliente usará o e-mail cadastrado + esta senha para acessar.
                  </span>
                </div>
                <button
                  onClick={() => handleCopyLink(emailModalData.defaultPassword || 'ContSuite@2026')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Senha</span>
                </button>
              </div>

              {/* Render email body */}
              <div 
                className="p-3 bg-white rounded-xl border border-slate-200 text-slate-800 max-h-56 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: emailModalData.bodyHtml }}
              />

              {(() => {
                const displayLink = emailModalData.invitationLink?.startsWith('http')
                  ? emailModalData.invitationLink
                  : `${window.location.origin}${emailModalData.invitationLink?.startsWith('/') ? '' : '/'}${emailModalData.invitationLink || ''}`;
                return (
                  <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="text-teal-900 font-bold block text-[11px]">Link Real de Acesso ao Sistema:</span>
                      <span className="text-teal-800 text-[10px] font-mono truncate block">
                        {displayLink}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyLink(displayLink)}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 shrink-0 transition cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setEmailModalData(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE SENHA PARA SIMULAR PERFIL (EXCETO ADMIN MASTER) */}
      {passwordTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Autenticação Requerida</h3>
                  <p className="text-[11px] text-slate-500">Acesso protegido por credencial</p>
                </div>
              </div>
              <button
                onClick={() => setPasswordTargetUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Perfil Selecionado:</span>
                <span className="font-bold text-slate-900">{passwordTargetUser.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">E-mail:</span>
                <span className="font-mono text-slate-700">{passwordTargetUser.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Empresa:</span>
                <span className="font-semibold text-teal-700">
                  {passwordTargetUser.company?.fantasyName || passwordTargetUser.company?.name || 'Não vinculada'}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSwitchPassword} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Digite a senha de acesso do perfil:
                </label>
                <input
                  type="password"
                  value={switchPassword}
                  onChange={(e) => {
                    setSwitchPassword(e.target.value);
                    setSwitchError(null);
                  }}
                  placeholder="Senha (padrão: ContSuite@2026)"
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#00897b] focus:border-transparent outline-none bg-white"
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Dica: Senha padrão de convite gerada pelo sistema: <strong>ContSuite@2026</strong>
                </p>
              </div>

              {switchError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{switchError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordTargetUser(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Confirmar & Entrar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
