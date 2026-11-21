import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import * as XLSX from 'xlsx';
import type { Asset } from './db.ts';

export interface ExtractedAssetCandidate {
  tempId: string;
  description: string;
  tagNumber: string;
  category: Asset['category'];
  categoryLabel: string;
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionValue: number;
  residualValue: number;
  accumulatedDepreciation?: number;
  annualRate: number;
  usefulLifeMonths: number;
  costCenter: string;
  location: string;
  supplier: string;
  invoiceNumber: string;
  debitAccount?: string;
  creditAccount?: string;
  assetAccount?: string;
  sourceSheet?: string;
  sourceRow?: number;
  quantity?: number;
  isSummaryEntry?: boolean;
  confidence?: number;
  aiReason?: string;
  notes?: string;
}

export interface SheetSummaryInfo {
  name: string;
  rowCount: number;
  isSummarySheet: boolean;
}

export interface AssetExtractionResponse {
  fileName: string;
  fileType: 'spreadsheet' | 'pdf' | 'image' | 'xml' | 'text';
  sheetsAnalyzed: SheetSummaryInfo[];
  candidates: ExtractedAssetCandidate[];
  usedAi: boolean;
  usedFallback?: boolean;
  aiWarning?: string;
  summaryText: string;
}

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

const VALID_CATEGORIES: Asset['category'][] = [
  'edificacoes',
  'maquinas',
  'veiculos',
  'moveis',
  'ti',
  'software',
  'ferramentas',
  'instalacoes',
  'outro',
];

const CATEGORY_DEFAULTS: Record<Asset['category'], { label: string; rate: number; months: number }> = {
  edificacoes: { label: 'Edificações e Construções Civis', rate: 4, months: 300 },
  maquinas: { label: 'Máquinas e Equipamentos', rate: 10, months: 120 },
  veiculos: { label: 'Veículos e Automotores', rate: 20, months: 60 },
  moveis: { label: 'Móveis e Utensílios de Escritório', rate: 10, months: 120 },
  ti: { label: 'Equipamentos de Informática (TI)', rate: 20, months: 60 },
  software: { label: 'Sistemas e Softwares / Intangíveis', rate: 20, months: 60 },
  ferramentas: { label: 'Ferramentas Industriais e Fabris', rate: 15, months: 80 },
  instalacoes: { label: 'Instalações Comerciais e Prediais', rate: 10, months: 120 },
  outro: { label: 'Outros Bens do Ativo Permanente', rate: 10, months: 120 },
};

function inferCategoryFromText(text: string): Asset['category'] {
  const t = (text || '').toLowerCase();
  if (/ve[ií]cul|carro|caminh[aã]o|moto|autom[oó]vel|utilit[aá]rio|furg[aã]o|frota|pickup|strada|hilux|fiorino|saveiro/i.test(t)) return 'veiculos';
  if (/computador|notebook|laptop|servidor|impressora|monitor|desktop|switch|roteador|nobreak|ti\b|inform[aá]tica|tablet|celular|iphone|macbook/i.test(t)) return 'ti';
  if (/software|sistema|erp|licen[cç]a|intang[ií]vel|aplicativo/i.test(t)) return 'software';
  if (/edifica[cç]|im[oó]vel|pr[eé]dio|galp[aã]o|sala comercial|terreno|constru[cç]|obra civil/i.test(t)) return 'edificacoes';
  if (/m[oó]vel|m[oó]veis|cadeira|mesa|arm[aá]rio|estante|balc[aã]o|utens[ií]lio|sof[aá]|escrit[oó]rio/i.test(t)) return 'moveis';
  if (/ferramenta|furadeira|esmerilhadeira|parafusadeira|kit industrial|bancada/i.test(t)) return 'ferramentas';
  if (/instala[cç]|ar[\s-]?condicionado|el[eé]trica|hidr[aá]ulica|divis[oó]ria|cftv|alarme|climatiza/i.test(t)) return 'instalacoes';
  if (/m[aá]quina|equipamento|empilhadeira|torno|prensa|compressor|gerador|cnc|balan[cç]a|forno|refrigerador|freezer|industrial/i.test(t)) return 'maquinas';
  return 'outro';
}

function sanitizeCategory(raw?: string, description?: string): Asset['category'] {
  const v = (raw || '').toLowerCase().trim() as Asset['category'];
  if (VALID_CATEGORIES.includes(v)) return v;
  return inferCategoryFromText(`${raw || ''} ${description || ''}`);
}

function parseBrazilianNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  const str = String(raw ?? '').trim();
  if (!str) return 0;
  // Remove currency symbols and whitespace
  const cleaned = str.replace(/[R$\s%]/g, '');
  if (!cleaned) return 0;

  // Handle "12.345,67" vs "12,345.67" vs "12345.67" vs "12345,67"
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    normalized = cleaned.replace(',', '.');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function normalizeDateIso(raw: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === 'number' && raw > 20000 && raw < 70000) {
    // Excel serial date
    const utcDays = Math.floor(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(raw ?? '').trim();
  if (!s) return fallback;

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const brMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (brMatch) {
    const [, d, m, yRaw] = brMatch;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // MM/YYYY or YYYY-MM
  const ymMatch = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch) {
    return `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}-01`;
  }
  const myMatch = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (myMatch) {
    return `${myMatch[2]}-${myMatch[1].padStart(2, '0')}-01`;
  }
  return fallback;
}

function isSummaryTabName(name: string): boolean {
  return /resumo|sint[eé]tico|consolidado|totais|total|agrupado|capa|sum[aá]rio|quadro|balancete/i.test(name || '');
}

function isTotalOrHeaderNoiseRow(description: string): boolean {
  const d = (description || '').trim().toLowerCase();
  if (!d || d.length < 2) return true;
  if (/^(total|total geral|sub-?total|soma|geral|saldo anterior|saldo final|a transportar|transporte)$/i.test(d)) return true;
  if (/^(descri[cç][aã]o|bem|ativo|item|plaqueta|patrim[oô]nio|hist[oó]rico|conta|grupo)$/i.test(d)) return true;
  return false;
}

interface ParsedSheetTable {
  name: string;
  isSummarySheet: boolean;
  rowCount: number;
  rows: string[][];
  textDump: string;
}

function extractWorkbookTables(buffer: Buffer): ParsedSheetTable[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
    cellText: true,
  });

  const tables: ParsedSheetTable[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // Raw rows preserving dates as Date or strings cleanly
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    const formattedRows: string[][] = [];
    for (const rawRow of rawMatrix) {
      if (!Array.isArray(rawRow)) continue;
      const strRow = rawRow.map((cell) => {
        if (cell === null || cell === undefined) return '';
        if (cell instanceof Date && !isNaN(cell.getTime())) {
          return cell.toISOString().slice(0, 10);
        }
        return String(cell).replace(/\s+/g, ' ').trim();
      });
      // Skip completely empty rows
      if (strRow.every((c) => !c)) continue;
      formattedRows.push(strRow);
    }

    if (formattedRows.length === 0) continue;

    // Trim completely empty trailing/leading columns across rows
    const maxCols = Math.max(...formattedRows.map((r) => r.length));
    const nonEmptyColIndices: number[] = [];
    for (let col = 0; col < maxCols; col++) {
      if (formattedRows.some((r) => Boolean(r[col]))) {
        nonEmptyColIndices.push(col);
      }
    }

    const compactRows = formattedRows.map((r) =>
      nonEmptyColIndices.map((colIdx) => r[colIdx] || '')
    );

    const lines = compactRows.map((r, idx) => `[L${idx + 1}] ${r.join(' | ')}`);
    const isSummary = isSummaryTabName(sheetName) || compactRows.length <= 15;

    tables.push({
      name: sheetName,
      isSummarySheet: isSummary,
      rowCount: compactRows.length,
      rows: compactRows,
      textDump: `=== ABA: "${sheetName}" (${compactRows.length} linhas úteis${isSummary ? ' - POSSÍVEL ABA RESUMIDA/SINTÉTICA' : ''}) ===\n${lines.slice(0, 250).join('\n')}`,
    });
  }

  return tables;
}

function buildNormalizedCandidate(
  raw: Partial<ExtractedAssetCandidate>,
  idx: number,
  defaultCompanyTagPrefix = 'PAT'
): ExtractedAssetCandidate {
  const description = String(raw.description || '').trim() || `Bem Patrimonial ${idx + 1}`;
  const category = sanitizeCategory(raw.category, description);
  const catDefaults = CATEGORY_DEFAULTS[category];
  const rawRate = Number(raw.annualRate);
  const annualRate = Number.isFinite(rawRate) && rawRate > 0 && rawRate <= 100 ? rawRate : catDefaults.rate;
  const usefulLifeMonths =
    Number.isFinite(Number(raw.usefulLifeMonths)) && Number(raw.usefulLifeMonths) > 0
      ? Math.round(Number(raw.usefulLifeMonths))
      : Math.max(12, Math.round((100 / annualRate) * 12));

  const acquisitionValue = Math.max(0, Number(parseBrazilianNumber(raw.acquisitionValue).toFixed(2)));
  const residualValue = Math.max(0, Number(parseBrazilianNumber(raw.residualValue || 0).toFixed(2)));
  const accumulatedDepreciation =
    raw.accumulatedDepreciation !== undefined
      ? Math.max(0, Number(parseBrazilianNumber(raw.accumulatedDepreciation).toFixed(2)))
      : undefined;

  return {
    tempId: `cand-${Date.now().toString(36)}-${idx + 1}`,
    description,
    tagNumber:
      String(raw.tagNumber || '').trim() ||
      `${defaultCompanyTagPrefix}-${String(idx + 1).padStart(3, '0')}`,
    category,
    categoryLabel: String(raw.categoryLabel || '').trim() || catDefaults.label,
    acquisitionDate: normalizeDateIso(raw.acquisitionDate),
    acquisitionValue,
    residualValue,
    accumulatedDepreciation,
    annualRate,
    usefulLifeMonths,
    costCenter: String(raw.costCenter || '').trim() || 'Administrativo',
    location: String(raw.location || '').trim() || 'Sede Principal',
    supplier: String(raw.supplier || '').trim(),
    invoiceNumber: String(raw.invoiceNumber || '').trim(),
    sourceSheet: raw.sourceSheet ? String(raw.sourceSheet).trim() : undefined,
    sourceRow: typeof raw.sourceRow === 'number' ? raw.sourceRow : undefined,
    quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
    isSummaryEntry: Boolean(raw.isSummaryEntry),
    confidence:
      typeof raw.confidence === 'number'
        ? Math.min(100, Math.max(10, Math.round(raw.confidence)))
        : 82,
    aiReason: String(raw.aiReason || '').trim() || undefined,
    notes: String(raw.notes || '').trim() || undefined,
  };
}

/**
 * Fallback determinístico multi-abas caso Gemini esteja indisponível ou em cota 429.
 * Lê todas as abas (inclusive abas resumidas) identificando cabeçalhos ou pares Texto + Valor.
 */
function parseSheetsDeterministically(tables: ParsedSheetTable[]): ExtractedAssetCandidate[] {
  const candidates: ExtractedAssetCandidate[] = [];

  for (const table of tables) {
    // 1. Find likely header row within first 15 rows
    let headerIdx = -1;
    let descCol = -1;
    let valCol = -1;
    let tagCol = -1;
    let dateCol = -1;
    let rateCol = -1;
    let deprecCol = -1;
    let ccCol = -1;
    let supplierCol = -1;
    let nfCol = -1;
    let qtyCol = -1;

    for (let r = 0; r < Math.min(15, table.rows.length); r++) {
      const row = table.rows[r].map((c) => c.toLowerCase());
      const foundDesc = row.findIndex((c) =>
        /descri|bem|ativo|imobilizado|equipamento|conta|grupo|categoria|hist[oó]rico|item|produto|nome/.test(c)
      );
      const foundVal = row.findIndex((c) =>
        /valor|aquisi[cç][aã]o|custo|total|bruto|original|pre[cç]o|montante|vlr/.test(c)
      );

      if (foundDesc !== -1 || foundVal !== -1) {
        headerIdx = r;
        descCol = foundDesc;
        valCol = foundVal;
        tagCol = row.findIndex((c) => /plaqueta|patrim|c[oó]digo|tag|tombo|registro/.test(c));
        dateCol = row.findIndex((c) => /data|aquisi[cç]|compra|entrada|incorpora/.test(c));
        rateCol = row.findIndex((c) => /taxa|al[ií]quota|%|deprec.*a\.?a/.test(c));
        deprecCol = row.findIndex((c) => /acumulad|deprecia[cç][aã]o\s*(acum|saldo)|depr\.?\s*ac/.test(c));
        ccCol = row.findIndex((c) => /centro|setor|departamento|área|area|unidade/.test(c));
        supplierCol = row.findIndex((c) => /fornecedor|fabricante|marca|emitente/.test(c));
        nfCol = row.findIndex((c) => /\bnf\b|nota\s*fiscal|nfe|documento|nº\s*nf/.test(c));
        qtyCol = row.findIndex((c) => /qtd|quant/.test(c));
        break;
      }
    }

    const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;

    for (let r = startRow; r < table.rows.length; r++) {
      const row = table.rows[r];
      let description = descCol >= 0 ? row[descCol] || '' : '';
      let val = valCol >= 0 ? parseBrazilianNumber(row[valCol]) : 0;

      // In compact/summary tables without standard headers, scan cells smartly
      if (!description) {
        const textCells = row.filter((c) => /[a-zA-ZÀ-ÿ]{3,}/.test(c) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c));
        description = textCells.sort((a, b) => b.length - a.length)[0] || '';
      }
      if (val <= 0) {
        const numericVals = row
          .map((c) => parseBrazilianNumber(c))
          .filter((n) => n > 10);
        if (numericVals.length > 0) {
          val = Math.max(...numericVals);
        }
      }

      if (isTotalOrHeaderNoiseRow(description)) continue;
      if (val <= 0 && description.length < 4) continue;
      if (val <= 0) continue; // Summary headers without monetary value aren't assets

      const qtyRaw = qtyCol >= 0 ? parseBrazilianNumber(row[qtyCol]) : 1;
      const rateRaw = rateCol >= 0 ? parseBrazilianNumber(row[rateCol]) : 0;
      const rateNormalized = rateRaw > 0 && rateRaw < 1 ? Math.round(rateRaw * 100) : rateRaw;

      candidates.push(
        buildNormalizedCandidate(
          {
            description,
            tagNumber: tagCol >= 0 ? row[tagCol] : '',
            acquisitionDate: dateCol >= 0 ? row[dateCol] : undefined,
            acquisitionValue: val,
            accumulatedDepreciation: deprecCol >= 0 ? parseBrazilianNumber(row[deprecCol]) : undefined,
            annualRate: rateNormalized > 0 ? rateNormalized : undefined,
            costCenter: ccCol >= 0 ? row[ccCol] : undefined,
            supplier: supplierCol >= 0 ? row[supplierCol] : undefined,
            invoiceNumber: nfCol >= 0 ? row[nfCol] : undefined,
            quantity: qtyRaw > 1 ? Math.round(qtyRaw) : 1,
            sourceSheet: table.name,
            sourceRow: r + 1,
            isSummaryEntry: table.isSummarySheet,
            confidence: table.isSummarySheet ? 74 : 85,
            aiReason: table.isSummarySheet
              ? `Identificado na aba resumida "${table.name}" (linha ${r + 1}). Confirme se deseja cadastrar este grupo/bem.`
              : `Extraído da aba "${table.name}" (linha ${r + 1}).`,
          },
          candidates.length
        )
      );
    }
  }

  return candidates;
}

function parseXmlAssetsDeterministically(xmlText: string): ExtractedAssetCandidate[] {
  const candidates: ExtractedAssetCandidate[] = [];
  const emitterMatch = xmlText.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/i);
  const nfMatch = xmlText.match(/<nNF>(\d+)<\/nNF>/i);
  const dhEmiMatch = xmlText.match(/<dhEmi>([^<]+)<\/dhEmi>|<dEmi>([^<]+)<\/dEmi>/i);

  const supplier = emitterMatch ? emitterMatch[1].trim() : '';
  const invoiceNumber = nfMatch ? nfMatch[1].trim() : '';
  const acqDate = dhEmiMatch ? normalizeDateIso(dhEmiMatch[1] || dhEmiMatch[2]) : new Date().toISOString().slice(0, 10);

  const detRegex = /<det[^>]*>([\s\S]*?)<\/det>/gi;
  let match: RegExpExecArray | null;
  while ((match = detRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const xProd = block.match(/<xProd>([^<]+)<\/xProd>/i)?.[1]?.trim();
    const vProd = block.match(/<vProd>([^<]+)<\/vProd>/i)?.[1];
    const qCom = block.match(/<qCom>([^<]+)<\/qCom>/i)?.[1];
    if (!xProd) continue;

    candidates.push(
      buildNormalizedCandidate(
        {
          description: xProd,
          acquisitionDate: acqDate,
          acquisitionValue: parseBrazilianNumber(vProd || 0),
          quantity: Math.max(1, Math.round(parseBrazilianNumber(qCom || 1))),
          supplier,
          invoiceNumber,
          sourceSheet: 'NF-e XML',
          confidence: 92,
          aiReason: `Item extraído do XML da NF-e${invoiceNumber ? ` nº ${invoiceNumber}` : ''}.`,
        },
        candidates.length
      )
    );
  }

  return candidates;
}

const ASSET_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summaryText: {
      type: Type.STRING,
      description: 'Breve resumo em português explicando quantas abas/páginas e quantos bens ou grupos resumidos foram identificados.',
    },
    assets: {
      type: Type.ARRAY,
      description: 'Lista completa de bens do ativo imobilizado encontrados em todas as abas/páginas para conferência um a um.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'Descrição completa do bem ou grupo resumido.' },
          tagNumber: { type: Type.STRING, description: 'Número da plaqueta/patrimônio ou código se existir.' },
          category: {
            type: Type.STRING,
            description: 'Categoria contábil: edificacoes, maquinas, veiculos, moveis, ti, software, ferramentas, instalacoes ou outro.',
          },
          acquisitionDate: { type: Type.STRING, description: 'Data de aquisição em YYYY-MM-DD (use início do período ou data de referência se aba resumida não detalhar).' },
          acquisitionValue: { type: Type.NUMBER, description: 'Valor bruto de aquisição em reais (apenas número positivo).' },
          residualValue: { type: Type.NUMBER, description: 'Valor residual se informado (senão 0).' },
          accumulatedDepreciation: { type: Type.NUMBER, description: 'Depreciação acumulada já existente se informada na planilha.' },
          annualRate: { type: Type.NUMBER, description: 'Taxa anual de depreciação % (ex: 4 edificacoes, 10 maquinas/moveis, 20 ti/veiculos).' },
          usefulLifeMonths: { type: Type.NUMBER, description: 'Vida útil total em meses (ex: 60 para 20% a.a., 120 para 10% a.a.).' },
          costCenter: { type: Type.STRING, description: 'Centro de custo, setor ou departamento se informado.' },
          location: { type: Type.STRING, description: 'Localização ou filial se informada.' },
          supplier: { type: Type.STRING, description: 'Fornecedor ou fabricante se informado.' },
          invoiceNumber: { type: Type.STRING, description: 'Número da NF se informado.' },
          sourceSheet: { type: Type.STRING, description: 'Nome exato da aba da planilha (ex: "Resumo", "TI") ou origem.' },
          sourceRow: { type: Type.NUMBER, description: 'Número aproximado da linha na aba.' },
          quantity: { type: Type.NUMBER, description: 'Quantidade de unidades se agrupado/resumido.' },
          isSummaryEntry: { type: Type.BOOLEAN, description: 'true se veio de uma aba resumida/sintética ou linha agrupada.' },
          confidence: { type: Type.NUMBER, description: 'Confiança de 0 a 100.' },
          aiReason: { type: Type.STRING, description: 'Explicação curta em português sobre onde foi encontrado e por que recebeu esta classificação.' },
        },
        required: ['description', 'category', 'acquisitionValue', 'annualRate'],
      },
    },
  },
  required: ['summaryText', 'assets'],
};

const ASSET_EXTRACTION_PROMPT = `Você é um auditor contábil especialista em Ativo Imobilizado (CPC 27 / IFRS / RFB Brasil).
Analise o conteúdo completo enviado (todas as abas da planilha, ou documento PDF/imagem/XML) para identificar TODOS os bens candidatos a cadastro no módulo de Ativo Imobilizado.

REGRAS CRÍTICAS PARA PLANILHAS COM ABAS RESUMIDAS ("Resumo", "Sintético", "Consolidado", "Totais"):
1. Inspecione TODAS as abas fornecidas, sem ignorar nenhuma aba curta ou resumida.
2. Se houver uma aba analítica (item por item) E uma aba resumida que apenas totaliza exatamente os mesmos itens: priorize os itens detalhados e NÃO duplique o "TOTAL GERAL".
3. Porém, se uma aba resumida/sintética contiver grupos de ativos ou valores consolidados QUE NÃO estão detalhados item a item em outra aba (ou se a planilha inteira possuir apenas abas resumidas, ex: "Veículos - 3 unid - R$ 180.000", "Máquinas Industriais - R$ 95.000", "Computadores TI - R$ 24.500"): EXTRAIA CADA LINHA/GRUPO DE ATIVO DA ABA RESUMIDA como um item candidato, marcando isSummaryEntry=true e informando sourceSheet com o nome exato da aba! O usuário vai revisar item por item ("um a um") e decidir se cadastra ou pula.
4. Nunca descarte uma linha válida só porque falta plaqueta ou data exata — gere uma sugestão contábil coerente (ex: taxa CPC 27 padrão da categoria e data fallback do período mencionado no cabeçalho ou data atual).
5. Ignore exclusivamente cabeçalhos de tabela e linhas puramente de "TOTAL GERAL" / "SOMA".
6. Para NF-e / faturas / relatórios PDF, extraia cada equipamento, veículo, móvel ou computador relevante separadamente para revisão um a um.`;

async function callGeminiAssetExtractor(
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
): Promise<{ summaryText: string; assets: any[]; warning?: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  const attempts = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', thinkingLevel: undefined },
  ];

  let lastErr: any;
  for (const attempt of attempts) {
    try {
      const config: Record<string, any> = {
        responseMimeType: 'application/json',
        responseSchema: ASSET_EXTRACTION_SCHEMA,
      };
      if (attempt.thinkingLevel !== undefined) {
        config.thinkingConfig = { thinkingLevel: attempt.thinkingLevel };
      }

      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: { parts },
        config,
      });

      const rawText = (response.text || '{}').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(rawText);
      return {
        summaryText: String(parsed.summaryText || ''),
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      };
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (err?.status === 404 || msg.includes('not found') || err?.status === 429) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function analyzeAssetFileWithAI(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}): Promise<AssetExtractionResponse> {
  const cleanName = params.fileName || 'arquivo';
  const lower = cleanName.toLowerCase();
  const base64Clean = (params.base64Data || '').includes(',')
    ? params.base64Data.split(',')[1]
    : params.base64Data || '';

  const buffer = Buffer.from(base64Clean, 'base64');

  const isSpreadsheet =
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsm') ||
    lower.endsWith('.ods') ||
    lower.endsWith('.csv') ||
    params.mimeType.includes('spreadsheet') ||
    params.mimeType.includes('excel') ||
    params.mimeType === 'text/csv';

  const isXml = lower.endsWith('.xml') || params.mimeType.includes('xml');
  const isPdf = lower.endsWith('.pdf') || params.mimeType === 'application/pdf';
  const isImage =
    params.mimeType.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)$/i.test(lower);

  // 1. PLANILHAS MULTI-ABAS (.xlsx, .xls, .ods, .csv)
  if (isSpreadsheet) {
    const tables = extractWorkbookTables(buffer);
    const sheetsAnalyzed: SheetSummaryInfo[] = tables.map((t) => ({
      name: t.name,
      rowCount: t.rowCount,
      isSummarySheet: t.isSummarySheet,
    }));

    if (tables.length === 0) {
      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed: [],
        candidates: [],
        usedAi: false,
        summaryText: 'Nenhuma aba com dados preenchidos foi encontrada na planilha.',
      };
    }

    const combinedText = tables.map((t) => t.textDump).join('\n\n').slice(0, 65000);
    const deterministicFallback = parseSheetsDeterministically(tables);

    try {
      const aiRes = await callGeminiAssetExtractor([
        {
          text: `${ASSET_EXTRACTION_PROMPT}\n\nARQUIVO: ${cleanName}\nTOTAL DE ABAS COM DADOS: ${tables.length}\n\n${combinedText}`,
        },
      ]);

      const normalizedAi = (aiRes.assets || [])
        .map((item, idx) => buildNormalizedCandidate(item, idx))
        .filter((c) => c.description && (c.acquisitionValue > 0 || (c.notes || '').length > 0));

      const finalCandidates = normalizedAi.length > 0 ? normalizedAi : deterministicFallback;

      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed,
        candidates: finalCandidates,
        usedAi: normalizedAi.length > 0,
        usedFallback: normalizedAi.length === 0 && deterministicFallback.length > 0,
        summaryText:
          aiRes.summaryText ||
          `Foram analisadas ${tables.length} aba(s) e identificados ${finalCandidates.length} bem(ns)/grupo(s) para revisão um a um.`,
      };
    } catch (err: any) {
      const warnMsg =
        err?.status === 429
          ? 'Cota temporária da IA atingida; leitura estruturada multi-abas aplicada automaticamente.'
          : err?.message || 'IA indisponível no momento; leitura estruturada multi-abas aplicada.';

      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed,
        candidates: deterministicFallback,
        usedAi: false,
        usedFallback: true,
        aiWarning: warnMsg,
        summaryText: `Planilha lida (${tables.length} aba(s)) com extrator contábil: ${deterministicFallback.length} item(ns) localizado(s) para revisão um a um.`,
      };
    }
  }

  // 2. XML (NF-e / CT-e)
  if (isXml) {
    const xmlText = buffer.toString('utf-8').slice(0, 50000);
    const fallbackXml = parseXmlAssetsDeterministically(xmlText);
    try {
      const aiRes = await callGeminiAssetExtractor([
        { text: `${ASSET_EXTRACTION_PROMPT}\n\nCONTEÚDO XML (${cleanName}):\n${xmlText}` },
      ]);
      const normalizedAi = (aiRes.assets || []).map((item, idx) =>
        buildNormalizedCandidate({ ...item, sourceSheet: item.sourceSheet || 'NF-e XML' }, idx)
      );
      const finalCandidates = normalizedAi.length > 0 ? normalizedAi : fallbackXml;
      return {
        fileName: cleanName,
        fileType: 'xml',
        sheetsAnalyzed: [{ name: 'NF-e XML', rowCount: finalCandidates.length, isSummarySheet: false }],
        candidates: finalCandidates,
        usedAi: normalizedAi.length > 0,
        usedFallback: normalizedAi.length === 0 && fallbackXml.length > 0,
        summaryText: aiRes.summaryText || `${finalCandidates.length} item(ns) identificado(s) no XML da NF-e.`,
      };
    } catch (err: any) {
      return {
        fileName: cleanName,
        fileType: 'xml',
        sheetsAnalyzed: [{ name: 'NF-e XML', rowCount: fallbackXml.length, isSummarySheet: false }],
        candidates: fallbackXml,
        usedAi: false,
        usedFallback: true,
        aiWarning: err?.message,
        summaryText: `${fallbackXml.length} item(ns) extraído(s) do XML para conferência um a um.`,
      };
    }
  }

  // 3. PDF ou IMAGEM (NF, Fatura, Relatório Patrimonial)
  if (isPdf || isImage) {
    const normalizedMime = isPdf
      ? 'application/pdf'
      : params.mimeType === 'image/jpg'
        ? 'image/jpeg'
        : params.mimeType || 'image/jpeg';
    try {
      const aiRes = await callGeminiAssetExtractor([
        { inlineData: { mimeType: normalizedMime, data: base64Clean } },
        { text: `${ASSET_EXTRACTION_PROMPT}\n\nARQUIVO ENVIADO: ${cleanName}` },
      ]);
      const normalizedAi = (aiRes.assets || []).map((item, idx) =>
        buildNormalizedCandidate(
          { ...item, sourceSheet: item.sourceSheet || (isPdf ? 'Documento PDF' : 'Imagem / Nota') },
          idx
        )
      );
      return {
        fileName: cleanName,
        fileType: isPdf ? 'pdf' : 'image',
        sheetsAnalyzed: [
          {
            name: isPdf ? 'Documento PDF' : 'Imagem Digitalizada',
            rowCount: normalizedAi.length,
            isSummarySheet: false,
          },
        ],
        candidates: normalizedAi,
        usedAi: true,
        summaryText:
          aiRes.summaryText ||
          `Documento analisado com IA: ${normalizedAi.length} bem(ns) identificado(s) para revisão um a um.`,
      };
    } catch (err: any) {
      return {
        fileName: cleanName,
        fileType: isPdf ? 'pdf' : 'image',
        sheetsAnalyzed: [{ name: cleanName, rowCount: 0, isSummarySheet: false }],
        candidates: [],
        usedAi: false,
        aiWarning: err?.message || 'Não foi possível extrair os bens deste documento via IA.',
        summaryText: 'Falha ao ler documento via IA. Você ainda pode cadastrar manualmente na revisão.',
      };
    }
  }

  // 4. Texto genérico / CSV / TXT
  const textContent = buffer.toString('utf-8').slice(0, 50000);
  try {
    const aiRes = await callGeminiAssetExtractor([
      { text: `${ASSET_EXTRACTION_PROMPT}\n\nARQUIVO TEXTO (${cleanName}):\n${textContent}` },
    ]);
    const normalizedAi = (aiRes.assets || []).map((item, idx) => buildNormalizedCandidate(item, idx));
    return {
      fileName: cleanName,
      fileType: 'text',
      sheetsAnalyzed: [{ name: cleanName, rowCount: normalizedAi.length, isSummarySheet: false }],
      candidates: normalizedAi,
      usedAi: true,
      summaryText:
        aiRes.summaryText || `${normalizedAi.length} bem(ns) identificado(s) no arquivo.`,
    };
  } catch (err: any) {
    return {
      fileName: cleanName,
      fileType: 'text',
      sheetsAnalyzed: [{ name: cleanName, rowCount: 0, isSummarySheet: false }],
      candidates: [],
      usedAi: false,
      aiWarning: err?.message,
      summaryText: 'Não foi possível identificar bens automaticamente neste arquivo.',
    };
  }
}
