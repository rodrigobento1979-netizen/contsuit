import React, { useState } from 'react';
import { 
  X, 
  User as UserIcon, 
  ShieldCheck, 
  Building2, 
  RefreshCw, 
  Lock, 
  CheckCircle2, 
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { User, Company } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentCompany?: Company;
  allUsers: (User & { company?: Company })[];
  onSelectUser: (user: User) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentCompany,
  allUsers,
  onSelectUser,
}) => {
  // Password challenge state for non-admin profiles
  const [challengeUser, setChallengeUser] = useState<User | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isMasterAdmin = (u: User) => {
    const email = u.email.toLowerCase().trim();
    return email === 'rodrigobento1979@gmail.com' || (u.role === 'admin' && email.includes('rodrigobento'));
  };

  const handleInitiateSwitch = (targetUser: User) => {
    // If already current user
    if (targetUser.id === currentUser.id) {
      onClose();
      return;
    }

    // Master Administrator switches directly without password challenge
    if (isMasterAdmin(targetUser)) {
      onSelectUser(targetUser);
      onClose();
      return;
    }

    // Non-admin / client profile requires password verification
    setChallengeUser(targetUser);
    setPasswordInput('');
    setPasswordError(null);
    setShowPassword(false);
  };

  const handleConfirmPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!challengeUser) return;

    // Standard default password generated for invited clients
    const validPasswords = ['ContSuite@2026', '123456', 'contsuite'];
    const trimmed = passwordInput.trim();

    if (!trimmed) {
      setPasswordError('Por favor, informe a senha de acesso.');
      return;
    }

    if (validPasswords.includes(trimmed)) {
      onSelectUser(challengeUser);
      setChallengeUser(null);
      setPasswordInput('');
      setPasswordError(null);
      onClose();
    } else {
      setPasswordError('Senha incorreta! Utilize a senha padrão enviada no convite (ContSuite@2026).');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#004d40] to-[#00897b] flex items-center justify-center text-white font-bold text-sm shadow-2xs">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">{currentUser.name}</h3>
              <p className="text-xs text-slate-500">{currentUser.email}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setChallengeUser(null);
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PASSWORD CHALLENGE PROMPT FOR CLIENT / NON-ADMIN PROFILE */}
        {challengeUser ? (
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-900 rounded-xl shrink-0 mt-0.5">
                <KeyRound className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Confirmação de Acesso com Senha
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Alternar para: <strong>{challengeUser.name}</strong> ({challengeUser.email})
                </p>
                <p className="text-[10px] text-slate-500">
                  (Exceto para o perfil do Administrador Master, outros perfis exigem senha de validação)
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmPassword} className="space-y-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Senha do Usuário:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder="Digite a senha (padrão: ContSuite@2026)"
                    className="w-full text-xs px-3 py-2 pr-9 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#00897b] focus:border-transparent outline-none bg-white"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                  <span>Senha padrão do sistema: <strong>ContSuite@2026</strong></span>
                </div>
              </div>

              {passwordError && (
                <div className="text-[11px] text-red-600 flex items-center gap-1.5 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setChallengeUser(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span>Validar e Entrar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Current profile & isolation pill */}
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Papel no Sistema:</span>
                  <span className="font-bold text-slate-800 uppercase text-[10px] px-2 py-0.5 rounded bg-slate-200">
                    {currentUser.role === 'admin' ? 'Administrador Geral' : currentUser.role === 'accountant' ? 'Contador' : 'Cliente Empresa'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Empresa Vinculada:</span>
                  <span className="font-bold text-[#00695c]">
                    {currentCompany?.name || 'Nenhuma'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">CNPJ:</span>
                  <span className="font-mono text-slate-700">{currentCompany?.cnpj || 'N/A'}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 flex items-start gap-2">
                <Lock className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Regra de Isolamento de Dados:</span>
                  <span className="text-[11px] text-teal-800">
                    {currentUser.role === 'admin' 
                      ? 'Como Administrador Geral, você pode gerenciar todas as empresas e usuários com acesso livre sem restrições.'
                      : 'Seu usuário visualiza estritamente os bens, quotas de depreciação e extratos bancários da sua empresa.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Profile Switcher */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-[#00897b]" />
                  Alternar Perfil:
                </span>
                <span className="text-[10px] text-slate-400">
                  Admin não pede senha • Clientes exigem senha
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {allUsers.map((u) => {
                  const isCurrent = u.id === currentUser.id;
                  const isMaster = isMasterAdmin(u);

                  return (
                    <button
                      key={u.id}
                      onClick={() => handleInitiateSwitch(u)}
                      className={`w-full p-2.5 rounded-xl border text-left text-xs transition flex items-center justify-between cursor-pointer ${
                        isCurrent
                          ? 'border-[#00897b] bg-teal-50/50 text-teal-950 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold flex items-center gap-1.5 truncate">
                          <span>{u.name}</span>
                          {isMaster && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#004d40] text-white">
                              Admin Master
                            </span>
                          )}
                          {!isMaster && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-200 text-slate-700 flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" />
                              Requer Senha
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {u.company?.fantasyName || u.company?.name || 'Sem empresa'} • {u.email}
                        </div>
                      </div>
                      {isCurrent ? (
                        <CheckCircle2 className="w-4 h-4 text-[#00897b] shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
