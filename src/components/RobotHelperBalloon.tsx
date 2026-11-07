import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  X, 
  ArrowRight, 
  ChevronRight, 
  FileText, 
  Building2, 
  FileSpreadsheet, 
  Coins, 
  PlusCircle, 
  Users, 
  Send, 
  Loader2,
  HelpCircle
} from 'lucide-react';

interface RoutineGuide {
  id: string;
  title: string;
  tab: 'home' | 'assets' | 'depreciation' | 'ofx' | 'fees' | 'accounts' | 'database' | 'admin' | 'companies';
  actionLabel: string;
  description: string;
  steps: string[];
}

const SYSTEM_ROUTINES: RoutineGuide[] = [
  {
    id: 'ofx',
    title: 'Como converter extrato bancário para OFX',
    tab: 'ofx',
    actionLabel: 'Ir para Conversor OFX',
    description: 'Transforme extratos bancários em PDF ou foto em arquivo .OFX padrão para importação no Domínio Sistemas ou Questor.',
    steps: [
      'Clique em "Conversor OFX" no menu lateral esquerdo.',
      'Arraste ou selecione o arquivo do extrato (PDF nativo, escaneado ou foto do extrato em JPG/PNG).',
      'Opcionalmente, informe a Conta Contábil do Banco (ex: 1.1.1.02.0001 - Itaú).',
      'Clique no botão "Processar com IA e Gerar OFX".',
      'A IA extrai todas as movimentações e você clica em "Baixar Arquivo OFX (.ofx)".'
    ],
  },
  {
    id: 'assets',
    title: 'Como cadastrar ativo permanente & conta contábil',
    tab: 'assets',
    actionLabel: 'Ir para Ativo Permanente',
    description: 'Cadastre máquinas, veículos, equipamentos e imóveis com plaqueta patrimonial e contas contábeis.',
    steps: [
      'Acesse "Ativo Permanente" no menu lateral esquerdo.',
      'Clique no botão "+ Novo Bem Patrimonial".',
      'Preencha a descrição, valor de aquisição, data e valor residual.',
      'O sistema sugere a taxa da Receita Federal (CPC 27) automaticamente.',
      'Defina as contas contábeis de débito (despesa), crédito (depreciação acumulada) e centro de custo.',
      'Clique em "Salvar Ativo" (os dados são sincronizados no Firebase Firestore).'
    ],
  },
  {
    id: 'depreciation',
    title: 'Como apurar depreciação e exportar para Domínio / Questor',
    tab: 'depreciation',
    actionLabel: 'Ver Apuração de Depreciação',
    description: 'Calcule a depreciação mensal linear e gere o arquivo TXT pronto para importação contábil.',
    steps: [
      'Clique em "Depreciação" no menu lateral.',
      'Selecione a competência no campo de mês (ex: 2026-11).',
      'O ContSuite calcula os valores depreciáveis, depreciação acumulada e valor contábil líquido.',
      'Clique em "Exportar Domínio Sistemas (TXT)" ou "CSV Universal" para baixar os lançamentos prontos para o ERP contábil.'
    ],
  },
  {
    id: 'fees',
    title: 'Como gerenciar e registrar pagamento de honorários',
    tab: 'fees',
    actionLabel: 'Ir para Honorários',
    description: 'Acompanhe as mensalidades dos clientes do escritório contábil e dê baixa nos pagamentos.',
    steps: [
      'Acesse "Honorários" no menu lateral.',
      'Visualize os KPIs de faturamento previsto, total recebido e mensalidades em aberto.',
      'Para liquidar uma fatura, clique no botão "Registrar Pagamento" na linha do cliente.',
      'Selecione o meio de liquidação (PIX, Boleto ou TED) e confirme a baixa no sistema.',
      'Para um novo cliente, clique em "+ Novo Contrato de Honorários".'
    ],
  },
  {
    id: 'companies',
    title: 'Como cadastrar nova empresa para controle interno',
    tab: 'companies',
    actionLabel: 'Cadastrar Empresa Agora',
    description: 'Cadastre empresas clientes para controle interno com isolamento absoluto de base de dados.',
    steps: [
      'Clique no botão "+ Cadastrar Empresa" no menu lateral.',
      'Informe Razão Social, Nome Fantasia, CNPJ e e-mail de contato.',
      'Selecione o sistema contábil utilizado (Domínio, Questor, Fortes, etc.).',
      'Salve o cadastro. A empresa passa a ter seu próprio ambiente isolado no sistema.'
    ],
  },
  {
    id: 'users',
    title: 'Como convidar clientes com isolamento de dados',
    tab: 'admin',
    actionLabel: 'Gerenciar Usuários & Convites',
    description: 'Envie convite de cadastramento por e-mail para que o cliente acesse apenas sua respectiva empresa.',
    steps: [
      'Acesse "Usuários & Convites" no menu lateral (acesso de Administrador).',
      'Clique em "+ Convidar Novo Usuário".',
      'Informe o nome, e-mail corporativo do cliente e a empresa associada.',
      'O sistema gera o e-mail de convite com o link de ativação exclusivo.',
      'Ao entrar, o cliente só enxergará o Ativo Permanente e o Conversor OFX da sua própria empresa.'
    ],
  },
  {
    id: 'accounts',
    title: 'Como cadastrar ou importar o Plano de Contas',
    tab: 'accounts',
    actionLabel: 'Ir para Plano de Contas',
    description: 'Gerencie a estrutura contábil, importe via CSV ou carregue o Plano Padrão Brasileiro (SPED/NBC TG).',
    steps: [
      'Clique em "Plano de Contas" no menu lateral esquerdo.',
      'Para carregar o plano completo em 1 clique, clique em "Plano Padrão (SPED)".',
      'Para cadastrar uma nova conta avulsa, clique em "+ Nova Conta" e preencha código, tipo (analítica/sintética) e finalidade (banco, imobilizado, depreciação).',
      'Para importar do seu ERP, clique em "Importar CSV" e cole o arquivo no formato CODIGO;DESCRICAO;TIPO;NATUREZA.',
      'O sistema utilizará essas contas para parametrizar depreciações e conciliação bancária do OFX automaticamente.'
    ],
  },
  {
    id: 'database',
    title: 'Como fazer backup, restaurar ou limpar dados de teste',
    tab: 'database',
    actionLabel: 'Ir para Banco de Dados',
    description: 'Exporte cópias de segurança em JSON, restaure backups ou limpe os dados de demonstração para iniciar o escritório real.',
    steps: [
      'Clique em "Banco de Dados" no menu lateral esquerdo.',
      'Para salvar uma cópia completa dos seus dados, clique em "Fazer Backup do Banco (.JSON)".',
      'Para restaurar dados anteriores, clique em "Restaurar Cópia de Backup" e faça o upload do arquivo .json.',
      'Para remover os cadastros de teste gerados na demonstração, utilize o botão "Limpar Dados de Demonstração" e confirme digitando LIMPAR.',
      'Sua conta de Administrador Master (Rodrigo Bento) e o Plano de Contas Referencial permanecerão 100% preservados.'
    ],
  },
  {
    id: 'user-company-bond',
    title: 'Como as empresas estão amarradas ao meu usuário?',
    tab: 'admin',
    actionLabel: 'Ver Empresas & Usuários',
    description: 'Entenda como funciona o vínculo das empresas à sua conta master e o isolamento seguro dos clientes.',
    steps: [
      'Você é o Administrador Master (rodrigobento1979@gmail.com). Todas as empresas cadastradas no sistema pertencem à sua carteira administrativa.',
      'Você tem visão global de todas as empresas e pode alternar livremente entre elas no topo do sistema.',
      'Cada cliente cadastrado ou convidado fica amarrado estritamente à sua própria empresa (companyId).',
      'Quando o cliente faz login, o sistema filtra 100% dos dados: ele nunca vê outras empresas, honorários de outros clientes ou inventários alheios.',
      'Você pode conferir esse isolamento clicando em "Simular Acesso" na aba Usuários & Convites.'
    ],
  },
];

interface RobotHelperBalloonProps {
  onNavigate: (tab: 'home' | 'assets' | 'depreciation' | 'ofx' | 'fees' | 'accounts' | 'database' | 'admin' | 'companies') => void;
  onOpenCompanyModal: () => void;
}

export const RobotHelperBalloon: React.FC<RobotHelperBalloonProps> = ({
  onNavigate,
  onOpenCompanyModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<RoutineGuide | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswer, setCustomAnswer] = useState<{ answer: string; steps: string[]; tab?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectRoutine = (routine: RoutineGuide) => {
    setSelectedRoutine(routine);
    setCustomAnswer(null);
  };

  const handleAction = (tab: RoutineGuide['tab']) => {
    setIsOpen(false);
    if (tab === 'companies') {
      onOpenCompanyModal();
    } else {
      onNavigate(tab as any);
    }
  };

  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/ai/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: customQuestion.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCustomAnswer({
          answer: data.answer,
          steps: data.steps || [],
          tab: data.suggestedTab,
        });
        setSelectedRoutine(null);
      }
    } catch (err) {
      console.error('Error asking AI:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Robot Speech Balloon Button */}
      <div className="fixed bottom-5 right-5 z-40 flex items-center gap-2 group">
        {/* Friendly speech bubble */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#00897b] text-white text-xs font-bold shadow-lg shadow-teal-950/20 hover:bg-[#00796b] transition transform hover:-translate-y-0.5 cursor-pointer border border-[#00bfa5]/40"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#26a69a]" />
            <span>Mostre-me como fazer</span>
            <span className="w-2 h-2 rounded-full bg-[#00bfa5] animate-ping ml-0.5"></span>
          </button>
        )}

        {/* Robot Avatar Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-13 h-13 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all transform hover:scale-105 cursor-pointer relative ${
            isOpen 
              ? 'bg-slate-800 rotate-90 text-slate-300' 
              : 'bg-gradient-to-tr from-[#00695c] via-[#00897b] to-[#00bfa5] text-white shadow-teal-900/30'
          }`}
          title="Assistente: Mostre-me como fazer"
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <>
              {/* Cute Robot SVG */}
              <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
                {/* Antenna */}
                <line x1="20" y1="4" x2="20" y2="10" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <circle cx="20" cy="4" r="2.5" fill="#26a69a" stroke="white" strokeWidth="1.5" />
                {/* Head */}
                <rect x="7" y="10" width="26" height="20" rx="6" fill="white" />
                {/* Screen visor */}
                <rect x="10" y="14" width="20" height="11" rx="3.5" fill="#004d40" />
                {/* Robot Eyes */}
                <circle cx="15" cy="19.5" r="2.5" fill="#00e676" />
                <circle cx="25" cy="19.5" r="2.5" fill="#00e676" />
                {/* Mouth smile */}
                <path d="M17 29 C 19 31, 21 31, 23 29" stroke="#004d40" strokeWidth="1.5" strokeLinecap="round" />
                {/* Ears */}
                <rect x="4" y="16" width="3" height="7" rx="1.5" fill="#80cbc4" />
                <rect x="33" y="16" width="3" height="7" rx="1.5" fill="#80cbc4" />
              </svg>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-full"></span>
            </>
          )}
        </button>
      </div>

      {/* Modal / Flyout: Interactive Guide with System Routines */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200/80 space-y-4 max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00695c] to-[#00bfa5] text-white flex items-center justify-center shadow-xs">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                    Suzy • Mostre-me como fazer
                    <span className="text-[10px] font-bold bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full border border-pink-200">
                      Assistente Suzy
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Olá! Sou a Suzy. Escolha uma rotina abaixo para ver o passo a passo ou faça sua pergunta.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Question input */}
              <form onSubmit={handleAskAi} className="relative">
                <input
                  type="text"
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Ou pergunte algo: 'Como lançar valor residual?', etc."
                  className="w-full text-xs pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#009688] bg-slate-50/50"
                />
                <button
                  type="submit"
                  disabled={loading || !customQuestion.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-2.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white transition flex items-center justify-center cursor-pointer disabled:opacity-40"
                  title="Perguntar"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </form>

              {/* Custom AI Answer */}
              {customAnswer && (
                <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200 space-y-2.5 animate-in fade-in">
                  <span className="text-xs font-bold text-teal-900 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                    Resposta do Assistente:
                  </span>
                  <p className="text-xs font-medium text-slate-700 leading-relaxed">
                    {customAnswer.answer}
                  </p>
                  {customAnswer.steps.length > 0 && (
                    <div className="space-y-1.5 pt-1.5 border-t border-teal-200/60">
                      {customAnswer.steps.map((st, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="w-4 h-4 rounded-full bg-[#00897b] text-white font-bold text-[9px] flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span>{st}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {customAnswer.tab && (
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleAction(customAnswer.tab as any)}
                        className="px-3 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <span>Acessar essa rotina</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Selected Routine Detail */}
              {selectedRoutine && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-teal-200 space-y-3 animate-in fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#00897b]" />
                        {selectedRoutine.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {selectedRoutine.description}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedRoutine(null)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-200">
                    {selectedRoutine.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="w-4 h-4 rounded-full bg-[#00897b] text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={() => handleAction(selectedRoutine.tab)}
                      className="px-4 py-2 rounded-xl bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>{selectedRoutine.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* List of Existing System Routines */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
                  Rotinas Disponíveis no ContSuite:
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {SYSTEM_ROUTINES.map((routine) => (
                    <button
                      key={routine.id}
                      onClick={() => handleSelectRoutine(routine)}
                      className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between text-xs ${
                        selectedRoutine?.id === routine.id
                          ? 'bg-teal-50/70 border-teal-300 text-teal-950 font-bold'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-teal-50 text-[#00897b] flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold">{routine.title}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>ContSuite • Assistente Integrado</span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
