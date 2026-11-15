import { PDFDocument } from 'pdf-lib';
import { DocumentCategory } from '../types';
import { uint8ToBase64 } from './fileStorage';

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

export interface SplitPdfGroup {
  category: DocumentCategory;
  groupLabel: string;
  pageNumbers: number[];
  fileName: string;
  file: File;
  base64: string;
  mimeType: 'application/pdf';
  fileSize: number;
  competenceMonth: string;
  issuerOrBank?: string;
  documentDate?: string;
  documentNumber?: string;
  amount?: number;
  detectedCnpj?: string;
  summary: string;
  aiClassified: boolean;
}

export interface PdfSplitResult {
  totalPages: number;
  wasSplit: boolean;
  groups: SplitPdfGroup[];
}

const CATEGORY_FILE_SUFFIX: Record<DocumentCategory, string> = {
  extrato: 'Extrato_Bancario',
  comprovante: 'Recibos_Comprovantes',
  nota_fiscal: 'Notas_Fiscais',
  guia_imposto: 'Guias_Impostos',
  folha_contrato: 'Folha_Contratos',
  outro: 'Outros_Documentos',
};

const CATEGORY_GROUP_LABEL: Record<DocumentCategory, string> = {
  extrato: 'Extrato Bancário',
  comprovante: 'Recibos e Comprovantes de Pagamento',
  nota_fiscal: 'Notas Fiscais',
  guia_imposto: 'Guias e Impostos',
  folha_contrato: 'Folha e Contratos',
  outro: 'Outros Documentos',
};

function sanitizeFileBase(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[^\w\-.]+/g, '_').slice(0, 80) || 'documento';
}

export async function splitAndClassifyPdfFile(
  file: File,
  fullBase64: string,
  onStatus?: (message: string) => void
): Promise<PdfSplitResult | null> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return null;

  let srcDoc: PDFDocument;
  try {
    const ab = await file.arrayBuffer();
    srcDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
  } catch (err) {
    console.warn('[PDF-SPLIT] Não foi possível abrir PDF com pdf-lib:', err);
    return null;
  }

  const totalPages = srcDoc.getPageCount();
  if (totalPages <= 1) {
    return null;
  }

  onStatus?.(`Analisando ${totalPages} páginas para separar extratos e recibos...`);

  const MAX_CHUNK_BASE64 = 2_000_000;
  const MAX_PAGES_PER_CALL = 5;

  const buildSliceBase64 = async (startZero: number, endZero: number): Promise<string> => {
    const subDoc = await PDFDocument.create();
    const indices: number[] = [];
    for (let i = startZero; i <= endZero; i++) indices.push(i);
    const copied = await subDoc.copyPages(srcDoc, indices);
    copied.forEach((p) => subDoc.addPage(p));
    const bytes = await subDoc.save();
    return uint8ToBase64(bytes);
  };

  const ranges: { startZero: number; endZero: number; b64: string }[] = [];
  const pushAdaptiveRange = async (startZero: number, endZero: number) => {
    const b64 = await buildSliceBase64(startZero, endZero);
    if (b64.length <= MAX_CHUNK_BASE64 || startZero === endZero) {
      ranges.push({ startZero, endZero, b64 });
      return;
    }
    const mid = Math.floor((startZero + endZero) / 2);
    await pushAdaptiveRange(startZero, mid);
    await pushAdaptiveRange(mid + 1, endZero);
  };

  for (let i = 0; i < totalPages; i += MAX_PAGES_PER_CALL) {
    await pushAdaptiveRange(i, Math.min(i + MAX_PAGES_PER_CALL - 1, totalPages - 1));
  }

  const allPages: PageClassificationItem[] = [];
  for (const r of ranges) {
    const chunkCount = r.endZero - r.startZero + 1;
    onStatus?.(
      `Identificando tipo de documento nas páginas ${r.startZero + 1}–${r.endZero + 1} de ${totalPages}...`
    );
    try {
      const res = await fetch('/api/documents/analyze-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          base64Data: r.b64,
          pageCount: chunkCount,
          startPageNumber: r.startZero + 1,
        }),
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data?.pages) && data.pages.length > 0) {
          allPages.push(...data.pages);
          continue;
        }
      }
    } catch (err) {
      console.warn('[PDF-SPLIT] Erro na API analyze-pages:', err);
    }

    // Fallback if endpoint call failed
    for (let p = r.startZero + 1; p <= r.endZero + 1; p++) {
      allPages.push({
        pageNumber: p,
        category: 'extrato',
        groupLabel: CATEGORY_GROUP_LABEL.extrato,
        competenceMonth: new Date().toISOString().slice(0, 7),
        summary: 'Documento multipágina importado.',
        aiClassified: false,
      });
    }
  }

  // Group pages by document category so extratos are ALWAYS separated from comprovantes/recibos/NFs
  const bucketMap = new Map<DocumentCategory, PageClassificationItem[]>();
  for (const p of allPages) {
    const list = bucketMap.get(p.category) || [];
    list.push(p);
    bucketMap.set(p.category, list);
  }

  // If all pages belong to a single category, no file splitting needed
  if (bucketMap.size <= 1) {
    const onlyCategory = allPages[0]?.category || 'outro';
    const first = allPages[0];
    const issuers = Array.from(new Set(allPages.map((x) => x.issuerOrBank).filter(Boolean)));
    const totalAmt = allPages.reduce((sum, x) => sum + (x.amount || 0), 0);
    return {
      totalPages,
      wasSplit: false,
      groups: [
        {
          category: onlyCategory,
          groupLabel: first?.groupLabel || CATEGORY_GROUP_LABEL[onlyCategory],
          pageNumbers: allPages.map((p) => p.pageNumber),
          fileName: file.name,
          file,
          base64: fullBase64,
          mimeType: 'application/pdf',
          fileSize: file.size,
          competenceMonth: first?.competenceMonth || new Date().toISOString().slice(0, 7),
          issuerOrBank: issuers[0] || first?.issuerOrBank,
          documentDate: first?.documentDate,
          documentNumber: first?.documentNumber,
          amount: totalAmt > 0 ? Number(totalAmt.toFixed(2)) : undefined,
          detectedCnpj: allPages.find((x) => x.detectedCnpj)?.detectedCnpj,
          summary:
            first?.summary ||
            `${CATEGORY_GROUP_LABEL[onlyCategory]} (${totalPages} páginas).`,
          aiClassified: allPages.some((x) => x.aiClassified),
        },
      ],
    };
  }

  // Mixed document detected! Always put 'extrato' first, then 'comprovante', etc.
  onStatus?.(`Separando ${bucketMap.size} grupos de documentos em PDFs independentes...`);
  const categoryOrder: DocumentCategory[] = [
    'extrato',
    'comprovante',
    'nota_fiscal',
    'guia_imposto',
    'folha_contrato',
    'outro',
  ];
  const sortedCategories = Array.from(bucketMap.keys()).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

  const baseName = sanitizeFileBase(file.name);
  const groups: SplitPdfGroup[] = [];

  for (const cat of sortedCategories) {
    const items = (bucketMap.get(cat) || []).sort((a, b) => a.pageNumber - b.pageNumber);
    const pageNums = items.map((i) => i.pageNumber);
    const zeroIndices = pageNums.map((n) => n - 1);

    const subPdf = await PDFDocument.create();
    const copiedPages = await subPdf.copyPages(srcDoc, zeroIndices);
    copiedPages.forEach((p) => subPdf.addPage(p));
    const subBytes = await subPdf.save();
    const subBase64 = uint8ToBase64(subBytes);

    const pagesLabel =
      pageNums.length === 1 ? `pág. ${pageNums[0]}` : `págs. ${pageNums.join(', ')}`;
    const groupFileName = `${baseName}__${CATEGORY_FILE_SUFFIX[cat]}.pdf`;
    const subBlob = new Blob([subBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const subFile = new File([subBlob], groupFileName, { type: 'application/pdf' });

    const firstItem = items[0];
    const issuers = Array.from(new Set(items.map((x) => x.issuerOrBank).filter(Boolean)));
    const totalAmt = items.reduce((sum, x) => sum + (x.amount || 0), 0);

    groups.push({
      category: cat,
      groupLabel: `${CATEGORY_GROUP_LABEL[cat]} (${pagesLabel})`,
      pageNumbers: pageNums,
      fileName: groupFileName,
      file: subFile,
      base64: subBase64,
      mimeType: 'application/pdf',
      fileSize: subBytes.byteLength,
      competenceMonth: firstItem?.competenceMonth || new Date().toISOString().slice(0, 7),
      issuerOrBank: issuers.slice(0, 2).join(' / ') || firstItem?.issuerOrBank,
      documentDate: firstItem?.documentDate,
      documentNumber: firstItem?.documentNumber,
      amount: totalAmt > 0 ? Number(totalAmt.toFixed(2)) : undefined,
      detectedCnpj: items.find((x) => x.detectedCnpj)?.detectedCnpj,
      summary: `${CATEGORY_GROUP_LABEL[cat]} extraído de "${file.name}" (${pagesLabel}). ${
        firstItem?.summary || ''
      }`.slice(0, 240),
      aiClassified: items.some((x) => x.aiClassified),
    });
  }

  return {
    totalPages,
    wasSplit: groups.length > 1,
    groups,
  };
}
