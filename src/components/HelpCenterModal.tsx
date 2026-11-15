import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  Sparkles,
  FolderOpen,
  Landmark,
  FolderTree,
  Building2,
  Coins,
  Database,
  Users,
  Mail,
  Bot,
  ArrowRight,
  CheckCircle2,
  Play,
  Download,
  Eye,
  Archive,
  Inbox,
  ShieldCheck,
} from 'lucide-react';
import { AppNavTab } from './Sidebar';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: AppNavTab) => void;
  isAdmin: boolean;
}

type HelpTab = 'novidades' | 'funcoes' | 'email_auto';

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<HelpTab>('novidades');

  if (!isOpen) return null;

  const goTo = (tab: AppNavTab) => {
    onNavigate(tab);
    onClose();
  };

  const featuresList: {
    id: string;
    tab: AppNavTab;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    group: string;
    summary: string;
    bullets: string[];
    adminOnly?: boolean;
  }[] = [
    {
      id: 'home',
      tab: 'home',
      icon: Bot,
      title: 'Início & Assistente Contábil IA',
      group: 'Painel Principal',
      summary: 'Orientação passo a passo interativa para qualquer rotina do escritório.',
      bullets: [
        'Pergunte em linguagem natural como fazer fechamentos, depreciação ou conversões OFX.',
        'Atalhos rápidos para abrir os módulos diretamente pelas respostas do assistente.',
      ],
    },
    {
      id: 'companies',
      tab: 'companies',
      icon: Landmark,
      title: 'Cadastro de Empresas & Clientes',
      group: 'Cadastros',
      summary: 'Carteira multiempresa com isolamento de dados e parâmetros de ERP.',
      bullets: [
        'Edite empresas já cadastradas para atualizar Razão Social, CNPJ, Telefone e E-mail de contato.',
        'Suporte aos sistemas contábeis Keevo (Mastermaq), NG/Keevo, Domínio, Questor, Fortes, Alterdata, TOTVS e SCI.',
      ],
    },
    {
      id: 'accounts',
      tab: 'accounts',
      icon: FolderTree,
      title: 'Plano de Contas Contábil',
      group: 'Cadastros',
      summary: 'Estrutura analítica/sintética por empresa para integração contábil.',
      bullets: [
        'Cadastre ou importe contas contábeis em lote (Bancos, Imobilizado, Depreciação Acumulada e Despesas).',
      ],
    },
    {
      id: 'assets',
      tab: 'assets',
      icon: Building2,
      title: 'Ativo Imobilizado & Depreciação (CPC 27)',
      group: 'Patrimônio',
      summary: 'Inventário patrimonial, cálculo de quotas, baixas e arquivos de exportação.',
      bullets: [
        'Apuração mensal, trimestral ou anual automática com cálculo de valor residual e vida útil.',
        'Baixa de bens com apuração automática de Ganho ou Perda de Capital.',
        'Exportação pronta para NG/Keevo, Domínio Sistemas, Questor CSV e Ficha Patrimonial.',
      ],
    },
    {
      id: 'ofx',
      tab: 'ofx',
      icon: Sparkles,
      title: 'Conversor OFX com Inteligência Artificial',
      group: 'Ferramentas',
      summary: 'Transforma extratos bancários em PDF, imagem ou texto no padrão OFX 1.02.',
      bullets: [
        'Leitura inteligente multi-página em segundo plano: você pode navegar por outras telas e voltar ao progresso.',
        'Extratos convertidos automaticamente em Arquivos aparecem imediatamente na lista do Conversor OFX.',
        'Relatório analítico imprimível para conferência de saldos, débitos, créditos e lançamentos.',
      ],
    },
    {
      id: 'documents',
      tab: 'documents',
      icon: FolderOpen,
      title: 'Arquivos & Kanban Contábil IA',
      group: 'Ferramentas',
      summary: 'Organização visual por Tipo ou Status com triagem e conversão automatizadas.',
      bullets: [
        'Botão compacto "Upload" e zona de arrastar/soltar múltiplos arquivos.',
        'Separação automática de PDFs mistos: extratos e recibos/comprovantes viram cards separados automaticamente.',
        'Botão Play "Analisar Extratos (OFX)" e "Processar Outros Docs" para extrair dados de notas fiscais, guias e recibos.',
        'Botão Ver (laranja) com visualização de PDF ampliável, botão Baixar OFX, Refazer, Arquivar e Excluir.',
      ],
    },
    {
      id: 'fees',
      tab: 'fees',
      icon: Coins,
      title: 'Controle de Honorários Contábeis',
      group: 'Ferramentas',
      summary: 'Gestão de mensalidades, contratos, vencimentos e baixas de pagamento.',
      bullets: [
        'Controle de status (Pago, Em aberto, Atrasado) com histórico por competência e meio de pagamento.',
      ],
    },
    {
      id: 'database',
      tab: 'database',
      icon: Database,
      title: 'Banco de Dados & Backup',
      group: 'Configurações',
      summary: 'Estatísticas da base, exportação de backup completo (.json) e restauração.',
      bullets: [
        'Gere cópias de segurança locais a qualquer momento ou restaure backups completos do escritório.',
      ],
    },
    {
      id: 'admin',
      tab: 'admin',
      icon: Users,
      title: 'Usuários, Convites & E-mail (SMTP/IMAP)',
      group: 'Configurações',
      summary: 'Controle de acesso por empresa e integração de envio/recebimento de e-mails.',
      bullets: [
        'Convide clientes com senha padrão inicial e envio automático com cópia de controle.',
        'Configure o envio direto (SMTP) e o recebimento automático de extratos (IMAP em contsuitesistemas@gmail.com).',
      ],
      adminOnly: true,
    },
  ];

  const novedades = [
    {
      icon: Inbox,
      badge: 'Novo na v1.0',
      title: 'Recebimento Automático de Extratos via E-mail',
      desc: 'Quando um cliente envia extrato ou documento para contsuitesistemas@gmail.com, o sistema importa o anexo automaticamente para Arquivos (vinculando à empresa por e-mail/CNPJ) e gera o OFX.',
    },
    {
      icon: Sparkles,
      badge: 'IA + Automação',
      title: 'Separação Automática de PDFs Mistos (Extratos x Recibos)',
      desc: 'Ao anexar um PDF com extrato bancário misturado com recibos manuais ou comprovantes, a IA separa as páginas e cria cards individuais para cada tipo de documento.',
    },
    {
      icon: Bot,
      badge: 'Agente OFX',
      title: 'Sincronização Direta Arquivos → Conversor OFX',
      desc: 'Todo extrato convertido em Arquivos fica imediatamente disponível no Conversor OFX e com os botões "Baixar OFX" e "Refazer" direto no card.',
    },
    {
      icon: Play,
      badge: 'Processamento IA',
      title: 'Botão Play para Notas Fiscais, Guias e Recibos',
      desc: 'Processe documentos que não são extrato com 1 clique para extrair valor, CNPJ, data, emissor e sugestão de lançamento contábil.',
    },
    {
      icon: Archive,
      badge: 'Kanban',
      title: 'Coluna Concluído / Arquivado & Visualização Ampliada',
      desc: 'Arquive documentos finalizados na quarta coluna do Kanban, visualize PDFs em tela expandida pelo botão laranja e exclua itens com segurança.',
    },
    {
      icon: Landmark,
      badge: 'ERPs & Cadastros',
      title: 'Sistema Keevo (Mastermaq), Edição de Empresas e Botão Upload',
      desc: 'Adicionado o ERP Keevo (Mastermaq), campo de e-mail editável nas empresas, notificações automáticas e botão compacto Upload na barra de Arquivos.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#004d40] via-[#00695c] to-[#00796b] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/40 text-amber-200 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                  Central de Ajuda & Manual do Sistema
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black tracking-wide uppercase">
                  Versão 1.0
                </span>
              </div>
              <p className="text-xs text-teal-100 truncate">
                Guia completo das funcionalidades, novidades da versão e recebimento automático por e-mail
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Central de Ajuda"
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('novidades')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'novidades'
                ? 'bg-[#00897b] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Novidades (v1.0)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('funcoes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'funcoes'
                ? 'bg-[#00897b] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Todas as Funções</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('email_auto')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'email_auto'
                ? 'bg-[#00897b] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Extratos via E-mail (contsuitesistemas@gmail.com)</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'novidades' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-teal-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-teal-700" />
                    ContSuite Contábil — Release Oficial v1.0
                  </h3>
                  <p className="text-xs text-teal-800 mt-0.5">
                    Automação completa da entrada de documentos por e-mail ou upload até a geração do OFX e integração patrimonial.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => goTo('documents')}
                  className="px-3 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto"
                >
                  <span>Ir para Arquivos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {novedades.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 leading-tight">
                            {item.title}
                          </h4>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                    </div>
                  );
                })}
              </div>

              {/* Quick Icon Legend for Cards in Arquivos */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-800">Legenda Rápida dos Botões nos Cards de Arquivos</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-700">
                  <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                    <span className="p-1 rounded bg-orange-500 text-white shrink-0">
                      <Eye className="w-3 h-3" />
                    </span>
                    <span><strong>Olho Laranja:</strong> Ver PDF / ampliar</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                    <span className="p-1 rounded bg-emerald-600 text-white shrink-0">
                      <Download className="w-3 h-3" />
                    </span>
                    <span><strong>Baixar OFX:</strong> Download direto</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                    <span className="p-1 rounded bg-indigo-600 text-white shrink-0">
                      <Play className="w-3 h-3" />
                    </span>
                    <span><strong>Play:</strong> Extrair dados com IA</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                    <span className="p-1 rounded bg-teal-600 text-white shrink-0">
                      <Archive className="w-3 h-3" />
                    </span>
                    <span><strong>Arquivar:</strong> Move p/ Concluído</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'funcoes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {featuresList
                .filter((f) => !f.adminOnly || isAdmin)
                .map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <div
                      key={feat.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 block">
                                {feat.group}
                              </span>
                              <h4 className="text-xs font-extrabold text-slate-900 truncate">
                                {feat.title}
                              </h4>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{feat.summary}</p>
                        <ul className="space-y-1">
                          {feat.bullets.map((b, i) => (
                            <li key={i} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <button
                          type="button"
                          onClick={() => goTo(feat.tab)}
                          className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>Abrir módulo</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {activeTab === 'email_auto' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-2">
                <h3 className="text-sm font-bold text-teal-950 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-teal-700" />
                  Como funciona o Recebimento Automático (contsuitesistemas@gmail.com)
                </h3>
                <p className="leading-relaxed text-teal-900">
                  O ContSuite v1.0 monitora a caixa de entrada de{' '}
                  <strong>contsuitesistemas@gmail.com</strong> via protocolo seguro IMAP (SSL porta 993).
                  Assim que o cliente envia um e-mail com extrato bancário, nota fiscal ou recibo em anexo:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">
                    Passo 1 · Identificação
                  </span>
                  <h4 className="font-bold text-slate-900">Vínculo Automático com a Empresa</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    O sistema identifica a empresa pelo e-mail do remetente cadastrado na empresa/usuário ou pelo CNPJ e nome encontrados no PDF/assunto.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">
                    Passo 2 · Separação IA
                  </span>
                  <h4 className="font-bold text-slate-900">Entrada direta em Arquivos</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Se o anexo contiver extrato + recibos misturados, a IA separa em cards distintos e salva tudo na pasta Arquivos da empresa.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">
                    Passo 3 · Conversão OFX
                  </span>
                  <h4 className="font-bold text-slate-900">OFX Pronto para Download</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Para anexos classificados como extrato, o conversor OFX gera o arquivo automaticamente para download em Arquivos e no Conversor OFX.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                <h4 className="font-bold text-amber-950">Como ativar a conexão com contsuitesistemas@gmail.com</h4>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-900 leading-relaxed">
                  <li>
                    Acesse a conta Google <strong>contsuitesistemas@gmail.com</strong> &gt;{' '}
                    <strong>Segurança</strong> &gt; ative a <strong>Verificação em duas etapas</strong> e crie uma{' '}
                    <strong>Senha de App</strong> de 16 dígitos.
                  </li>
                  <li>
                    No Gmail de <strong>contsuitesistemas@gmail.com</strong>, confirme em{' '}
                    <strong>Configurações &gt; Encaminhamento e POP/IMAP</strong> que o status{' '}
                    <strong>IMAP está ativado</strong>.
                  </li>
                  <li>
                    No ContSuite, entre em <strong>Configurações &gt; Usuários &amp; Convites &gt; Receber Extratos por E-mail</strong>, cole a Senha de App e clique em{' '}
                    <strong>Salvar &amp; Sincronizar Agora</strong>.
                  </li>
                </ol>
                {isAdmin && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => goTo('admin')}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Configurar Caixa contsuitesistemas@gmail.com</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            ContSuite Contábil · Versão 1.0
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition"
          >
            Fechar Manual
          </button>
        </div>
      </div>
    </div>
  );
};
