import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Building2,
  FileSpreadsheet,
  Coins,
  FolderTree,
  Database,
  Users,
  ChevronRight,
  X,
  MousePointerClick,
  HelpCircle,
  TrendingDown
} from 'lucide-react';
import { User, Company } from '../types';

interface AiGuideHomeViewProps {
  currentUser: User;
  currentCompany: Company;
  onNavigate: (tab: any) => void;
  onOpenCompanyModal: () => void;
}

interface RoutineHelpItem {
  id: string;
  title: string;
  category: string;
  icon: any;
  targetTab: string;
  summary: string;
  steps: string[];
}

export const AiGuideHomeView: React.FC<AiGuideHomeViewProps> = ({
  currentUser,
  currentCompany,
  onNavigate,
  onOpenCompanyModal,
}) => {
  // Modal state for floating options cards
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<RoutineHelpItem | null>(null);

  const routines: RoutineHelpItem[] = [
    {
      id: 'assets-deprec',
      title: 'Apurar e Processar Depreciação',
      category: 'Patrimônio',
      icon: FileSpreadsheet,
      targetTab: 'assets',
      summary: 'Cálculo de quotas mensais, trimestrais ou anuais pelas normas CPC 27 e Receita Federal.',
      steps: [
        'Acesse o menu "Patrimônio > Ativo Imobilizado" e abra a aba "Apuração de Depreciação".',
        'Selecione a periodicidade desejada: Mensal, Trimestral ou Anual.',
        'Escolha o Mês/Competência para visualizar as quotas calculadas e partidas dobradas (D/C).',
        'Use a aba de integração para exportar diretamente para NG (Keevo) ou Domínio Sistemas.',
      ],
    },
    {
      id: 'asset-disposal',
      title: 'Baixa de Bem & Ganho/Perda de Capital',
      category: 'Patrimônio',
      icon: TrendingDown,
      targetTab: 'assets',
      summary: 'Apuração automática do Valor Contábil Líquido (VCL) e resultado da alienação.',
      steps: [
        'No menu "Ativo Imobilizado", localize o bem no inventário e clique na opção "Baixar".',
        'Informe a data da baixa, o motivo (Venda, Sucata, Descarte, Perda) e o valor da alienação.',
        'O sistema calcula instantaneamente: Alienação - VCL = Ganho ou Perda de Capital.',
        'Os lançamentos contábeis de baixa e apuração de resultado são gerados automaticamente.',
      ],
    },
    {
      id: 'ofx-converter',
      title: 'Converter Extratos para OFX com IA',
      category: 'Ferramentas',
      icon: Sparkles,
      targetTab: 'ofx',
      summary: 'Conversão inteligente de extratos bancários em PDF ou imagem para arquivo OFX v1.02.',
      steps: [
        'Clique em "Ferramentas > Conversor OFX".',
        'Selecione a empresa e arraste o arquivo do extrato bancário (PDF, PNG, JPG).',
        'Nossa IA extrai todas as movimentações, datas, históricos e valores.',
        'Se a empresa do extrato ainda não estiver cadastrada, o sistema oferecerá para cadastrá-la na hora.',
      ],
    },
    {
      id: 'chart-accounts',
      title: 'Cadastrar ou Importar Plano de Contas',
      category: 'Cadastros',
      icon: FolderTree,
      targetTab: 'accounts',
      summary: 'Estruturação contábil para vinculação de bancos, imobilizado e despesas.',
      steps: [
        'Acesse "Cadastros > Plano de Contas".',
        'Clique em "+ Cadastrar Conta" para adicionar uma conta individual.',
        'Ou clique em "Importar Plano" para carregar ou colar planilha CSV/TXT/Excel/PDF.',
        'Você também pode carregar com 1 clique o Plano de Contas Padrão Brasileiro (SPED/NBC TG).',
      ],
    },
    {
      id: 'fees-manager',
      title: 'Honorários & Mensalidades Contábeis',
      category: 'Ferramentas',
      icon: Coins,
      targetTab: 'fees',
      summary: 'Controle de mensalidades dos clientes, vencimentos e baixa de pagamentos (PIX/Boleto).',
      steps: [
        'Acesse "Ferramentas > Honorários Contábeis".',
        'Acompanhe o dashboard com previsão de faturamento, total liquidado e em atraso.',
        'Clique em "Registrar Pagamento" para dar baixa imediata na fatura da competência.',
        'Cadastre novos contratos com definição de honorários e reajustes.',
      ],
    },
    {
      id: 'user-invite',
      title: 'Convidar Clientes com Senha Padrão',
      category: 'Configurações',
      icon: Users,
      targetTab: 'admin',
      summary: 'Acesso seguro de clientes com senha padrão provisória e isolamento estrito de empresa.',
      steps: [
        'Acesse "Configurações > Usuários & Convites".',
        'Clique em "+ Convidar Novo Usuário" e informe nome, e-mail e empresa vinculada.',
        'O sistema gera uma senha padrão provisória (ContSuite@2026) e o convite formatado.',
        'O cliente acessa com seu e-mail e senha, visualizando estritamente sua própria empresa.',
      ],
    },
    {
      id: 'database-backup',
      title: 'Banco de Dados, Backups & Limpeza',
      category: 'Configurações',
      icon: Database,
      targetTab: 'database',
      summary: 'Gerenciamento seguro da base, download de backups JSON e limpeza de dados de teste.',
      steps: [
        'Acesse "Configurações > Banco de Dados".',
        'Clique em "Fazer Backup Completo" para baixar cópia JSON de segurança dos dados.',
        'Para iniciar a operação oficial da consultoria, use "Limpar Dados de Demonstração".',
        'A limpeza remove registros de teste preservando seu usuário Master (Rodrigo Bento) e Plano de Contas.',
      ],
    },
  ];

  const handleOpenRoutine = (routine: RoutineHelpItem) => {
    setSelectedRoutine(routine);
  };

  const handleNavigateDirect = (tab: string) => {
    setIsOptionsOpen(false);
    setSelectedRoutine(null);
    onNavigate(tab);
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-10 sm:py-16 px-4 flex flex-col items-center justify-center min-h-[75vh]">
      
      {/* SUZY ROBOT CENTERPIECE (CLEAN - ZERO PERMANENT CARDS BELOW) */}
      <div className="text-center max-w-lg mx-auto space-y-5 flex flex-col items-center">
        
        {/* Animated Friendly Feminine Robot Avatar: Suzy (Clickable) */}
        <button
          onClick={() => setIsOptionsOpen(true)}
          className="relative group cursor-pointer focus:outline-none transform transition-all duration-300 hover:scale-105 active:scale-95"
          title="Clique na Suzy para abrir as opções do sistema!"
        >
          {/* Subtle Ambient Glow */}
          <div className="absolute -inset-2 bg-gradient-to-r from-teal-500/20 via-pink-400/20 to-teal-500/20 rounded-full blur-xl group-hover:opacity-100 opacity-60 transition duration-500"></div>

          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-tr from-[#004d40] via-[#00897b] to-[#ec4899] p-1.5 shadow-2xl shadow-teal-950/25 flex items-center justify-center relative z-10 border-2 border-white/60">
            <div className="w-full h-full bg-[#004d40] rounded-[22px] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-pink-500/20 via-teal-400/10 to-transparent"></div>
              
              {/* Cute Feminine Robot Face: Suzy */}
              <div className="relative flex flex-col items-center">
                {/* Cute Antenna with Rosy Glow */}
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-400 animate-pulse shadow-sm shadow-pink-300"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a7ffeb]"></span>
                </div>

                {/* Robot Icon */}
                <Bot className="w-14 h-14 sm:w-16 sm:h-16 text-[#a7ffeb] drop-shadow-md group-hover:text-white transition duration-300" />

                {/* Suzy's Rosy Cheeks and Sweet Smile */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400/90 shadow-2xs"></span>
                  <div className="w-2.5 h-0.5 bg-emerald-300 rounded-full"></div>
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400/90 shadow-2xs"></span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Suzy Name Badge */}
          <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border-2 border-white shadow-lg flex items-center gap-1 z-20">
            <Sparkles className="w-3 h-3 text-pink-100" />
            <span>Suzy</span>
          </div>

          {/* Pulsing Click Hint Indicator */}
          <div className="absolute -top-2 -left-2 bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-white z-20 animate-bounce">
            <MousePointerClick className="w-3 h-3" />
            <span>Clique-me!</span>
          </div>
        </button>

        {/* Speech Balloon Header (Also Clickable) */}
        <button
          onClick={() => setIsOptionsOpen(true)}
          className="bg-white hover:bg-slate-50/90 rounded-2xl p-5 sm:p-6 border border-teal-100 shadow-xl shadow-teal-950/5 max-w-lg relative text-left cursor-pointer transition transform hover:-translate-y-0.5 group"
        >
          {/* Arrow pointing up to robot */}
          <div className="w-3.5 h-3.5 bg-white border-l border-t border-teal-100 transform rotate-45 absolute -top-2 left-1/2 -translate-x-1/2"></div>
          
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[11px] font-bold border border-pink-200/70">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-ping"></span>
              Suzy • Assistente Virtual ContSuite
            </div>

            <span className="text-[11px] font-semibold text-teal-700 flex items-center gap-1 group-hover:translate-x-0.5 transition">
              <span>Abrir opções</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-snug">
            Olá, {currentUser.name.split(' ')[0]}! Eu sou a Suzy.
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
            Clique em mim para escolher o que você gostaria de fazer na gestão contábil da <strong className="text-teal-900">{currentCompany.fantasyName || currentCompany.name}</strong>.
          </p>
        </button>

        {/* Big Action Button to open floating cards */}
        <button
          onClick={() => setIsOptionsOpen(true)}
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#004d40] via-[#00897b] to-[#004d40] hover:from-[#003d33] hover:to-[#00796b] text-white font-extrabold text-xs sm:text-sm transition-all shadow-xl shadow-teal-950/20 transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer border border-[#00bfa5]/30"
        >
          <Sparkles className="w-4 h-4 text-[#a7ffeb]" />
          <span>Mostre-me como fazer • Escolher Rotina</span>
          <ArrowRight className="w-4 h-4 text-[#a7ffeb]" />
        </button>

        <p className="text-[11px] text-slate-400 font-medium">
          Dica: Clique no robô a qualquer momento para abrir as rotinas do ContSuite
        </p>
      </div>

      {/* FLOATING CARDS MODAL (CARDS FLUTUANTES) */}
      {isOptionsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-r from-teal-50/70 to-pink-50/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#004d40] text-white flex items-center justify-center relative shrink-0 shadow-sm">
                  <Bot className="w-6 h-6 text-[#a7ffeb]" />
                  <span className="w-2 h-2 rounded-full bg-pink-400 absolute -top-0.5 -right-0.5 border border-white"></span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                      {selectedRoutine ? selectedRoutine.title : 'Suzy • O que você gostaria de fazer?'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-100 text-pink-800">
                      Suzy
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedRoutine 
                      ? 'Passo a passo detalhado para realizar esta rotina' 
                      : 'Selecione uma das rotinas contábeis abaixo para prosseguir:'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsOptionsOpen(false);
                  setSelectedRoutine(null);
                }}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white transition flex items-center justify-center cursor-pointer border border-transparent hover:border-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              
              {!selectedRoutine ? (
                /* Grid of Floating Cards */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {routines.map((routine) => {
                    const Icon = routine.icon;
                    return (
                      <div
                        key={routine.id}
                        className="p-2.5 rounded-xl border border-slate-200 hover:border-[#00897b] bg-white hover:bg-teal-50/30 transition flex flex-col justify-between gap-2 shadow-2xs group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-teal-50 text-teal-700 group-hover:bg-[#00897b] group-hover:text-white transition flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <h4 className="font-bold text-xs text-slate-900 group-hover:text-teal-900 truncate">
                                {routine.title}
                              </h4>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 shrink-0">
                              {routine.category}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500 line-clamp-1 leading-normal pl-8">
                            {routine.summary}
                          </p>
                        </div>

                        {/* Card Action Buttons */}
                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                          <button
                            onClick={() => handleOpenRoutine(routine)}
                            className="flex-1 py-1 px-2 rounded-lg text-[10px] font-semibold text-slate-600 hover:text-teal-800 hover:bg-slate-100 transition cursor-pointer text-center"
                          >
                            Ver Passo a Passo
                          </button>
                          <button
                            onClick={() => handleNavigateDirect(routine.targetTab)}
                            className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-[#00897b] hover:bg-[#00796b] text-white transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                            title="Ir direto para a rotina"
                          >
                            <span>Acessar</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Step-by-Step Guide for Selected Routine */
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="p-3 bg-teal-50/70 border border-teal-200 rounded-2xl flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#00897b] text-white flex items-center justify-center shrink-0 mt-0.5">
                      <selectedRoutine.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                        {selectedRoutine.title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {selectedRoutine.summary}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                      Passo a Passo da Rotina:
                    </span>
                    <div className="space-y-2">
                      {selectedRoutine.steps.map((step, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-start gap-3 text-xs text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-200/70"
                        >
                          <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-extrabold text-[10px] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed font-medium">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
                    <button
                      onClick={() => setSelectedRoutine(null)}
                      className="w-full sm:w-auto px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      ← Escolher Outra Rotina
                    </button>

                    <button
                      onClick={() => handleNavigateDirect(selectedRoutine.targetTab)}
                      className="w-full sm:w-auto px-5 py-2.5 bg-[#00897b] hover:bg-[#00796b] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg shadow-teal-900/10 cursor-pointer"
                    >
                      <span>Acessar {selectedRoutine.title} Agora</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span className="text-[11px]">
                Empresa ativa: <strong className="text-slate-800">{currentCompany.fantasyName || currentCompany.name}</strong>
              </span>

              <button
                onClick={() => {
                  setIsOptionsOpen(false);
                  setSelectedRoutine(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
