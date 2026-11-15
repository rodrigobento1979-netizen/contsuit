import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { DocumentCategory } from './db.ts';

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

export interface DocumentClassificationResult {
  category: DocumentCategory;
  confidence: number;
  competenceMonth: string; // YYYY-MM
  documentDate?: string; // YYYY-MM-DD
  issuerOrBank?: string;
  documentNumber?: string;
  amount?: number;
  detectedCnpj?: string;
  summary: string;
  aiClassified: boolean;
}

const VALID_CATEGORIES: DocumentCategory[] = [
  'extrato',
  'nota_fiscal',
  'guia_imposto',
  'comprovante',
  'folha_contrato',
  'outro',
];

function sanitizeCategory(raw?: string): DocumentCategory {
  const v = (raw || '').toLowerCase().trim() as DocumentCategory;
  return VALID_CATEGORIES.includes(v) ? v : 'outro';
}

function normalizeMimeType(mimeType: string, fileName?: string): string {
  let clean = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/jpg') clean = 'image/jpeg';
  if (!clean && fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.xml')) return 'application/xml';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.txt') || lower.endsWith('.ofx')) return 'text/plain';
  }
  return clean || 'application/octet-stream';
}

/**
 * Classificação determinística rápida por nome, extensão e conteúdo textual (fallback zero-erro)
 */
export function classifyDocumentHeuristically(
  fileName: string,
  mimeType: string,
  textContent?: string
): DocumentClassificationResult {
  const lowerName = (fileName || '').toLowerCase();
  const lowerText = (textContent || '').toLowerCase();
  const combined = `${lowerName}\n${lowerText.slice(0, 4000)}`;
  const nowMonth = new Date().toISOString().slice(0, 7);

  // Detect CNPJ in text if available
  const cnpjMatch = (textContent || '').match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const detectedCnpj = cnpjMatch ? cnpjMatch[0] : undefined;

  // Detect competence YYYY-MM or MM/YYYY
  let competenceMonth = nowMonth;
  const mmYyyyMatch = combined.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
  if (mmYyyyMatch) {
    competenceMonth = `${mmYyyyMatch[2]}-${mmYyyyMatch[1]}`;
  }

  // XML NF-e / NFS-e / CT-e detection
  if (
    lowerName.endsWith('.xml') ||
    lowerText.includes('<nfeproc') ||
    lowerText.includes('<nfe ') ||
    lowerText.includes('<infnfe') ||
    lowerText.includes('<compnfse') ||
    lowerText.includes('<nfse') ||
    lowerText.includes('<cteproc')
  ) {
    return {
      category: 'nota_fiscal',
      confidence: 96,
      competenceMonth,
      detectedCnpj,
      summary: 'Documento fiscal eletrônico (XML NF-e / NFS-e / CT-e) identificado automaticamente.',
      aiClassified: false,
    };
  }

  if (
    lowerName.endsWith('.ofx') ||
    combined.includes('extrato') ||
    combined.includes('bank statement') ||
    combined.includes('conta corrente') ||
    combined.includes('saldo anterior') ||
    combined.includes('lançamentos futuros') ||
    combined.includes('itau') ||
    combined.includes('bradesco') ||
    combined.includes('santander') ||
    combined.includes('sicredi') ||
    combined.includes('sicoob') ||
    combined.includes('nubank') ||
    combined.includes('inter')
  ) {
    return {
      category: 'extrato',
      confidence: 88,
      competenceMonth,
      detectedCnpj,
      summary: 'Extrato ou movimentação bancária identificada pelo padrão do arquivo.',
      aiClassified: false,
    };
  }

  if (
    combined.includes('danfe') ||
    combined.includes('nota fiscal') ||
    combined.includes('nf-e') ||
    combined.includes('nfe') ||
    combined.includes('nfse') ||
    combined.includes('nfs-e') ||
    combined.includes('cupom fiscal') ||
    /\bnf[\s_-]?\d+/i.test(lowerName)
  ) {
    return {
      category: 'nota_fiscal',
      confidence: 88,
      competenceMonth,
      detectedCnpj,
      summary: 'Nota fiscal ou documento fiscal de mercadoria/serviço identificado.',
      aiClassified: false,
    };
  }

  if (
    combined.includes('darf') ||
    combined.includes('das ') ||
    combined.includes('simples nacional') ||
    combined.includes('fgts') ||
    combined.includes('gps') ||
    combined.includes('inss') ||
    combined.includes('iss') ||
    combined.includes('icms') ||
    combined.includes('iptu') ||
    combined.includes('gnre') ||
    combined.includes('guia') ||
    combined.includes('imposto') ||
    combined.includes('tributo') ||
    combined.includes('dae')
  ) {
    return {
      category: 'guia_imposto',
      confidence: 86,
      competenceMonth,
      detectedCnpj,
      summary: 'Guia de recolhimento de tributo ou obrigação fiscal identificada.',
      aiClassified: false,
    };
  }

  if (
    combined.includes('comprovante') ||
    combined.includes('recibo') ||
    combined.includes('pix') ||
    combined.includes('boleto') ||
    combined.includes('ted') ||
    combined.includes('pagamento') ||
    combined.includes('fatura')
  ) {
    return {
      category: 'comprovante',
      confidence: 82,
      competenceMonth,
      detectedCnpj,
      summary: 'Comprovante de pagamento, transferência ou recibo financeiro.',
      aiClassified: false,
    };
  }

  if (
    combined.includes('folha') ||
    combined.includes('holerite') ||
    combined.includes('contracheque') ||
    combined.includes('contrato') ||
    combined.includes('rescis') ||
    combined.includes('admiss') ||
    combined.includes('ferias') ||
    combined.includes('férias') ||
    combined.includes('certidao') ||
    combined.includes('certidão') ||
    combined.includes('pro-labore') ||
    combined.includes('prolabore') ||
    combined.includes('balancete') ||
    combined.includes('dre')
  ) {
    return {
      category: 'folha_contrato',
      confidence: 82,
      competenceMonth,
      detectedCnpj,
      summary: 'Documento societário, trabalhista ou relatório contábil identificado.',
      aiClassified: false,
    };
  }

  return {
    category: 'outro',
    confidence: 65,
    competenceMonth,
    detectedCnpj,
    summary: 'Documento contábil geral enviado para organização e conferência.',
    aiClassified: false,
  };
}

let docAiCooldownUntil = 0;

export async function classifyDocumentWithAI(params: {
  fileName: string;
  mimeType: string;
  base64Data?: string;
  textPreview?: string;
}): Promise<DocumentClassificationResult> {
  const normMime = normalizeMimeType(params.mimeType, params.fileName);

  // Decode text content if text-based (XML, CSV, TXT, OFX)
  let decodedText = params.textPreview || '';
  if (
    !decodedText &&
    params.base64Data &&
    (normMime.startsWith('text/') ||
      normMime === 'application/xml' ||
      normMime === 'application/json' ||
      params.fileName.toLowerCase().endsWith('.xml') ||
      params.fileName.toLowerCase().endsWith('.ofx'))
  ) {
    try {
      decodedText = Buffer.from(params.base64Data, 'base64').toString('utf-8').slice(0, 12000);
    } catch {}
  }

  const heuristic = classifyDocumentHeuristically(params.fileName, normMime, decodedText);

  // Fast-path for unambiguous XML NF-e / OFX files without wasting AI quota
  if (
    params.fileName.toLowerCase().endsWith('.ofx') ||
    (params.fileName.toLowerCase().endsWith('.xml') && heuristic.category === 'nota_fiscal' && !decodedText)
  ) {
    return heuristic;
  }

  const ai = getAiClient();
  const supportsInlineVisual =
    normMime === 'application/pdf' ||
    normMime.startsWith('image/');

  // If no AI key, unsupported binary (xlsx/docx), or in 429 cooldown, return deterministic classification
  if (!ai || Date.now() < docAiCooldownUntil || (!supportsInlineVisual && !decodedText)) {
    return heuristic;
  }

  const systemInstruction = `Você é um analista contábil e fiscal brasileiro experiente.
Sua tarefa é classificar documentos enviados para a contabilidade de uma empresa e extrair metadados essenciais.
Categorias válidas (escolha exatamente UMA):
- "extrato": Extratos bancários de conta corrente, poupança, aplicação financeira ou cartão corporativo.
- "nota_fiscal": NF-e, NFS-e, NFC-e, CT-e, DANFE, cupons fiscais, faturas de serviços ou XMLs fiscais.
- "guia_imposto": Guias de impostos e encargos (DARF, DAS Simples Nacional, FGTS/GRF, GPS/INSS, ISS, ICMS, GNRE, DAE, IPTU).
- "comprovante": Comprovantes de pagamento PIX, TED, boletos quitados, recibos e faturas pagas.
- "folha_contrato": Folha de pagamento, holerites, pró-labore, contratos sociais/alterações, contratos de locação/serviço, rescisões, certidões.
- "outro": Quaisquer outros documentos relevantes para a contabilidade que não se encaixem acima.`;

  const promptText = `Analise o documento "${params.fileName}" (${normMime}) e retorne a classificação contábil estruturada.
Se identificar data de emissão/competência, valor total, número do documento, banco/emissor ou CNPJ, preencha os campos.
Se não encontrar algum campo opcional, deixe-o omitido ou vazio.
Escreva "summary" em português claro e objetivo (máximo 1 frase curta, até 120 caracteres).`;

  const parts: any[] = [];
  if (supportsInlineVisual && params.base64Data) {
    parts.push({
      inlineData: {
        mimeType: normMime,
        data: params.base64Data,
      },
    });
  } else if (decodedText) {
    parts.push({ text: `CONTEÚDO DO ARQUIVO:\n${decodedText.slice(0, 10000)}` });
  }
  parts.push({ text: promptText });

  const schema = {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: 'extrato | nota_fiscal | guia_imposto | comprovante | folha_contrato | outro',
      },
      confidence: {
        type: Type.INTEGER,
        description: 'Confiança de 0 a 100',
      },
      competenceMonth: {
        type: Type.STRING,
        description: 'Mês de competência no formato YYYY-MM',
      },
      documentDate: {
        type: Type.STRING,
        description: 'Data do documento no formato YYYY-MM-DD, se encontrada',
      },
      issuerOrBank: {
        type: Type.STRING,
        description: 'Nome do banco, órgão público, fornecedor ou emissor',
      },
      documentNumber: {
        type: Type.STRING,
        description: 'Número da nota, guia, contrato ou documento',
      },
      amount: {
        type: Type.NUMBER,
        description: 'Valor total em reais (apenas se aplicável e claro)',
      },
      detectedCnpj: {
        type: Type.STRING,
        description: 'CNPJ identificado no documento (ex: 00.000.000/0001-00)',
      },
      summary: {
        type: Type.STRING,
        description: 'Resumo curto de 1 linha em português do que é o documento',
      },
    },
    required: ['category', 'confidence', 'competenceMonth', 'summary'],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validMonth = /^\d{4}-\d{2}$/.test(parsed.competenceMonth || '')
      ? parsed.competenceMonth
      : heuristic.competenceMonth;

    return {
      category: sanitizeCategory(parsed.category),
      confidence: Math.min(100, Math.max(50, Number(parsed.confidence) || 90)),
      competenceMonth: validMonth,
      documentDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.documentDate || '') ? parsed.documentDate : undefined,
      issuerOrBank: parsed.issuerOrBank ? String(parsed.issuerOrBank).slice(0, 100) : undefined,
      documentNumber: parsed.documentNumber ? String(parsed.documentNumber).slice(0, 60) : undefined,
      amount: typeof parsed.amount === 'number' && !isNaN(parsed.amount) && parsed.amount > 0 ? parsed.amount : undefined,
      detectedCnpj: parsed.detectedCnpj ? String(parsed.detectedCnpj).slice(0, 25) : heuristic.detectedCnpj,
      summary: parsed.summary ? String(parsed.summary).slice(0, 180) : heuristic.summary,
      aiClassified: true,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (err?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      docAiCooldownUntil = Date.now() + 60_000;
    }
    console.warn('[DOC-AI] Fallback para classificação heurística:', msg.slice(0, 140));
    return heuristic;
  }
}

export interface PageClassificationItem {
  pageNumber: number;
  category: DocumentCategory;
  groupLabel: string;
  issuerOrBank?: string;
  competenceMonth?: string;
  documentDate?: string;
  documentNumber?: string;
  amount?: number;
  detectedCnpj?: string;
  summary: string;
  aiClassified: boolean;
}

const DEFAULT_GROUP_LABELS: Record<DocumentCategory, string> = {
  extrato: 'Extrato Bancário',
  comprovante: 'Recibos e Comprovantes de Pagamento',
  nota_fiscal: 'Notas Fiscais',
  guia_imposto: 'Guias e Impostos',
  folha_contrato: 'Folha e Contratos',
  outro: 'Outros Documentos',
};

export async function analyzePdfPagesWithAI(params: {
  fileName: string;
  base64Data: string;
  pageCount: number;
  startPageNumber?: number;
}): Promise<{ pages: PageClassificationItem[]; aiClassified: boolean }> {
  const pageCount = Math.max(1, Number(params.pageCount) || 1);
  const offset = Math.max(1, Number(params.startPageNumber) || 1) - 1;
  const heuristic = classifyDocumentHeuristically(params.fileName, 'application/pdf');

  const buildFallback = (): PageClassificationItem[] =>
    Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: offset + i + 1,
      category: heuristic.category,
      groupLabel: DEFAULT_GROUP_LABELS[heuristic.category],
      competenceMonth: heuristic.competenceMonth,
      detectedCnpj: heuristic.detectedCnpj,
      summary: heuristic.summary,
      aiClassified: false,
    }));

  const ai = getAiClient();
  if (!ai || !params.base64Data || Date.now() < docAiCooldownUntil) {
    return { pages: buildFallback(), aiClassified: false };
  }

  const systemInstruction = `Você é um auditor contábil brasileiro especialista em triagem de PDFs compostos enviados por clientes.
Sua missão crítica é analisar CADA PÁGINA INDIVIDUALMENTE (da página 1 até a página ${pageCount} deste PDF) e classificar seu tipo exato para separarmos automaticamente documentos misturados.

REGRAS DE OURO DE SEPARAÇÃO:
1. NUNCA misture páginas de EXTRATO BANCÁRIO com páginas de RECIBOS/COMPROVANTES!
   - "extrato": Páginas contendo movimentação bancária em tabela/lista (data, histórico, débito/crédito, saldo do banco, cabeçalho de extrato de conta corrente/poupança/aplicação).
   - "comprovante": Páginas contendo recibos manuais, recibos simples, comprovantes de PIX, TED, DOC, transferência, boleto pago, autenticação bancária individual, comprovante de pagamento ou depósito. Mesmo que venha no mesmo arquivo após um extrato bancário, DEVE ser classificada como "comprovante"!
   - "nota_fiscal": DANFE, NF-e, NFS-e, cupom fiscal, fatura fiscal.
   - "guia_imposto": DARF, DAS, FGTS, GPS, INSS, GNRE, ISS, DAE.
   - "folha_contrato": Folha de pagamento, holerite, contrato, certidão.
   - "outro": Página em branco, capa sem conteúdo contábil relevante ou outros documentos diversos.

Para cada página, informe um "groupLabel" claro e padronizado (ex: "Extrato Bancário Itaú", "Recibos e Comprovantes", "Notas Fiscais", "Guias de Impostos").
Se páginas consecutivas forem do mesmo tipo e mesmo documento (ex: extrato de várias páginas), use o MESMO "category" e "groupLabel".
Se houver recibos manuais ou comprovantes de pagamento misturados ao PDF do extrato, marque essas páginas como "comprovante" com "groupLabel" como "Recibos e Comprovantes de Pagamento" (ou específico caso sejam recibos distintos).`;

  const promptText = `Analise o PDF "${params.fileName}" que possui exatamente ${pageCount} página(s).
Retorne um array "pages" com EXATAMENTE ${pageCount} itens (pageNumber de 1 a ${pageCount}), classificando cada página individualmente.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      pages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pageNumber: { type: Type.INTEGER, description: 'Número da página (1 a N)' },
            category: {
              type: Type.STRING,
              description: 'extrato | comprovante | nota_fiscal | guia_imposto | folha_contrato | outro',
            },
            groupLabel: {
              type: Type.STRING,
              description: 'Rótulo curto do grupo documental (ex: Extrato Bancário Itaú, Recibos Manuais)',
            },
            issuerOrBank: { type: Type.STRING },
            competenceMonth: { type: Type.STRING, description: 'YYYY-MM' },
            documentDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
            documentNumber: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            detectedCnpj: { type: Type.STRING },
            summary: { type: Type.STRING, description: 'Resumo curto de até 100 caracteres da página' },
          },
          required: ['pageNumber', 'category', 'groupLabel', 'summary'],
        },
      },
    },
    required: ['pages'],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: params.base64Data,
            },
          },
          { text: promptText },
        ],
      },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const rawPages: any[] = Array.isArray(parsed.pages) ? parsed.pages : [];

    const byRelPage = new Map<number, PageClassificationItem>();
    for (const p of rawPages) {
      const relNum = Number(p.pageNumber);
      if (!Number.isInteger(relNum) || relNum < 1 || relNum > pageCount) continue;
      const cat = sanitizeCategory(p.category);
      const validMonth = /^\d{4}-\d{2}$/.test(p.competenceMonth || '')
        ? p.competenceMonth
        : heuristic.competenceMonth;
      byRelPage.set(relNum, {
        pageNumber: offset + relNum,
        category: cat,
        groupLabel: p.groupLabel ? String(p.groupLabel).slice(0, 80) : DEFAULT_GROUP_LABELS[cat],
        issuerOrBank: p.issuerOrBank ? String(p.issuerOrBank).slice(0, 100) : undefined,
        competenceMonth: validMonth,
        documentDate: /^\d{4}-\d{2}-\d{2}$/.test(p.documentDate || '') ? p.documentDate : undefined,
        documentNumber: p.documentNumber ? String(p.documentNumber).slice(0, 60) : undefined,
        amount: typeof p.amount === 'number' && !isNaN(p.amount) && p.amount > 0 ? p.amount : undefined,
        detectedCnpj: p.detectedCnpj ? String(p.detectedCnpj).slice(0, 25) : heuristic.detectedCnpj,
        summary: p.summary ? String(p.summary).slice(0, 160) : heuristic.summary,
        aiClassified: true,
      });
    }

    const result: PageClassificationItem[] = [];
    for (let rel = 1; rel <= pageCount; rel++) {
      const found = byRelPage.get(rel);
      if (found) {
        result.push(found);
      } else {
        const prev = result[result.length - 1];
        result.push({
          pageNumber: offset + rel,
          category: prev?.category || heuristic.category,
          groupLabel: prev?.groupLabel || DEFAULT_GROUP_LABELS[heuristic.category],
          competenceMonth: prev?.competenceMonth || heuristic.competenceMonth,
          issuerOrBank: prev?.issuerOrBank,
          detectedCnpj: prev?.detectedCnpj || heuristic.detectedCnpj,
          summary: prev?.summary || heuristic.summary,
          aiClassified: Boolean(prev?.aiClassified),
        });
      }
    }

    return { pages: result, aiClassified: true };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (err?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      docAiCooldownUntil = Date.now() + 60_000;
    }
    console.warn('[DOC-AI] Fallback na análise página a página:', msg.slice(0, 140));
    return { pages: buildFallback(), aiClassified: false };
  }
}

export interface NonExtratoProcessResult extends DocumentClassificationResult {
  accountingNotes: string;
  suggestedStatus: 'em_analise' | 'contabilizado';
}

const CATEGORY_DEFAULT_ENTRY: Record<DocumentCategory, string> = {
  nota_fiscal: 'D: Mercadorias / Serviços Tomados | C: Fornecedores a Pagar',
  guia_imposto: 'D: Tributos / Encargos a Recolher | C: Banco Conta Movimento',
  comprovante: 'D: Fornecedores / Obrigações Pagas | C: Banco Conta Movimento',
  folha_contrato: 'D: Despesas com Pessoal / Serviços | C: Salários / Contas a Pagar',
  extrato: 'D: Banco Conta Movimento | C: Conciliação Bancária',
  outro: 'D: Despesas Administrativas | C: Contas a Pagar',
};

export async function processNonExtratoDocumentWithAI(params: {
  fileName: string;
  mimeType: string;
  currentCategory?: DocumentCategory;
  companyName?: string;
  accountingSystem?: string;
  base64Data?: string;
  textPreview?: string;
}): Promise<NonExtratoProcessResult> {
  const normMime = normalizeMimeType(params.mimeType, params.fileName);

  let decodedText = params.textPreview || '';
  if (
    !decodedText &&
    params.base64Data &&
    (normMime.startsWith('text/') ||
      normMime === 'application/xml' ||
      normMime === 'application/json' ||
      params.fileName.toLowerCase().endsWith('.xml'))
  ) {
    try {
      decodedText = Buffer.from(params.base64Data, 'base64').toString('utf-8').slice(0, 14000);
    } catch {}
  }

  const heuristic = classifyDocumentHeuristically(params.fileName, normMime, decodedText);
  const fallbackCategory =
    params.currentCategory && params.currentCategory !== 'outro'
      ? params.currentCategory
      : heuristic.category;

  const buildFallback = (base: DocumentClassificationResult): NonExtratoProcessResult => {
    const entryTemplate = CATEGORY_DEFAULT_ENTRY[base.category] || CATEGORY_DEFAULT_ENTRY.outro;
    const parts = [
      '[Processado IA]',
      entryTemplate,
      base.issuerOrBank ? `Emissor: ${base.issuerOrBank}` : '',
      base.documentNumber ? `Doc: ${base.documentNumber}` : '',
      base.amount ? `Valor: R$ ${base.amount.toFixed(2)}` : '',
      base.documentDate ? `Data: ${base.documentDate}` : '',
      params.accountingSystem ? `ERP: ${params.accountingSystem}` : '',
    ].filter(Boolean);
    return {
      ...base,
      accountingNotes: parts.join(' | ').slice(0, 480),
      suggestedStatus: 'em_analise',
    };
  };

  const ai = getAiClient();
  const supportsInlineVisual = normMime === 'application/pdf' || normMime.startsWith('image/');

  if (!ai || Date.now() < docAiCooldownUntil || (!supportsInlineVisual && !decodedText)) {
    return buildFallback({ ...heuristic, category: fallbackCategory });
  }

  const systemInstruction = `Você é um contador brasileiro sênior especialista em escrituração fiscal, trabalhista e contábil${
    params.accountingSystem ? ` (sistema contábil: ${params.accountingSystem})` : ''
  }.
Sua tarefa é PROCESSAR e EXTRAIR todos os dados contábeis relevantes de um documento que NÃO é extrato bancário (ex: Nota Fiscal, DANFE, NFS-e, XML fiscal, Guia de Imposto DAS/DARF/FGTS/GPS/ISS, Comprovante de Pagamento, Recibo, Folha de Pagamento, Holerite, Contrato ou Outro Documento).

Extraia com máxima precisão:
1. "category": Confirme ou corrija a categoria mais adequada entre: "nota_fiscal", "guia_imposto", "comprovante", "folha_contrato", "outro" (ou "extrato" somente se for claramente um extrato bancário).
2. "competenceMonth": Competência no formato YYYY-MM.
3. "documentDate": Data de emissão, vencimento ou pagamento no formato YYYY-MM-DD.
4. "issuerOrBank": Nome do fornecedor, prestador, órgão público, recebedor ou emissor.
5. "documentNumber": Número da NF, guia, código de receita, código de barras resumido ou número do recibo.
6. "amount": Valor total em reais (número decimal positivo).
7. "detectedCnpj": CNPJ ou CPF principal encontrado no documento.
8. "summary": Resumo claro e objetivo do documento em português (até 180 caracteres).
9. "accountingNotes": Sugestão objetiva de lançamento contábil e conferência para o contador (iniciando obrigatoriamente com "[Processado IA] ", contendo Débito sugerido, Crédito sugerido, histórico resumido, retenções/impostos ou vencimento se houver, máximo de 450 caracteres).`;

  const promptText = `Processe o documento "${params.fileName}"${
    params.companyName ? ` da empresa "${params.companyName}"` : ''
  }${params.currentCategory ? ` (categoria atual: ${params.currentCategory})` : ''}.
Extraia os metadados estruturados e gere a sugestão de lançamento contábil em "accountingNotes".`;

  const parts: any[] = [];
  if (supportsInlineVisual && params.base64Data) {
    parts.push({
      inlineData: {
        mimeType: normMime,
        data: params.base64Data,
      },
    });
  } else if (decodedText) {
    parts.push({ text: `CONTEÚDO DO DOCUMENTO:\n${decodedText.slice(0, 12000)}` });
  }
  parts.push({ text: promptText });

  const schema = {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING },
      confidence: { type: Type.INTEGER },
      competenceMonth: { type: Type.STRING },
      documentDate: { type: Type.STRING },
      issuerOrBank: { type: Type.STRING },
      documentNumber: { type: Type.STRING },
      amount: { type: Type.NUMBER },
      detectedCnpj: { type: Type.STRING },
      summary: { type: Type.STRING },
      accountingNotes: { type: Type.STRING },
    },
    required: ['category', 'confidence', 'competenceMonth', 'summary', 'accountingNotes'],
  };

  const candidates: { model: string; thinkingLevel: ThinkingLevel }[] = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  ];

  for (const candidate of candidates) {
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: { parts },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const validMonth = /^\d{4}-\d{2}$/.test(parsed.competenceMonth || '')
        ? parsed.competenceMonth
        : heuristic.competenceMonth;
      const category = sanitizeCategory(parsed.category || fallbackCategory);
      const rawNotes = parsed.accountingNotes ? String(parsed.accountingNotes).trim() : '';
      const formattedNotes = rawNotes.startsWith('[Processado IA]')
        ? rawNotes.slice(0, 480)
        : `[Processado IA] ${rawNotes}`.slice(0, 480);

      return {
        category,
        confidence: Math.min(100, Math.max(60, Number(parsed.confidence) || 92)),
        competenceMonth: validMonth,
        documentDate: /^\d{4}-\d{2}-\d{2}$/.test(parsed.documentDate || '')
          ? parsed.documentDate
          : undefined,
        issuerOrBank: parsed.issuerOrBank ? String(parsed.issuerOrBank).slice(0, 115) : undefined,
        documentNumber: parsed.documentNumber ? String(parsed.documentNumber).slice(0, 58) : undefined,
        amount:
          typeof parsed.amount === 'number' && !isNaN(parsed.amount) && parsed.amount > 0
            ? parsed.amount
            : undefined,
        detectedCnpj: parsed.detectedCnpj
          ? String(parsed.detectedCnpj).slice(0, 24)
          : heuristic.detectedCnpj,
        summary: parsed.summary ? String(parsed.summary).slice(0, 240) : heuristic.summary,
        aiClassified: true,
        accountingNotes:
          formattedNotes.length > 16
            ? formattedNotes
            : buildFallback({ ...heuristic, category }).accountingNotes,
        suggestedStatus: 'em_analise',
      };
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (err?.status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        docAiCooldownUntil = Date.now() + 60_000;
        break;
      }
      console.warn(`[DOC-PROCESS:${candidate.model}] Fallback:`, msg.slice(0, 140));
    }
  }

  return buildFallback({ ...heuristic, category: fallbackCategory });
}

