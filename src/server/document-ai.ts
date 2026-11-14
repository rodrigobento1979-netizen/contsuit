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
