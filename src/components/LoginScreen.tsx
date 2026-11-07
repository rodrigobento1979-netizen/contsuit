import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Lock, 
  ShieldCheck, 
  BarChart3, 
  MousePointerClick, 
  AlertCircle,
  Building2,
  HelpCircle,
  Loader2,
  Sparkles
} from 'lucide-react';
import { Company } from '../types';
import { ContSuiteLogo } from './ContSuiteLogo';

interface LoginScreenProps {
  onLogin: (email: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  allCompanies: Company[];
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onGoogleSignIn,
  allCompanies,
}) => {
  const [email, setEmail] = useState('rodrigobento1979@gmail.com');
  const [password, setPassword] = useState('••••••••');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe seu usuário ou e-mail cadastrado.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onLogin(email.trim());
    } catch (err: any) {
      setError(err.message || 'Usuário ou e-mail não encontrado. Solicite convite ao Administrador.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string) => {
    setEmail(demoEmail);
    setLoading(true);
    setError(null);
    try {
      await onLogin(demoEmail);
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onGoogleSignIn();
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar com o Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans overflow-hidden bg-slate-100">
      {/* Blurred Modern Executive Office Background matching image */}
      <div 
        className="absolute inset-0 bg-cover bg-center filter blur-[6px] opacity-75 scale-105"
        style={{
          backgroundImage: "url('/assets/aistudio/image_05d41d02.png')",
          backgroundColor: '#e2e8f0',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/40 via-teal-950/20 to-white/40" />

      {/* Main Login Card - Dual Pane Layout matching image_05d41d02.png */}
      <div className="relative z-10 w-full max-w-4xl bg-white rounded-3xl shadow-2xl shadow-teal-950/30 overflow-hidden border border-white/60 flex flex-col md:flex-row min-h-[520px]">
        
        {/* Left Pane: Vibrant Teal/Cyan Gradient with Brand, Digital Waves and Badges */}
        <div className="md:w-[48%] bg-gradient-to-br from-[#00bfa5] via-[#009688] to-[#00695c] p-8 sm:p-10 flex flex-col justify-between text-white relative overflow-hidden">
          {/* Subtle wave decoration */}
          <div className="absolute inset-0 opacity-15 pointer-events-none">
            <svg viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0,100 C150,200 250,50 400,150 L400,400 L0,400 Z" fill="white" />
              <path d="M0,220 C120,320 280,180 400,280 L400,400 L0,400 Z" fill="white" opacity="0.5" />
            </svg>
          </div>

          {/* Top Brand Logo */}
          <div className="relative z-10">
            <ContSuiteLogo size="xl" variant="white" showSubtitle={true} />
            <p className="mt-4 text-teal-50 text-xs sm:text-sm leading-relaxed max-w-xs font-normal">
              Sistema corporativo de gestão contábil, controle de ativo imobilizado, depreciação linear e conversor de extratos para OFX com IA.
            </p>
          </div>

          {/* Center Graphic Wavy Digital Ribbon */}
          <div className="relative z-10 my-6 py-4 flex items-center justify-center opacity-85">
            <svg viewBox="0 0 320 80" className="w-full h-20 text-teal-100" fill="none">
              <path
                d="M10,40 C60,10 100,70 160,40 C220,10 260,70 310,40"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.6"
              />
              <path
                d="M10,45 C70,25 110,65 170,45 C230,25 270,65 310,45"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M10,50 C80,35 120,60 180,50 C240,35 280,60 310,50"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.7"
              />
            </svg>
          </div>

          {/* Bottom 3 Badges from image: Security Shield, Bar Chart, Pointer Hand */}
          <div className="relative z-10 pt-4 border-t border-teal-400/30 flex items-center justify-around">
            <div className="flex flex-col items-center gap-1 group">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-teal-100 font-medium">Seguro</span>
            </div>

            <div className="flex flex-col items-center gap-1 group">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-teal-100 font-medium">CPC 27</span>
            </div>

            <div className="flex flex-col items-center gap-1 group">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20 shadow-xs">
                <MousePointerClick className="w-5 h-5 text-white" />
              </div>
              <span className="text-[10px] text-teal-100 font-medium">OFX c/ IA</span>
            </div>
          </div>
        </div>

        {/* Right Pane: White Form matching image with Acesse Sua Conta */}
        <div className="md:w-[52%] bg-white p-8 sm:p-10 flex flex-col justify-between">
          <div>
            {/* Header matching image */}
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0f2e2e] tracking-tight">
                Acesse Sua Conta
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
                Bem-vindo ao <span className="text-teal-700 font-bold">ContSuite</span>
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Input: Usuário ou E-mail */}
              <div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-teal-600">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Usuário ou E-mail"
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-teal-500/70 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/30 text-sm text-slate-800 placeholder-slate-400 outline-none transition bg-white"
                  />
                </div>
              </div>

              {/* Input: Senha */}
              <div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-teal-600">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-teal-500/70 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/30 text-sm text-slate-800 placeholder-slate-400 outline-none transition bg-white"
                  />
                </div>
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={() => setShowHelpModal(true)}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 transition cursor-pointer"
                  >
                    Esqueceu sua senha?
                  </button>
                </div>
              </div>

              {/* Action Button: LOGIN in solid vibrant teal matching image */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-lg bg-[#009688] hover:bg-[#00796b] text-white text-sm font-bold tracking-wider uppercase transition shadow-md shadow-teal-900/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>ENTRANDO...</span>
                  </>
                ) : (
                  <span>LOGIN</span>
                )}
              </button>
            </form>

            {/* Footer Links from image: Criar uma conta / Ajuda */}
            <div className="flex items-center justify-between mt-4 text-xs font-semibold text-teal-700">
              <button
                type="button"
                onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                className="hover:text-teal-900 transition cursor-pointer flex items-center gap-1"
              >
                <span>{showDemoAccounts ? 'Ocultar contas demo' : 'Criar uma conta / Acessos Rápidos'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHelpModal(true)}
                className="hover:text-teal-900 transition cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Ajuda</span>
              </button>
            </div>

            {/* Quick Demo Accounts Drawer */}
            {showDemoAccounts && (
              <div className="mt-4 p-3 bg-teal-50/70 rounded-xl border border-teal-100 text-xs space-y-2 animate-in fade-in">
                <span className="font-bold text-teal-950 block text-[11px] uppercase tracking-wider">
                  Acesso com 1 clique (Perfis Testados):
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('rodrigobento1979@gmail.com')}
                    className="w-full text-left p-2 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-950 transition flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-bold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Rodrigo Bento (Admin Master)
                      </span>
                      <span className="text-[10px] text-slate-500">Bento Contabilidade</span>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded">
                      Admin
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('carlos.mendes@metalurgicasp.com.br')}
                    className="w-full text-left p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 transition flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-bold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-600" />
                        Carlos Mendes (Cliente)
                      </span>
                      <span className="text-[10px] text-slate-500">Metalúrgica São Paulo</span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-semibold">Acessar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleQuickLogin('fernanda@techvanguard.com.br')}
                    className="w-full text-left p-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 transition flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-bold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-600" />
                        Fernanda Oliveira (Cliente)
                      </span>
                      <span className="text-[10px] text-slate-500">TechVanguard Soluções</span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-semibold">Acessar</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Google Firebase Authentication Option */}
          <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={loading}
              className="w-full py-2 px-3 rounded-lg border border-slate-200 hover:border-teal-400 bg-slate-50/70 hover:bg-white text-slate-700 text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Entrar com Conta Google (Firebase)</span>
            </button>
            <p className="text-[10px] text-center text-slate-400">
              Isolamento seguro: cada empresa acessa estritamente seus dados.
            </p>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-600" />
              Central de Ajuda ContSuite
            </h3>
            <div className="text-xs text-slate-600 space-y-2.5 leading-relaxed">
              <p>
                <strong>Como funciona o acesso?</strong><br />
                O sistema é administrado por Rodrigo Bento. Novos clientes recebem um convite por e-mail e acessam somente a sua própria empresa.
              </p>
              <p>
                <strong>Esqueceu sua senha?</strong><br />
                Basta utilizar a autenticação direta pelo Google com o mesmo e-mail cadastrado ou solicitar a reemissão ao administrador.
              </p>
              <p>
                <strong>Módulos do ContSuite:</strong><br />
                • Conversor de Extrato Bancário para OFX com IA.<br />
                • Controle de Ativo Permanente & Depreciação CPC 27.<br />
                • Controle Financeiro de Honorários Contábeis.<br />
                • Exportação para Domínio Sistemas, Questor, etc.
              </p>
            </div>
            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
