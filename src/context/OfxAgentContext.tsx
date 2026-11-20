import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  Company,
  CompanyDocument,
  ConvertedStatement,
  DocumentCategory,
  DocumentOfxStatus,
  OfxAgentScheduleMode,
  User,
} from '../types';
import {
  base64ToUint8Array,
  cleanBase64,
  getBlobFromIdb,
  readFileAsBase64,
  saveBlobToIdb,
  uint8ToBase64,
} from '../utils/fileStorage';
import { splitAndClassifyPdfFile } from '../utils/pdfSplitter';
import {
  fetchDocumentsFromFirestore,
  saveDocumentToFirestore,
  saveStatementToFirestore,
} from '../firebase/service';

export interface DocOfxJobState {
  docId: string;
  companyId: string;
  fileName: string;
  status: DocumentOfxStatus;
  totalPages: number;
  processedPages: number;
  foundTransactions: number;
  statusLabel: string;
  statementId?: string;
  error?: string;
}

export interface ManualOfxJobState {
  status: 'idle' | 'processing' | 'done' | 'error';
  companyId: string;
  fileName: string;
  totalPages: number;
  processedPages: number;
  foundTransactions: number;
  statusLabel: string;
  result?: ConvertedStatement;
  error?: string;
  splitInfoMessage?: string;
  unregisteredPrompt?: {
    cnpj?: string;
    companyName?: string;
    pendingStatement?: ConvertedStatement;
  } | null;
  updatedAt: string;
}

export interface DocProcessingJobState {
  docId: string;
  companyId: string;
  fileName: string;
  category: DocumentCategory;
  status: 'queued' | 'processing' | 'done' | 'error';
  statusLabel: string;
  accountingNotes?: string;
  error?: string;
}

interface AgentConfig {
  autoRunEnabled: boolean;
  scheduleMode: OfxAgentScheduleMode;
  lastSweepAt: string | null;
  nextSweepAt: string | null;
}

interface OfxAgentContextValue {
  autoRunEnabled: boolean;
  scheduleMode: OfxAgentScheduleMode;
  lastSweepAt: string | null;
  nextSweepAt: string | null;
  setAutoRunEnabled: (enabled: boolean) => void;
  setScheduleMode: (mode: OfxAgentScheduleMode) => void;
  isSweeping: boolean;
  isProcessingOtherDocs: boolean;
  isConvertingBatchOfx: boolean;
  batchOfxProgress: { current: number; total: number; label: string } | null;
  activeQueueCount: number;
  activeDocProcessCount: number;
  docJobs: Record<string, DocOfxJobState>;
  docProcessJobs: Record<string, DocProcessingJobState>;
  manualJob: ManualOfxJobState | null;
  startManualOfxConversion: (params: {
    file: File;
    fileBase64: string;
    mimeType: string;
    accountingAccount?: string;
    companyId: string;
    sourceDocId?: string;
  }) => Promise<void>;
  clearManualJob: () => void;
  dismissUnregisteredPrompt: () => void;
  skipUnregisteredCompany: () => void;
  enqueueDocumentForOfx: (doc: CompanyDocument, preloadedBase64?: string) => void;
  enqueueNonExtratoProcessing: (doc: CompanyDocument, preloadedBase64?: string) => void;
  convertMultipleDocsToSingleOfx: (
    docs: CompanyDocument[],
    resolveBase64Fn?: (doc: CompanyDocument) => Promise<string | null>
  ) => Promise<ConvertedStatement | null>;
  runPendingSweep: (docsOverride?: CompanyDocument[]) => Promise<number>;
  runPendingNonExtratoSweep: (docsOverride?: CompanyDocument[]) => Promise<number>;
  lastDocumentPatch: { docId: string; patch: Partial<CompanyDocument>; ts: number } | null;
  recentStatements: ConvertedStatement[];
  markStatementDeleted: (statementId: string) => void;
  inboxConfigured: boolean;
  inboxEmailAddress: string;
  inboxLastSyncAt: string | null;
  isSyncingInbox: boolean;
  lastInboxSyncEventTs: number;
  syncEmailInboxNow: (opts?: { forceAllRecent?: boolean; silent?: boolean }) => Promise<number>;
}

const OfxAgentContext = createContext<OfxAgentContextValue | null>(null);

const CONFIG_STORAGE_KEY = 'contsuite_ofx_agent_config_v1';
const MANUAL_JOB_STORAGE_KEY = 'contsuite_manual_ofx_job_v1';

function cacheStatementLocally(companyId: string, stmt: ConvertedStatement) {
  if (!companyId || !stmt?.id) return;
  try {
    const key = `contsuite_cached_statements_${companyId}`;
    const raw = localStorage.getItem(key);
    const existing: ConvertedStatement[] = raw ? JSON.parse(raw) : [];
    const { fileBase64, ...compact } = stmt;
    const normalized: ConvertedStatement = {
      ...compact,
      companyId,
      hasOriginalFile: Boolean(fileBase64 || compact.hasOriginalFile || compact.sourceDocId),
    };
    const next = [normalized, ...existing.filter((s) => s.id !== normalized.id)].slice(0, 100);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

function computeNextSweep(mode: OfxAgentScheduleMode, fromIso: string | null): string | null {
  if (mode === 'on_upload') return null;
  const base = fromIso ? new Date(fromIso).getTime() : Date.now();
  const deltaMs = mode === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(base + deltaMs).toISOString();
}

async function parseSafeJson(res: Response): Promise<any> {
  const rawText = await res.text();
  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    if (res.status === 413) {
      throw new Error(
        'O bloco de páginas/arquivo excedeu o limite de envio (4,5 MB). Tente um arquivo menor.'
      );
    }
    if (res.status === 504 || res.status === 502) {
      throw new Error('O servidor demorou para responder (Timeout). Tente processar novamente.');
    }
    throw new Error(`Erro no servidor (${res.status}): ${rawText.slice(0, 140) || 'Resposta inválida.'}`);
  }
}

async function compressImageIfNeeded(
  b64: string,
  mime: string
): Promise<{ base64: string; mimeType: string }> {
  if (!mime.startsWith('image/') || b64.length < 1_400_000) {
    return { base64: b64, mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime };
  }
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Falha ao otimizar imagem'));
      img.src = `data:${mime};base64,${b64}`;
    });
    const maxDim = 1800;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { base64: b64, mimeType: mime };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const outUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { base64: outUrl.split(',')[1] || b64, mimeType: 'image/jpeg' };
  } catch {
    return { base64: b64, mimeType: mime };
  }
}

function buildFallbackExtractionFromDoc(doc: Partial<CompanyDocument>, fallbackName?: string) {
  const date =
    (doc.documentDate && /^\d{4}-\d{2}-\d{2}/.test(doc.documentDate) ? doc.documentDate.slice(0, 10) : '') ||
    (doc.competenceMonth && /^\d{4}-\d{2}/.test(doc.competenceMonth) ? `${doc.competenceMonth}-01` : '') ||
    new Date().toISOString().slice(0, 10);
  const amount = typeof doc.amount === 'number' && !isNaN(doc.amount) && doc.amount > 0 ? Math.abs(doc.amount) : 0;
  if (amount <= 0) return null;

  const prefix =
    doc.category === 'nota_fiscal'
      ? 'NF'
      : doc.category === 'guia_imposto'
        ? 'Guia'
        : doc.category === 'comprovante'
          ? 'Comprov.'
          : 'Doc.';
  const memoParts = [
    prefix,
    doc.documentNumber ? `Nº ${doc.documentNumber}` : '',
    doc.issuerOrBank || doc.fileName || fallbackName || 'Documento Fiscal',
  ].filter(Boolean);

  return {
    bankName: doc.issuerOrBank || 'Documentos Fiscais / Contábeis',
    bankCode: '000',
    agency: '0001',
    accountNumber: 'FISCAL-01',
    accountType: 'BUSINESS' as const,
    startDate: date,
    endDate: date,
    openingBalance: 0,
    closingBalance: -amount,
    transactions: [
      {
        date,
        type: 'DEBIT' as const,
        amount,
        memo: memoParts.join(' - ').slice(0, 120),
        fitid: `${date.replace(/-/g, '')}${String(doc.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || '0001'}`,
      },
    ],
  };
}

async function convertBinaryToOfxStatement(params: {
  companyId: string;
  fileName: string;
  mimeType: string;
  fileBase64?: string;
  rawText?: string;
  bankHint?: string;
  sourceDocId?: string;
  fallbackDocMeta?: Partial<CompanyDocument>;
  onProgress: (p: {
    totalPages: number;
    processedPages: number;
    foundTransactions: number;
    statusLabel: string;
  }) => void;
}): Promise<ConvertedStatement> {
  const {
    companyId,
    fileName,
    mimeType,
    fileBase64,
    rawText,
    bankHint,
    sourceDocId,
    fallbackDocMeta,
    onProgress,
  } = params;
  const fileNameLower = fileName.toLowerCase();
  const mimeLower = (mimeType || '').toLowerCase();
  const isPdf = mimeLower === 'application/pdf' || fileNameLower.endsWith('.pdf');
  const isPlainTextOrOfx =
    Boolean(rawText) ||
    fileNameLower.endsWith('.txt') ||
    fileNameLower.endsWith('.ofx') ||
    fileNameLower.endsWith('.csv') ||
    fileNameLower.endsWith('.xml') ||
    mimeLower.includes('xml') ||
    mimeLower.startsWith('text/');

  let finalData: any = null;

  if (isPdf && fileBase64) {
    let srcPdf: PDFDocument | null = null;
    let totalPages = 0;
    try {
      const byteChars = atob(fileBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      srcPdf = await PDFDocument.load(bytes.buffer as ArrayBuffer, { ignoreEncryption: true });
      totalPages = srcPdf.getPageCount();
    } catch {
      srcPdf = null;
      totalPages = 0;
    }

    if (srcPdf && totalPages > 1) {
      const MAX_CHUNK_BASE64 = 2_400_000;
      const DEFAULT_BATCH = totalPages > 2 ? 3 : 2;

      const buildSliceBase64 = async (start: number, end: number) => {
        const subDoc = await PDFDocument.create();
        const indices: number[] = [];
        for (let p = start; p <= end; p++) indices.push(p);
        const copied = await subDoc.copyPages(srcPdf!, indices);
        copied.forEach((p) => subDoc.addPage(p));
        const subBytes = await subDoc.save();
        return uint8ToBase64(subBytes);
      };

      const chunkQueue: { start: number; end: number; prebuiltB64?: string }[] = [];
      const splitRangeToFit = async (start: number, end: number) => {
        const b64 = await buildSliceBase64(start, end);
        if (b64.length <= MAX_CHUNK_BASE64 || start === end) {
          if (b64.length > 3_600_000) {
            throw new Error(
              `A página ${start + 1} do PDF possui imagem muito pesada e excede o limite do servidor.`
            );
          }
          chunkQueue.push({ start, end, prebuiltB64: b64 });
          return;
        }
        const mid = Math.floor((start + end) / 2);
        await splitRangeToFit(start, mid);
        await splitRangeToFit(mid + 1, end);
      };

      if (totalPages > 2 || fileBase64.length > MAX_CHUNK_BASE64) {
        onProgress({
          totalPages,
          processedPages: 0,
          foundTransactions: 0,
          statusLabel: `Preparando lotes seguros de ${totalPages} páginas...`,
        });

        for (let i = 0; i < totalPages; i += DEFAULT_BATCH) {
          await splitRangeToFit(i, Math.min(i + DEFAULT_BATCH - 1, totalPages - 1));
        }

        const extractRange = async (
          range: { start: number; end: number; prebuiltB64?: string },
          contextHint?: string
        ) => {
          const chunkBase64 = range.prebuiltB64 || (await buildSliceBase64(range.start, range.end));
          let lastError: any = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const chunkRes = await fetch('/api/ofx/extract-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileBase64: chunkBase64,
                  mimeType: 'application/pdf',
                  bankHint: contextHint,
                }),
              });
              const chunkJson = await parseSafeJson(chunkRes);
              if (!chunkRes.ok || !chunkJson.extraction) {
                const err = new Error(
                  chunkJson.error || `Falha ao ler páginas ${range.start + 1}-${range.end + 1} de ${totalPages}`
                ) as Error & { noRetry?: boolean };
                if ([429, 403, 400, 413].includes(chunkRes.status)) err.noRetry = true;
                throw err;
              }
              return chunkJson.extraction;
            } catch (err: any) {
              lastError = err;
              if (err?.noRetry || attempt === 1) throw err;
              await new Promise((r) => setTimeout(r, 800));
            }
          }
          throw lastError;
        };

        const extractedChunks: any[] = new Array(chunkQueue.length);
        const firstRange = chunkQueue[0];
        const firstLabel =
          firstRange.start === firstRange.end
            ? `página ${firstRange.start + 1}`
            : `páginas ${firstRange.start + 1} a ${firstRange.end + 1}`;

        onProgress({
          totalPages,
          processedPages: 0,
          foundTransactions: 0,
          statusLabel: `Lendo ${firstLabel} de ${totalPages}...`,
        });

        const firstExtraction = await extractRange(firstRange, bankHint || undefined);
        extractedChunks[0] = firstExtraction;

        let processedPages = firstRange.end - firstRange.start + 1;
        let foundTransactions = firstExtraction?.transactions?.length || 0;

        const inferredYear =
          (firstExtraction?.startDate && /^\d{4}/.test(firstExtraction.startDate)
            ? firstExtraction.startDate.slice(0, 4)
            : '') ||
          (firstExtraction?.transactions?.[0]?.date && /^\d{4}/.test(firstExtraction.transactions[0].date)
            ? firstExtraction.transactions[0].date.slice(0, 4)
            : '');

        const sharedContextHint =
          [
            bankHint,
            firstExtraction?.bankName ? `Banco: ${firstExtraction.bankName} (${firstExtraction.bankCode || ''})` : '',
            firstExtraction?.agency ? `Agência: ${firstExtraction.agency}` : '',
            firstExtraction?.accountNumber ? `Conta: ${firstExtraction.accountNumber}` : '',
            inferredYear ? `Ano do extrato: ${inferredYear}` : '',
          ]
            .filter(Boolean)
            .join(' | ') || undefined;

        onProgress({
          totalPages,
          processedPages,
          foundTransactions,
          statusLabel: `${processedPages} de ${totalPages} páginas lidas • ${foundTransactions} lançamentos`,
        });

        const CONCURRENCY = 2;
        for (let i = 1; i < chunkQueue.length; i += CONCURRENCY) {
          const batchSlice = chunkQueue.slice(i, i + CONCURRENCY);
          onProgress({
            totalPages,
            processedPages,
            foundTransactions,
            statusLabel: `Analisando lote de páginas (${processedPages + 1}/${totalPages})...`,
          });

          const settled = await Promise.all(
            batchSlice.map(async (range, offset) => ({
              idx: i + offset,
              pageCount: range.end - range.start + 1,
              extraction: await extractRange(range, sharedContextHint),
            }))
          );

          for (const item of settled) {
            extractedChunks[item.idx] = item.extraction;
            processedPages += item.pageCount;
            foundTransactions += item.extraction?.transactions?.length || 0;
          }

          onProgress({
            totalPages,
            processedPages,
            foundTransactions,
            statusLabel: `${processedPages} de ${totalPages} páginas lidas • ${foundTransactions} lançamentos`,
          });
        }

        onProgress({
          totalPages,
          processedPages: totalPages,
          foundTransactions,
          statusLabel: `Consolidando ${foundTransactions} lançamentos em OFX...`,
        });

        const finalizeRes = await fetch('/api/ofx/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunks: extractedChunks,
            totalPages,
            pagesProcessed: totalPages,
            companyId,
            fileName,
            sourceDocId,
            fileBase64: fileBase64.length < 1_500_000 ? fileBase64 : undefined,
            mimeType: 'application/pdf',
          }),
        });
        const finalizeData = await parseSafeJson(finalizeRes);
        if (!finalizeRes.ok || !finalizeData?.statement) {
          throw new Error(finalizeData.error || 'Erro ao consolidar páginas do extrato.');
        }
        finalData = finalizeData;
      }
    }
  }

  if (!finalData) {
    onProgress({
      totalPages: 1,
      processedPages: 0,
      foundTransactions: 0,
      statusLabel: `Analisando ${fileName} para OFX...`,
    });

    const payloadBody: any = {
      fileName,
      bankHint,
      companyId,
      sourceDocId,
    };

    if (rawText) {
      payloadBody.rawText = rawText;
    } else if (isPlainTextOrOfx && fileBase64) {
      try {
        payloadBody.rawText = new TextDecoder('utf-8').decode(
          Uint8Array.from(atob(cleanBase64(fileBase64)), (c) => c.charCodeAt(0))
        );
      } catch {
        payloadBody.fileBase64 = fileBase64;
        payloadBody.mimeType = mimeType;
      }
    } else if (fileBase64) {
      const prepared = await compressImageIfNeeded(fileBase64, mimeType || 'application/pdf');
      if (prepared.base64.length > 3_400_000) {
        throw new Error('O arquivo ultrapassa 3,4 MB por requisição.');
      }
      payloadBody.fileBase64 = prepared.base64;
      payloadBody.mimeType = prepared.mimeType;
    }

    if (payloadBody.rawText || payloadBody.fileBase64) {
      try {
        const res = await fetch('/api/ofx/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBody),
        });
        const data = await parseSafeJson(res);
        if (res.ok && data?.statement) {
          finalData = data;
        } else if (!fallbackDocMeta) {
          throw new Error(data.error || 'Falha ao converter arquivo para OFX.');
        }
      } catch (err) {
        if (!fallbackDocMeta) throw err;
      }
    }

    // Fallback: synthesize OFX directly from fiscal document metadata (NF-e / Guia / Recibo) if binary had no bank table
    if (!finalData && fallbackDocMeta) {
      const fallbackChunk = buildFallbackExtractionFromDoc(fallbackDocMeta, fileName);
      if (fallbackChunk) {
        const finRes = await fetch('/api/ofx/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunks: [fallbackChunk],
            totalPages: 1,
            pagesProcessed: 1,
            companyId,
            fileName,
            sourceDocId,
            fileBase64: fileBase64 && fileBase64.length < 1_500_000 ? fileBase64 : undefined,
            mimeType: mimeType || 'application/pdf',
          }),
        });
        const finData = await parseSafeJson(finRes);
        if (finRes.ok && finData?.statement) {
          finalData = finData;
        } else {
          throw new Error(finData?.error || 'Falha ao gerar OFX do documento fiscal.');
        }
      } else {
        throw new Error('Não foi possível identificar valores para gerar o OFX deste documento.');
      }
    }
  }

  const stmt: ConvertedStatement = finalData.statement;
  if (fileBase64 && stmt.id) {
    await saveBlobToIdb(stmt.id, fileBase64);
    stmt.hasOriginalFile = true;
    stmt.fileBase64 = fileBase64;
  }

  try {
    await saveStatementToFirestore(companyId, stmt);
  } catch (err) {
    console.warn('Firestore statement sync warning:', err);
  }

  return stmt;
}

export const OfxAgentProvider: React.FC<{
  currentUser: User;
  currentCompany: Company;
  allCompanies: Company[];
  onStatementsChanged: () => void;
  onStatementCreated?: (stmt: ConvertedStatement) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  children: React.ReactNode;
}> = ({
  currentUser,
  currentCompany,
  allCompanies,
  onStatementsChanged,
  onStatementCreated,
  showToast,
  children,
}) => {
  const [config, setConfig] = useState<AgentConfig>(() => {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          autoRunEnabled: parsed.autoRunEnabled !== false,
          scheduleMode: parsed.scheduleMode || 'on_upload',
          lastSweepAt: parsed.lastSweepAt || null,
          nextSweepAt: parsed.nextSweepAt || null,
        };
      }
    } catch {}
    return {
      autoRunEnabled: true,
      scheduleMode: 'on_upload',
      lastSweepAt: null,
      nextSweepAt: null,
    };
  });

  const [docJobs, setDocJobs] = useState<Record<string, DocOfxJobState>>({});
  const [docProcessJobs, setDocProcessJobs] = useState<Record<string, DocProcessingJobState>>({});
  const [isSweeping, setIsSweeping] = useState(false);
  const [isProcessingOtherDocs, setIsProcessingOtherDocs] = useState(false);
  const [isConvertingBatchOfx, setIsConvertingBatchOfx] = useState(false);
  const [batchOfxProgress, setBatchOfxProgress] = useState<{
    current: number;
    total: number;
    label: string;
  } | null>(null);
  const [recentStatements, setRecentStatements] = useState<ConvertedStatement[]>([]);
  const [lastDocumentPatch, setLastDocumentPatch] = useState<{
    docId: string;
    patch: Partial<CompanyDocument>;
    ts: number;
  } | null>(null);
  const [inboxConfigured, setInboxConfigured] = useState(false);
  const [inboxEmailAddress, setInboxEmailAddress] = useState('contsuitesistemas@gmail.com');
  const [inboxLastSyncAt, setInboxLastSyncAt] = useState<string | null>(null);
  const [isSyncingInbox, setIsSyncingInbox] = useState(false);
  const [lastInboxSyncEventTs, setLastInboxSyncEventTs] = useState(0);

  const [manualJob, setManualJob] = useState<ManualOfxJobState | null>(() => {
    try {
      const raw = localStorage.getItem(MANUAL_JOB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ManualOfxJobState;
        if (parsed.status === 'processing') {
          return {
            ...parsed,
            status: 'error',
            error: 'Processamento interrompido por recarregamento da página. Envie novamente se necessário.',
          };
        }
        return parsed;
      }
    } catch {}
    return null;
  });

  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  useEffect(() => {
    try {
      if (!manualJob) {
        localStorage.removeItem(MANUAL_JOB_STORAGE_KEY);
      } else {
        const compactResult = manualJob.result
          ? {
              ...manualJob.result,
              fileBase64: undefined,
            }
          : undefined;
        localStorage.setItem(
          MANUAL_JOB_STORAGE_KEY,
          JSON.stringify({ ...manualJob, result: compactResult })
        );
      }
    } catch {}
  }, [manualJob]);

  const setAutoRunEnabled = useCallback((enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      autoRunEnabled: enabled,
      nextSweepAt: enabled ? computeNextSweep(prev.scheduleMode, prev.lastSweepAt) : null,
    }));
  }, []);

  const setScheduleMode = useCallback((mode: OfxAgentScheduleMode) => {
    setConfig((prev) => ({
      ...prev,
      scheduleMode: mode,
      nextSweepAt: prev.autoRunEnabled ? computeNextSweep(mode, prev.lastSweepAt) : null,
    }));
  }, []);

  const updateDocOfxMetadata = useCallback(
    async (docItem: CompanyDocument, patch: Partial<CompanyDocument>) => {
      setLastDocumentPatch({ docId: docItem.id, patch, ts: Date.now() });

      try {
        await fetch(`/api/documents/${docItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch {}

      try {
        await saveDocumentToFirestore(docItem.companyId, {
          ...docItem,
          ...patch,
          updatedAt: new Date().toISOString(),
        });
      } catch {}
    },
    []
  );

  // Background Document OFX Queue
  const queueRef = useRef<{ doc: CompanyDocument; preloadedBase64?: string }[]>([]);
  const processingQueueRef = useRef(false);
  const queuedIdsRef = useRef(new Set<string>());

  const processNextInQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift();
      if (!next) break;
      const { doc, preloadedBase64 } = next;

      setDocJobs((prev) => ({
        ...prev,
        [doc.id]: {
          docId: doc.id,
          companyId: doc.companyId,
          fileName: doc.fileName,
          status: 'processing',
          totalPages: 1,
          processedPages: 0,
          foundTransactions: 0,
          statusLabel: 'Iniciando agente automático OFX...',
        },
      }));
      await updateDocOfxMetadata(doc, { ofxStatus: 'processing', ofxError: '' });

      try {
        let base64 = preloadedBase64 || doc.fileBase64 || (await getBlobFromIdb(doc.id)) || undefined;
        if (!base64) {
          const docRes = await fetch(`/api/documents/${doc.id}`, { cache: 'no-store' });
          if (docRes.ok) {
            const full = await docRes.json();
            if (full?.fileBase64) {
              base64 = full.fileBase64;
              await saveBlobToIdb(doc.id, base64!);
            }
          }
        }

        if (!base64 && !(doc.amount && doc.amount > 0)) {
          throw new Error('Arquivo binário não encontrado localmente ou no servidor.');
        }

        const stmt = await convertBinaryToOfxStatement({
          companyId: doc.companyId,
          fileName: doc.fileName,
          mimeType: doc.mimeType || 'application/pdf',
          fileBase64: base64,
          bankHint: doc.issuerOrBank ? `Banco/Emissor: ${doc.issuerOrBank}` : undefined,
          sourceDocId: doc.id,
          fallbackDocMeta: doc,
          onProgress: (p) => {
            setDocJobs((prev) => ({
              ...prev,
              [doc.id]: {
                docId: doc.id,
                companyId: doc.companyId,
                fileName: doc.fileName,
                status: 'processing',
                totalPages: p.totalPages,
                processedPages: p.processedPages,
                foundTransactions: p.foundTransactions,
                statusLabel: p.statusLabel,
              },
            }));
          },
        });

        setDocJobs((prev) => ({
          ...prev,
          [doc.id]: {
            docId: doc.id,
            companyId: doc.companyId,
            fileName: doc.fileName,
            status: 'done',
            totalPages: stmt.totalPages || 1,
            processedPages: stmt.pagesProcessed || stmt.totalPages || 1,
            foundTransactions: stmt.transactionsCount || 0,
            statusLabel: `OFX pronto (${stmt.transactionsCount} lançamentos)`,
            statementId: stmt.id,
          },
        }));

        await updateDocOfxMetadata(doc, {
          ofxStatus: 'done',
          ofxStatementId: stmt.id,
          ofxError: '',
        });

        const normalizedStmt: ConvertedStatement = {
          ...stmt,
          companyId: stmt.companyId || doc.companyId,
          sourceDocId: stmt.sourceDocId || doc.id,
          originalFileName: stmt.originalFileName || doc.fileName,
          uploadedAt: stmt.uploadedAt || new Date().toISOString(),
        };

        cacheStatementLocally(doc.companyId, normalizedStmt);
        const { fileBase64: _omitB64, ...compactStmt } = normalizedStmt;
        setRecentStatements((prev) => [
          { ...compactStmt, hasOriginalFile: true },
          ...prev.filter((s) => s.id !== normalizedStmt.id),
        ]);
        onStatementCreated?.(normalizedStmt);
        onStatementsChanged();
        showToast(
          `Agente OFX concluiu "${doc.fileName}" (${stmt.transactionsCount} lançamentos).`
        );
      } catch (err: any) {
        const msg = err?.message || 'Erro ao gerar OFX automático.';
        setDocJobs((prev) => ({
          ...prev,
          [doc.id]: {
            docId: doc.id,
            companyId: doc.companyId,
            fileName: doc.fileName,
            status: 'error',
            totalPages: 1,
            processedPages: 0,
            foundTransactions: 0,
            statusLabel: 'Falha na conversão automática',
            error: msg,
          },
        }));
        await updateDocOfxMetadata(doc, { ofxStatus: 'error', ofxError: msg.slice(0, 240) });
      } finally {
        queuedIdsRef.current.delete(doc.id);
      }
    }

    processingQueueRef.current = false;
  }, [onStatementCreated, onStatementsChanged, showToast, updateDocOfxMetadata]);

  const enqueueDocumentForOfx = useCallback(
    (doc: CompanyDocument, preloadedBase64?: string) => {
      if (!doc || !doc.id) return;
      if (queuedIdsRef.current.has(doc.id)) return;

      queuedIdsRef.current.add(doc.id);
      queueRef.current.push({ doc, preloadedBase64 });

      setDocJobs((prev) => ({
        ...prev,
        [doc.id]: {
          docId: doc.id,
          companyId: doc.companyId,
          fileName: doc.fileName,
          status: 'queued',
          totalPages: 1,
          processedPages: 0,
          foundTransactions: 0,
          statusLabel: 'Na fila do Agente OFX...',
        },
      }));
      void updateDocOfxMetadata(doc, { ofxStatus: 'queued', ofxError: '' });
      void processNextInQueue();
    },
    [processNextInQueue, updateDocOfxMetadata]
  );

  const runPendingSweep = useCallback(
    async (docsOverride?: CompanyDocument[]): Promise<number> => {
      if (!currentCompany?.id) return 0;
      setIsSweeping(true);
      let candidates: CompanyDocument[] = [];
      try {
        if (docsOverride) {
          candidates = docsOverride;
        } else {
          const map = new Map<string, CompanyDocument>();
          try {
            const raw = localStorage.getItem(`contsuite_cached_docs_${currentCompany.id}`);
            if (raw) {
              (JSON.parse(raw) as CompanyDocument[]).forEach((d) => map.set(d.id, d));
            }
          } catch {}
          try {
            const fDocs = await fetchDocumentsFromFirestore(currentCompany.id);
            fDocs.forEach((d) => map.set(d.id, { ...map.get(d.id), ...d }));
          } catch {}
          try {
            const res = await fetch(`/api/documents?companyId=${currentCompany.id}`, {
              cache: 'no-store',
            });
            if (res.ok) {
              const apiDocs: CompanyDocument[] = await res.json();
              apiDocs.forEach((d) => map.set(d.id, { ...map.get(d.id), ...d }));
            }
          } catch {}
          candidates = Array.from(map.values());
        }

        const eligible = candidates.filter((d) => {
          if (d.category !== 'extrato') return false;
          if (d.ofxStatementId || d.ofxStatus === 'done') return false;
          if (queuedIdsRef.current.has(d.id)) return false;
          const lower = (d.fileName || '').toLowerCase();
          return (
            d.mimeType === 'application/pdf' ||
            d.mimeType?.startsWith('image/') ||
            lower.endsWith('.pdf') ||
            lower.endsWith('.ofx') ||
            lower.endsWith('.txt') ||
            lower.endsWith('.csv')
          );
        });

        eligible.forEach((d) => enqueueDocumentForOfx(d));

        const nowIso = new Date().toISOString();
        setConfig((prev) => ({
          ...prev,
          lastSweepAt: nowIso,
          nextSweepAt: prev.autoRunEnabled ? computeNextSweep(prev.scheduleMode, nowIso) : null,
        }));

        return eligible.length;
      } finally {
        setIsSweeping(false);
      }
    },
    [currentCompany?.id, enqueueDocumentForOfx]
  );

  // Background Queue for Non-Extrato Documents (Notas Fiscais, Guias, Comprovantes, Folha, Outros)
  const docProcessQueueRef = useRef<{ doc: CompanyDocument; preloadedBase64?: string }[]>([]);
  const processingNonExtratoRef = useRef(false);
  const queuedNonExtratoIdsRef = useRef(new Set<string>());

  const processNextNonExtratoInQueue = useCallback(async () => {
    if (processingNonExtratoRef.current) return;
    processingNonExtratoRef.current = true;

    while (docProcessQueueRef.current.length > 0) {
      const next = docProcessQueueRef.current.shift();
      if (!next) break;
      const { doc, preloadedBase64 } = next;

      setDocProcessJobs((prev) => ({
        ...prev,
        [doc.id]: {
          docId: doc.id,
          companyId: doc.companyId,
          fileName: doc.fileName,
          category: doc.category,
          status: 'processing',
          statusLabel: 'Extraindo dados contábeis e sugestão de lançamento...',
        },
      }));

      try {
        let base64 = preloadedBase64 || doc.fileBase64 || (await getBlobFromIdb(doc.id)) || undefined;
        if (!base64) {
          try {
            const docRes = await fetch(`/api/documents/${doc.id}`, { cache: 'no-store' });
            if (docRes.ok) {
              const full = await docRes.json();
              if (full?.fileBase64) {
                base64 = full.fileBase64;
                await saveBlobToIdb(doc.id, base64!);
              }
            }
          } catch {}
        }

        const lower = (doc.fileName || '').toLowerCase();
        const mime = (doc.mimeType || '').toLowerCase();
        let payloadBase64: string | undefined = base64 ? cleanBase64(base64) : undefined;
        let textPreview: string | undefined;

        if (
          payloadBase64 &&
          (mime.startsWith('text/') ||
            mime.includes('xml') ||
            lower.endsWith('.xml') ||
            lower.endsWith('.csv') ||
            lower.endsWith('.txt'))
        ) {
          try {
            textPreview = new TextDecoder('utf-8')
              .decode(base64ToUint8Array(payloadBase64))
              .slice(0, 14000);
            payloadBase64 = undefined;
          } catch {}
        } else if (
          payloadBase64 &&
          payloadBase64.length > 2_200_000 &&
          (mime === 'application/pdf' || lower.endsWith('.pdf'))
        ) {
          try {
            const bytes = base64ToUint8Array(payloadBase64);
            const srcDoc = await PDFDocument.load(bytes.buffer as ArrayBuffer, {
              ignoreEncryption: true,
            });
            const pageCount = Math.min(2, srcDoc.getPageCount());
            if (pageCount >= 1) {
              const subDoc = await PDFDocument.create();
              const indices = Array.from({ length: pageCount }, (_, idx) => idx);
              const copied = await subDoc.copyPages(srcDoc, indices);
              copied.forEach((p) => subDoc.addPage(p));
              const out = await subDoc.save();
              payloadBase64 = uint8ToBase64(out);
            }
          } catch {}
        } else if (payloadBase64 && mime.startsWith('image/')) {
          const compressed = await compressImageIfNeeded(payloadBase64, mime);
          payloadBase64 = compressed.base64;
        }

        const res = await fetch('/api/documents/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            currentCategory: doc.category,
            companyId: doc.companyId,
            base64Data: payloadBase64 && payloadBase64.length <= 3_300_000 ? payloadBase64 : undefined,
            textPreview,
          }),
        });
        const data = await parseSafeJson(res);
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao processar documento.');
        }

        const nextStatus =
          doc.status === 'pendente'
            ? (data.suggestedStatus || 'em_analise')
            : doc.status;

        const patch: Partial<CompanyDocument> = {
          category: data.category || doc.category,
          status: nextStatus,
          competenceMonth: data.competenceMonth || doc.competenceMonth,
          documentDate: data.documentDate || doc.documentDate,
          issuerOrBank: data.issuerOrBank || doc.issuerOrBank,
          documentNumber: data.documentNumber || doc.documentNumber,
          amount: typeof data.amount === 'number' && data.amount > 0 ? data.amount : doc.amount,
          detectedCnpj: data.detectedCnpj || doc.detectedCnpj,
          summary: data.summary || doc.summary,
          notes: data.accountingNotes ? String(data.accountingNotes).slice(0, 500) : doc.notes,
          aiClassified: true,
          confidence: data.confidence || 92,
        };

        await updateDocOfxMetadata(doc, patch);

        // Immediately convert Nota Fiscal / Guia / Comprovante into an OFX statement so it appears in Conversor OFX
        const enrichedDoc: CompanyDocument = {
          ...doc,
          ...patch,
        };

        setDocProcessJobs((prev) => ({
          ...prev,
          [doc.id]: {
            docId: doc.id,
            companyId: doc.companyId,
            fileName: doc.fileName,
            category: enrichedDoc.category,
            status: 'processing',
            statusLabel: 'Convertendo e enviando lançamento para o Conversor OFX...',
            accountingNotes: patch.notes,
          },
        }));

        let generatedStmt: ConvertedStatement | null = null;
        try {
          generatedStmt = await convertBinaryToOfxStatement({
            companyId: doc.companyId,
            fileName: doc.fileName,
            mimeType: doc.mimeType || 'application/pdf',
            fileBase64: base64,
            rawText: textPreview,
            bankHint: enrichedDoc.issuerOrBank
              ? `Emissor/Fornecedor: ${enrichedDoc.issuerOrBank}${enrichedDoc.documentNumber ? ` | NF/Doc: ${enrichedDoc.documentNumber}` : ''}`
              : undefined,
            sourceDocId: doc.id,
            fallbackDocMeta: enrichedDoc,
            onProgress: (p) => {
              setDocJobs((prev) => ({
                ...prev,
                [doc.id]: {
                  docId: doc.id,
                  companyId: doc.companyId,
                  fileName: doc.fileName,
                  status: 'processing',
                  totalPages: p.totalPages,
                  processedPages: p.processedPages,
                  foundTransactions: p.foundTransactions,
                  statusLabel: p.statusLabel,
                },
              }));
            },
          });
        } catch (ofxErr: any) {
          console.warn('Non-extrato OFX conversion fallback warning:', ofxErr?.message);
          await updateDocOfxMetadata(enrichedDoc, {
            ofxStatus: 'error',
            ofxError: (ofxErr?.message || 'Não foi possível gerar OFX automático.').slice(0, 200),
          });
        }

        if (generatedStmt) {
          const normalizedStmt: ConvertedStatement = {
            ...generatedStmt,
            companyId: generatedStmt.companyId || doc.companyId,
            sourceDocId: generatedStmt.sourceDocId || doc.id,
            originalFileName: generatedStmt.originalFileName || doc.fileName,
            uploadedAt: generatedStmt.uploadedAt || new Date().toISOString(),
          };

          await updateDocOfxMetadata(enrichedDoc, {
            ofxStatus: 'done',
            ofxStatementId: normalizedStmt.id,
            ofxError: '',
          });

          setDocJobs((prev) => ({
            ...prev,
            [doc.id]: {
              docId: doc.id,
              companyId: doc.companyId,
              fileName: doc.fileName,
              status: 'done',
              totalPages: normalizedStmt.totalPages || 1,
              processedPages: normalizedStmt.pagesProcessed || normalizedStmt.totalPages || 1,
              foundTransactions: normalizedStmt.transactionsCount || 0,
              statusLabel: `OFX pronto (${normalizedStmt.transactionsCount} lançamentos)`,
              statementId: normalizedStmt.id,
            },
          }));

          cacheStatementLocally(doc.companyId, normalizedStmt);
          const { fileBase64: _omitB64, ...compactStmt } = normalizedStmt;
          setRecentStatements((prev) => [
            { ...compactStmt, hasOriginalFile: Boolean(base64) },
            ...prev.filter((s) => s.id !== normalizedStmt.id),
          ]);
          setManualJob({
            status: 'done',
            companyId: doc.companyId,
            fileName: doc.fileName,
            totalPages: normalizedStmt.totalPages || 1,
            processedPages: normalizedStmt.pagesProcessed || normalizedStmt.totalPages || 1,
            foundTransactions: normalizedStmt.transactionsCount || 0,
            statusLabel: `Documento "${doc.fileName}" enviado para o OFX (${normalizedStmt.transactionsCount} lançamentos)`,
            result: normalizedStmt,
            updatedAt: new Date().toISOString(),
          });
          onStatementCreated?.(normalizedStmt);
          onStatementsChanged();
        }

        setDocProcessJobs((prev) => ({
          ...prev,
          [doc.id]: {
            docId: doc.id,
            companyId: doc.companyId,
            fileName: doc.fileName,
            category: enrichedDoc.category,
            status: 'done',
            statusLabel: generatedStmt
              ? `Processado e enviado para o OFX (${generatedStmt.transactionsCount} lanç.)`
              : 'Dados extraídos e prontos para escrituração',
            accountingNotes: patch.notes,
          },
        }));

        showToast(
          generatedStmt
            ? `"${doc.fileName}" processado e enviado para o Conversor OFX (${generatedStmt.transactionsCount} lançamentos)!`
            : `Documento "${doc.fileName}" processado com IA!`
        );
      } catch (err: any) {
        const msg = err?.message || 'Erro ao processar documento.';
        setDocProcessJobs((prev) => ({
          ...prev,
          [doc.id]: {
            docId: doc.id,
            companyId: doc.companyId,
            fileName: doc.fileName,
            category: doc.category,
            status: 'error',
            statusLabel: 'Falha ao processar documento',
            error: msg,
          },
        }));
      } finally {
        queuedNonExtratoIdsRef.current.delete(doc.id);
      }
    }

    processingNonExtratoRef.current = false;
  }, [onStatementCreated, onStatementsChanged, showToast, updateDocOfxMetadata]);

  const enqueueNonExtratoProcessing = useCallback(
    (doc: CompanyDocument, preloadedBase64?: string) => {
      if (!doc || !doc.id) return;
      if (queuedNonExtratoIdsRef.current.has(doc.id)) return;

      queuedNonExtratoIdsRef.current.add(doc.id);
      docProcessQueueRef.current.push({ doc, preloadedBase64 });

      setDocProcessJobs((prev) => ({
        ...prev,
        [doc.id]: {
          docId: doc.id,
          companyId: doc.companyId,
          fileName: doc.fileName,
          category: doc.category,
          status: 'queued',
          statusLabel: 'Na fila de processamento e conversão OFX...',
        },
      }));

      void processNextNonExtratoInQueue();
    },
    [processNextNonExtratoInQueue]
  );

  const runPendingNonExtratoSweep = useCallback(
    async (docsOverride?: CompanyDocument[]): Promise<number> => {
      if (!currentCompany?.id) return 0;
      setIsProcessingOtherDocs(true);
      try {
        let candidates: CompanyDocument[] = [];
        if (docsOverride) {
          candidates = docsOverride;
        } else {
          const map = new Map<string, CompanyDocument>();
          try {
            const raw = localStorage.getItem(`contsuite_cached_docs_${currentCompany.id}`);
            if (raw) {
              (JSON.parse(raw) as CompanyDocument[]).forEach((d) => map.set(d.id, d));
            }
          } catch {}
          try {
            const fDocs = await fetchDocumentsFromFirestore(currentCompany.id);
            fDocs.forEach((d) => map.set(d.id, { ...map.get(d.id), ...d }));
          } catch {}
          try {
            const res = await fetch(`/api/documents?companyId=${currentCompany.id}`, {
              cache: 'no-store',
            });
            if (res.ok) {
              const apiDocs: CompanyDocument[] = await res.json();
              apiDocs.forEach((d) => map.set(d.id, { ...map.get(d.id), ...d }));
            }
          } catch {}
          candidates = Array.from(map.values());
        }

        const eligible = candidates.filter((d) => {
          if (d.category === 'extrato') return false;
          if (queuedNonExtratoIdsRef.current.has(d.id)) return false;
          if (d.status === 'concluido' && d.ofxStatus === 'done') return false;
          const alreadyProcessed = Boolean(d.notes && d.notes.includes('[Processado IA]'));
          return d.status === 'pendente' || !alreadyProcessed || d.ofxStatus !== 'done';
        });

        eligible.forEach((d) => enqueueNonExtratoProcessing(d));
        return eligible.length;
      } finally {
        setIsProcessingOtherDocs(false);
      }
    },
    [currentCompany?.id, enqueueNonExtratoProcessing]
  );

  // Batch consolidation: transform multiple selected documents (e.g., multiple Notas Fiscais) into ONE unified OFX file
  const convertMultipleDocsToSingleOfx = useCallback(
    async (
      docs: CompanyDocument[],
      resolveBase64Fn?: (doc: CompanyDocument) => Promise<string | null>
    ): Promise<ConvertedStatement | null> => {
      if (!docs || docs.length === 0) return null;
      const targetCompanyId = docs[0].companyId || currentCompany?.id;
      if (!targetCompanyId) return null;

      setIsConvertingBatchOfx(true);
      setBatchOfxProgress({
        current: 0,
        total: docs.length,
        label: `Preparando ${docs.length} arquivo(s) para unificação em OFX...`,
      });

      const allChunks: any[] = [];
      let totalPagesProcessed = 0;

      try {
        for (let idx = 0; idx < docs.length; idx++) {
          const doc = docs[idx];
          setBatchOfxProgress({
            current: idx + 1,
            total: docs.length,
            label: `Lendo (${idx + 1}/${docs.length}): ${doc.fileName}`,
          });

          let base64: string | null =
            doc.fileBase64 || (await getBlobFromIdb(doc.id)) || null;
          if (!base64 && resolveBase64Fn) {
            base64 = await resolveBase64Fn(doc);
          }
          if (!base64) {
            try {
              const r = await fetch(`/api/documents/${doc.id}`, { cache: 'no-store' });
              if (r.ok) {
                const full = await r.json();
                if (full?.fileBase64) {
                  base64 = cleanBase64(full.fileBase64);
                  await saveBlobToIdb(doc.id, base64);
                }
              }
            } catch {}
          }

          const lower = (doc.fileName || '').toLowerCase();
          const mime = (doc.mimeType || '').toLowerCase();
          const isTextOrXml =
            mime.startsWith('text/') ||
            mime.includes('xml') ||
            lower.endsWith('.xml') ||
            lower.endsWith('.ofx') ||
            lower.endsWith('.csv') ||
            lower.endsWith('.txt');
          const isPdf = mime === 'application/pdf' || lower.endsWith('.pdf');

          let docChunks: any[] = [];

          if (base64 && isTextOrXml) {
            try {
              const rawText = new TextDecoder('utf-8').decode(
                base64ToUint8Array(cleanBase64(base64))
              );
              const chunkRes = await fetch('/api/ofx/extract-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  rawText,
                  mimeType: doc.mimeType || 'application/xml',
                  bankHint: doc.issuerOrBank || doc.fileName,
                }),
              });
              const chunkJson = await parseSafeJson(chunkRes);
              if (chunkRes.ok && chunkJson?.extraction?.transactions?.length > 0) {
                docChunks.push(chunkJson.extraction);
                totalPagesProcessed += 1;
              }
            } catch {}
          } else if (base64 && isPdf) {
            try {
              const bytes = base64ToUint8Array(cleanBase64(base64));
              const srcPdf = await PDFDocument.load(bytes.buffer as ArrayBuffer, {
                ignoreEncryption: true,
              });
              const numPages = srcPdf.getPageCount();
              const step = 3;
              for (let start = 0; start < numPages; start += step) {
                const end = Math.min(start + step - 1, numPages - 1);
                const subDoc = await PDFDocument.create();
                const indices: number[] = [];
                for (let p = start; p <= end; p++) indices.push(p);
                const copied = await subDoc.copyPages(srcPdf, indices);
                copied.forEach((p) => subDoc.addPage(p));
                const subB64 = uint8ToBase64(await subDoc.save());

                const chunkRes = await fetch('/api/ofx/extract-chunk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fileBase64: subB64,
                    mimeType: 'application/pdf',
                    bankHint: doc.issuerOrBank || doc.fileName,
                  }),
                });
                const chunkJson = await parseSafeJson(chunkRes);
                if (chunkRes.ok && chunkJson?.extraction?.transactions?.length > 0) {
                  docChunks.push(chunkJson.extraction);
                  totalPagesProcessed += end - start + 1;
                }
              }
            } catch {}
          } else if (base64) {
            try {
              const prepared = await compressImageIfNeeded(
                cleanBase64(base64),
                mime || 'image/jpeg'
              );
              const chunkRes = await fetch('/api/ofx/extract-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileBase64: prepared.base64,
                  mimeType: prepared.mimeType,
                  bankHint: doc.issuerOrBank || doc.fileName,
                }),
              });
              const chunkJson = await parseSafeJson(chunkRes);
              if (chunkRes.ok && chunkJson?.extraction?.transactions?.length > 0) {
                docChunks.push(chunkJson.extraction);
                totalPagesProcessed += 1;
              }
            } catch {}
          }

          // Fallback to /api/documents/process or stored document metadata if binary extraction returned empty
          if (docChunks.length === 0) {
            let docForFallback: Partial<CompanyDocument> = doc;
            if ((!doc.amount || doc.amount <= 0) && base64) {
              try {
                let textPreview: string | undefined;
                let payloadB64: string | undefined = cleanBase64(base64);
                if (isTextOrXml) {
                  textPreview = new TextDecoder('utf-8')
                    .decode(base64ToUint8Array(payloadB64))
                    .slice(0, 14000);
                  payloadB64 = undefined;
                } else if (mime.startsWith('image/')) {
                  payloadB64 = (await compressImageIfNeeded(payloadB64, mime)).base64;
                }
                const procRes = await fetch('/api/documents/process', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fileName: doc.fileName,
                    mimeType: doc.mimeType,
                    currentCategory: doc.category,
                    companyId: doc.companyId,
                    base64Data: payloadB64 && payloadB64.length <= 3_300_000 ? payloadB64 : undefined,
                    textPreview,
                  }),
                });
                const procJson = await parseSafeJson(procRes);
                if (procRes.ok && procJson) {
                  docForFallback = {
                    ...doc,
                    amount: typeof procJson.amount === 'number' ? procJson.amount : doc.amount,
                    documentDate: procJson.documentDate || doc.documentDate,
                    issuerOrBank: procJson.issuerOrBank || doc.issuerOrBank,
                    documentNumber: procJson.documentNumber || doc.documentNumber,
                  };
                }
              } catch {}
            }

            const fallbackChunk = buildFallbackExtractionFromDoc(docForFallback, doc.fileName);
            if (fallbackChunk) {
              docChunks.push(fallbackChunk);
              totalPagesProcessed += 1;
            }
          }

          allChunks.push(...docChunks);
        }

        if (allChunks.length === 0) {
          throw new Error(
            'Não foram encontrados lançamentos ou valores válidos nos arquivos selecionados para gerar o OFX.'
          );
        }

        setBatchOfxProgress({
          current: docs.length,
          total: docs.length,
          label: `Consolidando ${docs.length} arquivos em um único arquivo OFX...`,
        });

        const unifiedFileName = `OFX_Unificado_${docs.length}_Arquivos_${new Date()
          .toISOString()
          .slice(0, 10)}.ofx`;

        const finalizeRes = await fetch('/api/ofx/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunks: allChunks,
            totalPages: Math.max(1, totalPagesProcessed),
            pagesProcessed: Math.max(1, totalPagesProcessed),
            companyId: targetCompanyId,
            fileName: unifiedFileName,
            mimeType: 'application/x-ofx',
          }),
        });
        const finalizeData = await parseSafeJson(finalizeRes);
        if (!finalizeRes.ok || !finalizeData?.statement) {
          throw new Error(finalizeData?.error || 'Erro ao consolidar arquivos em OFX único.');
        }

        const unifiedStmt: ConvertedStatement = {
          ...finalizeData.statement,
          companyId: finalizeData.statement.companyId || targetCompanyId,
          originalFileName: unifiedFileName,
          uploadedAt: finalizeData.statement.uploadedAt || new Date().toISOString(),
        };

        try {
          await saveStatementToFirestore(targetCompanyId, unifiedStmt);
        } catch {}

        cacheStatementLocally(targetCompanyId, unifiedStmt);
        const { fileBase64: _omitBatchB64, ...compactBatchStmt } = unifiedStmt;
        setRecentStatements((prev) => [
          compactBatchStmt,
          ...prev.filter((s) => s.id !== unifiedStmt.id),
        ]);
        setManualJob({
          status: 'done',
          companyId: targetCompanyId,
          fileName: unifiedFileName,
          totalPages: unifiedStmt.totalPages || docs.length,
          processedPages: unifiedStmt.pagesProcessed || docs.length,
          foundTransactions: unifiedStmt.transactionsCount || 0,
          statusLabel: `OFX único gerado a partir de ${docs.length} arquivos (${unifiedStmt.transactionsCount} lançamentos)`,
          result: unifiedStmt,
          updatedAt: new Date().toISOString(),
        });

        for (const doc of docs) {
          await updateDocOfxMetadata(doc, {
            ofxStatus: 'done',
            ofxStatementId: unifiedStmt.id,
            ofxError: '',
            status: doc.status === 'pendente' ? 'em_analise' : doc.status,
          });
        }

        onStatementCreated?.(unifiedStmt);
        onStatementsChanged();
        showToast(
          `${docs.length} arquivos transformados em 1 único OFX (${unifiedStmt.transactionsCount} lançamentos)!`
        );
        return unifiedStmt;
      } catch (err: any) {
        showToast(err?.message || 'Erro ao consolidar arquivos selecionados em OFX.', 'error');
        return null;
      } finally {
        setIsConvertingBatchOfx(false);
        setBatchOfxProgress(null);
      }
    },
    [currentCompany?.id, onStatementCreated, onStatementsChanged, showToast, updateDocOfxMetadata]
  );

  // Background timer for Hourly & Daily schedules
  useEffect(() => {
    if (!config.autoRunEnabled || config.scheduleMode === 'on_upload') return;
    const intervalMs = config.scheduleMode === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    const timer = setInterval(() => {
      const last = config.lastSweepAt ? new Date(config.lastSweepAt).getTime() : 0;
      if (Date.now() - last >= intervalMs) {
        void runPendingSweep();
      }
    }, 60_000);

    return () => clearInterval(timer);
  }, [config.autoRunEnabled, config.scheduleMode, config.lastSweepAt, runPendingSweep]);

  const syncEmailInboxNow = useCallback(
    async (opts?: { forceAllRecent?: boolean; silent?: boolean }): Promise<number> => {
      setIsSyncingInbox(true);
      try {
        const res = await fetch('/api/email/sync-inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            forceAllRecent: Boolean(opts?.forceAllRecent),
            silentIfUnconfigured: Boolean(opts?.silent),
          }),
        });
        const data = await parseSafeJson(res);
        setInboxLastSyncAt(new Date().toISOString());

        if (!res.ok) {
          if (!opts?.silent) {
            showToast(data?.error || 'Não foi possível verificar a caixa de e-mail.', 'error');
          }
          return 0;
        }

        const importedDocs: CompanyDocument[] = Array.isArray(data?.importedDocuments)
          ? data.importedDocuments
          : [];
        const importedStmts: ConvertedStatement[] = Array.isArray(data?.importedStatements)
          ? data.importedStatements
          : [];

        if (importedDocs.length > 0) {
          setInboxConfigured(true);
          for (const d of importedDocs) {
            await saveDocumentToFirestore(d.companyId, d).catch(() => {});
            if (
              config.autoRunEnabled &&
              d.category === 'extrato' &&
              d.ofxStatus !== 'done' &&
              !d.ofxStatementId
            ) {
              enqueueDocumentForOfx(d);
            }
          }
          setLastInboxSyncEventTs(Date.now());
        }

        if (importedStmts.length > 0) {
          for (const stmt of importedStmts) {
            const stmtCompanyId = stmt.companyId || currentCompany.id;
            await saveStatementToFirestore(stmtCompanyId, stmt).catch(() => {});
            cacheStatementLocally(stmtCompanyId, stmt);
            onStatementCreated?.(stmt);
          }
          setRecentStatements((prev) => {
            const incomingIds = new Set(importedStmts.map((s) => s.id));
            const compact = importedStmts.map(({ fileBase64: _b64, ...rest }) => ({
              ...rest,
              hasOriginalFile: Boolean(rest.hasOriginalFile || rest.sourceDocId),
            }));
            return [...compact, ...prev.filter((s) => !incomingIds.has(s.id))];
          });
          onStatementsChanged();
        }

        if (importedDocs.length > 0) {
          showToast(
            `${importedDocs.length} arquivo(s) importado(s) automaticamente de ${inboxEmailAddress}!`
          );
        } else if (!opts?.silent && data?.message) {
          showToast(data.message);
        }

        return importedDocs.length;
      } catch (err: any) {
        if (!opts?.silent) {
          showToast(err?.message || 'Falha ao sincronizar e-mails.', 'error');
        }
        return 0;
      } finally {
        setIsSyncingInbox(false);
      }
    },
    [
      config.autoRunEnabled,
      enqueueDocumentForOfx,
      inboxEmailAddress,
      onStatementCreated,
      onStatementsChanged,
      showToast,
    ]
  );

  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/email/inbox-settings', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (!active) return;
        setInboxConfigured(Boolean(d?.configured));
        if (d?.user) setInboxEmailAddress(d.user);
        if (d?.lastCheckedAt) setInboxLastSyncAt(d.lastCheckedAt);
        if (d?.configured && d?.enabled) {
          void syncEmailInboxNow({ silent: true });
        }
      } catch {}
    };
    void checkStatus();

    const interval = setInterval(() => {
      if (inboxConfigured) {
        void syncEmailInboxNow({ silent: true });
      }
    }, 60_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [inboxConfigured, syncEmailInboxNow]);

  // Manual OFX Conversion (persists live even when user navigates away from Conversor OFX tab)
  const startManualOfxConversion = useCallback(
    async ({
      file,
      fileBase64,
      mimeType,
      accountingAccount,
      companyId,
      sourceDocId,
    }: {
      file: File;
      fileBase64: string;
      mimeType: string;
      accountingAccount?: string;
      companyId: string;
      sourceDocId?: string;
    }) => {
      let activeFile = file;
      let activeBase64 = fileBase64;
      let splitInfoMessage: string | undefined;

      setManualJob({
        status: 'processing',
        companyId,
        fileName: file.name,
        totalPages: 1,
        processedPages: 0,
        foundTransactions: 0,
        statusLabel: 'Verificando conteúdo do arquivo (extrato x recibos)...',
        updatedAt: new Date().toISOString(),
      });

      try {
        const isPdf = mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        const isPlainTextOrOfx =
          file.name.toLowerCase().endsWith('.txt') ||
          file.name.toLowerCase().endsWith('.ofx') ||
          file.name.toLowerCase().endsWith('.csv') ||
          mimeType.startsWith('text/');

        // Check if PDF contains mixed bank statement + payment receipts
        if (isPdf) {
          const splitResult = await splitAndClassifyPdfFile(file, fileBase64, (msg) => {
            setManualJob((prev) =>
              prev ? { ...prev, statusLabel: msg, updatedAt: new Date().toISOString() } : prev
            );
          });

          if (splitResult?.wasSplit) {
            const extratoGroup = splitResult.groups.find((g) => g.category === 'extrato');
            const otherGroups = splitResult.groups.filter((g) => g.category !== 'extrato');

            // Persist all separated non-extrato receipt groups into Arquivos automatically
            for (const grp of otherGroups) {
              try {
                const sendB64 = grp.base64.length <= 3_300_000 ? grp.base64 : undefined;
                const docRes = await fetch('/api/documents', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    companyId,
                    fileName: grp.fileName,
                    mimeType: 'application/pdf',
                    fileSize: grp.fileSize,
                    fileBase64: sendB64,
                    category: grp.category,
                    competenceMonth: grp.competenceMonth,
                    documentDate: grp.documentDate,
                    issuerOrBank: grp.issuerOrBank,
                    documentNumber: grp.documentNumber,
                    amount: grp.amount,
                    detectedCnpj: grp.detectedCnpj,
                    summary: grp.summary,
                    aiClassified: grp.aiClassified,
                    confidence: 92,
                    sourceGroupLabel: grp.groupLabel,
                    uploadedBy: currentUser.email,
                    autoClassify: false,
                  }),
                });
                if (docRes.ok) {
                  const savedDoc: CompanyDocument = await docRes.json();
                  await saveBlobToIdb(savedDoc.id, grp.base64);
                  await saveDocumentToFirestore(companyId, {
                    ...savedDoc,
                    hasOriginalFile: true,
                  }).catch(() => {});
                }
              } catch (e) {
                console.warn('Falha ao salvar grupo separado em Arquivos:', e);
              }
            }

            if (extratoGroup) {
              activeFile = extratoGroup.file;
              activeBase64 = extratoGroup.base64;
              splitInfoMessage = `PDF misto detectado (${splitResult.totalPages} págs): separadas ${extratoGroup.pageNumbers.length} pág(s) de extrato para OFX e ${otherGroups
                .map((g) => `${g.pageNumbers.length} pág(s) de ${g.groupLabel}`)
                .join(', ')} salvos automaticamente em Arquivos.`;

              // Save separated extrato card too if there was no sourceDocId
              if (!sourceDocId) {
                try {
                  const sendB64 = extratoGroup.base64.length <= 3_300_000 ? extratoGroup.base64 : undefined;
                  const extDocRes = await fetch('/api/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      companyId,
                      fileName: extratoGroup.fileName,
                      mimeType: 'application/pdf',
                      fileSize: extratoGroup.fileSize,
                      fileBase64: sendB64,
                      category: 'extrato',
                      competenceMonth: extratoGroup.competenceMonth,
                      issuerOrBank: extratoGroup.issuerOrBank,
                      summary: extratoGroup.summary,
                      aiClassified: extratoGroup.aiClassified,
                      confidence: 95,
                      sourceGroupLabel: extratoGroup.groupLabel,
                      ofxStatus: 'processing',
                      uploadedBy: currentUser.email,
                      autoClassify: false,
                    }),
                  });
                  if (extDocRes.ok) {
                    const savedExtDoc: CompanyDocument = await extDocRes.json();
                    sourceDocId = savedExtDoc.id;
                    await saveBlobToIdb(savedExtDoc.id, extratoGroup.base64);
                    await saveDocumentToFirestore(companyId, {
                      ...savedExtDoc,
                      hasOriginalFile: true,
                    }).catch(() => {});
                  }
                } catch {}
              }
            } else {
              throw new Error(
                'Este PDF contém apenas recibos/comprovantes ou documentos fiscais (sem extrato bancário). Os arquivos foram salvos separados em Arquivos.'
              );
            }
          }
        }

        let rawText: string | undefined;
        if (isPlainTextOrOfx && !activeBase64) {
          rawText = await activeFile.text();
        } else if (isPlainTextOrOfx) {
          rawText = await activeFile.text().catch(async () => {
            const fallback = await readFileAsBase64(activeFile);
            return atob(fallback);
          });
        }

        const stmt = await convertBinaryToOfxStatement({
          companyId,
          fileName: activeFile.name,
          mimeType: isPdf ? 'application/pdf' : mimeType,
          fileBase64: rawText ? undefined : activeBase64,
          rawText,
          bankHint: accountingAccount ? `Conta contábil: ${accountingAccount}` : undefined,
          sourceDocId,
          onProgress: (p) => {
            setManualJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'processing',
                    fileName: activeFile.name,
                    totalPages: p.totalPages,
                    processedPages: p.processedPages,
                    foundTransactions: p.foundTransactions,
                    statusLabel: p.statusLabel,
                    splitInfoMessage,
                    updatedAt: new Date().toISOString(),
                  }
                : prev
            );
          },
        });

        const detectedCnpj = (stmt as any).extractedCnpj || (stmt as any).detectedCnpj;
        const detectedOrg = (stmt as any).extractedCompanyName || stmt.bankName;
        let companyFound = true;
        if (detectedCnpj) {
          const cleanDetected = detectedCnpj.replace(/\D/g, '');
          const exists = allCompanies.some((c) => c.cnpj.replace(/\D/g, '') === cleanDetected);
          if (!exists) companyFound = false;
        }

        setManualJob({
          status: 'done',
          companyId,
          fileName: activeFile.name,
          totalPages: stmt.totalPages || 1,
          processedPages: stmt.pagesProcessed || stmt.totalPages || 1,
          foundTransactions: stmt.transactionsCount || 0,
          statusLabel: `Concluído • ${stmt.transactionsCount} lançamentos convertidos`,
          result: stmt,
          splitInfoMessage,
          unregisteredPrompt:
            !companyFound && detectedCnpj
              ? {
                  cnpj: detectedCnpj,
                  companyName: detectedOrg || 'Empresa Identificada no Extrato',
                  pendingStatement: stmt,
                }
              : null,
          updatedAt: new Date().toISOString(),
        });

        const normalizedManualStmt: ConvertedStatement = {
          ...stmt,
          companyId: stmt.companyId || companyId,
          sourceDocId: stmt.sourceDocId || sourceDocId,
          originalFileName: stmt.originalFileName || activeFile.name,
          uploadedAt: stmt.uploadedAt || new Date().toISOString(),
        };
        cacheStatementLocally(companyId, normalizedManualStmt);
        const { fileBase64: _omitManualB64, ...compactManualStmt } = normalizedManualStmt;
        setRecentStatements((prev) => [
          { ...compactManualStmt, hasOriginalFile: true },
          ...prev.filter((s) => s.id !== normalizedManualStmt.id),
        ]);
        onStatementCreated?.(normalizedManualStmt);
        onStatementsChanged();
        showToast(`Extrato convertido com sucesso (${stmt.transactionsCount} lançamentos)!`);
      } catch (err: any) {
        setManualJob((prev) => ({
          status: 'error',
          companyId,
          fileName: prev?.fileName || file.name,
          totalPages: prev?.totalPages || 1,
          processedPages: prev?.processedPages || 0,
          foundTransactions: prev?.foundTransactions || 0,
          statusLabel: 'Erro na conversão',
          error: err?.message || 'Erro inesperado ao converter extrato.',
          splitInfoMessage: prev?.splitInfoMessage,
          updatedAt: new Date().toISOString(),
        }));
      }
    },
    [allCompanies, currentUser.email, onStatementCreated, onStatementsChanged, showToast]
  );

  const markStatementDeleted = useCallback((statementId: string) => {
    setRecentStatements((prev) => prev.filter((s) => s.id !== statementId));
  }, []);

  const clearManualJob = useCallback(() => {
    setManualJob(null);
  }, []);

  const dismissUnregisteredPrompt = useCallback(() => {
    setManualJob((prev) => (prev ? { ...prev, unregisteredPrompt: null } : prev));
  }, []);

  const skipUnregisteredCompany = useCallback(() => {
    setManualJob((prev) => (prev ? { ...prev, unregisteredPrompt: null } : prev));
    onStatementsChanged();
  }, [onStatementsChanged]);

  const activeQueueCount = Object.values(docJobs).filter(
    (j: DocOfxJobState) => j.status === 'queued' || j.status === 'processing'
  ).length;

  const activeDocProcessCount = Object.values(docProcessJobs).filter(
    (j: DocProcessingJobState) => j.status === 'queued' || j.status === 'processing'
  ).length;

  return (
    <OfxAgentContext.Provider
      value={{
        autoRunEnabled: config.autoRunEnabled,
        scheduleMode: config.scheduleMode,
        lastSweepAt: config.lastSweepAt,
        nextSweepAt: config.nextSweepAt,
        setAutoRunEnabled,
        setScheduleMode,
        isSweeping,
        isProcessingOtherDocs,
        isConvertingBatchOfx,
        batchOfxProgress,
        activeQueueCount,
        activeDocProcessCount,
        docJobs,
        docProcessJobs,
        manualJob,
        startManualOfxConversion,
        clearManualJob,
        dismissUnregisteredPrompt,
        skipUnregisteredCompany,
        enqueueDocumentForOfx,
        enqueueNonExtratoProcessing,
        convertMultipleDocsToSingleOfx,
        runPendingSweep,
        runPendingNonExtratoSweep,
        lastDocumentPatch,
        recentStatements,
        markStatementDeleted,
        inboxConfigured,
        inboxEmailAddress,
        inboxLastSyncAt,
        isSyncingInbox,
        lastInboxSyncEventTs,
        syncEmailInboxNow,
      }}
    >
      {children}
    </OfxAgentContext.Provider>
  );
};

export function useOfxAgent(): OfxAgentContextValue {
  const ctx = useContext(OfxAgentContext);
  if (!ctx) {
    throw new Error('useOfxAgent deve ser usado dentro de OfxAgentProvider');
  }
  return ctx;
}
