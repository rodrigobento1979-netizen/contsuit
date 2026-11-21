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
  depreciationStartDate?: string; // YYYY-MM-DD
  acquisitionYear?: number;
  assetGroup?: string;
  assetClass?: string;
  marking?: string;
  postToTrialBalance?: boolean;
  status?: Asset['status'];
  acquisitionValue: number;
  residualValue: number;
  accumulatedDepreciation?: number;
  accumulatedDepreciationDate?: string; // YYYY-MM-DD
  accumulatedDepreciationMonths?: number;
  lastPeriodQuota?: number;
  netBookValueImported?: number;
  depreciationHistoryNote?: string;
  annualRate: number;
  usefulLifeMonths: number;
  usefulLifeYears?: number;
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
  if (/ve[ií]cul|carro|caminh[aã]o|moto\b|motociclet|autom[oó]vel|utilit[aá]rio|furg[aã]o|frota|pickup|strada|hilux|fiorino|saveiro|kombi|van\b|sprinter|ônibus|onibus/i.test(t)) return 'veiculos';
  if (/computador|notebook|laptop|servidor|impressora|monitor|desktop|switch|roteador|nobreak|no-break|\bti\b|inform[aá]tica|processamento de dados|tablet|celular|smartphone|iphone|macbook|scanner|leitor/i.test(t)) return 'ti';
  if (/software|sistema|erp|licen[cç]a|intang[ií]vel|aplicativo/i.test(t)) return 'software';
  if (/edifica[cç]|im[oó]vel|im[oó]veis|pr[eé]dio|galp[aã]o|sala comercial|terreno|constru[cç]|obra civil|alvenaria|benfeitoria/i.test(t)) return 'edificacoes';
  if (/m[oó]vel|m[oó]veis|cadeira|mesa\b|arm[aá]rio|estante|balc[aã]o|utens[ií]lio|sof[aá]|poltrona|gaveteiro|arquivo de a[cç]o|escrit[oó]rio/i.test(t)) return 'moveis';
  if (/ferramenta|furadeira|esmerilhadeira|parafusadeira|kit industrial|bancada|solda|serra\b|martelete/i.test(t)) return 'ferramentas';
  if (/instala[cç]|ar[\s-]?condicionado|el[eé]trica|hidr[aá]ulica|divis[oó]ria|cftv|alarme|climatiza|cabine|painel el[eé]trico/i.test(t)) return 'instalacoes';
  if (/m[aá]quina|equipamento|empilhadeira|torno|prensa|compressor|gerador|cnc|balan[cç]a|forno|refrigerador|freezer|industrial|extratora|esteira|caldeira|bomba\b|motor\b/i.test(t)) return 'maquinas';
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
  const cleaned = str.replace(/[R$\s%]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '--') return 0;

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

function formatExcelDateSafely(d: Date): string {
  // SheetJS often constructs local midnight minus ~43s; adding 120s prevents previous-day/UTC shifts
  const shifted = new Date(d.getTime() + 120 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (y < 1950 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

const PT_MONTHS: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

function normalizeDateIso(raw: unknown, fallbackYear?: number): string {
  const defaultFallback = fallbackYear && fallbackYear >= 1950 && fallbackYear <= 2100
    ? `${fallbackYear}-01-01`
    : new Date().toISOString().slice(0, 10);

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return formatExcelDateSafely(raw);
  }
  if (typeof raw === 'number' && raw > 15000 && raw < 75000) {
    const utcDays = Math.round(raw - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(raw ?? '').trim();
  if (!s) return defaultFallback;

  // Bare 4-digit year e.g. "2021"
  if (/^(19|20)\d{2}$/.test(s)) {
    return `${s}-01-01`;
  }

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, yStr, mStr, dStr] = isoMatch;
    if (isValidYmd(Number(yStr), Number(mStr), Number(dStr))) {
      return `${yStr}-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}`;
    }
  }
  // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const brMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (brMatch) {
    const [, dStr, mStr, yRaw] = brMatch;
    const yStr = yRaw.length === 2 ? `${Number(yRaw) > 70 ? '19' : '20'}${yRaw}` : yRaw;
    if (isValidYmd(Number(yStr), Number(mStr), Number(dStr))) {
      return `${yStr}-${mStr.padStart(2, '0')}-${dStr.padStart(2, '0')}`;
    }
  }
  // PT-BR mmm/yy or mmm/yyyy (e.g. "mar/21", "ago/2023")
  const ptMonthMatch = s.toLowerCase().match(/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[./-\s]+(\d{2,4})$/i);
  if (ptMonthMatch) {
    const mon = PT_MONTHS[ptMonthMatch[1].toLowerCase()];
    const yRaw = ptMonthMatch[2];
    const yStr = yRaw.length === 2 ? `${Number(yRaw) > 70 ? '19' : '20'}${yRaw}` : yRaw;
    if (mon && Number(yStr) >= 1950 && Number(yStr) <= 2100) {
      return `${yStr}-${mon}-01`;
    }
  }
  // YYYY-MM
  const ymMatch = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch && Number(ymMatch[2]) >= 1 && Number(ymMatch[2]) <= 12) {
    return `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}-01`;
  }
  // MM/YYYY
  const myMatch = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (myMatch && Number(myMatch[1]) >= 1 && Number(myMatch[1]) <= 12) {
    return `${myMatch[2]}-${myMatch[1].padStart(2, '0')}-01`;
  }
  return defaultFallback;
}

function parseDateFromHeader(header: string): string | undefined {
  const s = String(header || '');
  const brMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
  }
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const myMatch = s.match(/(\d{1,2})\/(\d{4})/);
  if (myMatch) {
    return `${myMatch[2]}-${myMatch[1].padStart(2, '0')}-01`;
  }
  return undefined;
}

function parseBooleanPt(raw: string): boolean | undefined {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return undefined;
  if (/^(sim|s|yes|y|true|1|x|ok|lan[cç]ar)$/i.test(s)) return true;
  if (/^(n[aã]o|nao|n|no|false|0)$/i.test(s)) return false;
  return undefined;
}

function parseAssetStatus(raw: string): Asset['status'] {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return 'ativo';
  if (/totalmente\s*depreciad|100%\s*depreciad|\bdepreciad[oa]\b/i.test(s) && !/em\s*deprecia/i.test(s)) {
    return 'totalmente_depreciado';
  }
  if (/baixad[oa]|alienad[oa]|vendid[oa]|descartad[oa]|sucatead[oa]/i.test(s)) {
    return 'baixado';
  }
  if (/manuten[cç][aã]o/i.test(s)) {
    return 'em_manutencao';
  }
  return 'ativo';
}

type SheetRole = 'inventory' | 'summary' | 'journal' | 'parameter' | 'other';

function classifySheetRole(name: string): SheetRole {
  const n = (name || '').toLowerCase();
  if (/premissas|par[aâ]metros|config|taxas|al[ií]quotas|tabela|instru[cç][oõ]es|ajuda|listas?|auxiliar|apoio|indices?|criterios?/i.test(n)) {
    return 'parameter';
  }
  if (/lan[cç]amento|di[aá]rio|partidas|raz[aã]o|apropria|contabiliza/i.test(n)) {
    return 'journal';
  }
  if (/resumo|sint[eé]tico|consolidado|totais|sum[aá]rio|quadro|balancete|capa/i.test(n)) {
    return 'summary';
  }
  if (/relat[oó]rio|bens|ativo|imobilizado|invent[aá]rio|patrim[oô]nio|cadastro|itens|equipamentos|ve[ií]culos|m[aá]quinas|frota/i.test(n)) {
    return 'inventory';
  }
  return 'other';
}

function isTotalOrHeaderNoiseRow(description: string): boolean {
  const d = (description || '').trim().toLowerCase();
  if (!d || d.length < 2) return true;
  if (/^(total|total geral|totais|sub-?total|soma|geral|saldo|saldo anterior|saldo final|a transportar|transporte)$/i.test(d)) return true;
  if (/^(descri[cç][aã]o|bem|bens|ativo|ativos|item|itens|plaqueta|patrim[oô]nio|hist[oó]rico|conta|grupo|categoria|classe|status|situa[cç][aã]o|legenda|resumo)$/i.test(d)) return true;
  if (/^(em deprecia[cç][aã]o|totalmente depreciad[oa]s?|depreciad[oa]s?|baixad[oa]s?|alienad[oa]s?|ativ[oa]s?|inativ[oa]s?|em uso|em manuten[cç][aã]o|sim|n[aã]o|qtd|quantidade)$/i.test(d)) return true;
  return false;
}

interface ParsedSheetTable {
  name: string;
  role: SheetRole;
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
          return formatExcelDateSafely(cell);
        }
        return String(cell).replace(/\s+/g, ' ').trim();
      });
      if (strRow.every((c) => !c)) continue;
      formattedRows.push(strRow);
    }

    if (formattedRows.length === 0) continue;

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

    const role = classifySheetRole(sheetName);
    const isSummary = role === 'summary' || role === 'journal';
    const roleTag =
      role === 'parameter'
        ? 'ABA AUXILIAR/PREMISSAS - NÃO SÃO BENS'
        : role === 'journal'
          ? 'ABA DE LANÇAMENTOS/RESUMO CONTÁBIL'
          : role === 'summary'
            ? 'ABA RESUMIDA/SINTÉTICA'
            : 'ABA DE BENS/INVENTÁRIO';

    const lines = compactRows.map((r, idx) => `[L${idx + 1}] ${r.join(' | ')}`);

    tables.push({
      name: sheetName,
      role,
      isSummarySheet: isSummary,
      rowCount: compactRows.length,
      rows: compactRows,
      textDump: `=== ABA: "${sheetName}" (${compactRows.length} linhas úteis • ${roleTag}) ===\n${lines.slice(0, 220).join('\n')}`,
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
  const semanticHint = [raw.assetGroup, raw.assetClass, raw.category, description].filter(Boolean).join(' ');
  const category = sanitizeCategory(raw.category, semanticHint);
  const catDefaults = CATEGORY_DEFAULTS[category];

  const rawRate = Number(raw.annualRate);
  const usefulLifeYearsRaw = Number(raw.usefulLifeYears);

  let usefulLifeMonths =
    Number.isFinite(Number(raw.usefulLifeMonths)) && Number(raw.usefulLifeMonths) > 0
      ? Math.round(Number(raw.usefulLifeMonths))
      : Number.isFinite(usefulLifeYearsRaw) && usefulLifeYearsRaw > 0
        ? Math.round(usefulLifeYearsRaw * 12)
        : 0;

  const normalizedRate =
    rawRate === 1 && (usefulLifeYearsRaw === 1 || usefulLifeMonths === 12)
      ? 100
      : rawRate > 0 && rawRate < 1
        ? Math.round(rawRate * 10000) / 100
        : rawRate;

  let annualRate =
    Number.isFinite(normalizedRate) && normalizedRate > 0 && normalizedRate <= 100
      ? normalizedRate
      : usefulLifeMonths > 0
        ? Math.round(((12 / usefulLifeMonths) * 100) * 100) / 100
        : catDefaults.rate;

  if (usefulLifeMonths <= 0) {
    usefulLifeMonths = Math.max(12, Math.round((100 / annualRate) * 12));
  }

  const usefulLifeYears =
    Number.isFinite(usefulLifeYearsRaw) && usefulLifeYearsRaw > 0
      ? usefulLifeYearsRaw
      : Math.round((usefulLifeMonths / 12) * 10) / 10;

  const acquisitionValue = Math.max(0, Number(parseBrazilianNumber(raw.acquisitionValue).toFixed(2)));
  const residualValue = Math.max(0, Number(parseBrazilianNumber(raw.residualValue || 0).toFixed(2)));
  const accumulatedDepreciation =
    raw.accumulatedDepreciation !== undefined
      ? Math.max(0, Number(parseBrazilianNumber(raw.accumulatedDepreciation).toFixed(2)))
      : undefined;

  const fallbackYear = raw.acquisitionYear && raw.acquisitionYear >= 1950 ? raw.acquisitionYear : undefined;
  const depreciationStartDate = raw.depreciationStartDate
    ? normalizeDateIso(raw.depreciationStartDate, fallbackYear)
    : raw.acquisitionDate
      ? normalizeDateIso(raw.acquisitionDate, fallbackYear)
      : normalizeDateIso(undefined, fallbackYear);
  const acquisitionDate = raw.acquisitionDate
    ? normalizeDateIso(raw.acquisitionDate, fallbackYear)
    : depreciationStartDate;

  let tagNumber = String(raw.tagNumber || '').trim();
  if (!tagNumber) {
    tagNumber = `${defaultCompanyTagPrefix}-${String(idx + 1).padStart(3, '0')}`;
  } else if (/^\d+$/.test(tagNumber)) {
    tagNumber = `${defaultCompanyTagPrefix}-${tagNumber.padStart(3, '0')}`;
  }

  return {
    tempId: `cand-${Date.now().toString(36)}-${idx + 1}`,
    description,
    tagNumber,
    category,
    categoryLabel: String(raw.categoryLabel || '').trim() || catDefaults.label,
    acquisitionDate,
    depreciationStartDate,
    acquisitionYear: raw.acquisitionYear || Number(acquisitionDate.slice(0, 4)) || undefined,
    assetGroup: raw.assetGroup ? String(raw.assetGroup).trim() : undefined,
    assetClass: raw.assetClass ? String(raw.assetClass).trim() : undefined,
    marking: raw.marking ? String(raw.marking).trim() : undefined,
    postToTrialBalance: raw.postToTrialBalance,
    status: raw.status || 'ativo',
    acquisitionValue,
    residualValue,
    accumulatedDepreciation,
    accumulatedDepreciationDate: raw.accumulatedDepreciationDate
      ? normalizeDateIso(raw.accumulatedDepreciationDate)
      : undefined,
    accumulatedDepreciationMonths:
      typeof raw.accumulatedDepreciationMonths === 'number' && raw.accumulatedDepreciationMonths >= 0
        ? Math.round(raw.accumulatedDepreciationMonths)
        : undefined,
    lastPeriodQuota:
      raw.lastPeriodQuota !== undefined
        ? Math.max(0, Number(parseBrazilianNumber(raw.lastPeriodQuota).toFixed(2)))
        : undefined,
    netBookValueImported:
      raw.netBookValueImported !== undefined
        ? Math.max(0, Number(parseBrazilianNumber(raw.netBookValueImported).toFixed(2)))
        : undefined,
    depreciationHistoryNote: raw.depreciationHistoryNote
      ? String(raw.depreciationHistoryNote).trim()
      : undefined,
    annualRate,
    usefulLifeMonths,
    usefulLifeYears,
    costCenter: String(raw.costCenter || '').trim() || (raw.marking ? String(raw.marking).trim() : 'Administrativo'),
    location: String(raw.location || '').trim() || 'Sede Principal',
    supplier: String(raw.supplier || '').trim(),
    invoiceNumber: String(raw.invoiceNumber || '').trim(),
    debitAccount: raw.debitAccount ? String(raw.debitAccount).trim() : undefined,
    creditAccount: raw.creditAccount ? String(raw.creditAccount).trim() : undefined,
    assetAccount: raw.assetAccount ? String(raw.assetAccount).trim() : undefined,
    sourceSheet: raw.sourceSheet ? String(raw.sourceSheet).trim() : undefined,
    sourceRow: typeof raw.sourceRow === 'number' ? raw.sourceRow : undefined,
    quantity: typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1,
    isSummaryEntry: Boolean(raw.isSummaryEntry),
    confidence:
      typeof raw.confidence === 'number'
        ? Math.min(100, Math.max(10, Math.round(raw.confidence)))
        : 92,
    aiReason: String(raw.aiReason || '').trim() || undefined,
    notes: String(raw.notes || '').trim() || undefined,
  };
}

interface ColumnDateMeta {
  colIndex: number;
  header: string;
  isoDate?: string;
}

/**
 * Extrai TODOS os bens e TODAS as colunas de uma aba estruturada de inventário (zero truncamento de linhas).
 * Compatível com planilhas completas estilo "Relatorio_Bens" (Nº, Grupo, Bem, Ano, Marcação, Classe,
 * Vida útil (anos), Taxa anual, Início da depreciação, Custo base, Lançar no balancete?, Conta do imobilizado,
 * Conta dep. acumulada, Meses até..., Dep. acum..., Quota..., Valor residual DD/MM/AAAA, Situação...).
 */
function extractStructuredTableAssets(
  table: ParsedSheetTable,
  startIndexOffset = 0
): ExtractedAssetCandidate[] {
  const found: ExtractedAssetCandidate[] = [];

  let bestRow = -1;
  let bestScore = -1;

  let tagCol = -1;
  let groupCol = -1;
  let descCol = -1;
  let yearCol = -1;
  let markingCol = -1;
  let classCol = -1;
  let usefulLifeYearsCol = -1;
  let usefulLifeMonthsCol = -1;
  let usefulLifeGenericCol = -1;
  let rateCol = -1;
  let depStartCol = -1;
  let acqDateCol = -1;
  let valCol = -1;
  let salvageValCol = -1;
  let nbvCol = -1;
  let trialBalanceCol = -1;
  let assetAccountCol = -1;
  let creditAccountCol = -1;
  let debitAccountCol = -1;
  let statusCol = -1;
  let ccCol = -1;
  let supplierCol = -1;
  let nfCol = -1;
  let qtyCol = -1;
  let depAccumCols: ColumnDateMeta[] = [];
  let depMonthsCols: ColumnDateMeta[] = [];
  let quotaCols: ColumnDateMeta[] = [];

  const scanLimit = Math.min(35, table.rows.length);
  for (let r = 0; r < scanLimit; r++) {
    const rawRow = table.rows[r];
    const row = rawRow.map((c) => c.toLowerCase().trim());
    if (row.filter(Boolean).length < 2) continue;

    // Prioritize explicit Bem / Descrição columns before falling back to Grupo / Classe
    let dCol = row.findIndex((c) =>
      /^(bem|bens|descri[cç][aã]o|descri[cç][aã]o\s+do\s+bem|especifica[cç][aã]o)$/i.test(c)
    );
    if (dCol === -1) {
      dCol = row.findIndex((c) =>
        /\b(descri[cç][aã]o|bem|bens|ativo|imobilizado|equipamento|objeto|especifica[cç][aã]o)\b/i.test(c) &&
        !/conta|dep|acum|in[ií]cio|grupo|classe/i.test(c)
      );
    }

    const gCol = row.findIndex((c) => /^grupo\b|grupo\s*(cont[aá]bil|do\s*bem)/i.test(c));
    const clCol = row.findIndex((c) => /^classe\b|classe\s*(cont[aá]bil|do\s*bem)/i.test(c));

    // Value column: highest priority to Custo base / Valor aquisição, never date/dep/residual/conta
    let vCol = row.findIndex(
      (c) =>
        /custo\s*base|(valor|vlr).*(aquisi|compra|original|bruto|bem|total|cont[aá]bil)/i.test(c) &&
        !/\bdata\b|\bdt\b|deprec|acumulad|residual|l[ií]quido|taxa|al[ií]quota|quota|conta|meses/i.test(c)
    );
    if (vCol === -1) {
      vCol = row.findIndex(
        (c) =>
          /\b(valor|vlr|custo|montante|pre[cç]o)\b/i.test(c) &&
          !/\bdata\b|\bdt\b|deprec|acumulad|residual|l[ií]quido|taxa|al[ií]quota|quota|conta|meses|centro/i.test(c)
      );
    }

    if (dCol === -1 && gCol !== -1) {
      dCol = gCol;
    }

    let tCol = row.findIndex((c) =>
      /^(n[º°o]?|n[uú]mero|plaqueta|patrim[oô]nio|tombo|tag|c[oó]d\.?\s*bem|registro)$/i.test(c)
    );
    if (tCol === -1) {
      tCol = row.findIndex((c) => /plaqueta|patrim|tombo|\btag\b|c[oó]d\.?\s*bem|registro/i.test(c));
    }

    const yrCol = row.findIndex((c) => /^ano\b|ano\s*(aquisi|compra)/i.test(c));
    const mkCol = row.findIndex((c) => /marca[cç][aã]o/i.test(c));
    const ulyCol = row.findIndex((c) => /vida\s*[uú]til.*ano/i.test(c));
    const ulmCol = row.findIndex((c) => /vida\s*[uú]til.*m[eê]s/i.test(c));
    const ulgCol = row.findIndex((c) => /vida\s*[uú]til/i.test(c));
    const rtCol = row.findIndex((c) => /taxa|al[ií]quota|%\s*a\.?a|deprec.*%/i.test(c));
    const dsCol = row.findIndex((c) => /in[ií]cio.*deprec|deprec.*in[ií]cio/i.test(c));
    const adCol = row.findIndex((c) => /data.*(aquisi|compra|entrada|incorpora)|aquisi[cç][aã]o|\bdata\b/i.test(c));
    const tbCol = row.findIndex((c) => /balancete/i.test(c));
    const aaCol = row.findIndex((c) => /conta.*(imobilizado|ativo)/i.test(c));
    const caCol = row.findIndex((c) => /conta.*(dep|acum)/i.test(c));
    const daCol = row.findIndex((c) => /conta.*(despesa|d[eé]bito)/i.test(c));
    const stCol = row.findIndex((c) => /situa[cç][aã]o|\bstatus\b/i.test(c));
    const cCol = row.findIndex((c) => /centro.*custo|setor|departamento|[aá]rea|unidade|local/i.test(c));
    const sCol = row.findIndex((c) => /fornecedor|fabricante|marca\b|emitente/i.test(c) && !/marca[cç][aã]o/i.test(c));
    const nCol = row.findIndex((c) => /\b(nf|nf-e|nfe|nota\s*fiscal|n[º°o]?\s*nf)\b/i.test(c));
    const qCol = row.findIndex((c) => /\b(qtd|qtde|quant|quantidade)\b/i.test(c));

    // Distinguish Valor Residual (date-stamped NBV) vs undated Salvage Value
    const nbCol = row.findIndex(
      (c) =>
        (/valor\s*residual.*\d|valor\s*l[ií]quido|saldo\s*cont[aá]bil|\bvcl\b/i.test(c))
    );
    const svCol = row.findIndex(
      (c) =>
        /valor\s*residual/i.test(c) &&
        !/\d{2}\/\d{2}\/\d{4}|\d{4}|l[ií]quido/i.test(c)
    );

    const accCols: ColumnDateMeta[] = [];
    const mCols: ColumnDateMeta[] = [];
    const qCols: ColumnDateMeta[] = [];
    row.forEach((c, idx) => {
      if ((/dep\.?\s*acum|deprecia[cç][aã]o\s*acumulad/i.test(c)) && !/conta/i.test(c)) {
        accCols.push({ colIndex: idx, header: rawRow[idx], isoDate: parseDateFromHeader(rawRow[idx]) });
      }
      if (/meses\s*(at[eé]|deprec|decorrido)/i.test(c)) {
        mCols.push({ colIndex: idx, header: rawRow[idx], isoDate: parseDateFromHeader(rawRow[idx]) });
      }
      if (/^\s*quota\b|\bquota\b|\bcota\s*(de|mensal|trim|sem)/i.test(c)) {
        qCols.push({ colIndex: idx, header: rawRow[idx], isoDate: parseDateFromHeader(rawRow[idx]) });
      }
    });

    let score = 0;
    if (dCol !== -1) score += 3;
    if (vCol !== -1) score += 3;
    if (tCol !== -1) score += 1;
    if (gCol !== -1) score += 1;
    if (clCol !== -1) score += 1;
    if (rtCol !== -1) score += 1;
    if (dsCol !== -1 || adCol !== -1) score += 1;
    if (aaCol !== -1) score += 2;
    if (caCol !== -1) score += 2;
    if (accCols.length > 0) score += 2;
    if (stCol !== -1) score += 1;

    if (dCol !== -1 && vCol !== -1 && score > bestScore) {
      bestScore = score;
      bestRow = r;
      tagCol = tCol;
      groupCol = gCol;
      descCol = dCol;
      yearCol = yrCol;
      markingCol = mkCol;
      classCol = clCol;
      usefulLifeYearsCol = ulyCol;
      usefulLifeMonthsCol = ulmCol;
      usefulLifeGenericCol = ulgCol;
      rateCol = rtCol;
      depStartCol = dsCol;
      acqDateCol = adCol;
      valCol = vCol;
      salvageValCol = svCol;
      nbvCol = nbCol;
      trialBalanceCol = tbCol;
      assetAccountCol = aaCol;
      creditAccountCol = caCol;
      debitAccountCol = daCol;
      statusCol = stCol;
      ccCol = cCol;
      supplierCol = sCol;
      nfCol = nCol;
      qtyCol = qCol;
      depAccumCols = accCols.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
      depMonthsCols = mCols.sort((a, b) => (a.isoDate || '').localeCompare(b.isoDate || ''));
      quotaCols = qCols;
    }
  }

  if (bestRow === -1 && table.role !== 'summary' && table.role !== 'other') {
    return [];
  }

  const startRow = bestRow >= 0 ? bestRow + 1 : 0;

  for (let r = startRow; r < table.rows.length; r++) {
    const row = table.rows[r];
    let description = descCol >= 0 ? (row[descCol] || '').trim() : '';
    const rawValCell = valCol >= 0 ? (row[valCol] || '').trim() : '';
    let val = valCol >= 0 ? parseBrazilianNumber(rawValCell) : 0;

    if (!description && bestRow === -1) {
      const textCells = row.filter(
        (c) => /[a-zA-ZÀ-ÿ]{4,}/.test(c) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c) && !isTotalOrHeaderNoiseRow(c)
      );
      description = textCells.sort((a, b) => b.length - a.length)[0] || '';
    }
    if (val <= 0 && bestRow === -1) {
      const numericVals = row.map((c) => parseBrazilianNumber(c)).filter((n) => n >= 50);
      if (numericVals.length > 0) val = Math.max(...numericVals);
    }

    if (isTotalOrHeaderNoiseRow(description)) continue;
    if (val < 10) continue;

    const assetGroup = groupCol >= 0 ? (row[groupCol] || '').trim() : undefined;
    const assetClass = classCol >= 0 ? (row[classCol] || '').trim() : undefined;
    const marking = markingCol >= 0 ? (row[markingCol] || '').trim() : undefined;

    const yearRaw = yearCol >= 0 ? Math.round(parseBrazilianNumber(row[yearCol])) : 0;
    const acquisitionYear = yearRaw >= 1950 && yearRaw <= 2100 ? yearRaw : undefined;

    const depStartRaw = depStartCol >= 0 ? (row[depStartCol] || '').trim() : '';
    const acqDateRaw = acqDateCol >= 0 ? (row[acqDateCol] || '').trim() : '';
    const depreciationStartDate = depStartRaw
      ? normalizeDateIso(depStartRaw, acquisitionYear)
      : acqDateRaw
        ? normalizeDateIso(acqDateRaw, acquisitionYear)
        : acquisitionYear
          ? `${acquisitionYear}-01-01`
          : undefined;
    const acquisitionDate = acqDateRaw
      ? normalizeDateIso(acqDateRaw, acquisitionYear)
      : depreciationStartDate;

    let usefulLifeYears: number | undefined;
    let usefulLifeMonths: number | undefined;
    if (usefulLifeYearsCol >= 0) {
      const y = parseBrazilianNumber(row[usefulLifeYearsCol]);
      if (y > 0) {
        usefulLifeYears = y;
        usefulLifeMonths = Math.round(y * 12);
      }
    } else if (usefulLifeMonthsCol >= 0) {
      const m = parseBrazilianNumber(row[usefulLifeMonthsCol]);
      if (m > 0) {
        usefulLifeMonths = Math.round(m);
        usefulLifeYears = Math.round((m / 12) * 10) / 10;
      }
    } else if (usefulLifeGenericCol >= 0) {
      const n = parseBrazilianNumber(row[usefulLifeGenericCol]);
      if (n > 0) {
        if (n <= 40) {
          usefulLifeYears = n;
          usefulLifeMonths = Math.round(n * 12);
        } else {
          usefulLifeMonths = Math.round(n);
          usefulLifeYears = Math.round((n / 12) * 10) / 10;
        }
      }
    }

    const rateRaw = rateCol >= 0 ? parseBrazilianNumber(row[rateCol]) : 0;
    const rateNormalized =
      rateRaw === 1 && (usefulLifeYears === 1 || usefulLifeMonths === 12)
        ? 100
        : rateRaw > 0 && rateRaw < 1
          ? Math.round(rateRaw * 10000) / 100
          : rateRaw;

    // Collect accumulated depreciation milestones & pick latest date column
    let accumulatedDepreciation: number | undefined;
    let accumulatedDepreciationDate: string | undefined;
    const historyParts: string[] = [];

    if (depAccumCols.length > 0) {
      for (const colMeta of depAccumCols) {
        const cellText = (row[colMeta.colIndex] || '').trim();
        if (!cellText) continue;
        const amt = parseBrazilianNumber(cellText);
        const dateTag = colMeta.isoDate
          ? colMeta.isoDate.split('-').reverse().join('/')
          : colMeta.header;
        historyParts.push(`${dateTag}: R$ ${amt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        accumulatedDepreciation = amt;
        accumulatedDepreciationDate = colMeta.isoDate;
      }
    }

    let accumulatedDepreciationMonths: number | undefined;
    if (depMonthsCols.length > 0) {
      for (const mMeta of depMonthsCols) {
        const cellText = (row[mMeta.colIndex] || '').trim();
        if (!cellText) continue;
        accumulatedDepreciationMonths = Math.max(0, Math.round(parseBrazilianNumber(cellText)));
      }
    }

    let lastPeriodQuota: number | undefined;
    if (quotaCols.length > 0) {
      for (const qMeta of quotaCols) {
        const cellText = (row[qMeta.colIndex] || '').trim();
        if (!cellText) continue;
        lastPeriodQuota = parseBrazilianNumber(cellText);
      }
    }

    const netBookValueImported =
      nbvCol >= 0 && (row[nbvCol] || '').trim() !== ''
        ? Math.max(0, parseBrazilianNumber(row[nbvCol]))
        : undefined;

    const residualValue =
      salvageValCol >= 0 && (row[salvageValCol] || '').trim() !== ''
        ? Math.max(0, parseBrazilianNumber(row[salvageValCol]))
        : 0;

    const postToTrialBalance =
      trialBalanceCol >= 0 ? parseBooleanPt(row[trialBalanceCol] || '') : undefined;

    const status = statusCol >= 0 ? parseAssetStatus(row[statusCol] || '') : 'ativo';
    const qtyRaw = qtyCol >= 0 ? parseBrazilianNumber(row[qtyCol]) : 1;

    const assetAccount = assetAccountCol >= 0 ? (row[assetAccountCol] || '').trim() : undefined;
    const creditAccount = creditAccountCol >= 0 ? (row[creditAccountCol] || '').trim() : undefined;
    const debitAccount = debitAccountCol >= 0 ? (row[debitAccountCol] || '').trim() : undefined;

    const costCenterVal = ccCol >= 0 ? (row[ccCol] || '').trim() : '';

    found.push(
      buildNormalizedCandidate(
        {
          description,
          tagNumber: tagCol >= 0 ? row[tagCol] : '',
          assetGroup,
          assetClass,
          marking,
          acquisitionYear,
          acquisitionDate,
          depreciationStartDate,
          acquisitionValue: val,
          residualValue,
          accumulatedDepreciation,
          accumulatedDepreciationDate,
          accumulatedDepreciationMonths,
          lastPeriodQuota,
          netBookValueImported,
          depreciationHistoryNote: historyParts.length > 0 ? historyParts.join(' | ') : undefined,
          annualRate: rateNormalized > 0 ? rateNormalized : undefined,
          usefulLifeMonths,
          usefulLifeYears,
          postToTrialBalance,
          status,
          assetAccount: assetAccount || undefined,
          creditAccount: creditAccount || undefined,
          debitAccount: debitAccount || undefined,
          costCenter: costCenterVal || marking || undefined,
          supplier: supplierCol >= 0 ? row[supplierCol] : undefined,
          invoiceNumber: nfCol >= 0 ? row[nfCol] : undefined,
          quantity: qtyRaw > 1 ? Math.round(qtyRaw) : 1,
          sourceSheet: table.name,
          sourceRow: r + 1,
          isSummaryEntry: table.role === 'summary',
          confidence: table.role === 'summary' ? 84 : 96,
          aiReason: `Leitura completa da aba "${table.name}" (linha ${r + 1})${
            accumulatedDepreciation !== undefined
              ? ` com Dep. Acumulada de R$ ${accumulatedDepreciation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${
                  accumulatedDepreciationDate ? ` em ${accumulatedDepreciationDate.split('-').reverse().join('/')}` : ''
                }`
              : ''
          }.`,
        },
        startIndexOffset + found.length
      )
    );
  }

  return found;
}

/**
 * Prioriza a 1ª aba da planilha quando ela possui cabeçalho estruturado de bens (lendo 100% das linhas e colunas).
 * Caso a 1ª aba seja apenas capa/parâmetros, percorre as demais abas de inventário ou resumidas.
 */
function parseSheetsDeterministically(tables: ParsedSheetTable[]): {
  candidates: ExtractedAssetCandidate[];
  primarySheetUsed?: string;
} {
  if (tables.length === 0) return { candidates: [] };

  // 1. Tenta ler integralmente a 1ª aba não-parâmetro (normalmente tables[0])
  const firstCandidateTab =
    tables[0].role !== 'parameter' ? tables[0] : tables.find((t) => t.role !== 'parameter');

  if (firstCandidateTab) {
    const firstAssets = extractStructuredTableAssets(firstCandidateTab, 0);
    if (firstAssets.length > 0) {
      return { candidates: firstAssets, primarySheetUsed: firstCandidateTab.name };
    }
  }

  // 2. Fallback: percorre demais abas de inventário/outras
  const candidates: ExtractedAssetCandidate[] = [];
  const nonParamTables = tables.filter((t) => t.role !== 'parameter');
  const inventoryTables = nonParamTables.filter((t) => t.role === 'inventory');
  const otherTables = nonParamTables.filter((t) => t.role === 'other');
  const summaryTables = nonParamTables.filter((t) => t.role === 'summary');

  for (const t of [...inventoryTables, ...otherTables]) {
    if (firstCandidateTab && t.name === firstCandidateTab.name) continue;
    candidates.push(...extractStructuredTableAssets(t, candidates.length));
  }

  // 3. Se não houver bens analíticos, lê abas resumidas
  if (candidates.length === 0) {
    for (const t of summaryTables) {
      candidates.push(...extractStructuredTableAssets(t, candidates.length));
    }
  }

  return { candidates };
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
      description: 'Lista completa de bens do ativo imobilizado encontrados para conferência um a um.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'Descrição completa do bem ou grupo resumido.' },
          tagNumber: { type: Type.STRING, description: 'Número da plaqueta/patrimônio ou código se existir.' },
          assetGroup: { type: Type.STRING, description: 'Grupo contábil informado (ex: Veículos, Máquinas).' },
          assetClass: { type: Type.STRING, description: 'Classe do bem informada se houver.' },
          marking: { type: Type.STRING, description: 'Marcação/tag auxiliar (ex: AVR, MV).' },
          category: {
            type: Type.STRING,
            description: 'Categoria contábil: edificacoes, maquinas, veiculos, moveis, ti, software, ferramentas, instalacoes ou outro.',
          },
          acquisitionDate: { type: Type.STRING, description: 'Data de aquisição ou início de depreciação em YYYY-MM-DD.' },
          depreciationStartDate: { type: Type.STRING, description: 'Data de início da depreciação em YYYY-MM-DD.' },
          acquisitionValue: { type: Type.NUMBER, description: 'Custo base / valor bruto de aquisição em reais.' },
          residualValue: { type: Type.NUMBER, description: 'Valor residual final de vida útil (0 se não houver).' },
          accumulatedDepreciation: { type: Type.NUMBER, description: 'Depreciação acumulada já existente informada na planilha.' },
          accumulatedDepreciationDate: { type: Type.STRING, description: 'Data de corte da depreciação acumulada em YYYY-MM-DD.' },
          annualRate: { type: Type.NUMBER, description: 'Taxa anual de depreciação % (ex: 4, 10, 20).' },
          usefulLifeMonths: { type: Type.NUMBER, description: 'Vida útil total em meses.' },
          assetAccount: { type: Type.STRING, description: 'Conta contábil do imobilizado.' },
          creditAccount: { type: Type.STRING, description: 'Conta contábil de depreciação acumulada.' },
          costCenter: { type: Type.STRING, description: 'Centro de custo, setor ou departamento se informado.' },
          location: { type: Type.STRING, description: 'Localização ou filial se informada.' },
          supplier: { type: Type.STRING, description: 'Fornecedor ou fabricante se informado.' },
          invoiceNumber: { type: Type.STRING, description: 'Número da NF se informado.' },
          sourceSheet: { type: Type.STRING, description: 'Nome exato da aba da planilha ou origem.' },
          sourceRow: { type: Type.NUMBER, description: 'Número aproximado da linha na aba.' },
          quantity: { type: Type.NUMBER, description: 'Quantidade de unidades se agrupado/resumido.' },
          isSummaryEntry: { type: Type.BOOLEAN, description: 'true se veio de uma aba resumida/sintética ou linha agrupada.' },
          confidence: { type: Type.NUMBER, description: 'Confiança de 0 a 100.' },
          aiReason: { type: Type.STRING, description: 'Explicação curta em português sobre onde foi encontrado e sua classificação.' },
        },
        required: ['description', 'category', 'acquisitionValue', 'annualRate'],
      },
    },
  },
  required: ['summaryText', 'assets'],
};

const ASSET_CATEGORY_ENRICH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    classifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          category: { type: Type.STRING },
        },
        required: ['key', 'category'],
      },
    },
  },
  required: ['classifications'],
};

const ASSET_EXTRACTION_PROMPT = `Você é um auditor contábil especialista em Ativo Imobilizado (CPC 27 / IFRS / RFB Brasil).
Analise o conteúdo enviado para identificar TODOS os bens reais candidatos a cadastro no módulo de Ativo Imobilizado.

REGRAS CRÍTICAS:
1. Foque nas abas de inventário/bens (ex: "Relatorio_Bens", "Bens", "Ativo", "Inventário") ou em abas resumidas de bens quando não houver analítico.
2. NÃO extraia linhas de abas auxiliares de parâmetros/regras (ex: "Premissas", "Taxas") nem lançamentos contábeis de diário ("Resumo_Lancamentos").
3. NÃO extraia cards/legendas/totais ("Em depreciação: 1", "TOTAL GERAL").
4. Extraia também Depreciação Acumulada já existente, data de corte, contas contábeis e situação quando presentes.
5. Para NF-e / PDFs / imagens, extraia cada equipamento, veículo, móvel ou computador relevante separadamente.`;

function formatFriendlyAiWarning(err: any): string {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  if (
    err?.status === 503 ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return 'O modelo de IA está temporariamente com pico de demanda. Aplicamos a leitura estruturada completa automaticamente para você revisar um a um.';
  }
  if (err?.status === 429 || lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return 'Cota temporária da IA atingida; leitura estruturada completa aplicada automaticamente.';
  }
  if (lower.includes('api_key') || lower.includes('permission_denied') || lower.includes('não configurada')) {
    return 'Chave de IA indisponível no momento; leitura estruturada completa aplicada automaticamente.';
  }
  return 'Leitura estruturada inteligente aplicada automaticamente nas abas da planilha.';
}

function isRetryableGeminiError(err: any): boolean {
  const status = Number(err?.status || err?.code || 0);
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    status === 404 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('not found') ||
    msg.includes('timeout')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout após ${ms}ms (${label})`)), ms);
    }),
  ]);
}

async function callGeminiAssetExtractor(
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>
): Promise<{ summaryText: string; assets: any[]; warning?: string }> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }

  const attempts = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, delayMs: 0, timeoutMs: 12000 },
    { model: 'gemini-4-hydrogen', thinkingLevel: undefined, delayMs: 400, timeoutMs: 15000 },
  ];

  let lastErr: any;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
    }
    try {
      const config: Record<string, any> = {
        responseMimeType: 'application/json',
        responseSchema: ASSET_EXTRACTION_SCHEMA,
      };
      if (attempt.thinkingLevel !== undefined) {
        config.thinkingConfig = { thinkingLevel: attempt.thinkingLevel };
      }

      const response = await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: { parts },
          config,
        }),
        attempt.timeoutMs,
        attempt.model
      );

      const rawText = (response.text || '{}').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(rawText);
      return {
        summaryText: String(parsed.summaryText || ''),
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      };
    } catch (err: any) {
      lastErr = err;
      if (isRetryableGeminiError(err)) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Classifica com IA apenas os itens cuja categoria não pôde ser inferida por palavras-chave,
 * preservando 100% dos números, datas, contas e depreciação acumulada já extraídos.
 */
async function enrichUnclassifiedCategoriesWithAi(
  candidates: ExtractedAssetCandidate[]
): Promise<{ candidates: ExtractedAssetCandidate[]; usedAi: boolean }> {
  const unclassified = candidates.filter((c) => c.category === 'outro');
  if (unclassified.length === 0) {
    return { candidates, usedAi: false };
  }
  const ai = getAiClient();
  if (!ai) {
    return { candidates, usedAi: false };
  }

  const uniqueKeys = Array.from(
    new Set(
      unclassified.map((c) =>
        [c.assetGroup, c.assetClass, c.description].filter(Boolean).join(' | ').slice(0, 120)
      )
    )
  ).slice(0, 40);

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            {
              text: `Classifique cada item do Ativo Imobilizado em UMA categoria CPC 27 válida: edificacoes, maquinas, veiculos, moveis, ti, software, ferramentas, instalacoes, outro.\nItens:\n${uniqueKeys.map((k) => `- ${k}`).join('\n')}`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: ASSET_CATEGORY_ENRICH_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      }),
      8000,
      'category-enrich'
    );

    const parsed = JSON.parse((response.text || '{}').replace(/```json|```/g, '').trim());
    const map = new Map<string, Asset['category']>();
    for (const entry of parsed.classifications || []) {
      const cat = String(entry.category || '').toLowerCase().trim() as Asset['category'];
      if (VALID_CATEGORIES.includes(cat)) {
        map.set(String(entry.key || ''), cat);
      }
    }

    if (map.size === 0) return { candidates, usedAi: false };

    const updated = candidates.map((c) => {
      if (c.category !== 'outro') return c;
      const key = [c.assetGroup, c.assetClass, c.description].filter(Boolean).join(' | ').slice(0, 120);
      const suggested = map.get(key);
      if (!suggested || suggested === 'outro') return c;
      return {
        ...c,
        category: suggested,
        categoryLabel: CATEGORY_DEFAULTS[suggested].label,
      };
    });
    return { candidates: updated, usedAi: true };
  } catch {
    return { candidates, usedAi: false };
  }
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

    const { candidates: structuredAssets, primarySheetUsed } = parseSheetsDeterministically(tables);

    // Se a 1ª aba (ou abas estruturadas) trouxe TODOS os bens com cabeçalho completo,
    // nunca truncamos nem substituímos os números/datas/contas por resposta parcial da IA.
    if (structuredAssets.length > 0 && primarySheetUsed) {
      const enriched = await enrichUnclassifiedCategoriesWithAi(structuredAssets);
      const hasAccDepCount = enriched.candidates.filter((c) => (c.accumulatedDepreciation || 0) > 0).length;

      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed,
        candidates: enriched.candidates,
        usedAi: enriched.usedAi,
        usedFallback: false,
        summaryText: `1ª aba "${primarySheetUsed}" lida integralmente: ${enriched.candidates.length} bem(ns) com todas as colunas contábeis${
          hasAccDepCount > 0 ? ` (${hasAccDepCount} com depreciação acumulada anterior)` : ''
        }.`,
      };
    }

    // Fallback IA completa quando a planilha não tem cabeçalho tabular padrão
    const hasInventoryTab = tables.some((t) => t.role === 'inventory' || t.role === 'summary');
    const promptTables = hasInventoryTab
      ? tables.filter((t) => t.role !== 'parameter' && t.role !== 'journal')
      : tables;
    const effectivePromptTables = promptTables.length > 0 ? promptTables : tables;
    const combinedText = effectivePromptTables.map((t) => t.textDump).join('\n\n').slice(0, 65000);

    try {
      const aiRes = await callGeminiAssetExtractor([
        {
          text: `${ASSET_EXTRACTION_PROMPT}\n\nARQUIVO: ${cleanName}\nABAS ANALISADAS: ${effectivePromptTables.map((t) => t.name).join(', ')}\n\n${combinedText}`,
        },
      ]);

      const normalizedAi = (aiRes.assets || [])
        .map((item, idx) => buildNormalizedCandidate(item, idx))
        .filter((c) => !isTotalOrHeaderNoiseRow(c.description) && c.acquisitionValue > 0);

      const finalCandidates =
        normalizedAi.length >= structuredAssets.length && normalizedAi.length > 0
          ? normalizedAi
          : structuredAssets;

      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed,
        candidates: finalCandidates,
        usedAi: finalCandidates === normalizedAi && normalizedAi.length > 0,
        usedFallback: finalCandidates === structuredAssets && structuredAssets.length > 0,
        summaryText:
          aiRes.summaryText ||
          `Foram analisadas ${tables.length} aba(s) e identificados ${finalCandidates.length} bem(ns) para revisão um a um.`,
      };
    } catch (err: any) {
      return {
        fileName: cleanName,
        fileType: 'spreadsheet',
        sheetsAnalyzed,
        candidates: structuredAssets,
        usedAi: false,
        usedFallback: true,
        aiWarning: formatFriendlyAiWarning(err),
        summaryText: `Planilha lida (${tables.length} aba(s)) com extrator contábil: ${structuredAssets.length} bem(ns) localizado(s) para revisão um a um.`,
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
        aiWarning: formatFriendlyAiWarning(err),
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
        aiWarning: formatFriendlyAiWarning(err),
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
      aiWarning: formatFriendlyAiWarning(err),
      summaryText: 'Não foi possível identificar bens automaticamente neste arquivo.',
    };
  }
}
