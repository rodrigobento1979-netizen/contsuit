import { GoogleGenAI, ThinkingLevel } from '@google/genai';

function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.includes('MY_GEMINI')) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface GuideAnswer {
  answer: string;
  steps: string[];
  suggestedTab?: 'assets' | 'depreciation' | 'ofx' | 'fees' | 'companies' | 'admin';
  suggestedActionLabel?: string;
}

export async function askContSuiteAgent(userQuestion: string, userContext?: any): Promise<GuideAnswer> {
  const qLower = (userQuestion || '').toLowerCase();

  // Smart immediate routing if user question matches key intent
  let defaultTab: 'assets' | 'depreciation' | 'ofx' | 'fees' | 'companies' | 'admin' | undefined;
  let defaultAction = 'Abrir no ContSuite';

  if (qLower.includes('ofx') || qLower.includes('extrato') || qLower.includes('banco') || qLower.includes('bancari') || qLower.includes('converter')) {
    defaultTab = 'ofx';
    defaultAction = 'Ir para Conversor OFX';
  } else if (qLower.includes('deprecia') || qLower.includes('taxa') || qLower.includes('dominio') || qLower.includes('questor') || qLower.includes('exporta')) {
    defaultTab = 'depreciation';
    defaultAction = 'Ver Apuração de Depreciação';
  } else if (qLower.includes('ativo') || qLower.includes('imobilizado') || qLower.includes('bem') || qLower.includes('plaqueta') || qLower.includes('cadastrar bem')) {
    defaultTab = 'assets';
    defaultAction = 'Gerenciar Ativo Permanente';
  } else if (qLower.includes('honorario') || qLower.includes('fatura') || qLower.includes('mensalidade') || qLower.includes('inadimpl') || qLower.includes('pagamento')) {
    defaultTab = 'fees';
    defaultAction = 'Controle de Honorários';
  } else if (qLower.includes('empresa') || qLower.includes('cnpj') || qLower.includes('cliente novo')) {
    defaultTab = 'companies';
    defaultAction = 'Cadastrar Nova Empresa';
  } else if (qLower.includes('amarrad') || qLower.includes('vinculad') || qLower.includes('meu usuario') || qLower.includes('usuario') || qLower.includes('convite') || qLower.includes('senha') || qLower.includes('acesso')) {
    defaultTab = 'admin';
    defaultAction = 'Gestão de Usuários e Empresas';
  }

  const ai = getAiClient();
  if (ai) {
    try {
      const systemInstruction = `Você é o Agente Inteligente Contábil do ContSuite (software contábil para escritórios e empresas gerido por Rodrigo Bento).
Seu objetivo é orientar passo a passo como o usuário realiza tarefas no sistema ContSuite:
1. Conversor OFX: Upload de PDF ou foto de extrato bancário, informe opcional da conta contábil do banco, processamento via IA e download do arquivo .OFX pronto para Domínio Sistemas, Questor, etc.
2. Ativo Permanente (CPC 27): Cadastro de bens (aquisição, valor residual, centro de custo, taxa da RFB).
3. Apuração de Depreciação: Cálculo automático linear mensal e exportação de lançamentos em TXT/CSV para sistemas contábeis.
4. Honorários Contábeis: Controle financeiro de contratos, vencimentos, liquidações e faturamento do escritório.
5. Cadastro de Empresas: Controle interno de clientes com isolamento seguro de dados.

Responda sempre em português do Brasil com clareza, objetividade e cordialidade. Estruture sua resposta com uma explicação breve e depois liste os passos práticos numerados.
Retorne um JSON estrito no seguinte formato:
{
  "answer": "Texto explicativo e acolhedor",
  "steps": [
    "Passo 1: ...",
    "Passo 2: ...",
    "Passo 3: ..."
  ],
  "suggestedTab": "ofx" | "assets" | "depreciation" | "fees" | "companies" | "admin"
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: userQuestion,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);
      return {
        answer: parsed.answer || 'Aqui estão as instruções para o que você precisa:',
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        suggestedTab: parsed.suggestedTab || defaultTab,
        suggestedActionLabel: defaultAction,
      };
    } catch (err) {
      console.warn('Gemini guide call failed, falling back to local guide logic:', err);
    }
  }

  // Resilient expert accounting fallbacks
  if (defaultTab === 'ofx') {
    return {
      answer: 'Para converter qualquer extrato bancário em PDF ou imagem/foto para o formato OFX:',
      steps: [
        'Acesse a aba "Conversor OFX" no menu superior.',
        'Arraste ou selecione o arquivo do seu extrato (PDF, PNG ou JPG de qualquer banco brasileiro como Itaú, Bradesco, BB, Caixa, Inter, etc.).',
        'Se desejar, preencha o campo opcional "Conta Contábil do Banco" (ex: 1.1.1.02.0001).',
        'Clique no botão "Processar com IA e Gerar OFX".',
        'Revise o resumo das transações e clique em "Baixar Arquivo OFX (.ofx)" para importar diretamente no Domínio Sistemas, Questor ou outro ERP contábil.'
      ],
      suggestedTab: 'ofx',
      suggestedActionLabel: 'Ir para Conversor OFX',
    };
  }

  if (defaultTab === 'depreciation') {
    return {
      answer: 'A apuração de depreciação mensal no ContSuite segue rigorosamente o CPC 27 e a Instrução Normativa da Receita Federal:',
      steps: [
        'Clique em "Depreciação" no menu superior.',
        'Selecione a competência desejada no seletor de mês (ex: 2026-11).',
        'O sistema calcula a depreciação mensal considerando o valor depreciável (Valor de Aquisição menos Valor Residual).',
        'Clique em "Exportar Domínio Sistemas (TXT)" ou "CSV Universal" para gerar os lançamentos contábeis de débito (despesa) e crédito (depreciação acumulada).'
      ],
      suggestedTab: 'depreciation',
      suggestedActionLabel: 'Ver Apuração de Depreciação',
    };
  }

  if (defaultTab === 'fees') {
    return {
      answer: 'O módulo de Honorários permite o controle financeiro total dos clientes do seu escritório contábil:',
      steps: [
        'Acesse o menu "Honorários" no topo.',
        'Acompanhe o faturamento previsto do mês, total já liquidado e clientes em aberto ou atrasados.',
        'Para dar baixa em uma mensalidade recebida, clique em "Registrar Pagamento" na linha da empresa cliente.',
        'Você pode criar novos contratos informando o valor mensal, dia de vencimento e serviços contratados.'
      ],
      suggestedTab: 'fees',
      suggestedActionLabel: 'Ir para Controle de Honorários',
    };
  }

  if (defaultTab === 'companies') {
    return {
      answer: 'Para cadastrar uma nova empresa cliente no controle interno do escritório:',
      steps: [
        'Clique no botão verde "+ Cadastrar Empresa" no menu superior.',
        'Informe a Razão Social, CNPJ, Nome Fantasia e E-mail de contato do cliente.',
        'Selecione o sistema contábil utilizado (Domínio, Questor, Fortes, Alterdata, etc.).',
        'Salve. A empresa passa a ter seu ambiente 100% isolado no ContSuite e você pode alternar facilmente entre elas.'
      ],
      suggestedTab: 'companies',
      suggestedActionLabel: 'Cadastrar Nova Empresa',
    };
  }

  if (qLower.includes('amarrad') || qLower.includes('vinculad') || qLower.includes('meu usuario')) {
    return {
      answer: 'Sim! Todas as empresas cadastradas estão vinculadas e amarradas à sua conta master (Rodrigo Bento - rodrigobento1979@gmail.com):',
      steps: [
        'Como Administrador Master, todas as empresas da carteira pertencem à sua gestão.',
        'Você possui acesso e visão global de todas as empresas e pode alternar livremente entre elas no menu do topo.',
        'Cada usuário cliente que você cadastra ou convida fica amarrado estritamente à sua respectiva empresa (companyId).',
        'Os clientes nunca veem dados, honorários, extratos ou patrimônio de outras empresas: o isolamento é 100% garantido.',
        'Você pode testar esse isolamento na aba "Usuários & Convites" clicando no botão "Simular Acesso".'
      ],
      suggestedTab: 'admin',
      suggestedActionLabel: 'Ver Carteira de Empresas & Usuários',
    };
  }

  return {
    answer: 'Olá! Sou o assistente inteligente do ContSuite. Veja os principais módulos disponíveis para você:',
    steps: [
      'Conversor OFX com IA: Transforme PDFs e fotos de extratos bancários em arquivo OFX padrão.',
      'Ativo Permanente (CPC 27): Cadastre máquinas, veículos, prédios e computadores com cálculo de depreciação automática.',
      'Controle de Honorários: Monitore os recebimentos mensais de clientes do escritório.',
      'Isolamento Multiusuário: Convide clientes para acessar exclusivamente os dados de suas respectivas empresas.'
    ],
    suggestedTab: 'ofx',
    suggestedActionLabel: 'Explorar Recursos',
  };
}
