import { Company } from '../types';

export interface CompanyMatchInput {
  companies: Company[];
  currentCompanyId?: string;
  detectedCnpj?: string;
  allDetectedCnpjs?: string[];
  detectedCompanyName?: string;
  issuerOrBank?: string;
  summary?: string;
  fileName?: string;
  textPreview?: string;
}

export interface CompanyMatchResult {
  company?: Company;
  matchedBy?: 'cnpj' | 'name';
  matchedValue?: string;
}

function normalizeText(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCorporateSuffixes(value: string): string {
  return value
    .replace(/\b(ltda|me|epp|eireli|s a|sa|ss|mei|slu|consultoria|comercio|servicos|industria)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCnpjDigitsFromText(text?: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  const seen = new Set<string>();

  // Formatted CNPJs (00.000.000/0001-00 or partial punctuation)
  const formatted = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [];
  for (const m of formatted) {
    const digits = m.replace(/\D/g, '');
    if (digits.length === 14 && !seen.has(digits)) {
      seen.add(digits);
      matches.push(digits);
    }
  }

  // Raw 14-digit CNPJs inside XML tags (<CNPJ>12345678000190</CNPJ>) or explicit CNPJ labels
  const tagMatches = text.match(/(?:<CNPJ[^>]*>|cnpj[^0-9]{0,8})(\d{14})/gi) || [];
  for (const tm of tagMatches) {
    const digits = tm.replace(/\D/g, '');
    if (digits.length === 14 && !seen.has(digits)) {
      seen.add(digits);
      matches.push(digits);
    }
  }

  return matches;
}

export function formatCnpjDigits(digits: string): string {
  const clean = (digits || '').replace(/\D/g, '');
  if (clean.length !== 14) return digits;
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function matchRegisteredCompanyFromMetadata(
  input: CompanyMatchInput
): CompanyMatchResult {
  const { companies } = input;
  if (!Array.isArray(companies) || companies.length === 0) return {};

  // Prioritize client companies before comp-master so documents mentioning both
  // accounting firm and client company get filed into the client's Explorer folder.
  const orderedCompanies = [
    ...companies.filter((c) => c.id !== 'comp-master'),
    ...companies.filter((c) => c.id === 'comp-master'),
  ];

  // 1. Exact 14-digit CNPJ match
  const candidateDigits: string[] = [];
  const pushDigits = (list: string[]) => {
    for (const d of list) {
      if (d.length === 14 && !candidateDigits.includes(d)) {
        candidateDigits.push(d);
      }
    }
  };

  if (input.detectedCnpj) pushDigits(extractCnpjDigitsFromText(input.detectedCnpj));
  if (Array.isArray(input.allDetectedCnpjs)) {
    for (const c of input.allDetectedCnpjs) pushDigits(extractCnpjDigitsFromText(c));
  }
  if (input.textPreview) pushDigits(extractCnpjDigitsFromText(input.textPreview));
  if (input.summary) pushDigits(extractCnpjDigitsFromText(input.summary));
  if (input.fileName) pushDigits(extractCnpjDigitsFromText(input.fileName));

  for (const digits of candidateDigits) {
    const match = orderedCompanies.find(
      (c) => (c.cnpj || '').replace(/\D/g, '') === digits
    );
    if (match) {
      return {
        company: match,
        matchedBy: 'cnpj',
        matchedValue: formatCnpjDigits(digits),
      };
    }
  }

  // 2. Company Fantasy Name or Legal Name match
  const haystackRaw = [
    input.detectedCompanyName,
    input.issuerOrBank,
    input.summary,
    input.fileName,
    input.textPreview?.slice(0, 4000),
  ]
    .filter(Boolean)
    .join(' ');
  const haystack = normalizeText(haystackRaw);

  if (haystack.length >= 3) {
    for (const comp of orderedCompanies) {
      const variants = [
        normalizeText(comp.fantasyName),
        normalizeText(comp.name),
        stripCorporateSuffixes(normalizeText(comp.fantasyName)),
        stripCorporateSuffixes(normalizeText(comp.name)),
      ].filter((v) => v.length >= 4);

      for (const variant of variants) {
        if (haystack.includes(variant)) {
          return {
            company: comp,
            matchedBy: 'name',
            matchedValue: comp.fantasyName || comp.name,
          };
        }
      }
    }
  }

  return {};
}
