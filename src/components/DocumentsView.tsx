import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderOpen,
  FolderUp,
  Upload,
  Search,
  Sparkles,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileCode,
  File as FileIcon,
  Download,
  Trash2,
  Eye,
  X,
  CheckCircle2,
  Clock,
  Loader2,
  Building2,
  ArrowRight,
  Columns3,
  List,
  Kanban,
  RefreshCw,
  Calendar,
  Archive,
  Bot,
  Play,
  AlertCircle,
  Maximize2,
  Minimize2,
  Mail,
  FolderTree,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  convertImageFileToCompressedPdfFile,
  formatCompactBytes,
  isImageFile,
} from '../utils/imageToCompressedPdf';
import {
  Company,
  CompanyDocument,
  ConvertedStatement,
  DocumentCategory,
  DocumentOfxStatus,
  DocumentStatus,
  OfxAgentScheduleMode,
  User,
} from '../types';
import {
  fetchDocumentsFromFirestore,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
  fetchStatementsFromFirestore,
  subscribeDocumentsFromFirestore,
} from '../firebase/service';
import {
  base64ToBlob,
  base64ToUint8Array,
  cleanBase64,
  deleteBlobFromIdb,
  getBlobFromIdb,
  saveBlobToIdb,
} from '../utils/fileStorage';
import { splitAndClassifyPdfFile } from '../utils/pdfSplitter';
import { PdfCanvasViewer } from './PdfCanvasViewer';
import { useOfxAgent } from '../context/OfxAgentContext';
import { isMasterUser, filterCompaniesForUser } from '../utils/auth';

interface DocumentsViewProps {
  currentUser: User;
  currentCompany: Company;
  allCompanies: Company[];
  onSelectCompany: (companyId: string) => void;
  onOpenInOfxConverter?: (file: File) => void;
  onNavigateToOfx?: () => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

type ViewMode = 'kanban_category' | 'kanban_status' | 'list' | 'explorer';

interface CategoryColumnMeta {
  id: DocumentCategory;
  label: string;
  shortLabel: string;
  description: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
}

const CATEGORY_COLUMNS: CategoryColumnMeta[] = [
  {
    id: 'extrato',
    label: 'Extratos Bancários',
    shortLabel: 'Extratos',
    description: 'Conta corrente, poupança, aplicações e OFX',
    accentText: 'text-teal-700',
    accentBg: 'bg-teal-50/70',
    accentBorder: 'border-teal-200',
  },
  {
    id: 'nota_fiscal',
    label: 'Notas Fiscais',
    shortLabel: 'Notas Fiscais',
    description: 'NF-e, NFS-e, NFC-e, DANFE e XMLs fiscais',
    accentText: 'text-blue-700',
    accentBg: 'bg-blue-50/70',
    accentBorder: 'border-blue-200',
  },
  {
    id: 'guia_imposto',
    label: 'Guias e Impostos',
    shortLabel: 'Guias/Impostos',
    description: 'DARF, DAS, FGTS, GPS, ISS e ICMS',
    accentText: 'text-amber-700',
    accentBg: 'bg-amber-50/70',
    accentBorder: 'border-amber-200',
  },
  {
    id: 'comprovante',
    label: 'Comprovantes & Recibos',
    shortLabel: 'Comprovantes',
    description: 'PIX, TED, boletos pagos e recibos',
    accentText: 'text-emerald-700',
    accentBg: 'bg-emerald-50/70',
    accentBorder: 'border-emerald-200',
  },
  {
    id: 'folha_contrato',
    label: 'Folha & Contratos',
    shortLabel: 'Folha/Contratos',
    description: 'Holerites, contratos sociais e certidões',
    accentText: 'text-indigo-700',
    accentBg: 'bg-indigo-50/70',
    accentBorder: 'border-indigo-200',
  },
  {
    id: 'outro',
    label: 'Outros Documentos',
    shortLabel: 'Outros',
    description: 'Demais documentos relevantes à contabilidade',
    accentText: 'text-slate-700',
    accentBg: 'bg-slate-100/80',
    accentBorder: 'border-slate-200',
  },
];

const STATUS_COLUMNS: {
  id: DocumentStatus;
  label: string;
  description: string;
  dotColor: string;
  textColor: string;
}[] = [
  {
    id: 'pendente',
    label: 'Recebido / Pendente',
    description: 'Aguardando conferência da equipe contábil',
    dotColor: 'bg-amber-500',
    textColor: 'text-amber-700',
  },
  {
    id: 'em_analise',
    label: 'Em Análise',
    description: 'Em conferência ou integração fiscal/contábil',
    dotColor: 'bg-blue-600',
    textColor: 'text-blue-700',
  },
  {
    id: 'contabilizado',
    label: 'Contabilizado',
    description: 'Escriturado e arquivado na competência',
    dotColor: 'bg-emerald-600',
    textColor: 'text-emerald-700',
  },
  {
    id: 'concluido',
    label: 'Concluído / Arquivado',
    description: 'Processo finalizado e arquivado definitivamente',
    dotColor: 'bg-teal-600',
    textColor: 'text-teal-800',
  },
];

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(val?: number): string {
  if (val === undefined || val === null || isNaN(val)) return '';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getFileIcon(mimeType: string, fileName: string) {
  const lower = (fileName || '').toLowerCase();
  if (mimeType.startsWith('image/')) return ImageIcon;
  if (lower.endsWith('.xml') || lower.endsWith('.ofx')) return FileCode;
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return FileSpreadsheet;
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return FileText;
  return FileIcon;
}

async function prepareClassificationPayload(file: File, fullBase64: string): Promise<{
  classificationBase64?: string;
  textPreview?: string;
}> {
  const lower = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  // Text / XML / CSV / OFX
  if (
    mime.startsWith('text/') ||
    mime.includes('xml') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.ofx') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.txt')
  ) {
    try {
      const text = await file.text();
      return { textPreview: text.slice(0, 10000) };
    } catch {
      return {};
    }
  }

  // Image: compress if > 1.2MB for fast classification
  if (mime.startsWith('image/')) {
    if (fullBase64.length <= 1_600_000) {
      return { classificationBase64: fullBase64 };
    }
    try {
      const url = URL.createObjectURL(file);
      const compressed = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1400;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          resolve(dataUrl.split(',')[1]);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve('');
        };
        img.src = url;
      });
      if (compressed) return { classificationBase64: compressed };
    } catch {}
  }

  // PDF: slice first page if PDF is larger than 1.6MB so AI classification stays fast & under Vercel payload limits
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    if (fullBase64.length <= 2_200_000) {
      return { classificationBase64: fullBase64 };
    }
    try {
      const ab = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      if (srcDoc.getPageCount() >= 1) {
        const subDoc = await PDFDocument.create();
        const [firstPage] = await subDoc.copyPages(srcDoc, [0]);
        subDoc.addPage(firstPage);
        const bytes = await subDoc.save();
        let bin = '';
        for (let i = 0; i < bytes.length; i++) {
          bin += String.fromCharCode(bytes[i]);
        }
        return { classificationBase64: btoa(bin) };
      }
    } catch {}
  }

  return {};
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  currentUser,
  currentCompany,
  allCompanies,
  onSelectCompany,
  onOpenInOfxConverter,
  onNavigateToOfx,
  showToast,
}) => {
  const isMaster = isMasterUser(currentUser);
  const visibleCompanies = filterCompaniesForUser(allCompanies, currentUser);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    autoRunEnabled,
    scheduleMode,
    lastSweepAt,
    nextSweepAt,
    setAutoRunEnabled,
    setScheduleMode,
    isSweeping,
    isProcessingOtherDocs,
    activeQueueCount,
    activeDocProcessCount,
    docJobs,
    docProcessJobs,
    enqueueDocumentForOfx,
    enqueueNonExtratoProcessing,
    runPendingSweep,
    runPendingNonExtratoSweep,
    lastDocumentPatch,
    recentStatements,
    inboxConfigured,
    inboxEmailAddress,
    isSyncingInbox,
    lastInboxSyncEventTs,
    syncEmailInboxNow,
    isConvertingBatchOfx,
    batchOfxProgress,
    convertMultipleDocsToSingleOfx,
  } = useOfxAgent();

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban_category');
  const [explorerCompanyId, setExplorerCompanyId] = useState<string | null>(null);
  const [explorerCategory, setExplorerCategory] = useState<DocumentCategory | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [competenceFilter, setCompetenceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');

  // Upload queue state
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);
  const [uploadingQueue, setUploadingQueue] = useState<{
    total: number;
    completed: number;
    currentFileName: string;
  } | null>(null);

  // Drag-and-drop across Kanban columns
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragTargetCol, setDragTargetCol] = useState<string | null>(null);

  // Selected document detail modal
  const [selectedDoc, setSelectedDoc] = useState<CompanyDocument | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const reattachInputRef = useRef<HTMLInputElement>(null);

  // Editable detail fields
  const [editDraft, setEditDraft] = useState<{
    category: DocumentCategory;
    status: DocumentStatus;
    competenceMonth: string;
    documentDate: string;
    issuerOrBank: string;
    documentNumber: string;
    amount: string;
    detectedCnpj: string;
    notes: string;
  } | null>(null);

  const cacheKey = `contsuite_cached_docs_${currentCompany.id}`;

  const mergeDocsIntoState = useCallback(
    (incomingDocs: CompanyDocument[]) => {
      if (!currentCompany.id || incomingDocs.length === 0) return;
      setDocuments((prev) => {
        const map = new Map<string, CompanyDocument>();
        prev.forEach((d) => {
          if (d && d.id && d.companyId === currentCompany.id) {
            map.set(d.id, d);
          }
        });
        let changed = false;
        incomingDocs.forEach((d) => {
          if (d && d.id && d.companyId === currentCompany.id) {
            const existing = map.get(d.id);
            const nextDoc: CompanyDocument = {
              ...existing,
              ...d,
              hasOriginalFile: Boolean(d.hasOriginalFile || existing?.hasOriginalFile),
            };
            if (
              !existing ||
              existing.updatedAt !== nextDoc.updatedAt ||
              existing.status !== nextDoc.status ||
              existing.category !== nextDoc.category
            ) {
              changed = true;
            }
            map.set(d.id, nextDoc);
          }
        });
        if (!changed && prev.length === map.size) return prev;
        const merged = Array.from(map.values()).sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );
        try {
          localStorage.setItem(cacheKey, JSON.stringify(merged.map(({ fileBase64, ...rest }) => rest)));
        } catch {}
        return merged;
      });
    },
    [currentCompany.id, cacheKey]
  );

  const loadDocuments = useCallback(async (silent: boolean = false) => {
    if (!currentCompany.id) return;
    if (!silent) setLoading(true);
    let apiDocs: CompanyDocument[] = [];
    try {
      const res = await fetch(`/api/documents?companyId=${currentCompany.id}`, { cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        apiDocs = await res.json();
      }
    } catch (err) {
      if (!silent) console.warn('Could not load documents from API:', err);
    }

    let firestoreDocs: CompanyDocument[] = [];
    if (!silent) {
      try {
        firestoreDocs = await fetchDocumentsFromFirestore(currentCompany.id);
      } catch (err) {
        console.warn('Could not load documents from Firestore:', err);
      }
    }

    let localDocs: CompanyDocument[] = [];
    if (!silent) {
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) localDocs = JSON.parse(raw);
      } catch {}
    }

    if (silent) {
      if (apiDocs.length > 0) {
        mergeDocsIntoState(apiDocs);
      }
      return;
    }

    const map = new Map<string, CompanyDocument>();
    [...localDocs, ...firestoreDocs, ...apiDocs].forEach((d) => {
      if (d && d.id && d.companyId === currentCompany.id) {
        const existing = map.get(d.id);
        map.set(d.id, {
          ...existing,
          ...d,
          hasOriginalFile: Boolean(d.hasOriginalFile || existing?.hasOriginalFile),
        });
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    setDocuments(merged);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(merged.map(({ fileBase64, ...rest }) => rest)));
    } catch {}
    setLoading(false);
  }, [currentCompany.id, cacheKey, mergeDocsIntoState]);

  useEffect(() => {
    setSelectedDocIds([]);
    void loadDocuments(false);
  }, [loadDocuments, currentCompany.id]);

  // Real-time cross-device sync: Firestore onSnapshot + instant custom event + silent 3s API poll
  useEffect(() => {
    if (!currentCompany.id) return;

    const unsubscribe = subscribeDocumentsFromFirestore(currentCompany.id, (liveDocs) => {
      if (liveDocs.length > 0) {
        mergeDocsIntoState(liveDocs);
      }
    });

    const handleLocalDocSaved = (e: Event) => {
      const customEv = e as CustomEvent<CompanyDocument>;
      if (customEv.detail && customEv.detail.companyId === currentCompany.id) {
        mergeDocsIntoState([customEv.detail]);
      }
    };

    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadDocuments(true);
      }
    };

    window.addEventListener('contsuite:document-saved', handleLocalDocSaved);
    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    const pollInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadDocuments(true);
      }
    }, 3000);

    return () => {
      unsubscribe();
      window.removeEventListener('contsuite:document-saved', handleLocalDocSaved);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.clearInterval(pollInterval);
    };
  }, [currentCompany.id, loadDocuments, mergeDocsIntoState]);

  useEffect(() => {
    if (lastInboxSyncEventTs > 0) {
      void loadDocuments(true);
    }
  }, [lastInboxSyncEventTs, loadDocuments]);

  // Sync live OFX agent updates into documents list & cache
  useEffect(() => {
    if (!lastDocumentPatch) return;
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === lastDocumentPatch.docId);
      if (idx === -1) return prev;
      const next = prev.map((d) =>
        d.id === lastDocumentPatch.docId ? { ...d, ...lastDocumentPatch.patch } : d
      );
      try {
        localStorage.setItem(cacheKey, JSON.stringify(next.map(({ fileBase64, ...rest }) => rest)));
      } catch {}
      return next;
    });
    setSelectedDoc((prev) =>
      prev && prev.id === lastDocumentPatch.docId ? { ...prev, ...lastDocumentPatch.patch } : prev
    );
    if (selectedDoc?.id === lastDocumentPatch.docId) {
      const p = lastDocumentPatch.patch;
      setEditDraft((prev) =>
        prev
          ? {
              ...prev,
              category: p.category || prev.category,
              status: p.status || prev.status,
              competenceMonth: p.competenceMonth || prev.competenceMonth,
              documentDate: p.documentDate !== undefined ? p.documentDate : prev.documentDate,
              issuerOrBank: p.issuerOrBank !== undefined ? p.issuerOrBank : prev.issuerOrBank,
              documentNumber:
                p.documentNumber !== undefined ? p.documentNumber : prev.documentNumber,
              amount: p.amount !== undefined ? String(p.amount) : prev.amount,
              detectedCnpj: p.detectedCnpj !== undefined ? p.detectedCnpj : prev.detectedCnpj,
              notes: p.notes !== undefined ? p.notes : prev.notes,
            }
          : prev
      );
    }
  }, [lastDocumentPatch, cacheKey, selectedDoc?.id]);

  // Helper to update local + cache state cleanly
  const persistCacheList = useCallback(
    (list: CompanyDocument[]) => {
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify(list.map(({ fileBase64, ...rest }) => rest))
        );
      } catch {}
    },
    [cacheKey]
  );

  // Available competence months from documents
  const competenceOptions = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      if (d.competenceMonth) set.add(d.competenceMonth);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [documents]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return documents.filter((d) => {
      if (competenceFilter !== 'all' && d.competenceMonth !== competenceFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          d.fileName,
          d.issuerOrBank,
          d.documentNumber,
          d.summary,
          d.detectedCnpj,
          d.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [documents, competenceFilter, statusFilter, searchTerm]);

  // Summary metrics
  const stats = useMemo(() => {
    const total = filteredDocs.length;
    const aiCount = filteredDocs.filter((d) => d.aiClassified).length;
    const pendingCount = filteredDocs.filter((d) => d.status === 'pendente').length;
    const doneCount = filteredDocs.filter(
      (d) => d.status === 'contabilizado' || d.status === 'concluido'
    ).length;
    return { total, aiCount, pendingCount, doneCount };
  }, [filteredDocs]);

  // Read file as base64
  const readFileBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
      reader.readAsDataURL(file);
    });

  // Upload & classify batch of files (with automatic mixed-PDF splitting + Auto OFX Agent)
  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploadingQueue({ total: files.length, completed: 0, currentFileName: files[0].name });
    let createdCardsCount = 0;
    let splitFilesCount = 0;
    let triggeredOfxCount = 0;

    const persistCreatedCard = async (
      savedDoc: CompanyDocument,
      binaryBase64: string
    ) => {
      await saveBlobToIdb(savedDoc.id, binaryBase64);
      savedDoc.hasOriginalFile = true;

      try {
        await saveDocumentToFirestore(currentCompany.id, savedDoc);
      } catch (fErr) {
        console.warn('Firestore save document warning:', fErr);
      }

      setDocuments((prev) => {
        const next = [savedDoc, ...prev.filter((d) => d.id !== savedDoc.id)];
        persistCacheList(next);
        return next;
      });
      createdCardsCount++;

      // Automatic OFX Agent trigger for bank statements on upload
      if (
        autoRunEnabled &&
        scheduleMode === 'on_upload' &&
        savedDoc.category === 'extrato'
      ) {
        enqueueDocumentForOfx(savedDoc, binaryBase64);
        triggeredOfxCount++;
      }
    };

    for (let i = 0; i < files.length; i++) {
      const rawFile = files[i];
      setUploadingQueue({ total: files.length, completed: i, currentFileName: rawFile.name });

      try {
        let file = rawFile;
        let fullBase64 = '';
        if (isImageFile(rawFile)) {
          setUploadingQueue({
            total: files.length,
            completed: i,
            currentFileName: `${rawFile.name} — Convertendo foto para PDF comprimido...`,
          });
          const converted = await convertImageFileToCompressedPdfFile(rawFile);
          file = converted.pdfFile;
          fullBase64 = converted.base64;
        } else {
          fullBase64 = await readFileBase64(file);
        }

        const mimeType =
          file.type ||
          (file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : file.name.toLowerCase().endsWith('.xml')
              ? 'application/xml'
              : 'application/octet-stream');

        const isPdf = mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

        // Step 1: For multi-page PDFs, analyze page-by-page and ALWAYS separate extratos from receipts/other docs
        if (isPdf) {
          const splitResult = await splitAndClassifyPdfFile(file, fullBase64, (statusText) => {
            setUploadingQueue({
              total: files.length,
              completed: i,
              currentFileName: `${file.name} — ${statusText}`,
            });
          });

          if (splitResult && splitResult.groups.length > 0) {
            if (splitResult.wasSplit) splitFilesCount++;

            for (const grp of splitResult.groups) {
              const sendGroupB64 = grp.base64.length <= 3_300_000 ? grp.base64 : undefined;
              const willAutoOfx =
                autoRunEnabled && scheduleMode === 'on_upload' && grp.category === 'extrato';

              const res = await fetch('/api/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  companyId: currentCompany.id,
                  fileName: grp.fileName,
                  mimeType: 'application/pdf',
                  fileSize: grp.fileSize,
                  fileBase64: sendGroupB64,
                  category: grp.category,
                  competenceMonth: grp.competenceMonth,
                  documentDate: grp.documentDate,
                  issuerOrBank: grp.issuerOrBank,
                  documentNumber: grp.documentNumber,
                  amount: grp.amount,
                  detectedCnpj: grp.detectedCnpj,
                  summary: grp.summary,
                  aiClassified: grp.aiClassified,
                  confidence: grp.aiClassified ? 94 : 80,
                  sourceGroupLabel: grp.groupLabel,
                  ofxStatus: willAutoOfx ? 'queued' : undefined,
                  uploadedBy: currentUser.email,
                  autoClassify: false,
                }),
              });

              let savedDoc: CompanyDocument | null = null;
              if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
                savedDoc = await res.json();
              } else {
                const now = new Date().toISOString();
                savedDoc = {
                  id: 'doc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000),
                  companyId: currentCompany.id,
                  fileName: grp.fileName.slice(0, 200),
                  mimeType: 'application/pdf',
                  fileSize: grp.fileSize,
                  category: grp.category,
                  status: 'pendente',
                  competenceMonth: grp.competenceMonth || now.slice(0, 7),
                  documentDate: grp.documentDate,
                  issuerOrBank: grp.issuerOrBank,
                  documentNumber: grp.documentNumber,
                  amount: grp.amount,
                  detectedCnpj: grp.detectedCnpj,
                  summary: grp.summary,
                  aiClassified: grp.aiClassified,
                  sourceGroupLabel: grp.groupLabel,
                  ofxStatus: willAutoOfx ? 'queued' : undefined,
                  uploadedBy: currentUser.email,
                  uploadedAt: now,
                  updatedAt: now,
                  hasOriginalFile: true,
                };
              }

              if (savedDoc) {
                await persistCreatedCard(savedDoc, grp.base64);
              }
            }
            continue;
          }
        }

        // Step 2: Single-page PDF or non-PDF upload path
        const { classificationBase64, textPreview } = await prepareClassificationPayload(file, fullBase64);
        const sendFullFile = fullBase64.length <= 3_300_000 ? fullBase64 : undefined;

        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: currentCompany.id,
            fileName: file.name,
            mimeType,
            fileSize: file.size,
            fileBase64: sendFullFile,
            classificationBase64,
            textPreview,
            uploadedBy: currentUser.email,
            autoClassify: true,
          }),
        });

        let savedDoc: CompanyDocument | null = null;
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          savedDoc = await res.json();
        } else {
          const now = new Date().toISOString();
          savedDoc = {
            id: 'doc-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000),
            companyId: currentCompany.id,
            fileName: file.name.slice(0, 200),
            mimeType: mimeType.slice(0, 120),
            fileSize: file.size,
            category: 'outro',
            status: 'pendente',
            competenceMonth: now.slice(0, 7),
            summary: 'Arquivo adicionado ao repositório da empresa.',
            aiClassified: false,
            uploadedBy: currentUser.email,
            uploadedAt: now,
            updatedAt: now,
            hasOriginalFile: true,
          };
        }

        if (savedDoc) {
          await persistCreatedCard(savedDoc, fullBase64);
        }
      } catch (err: any) {
        showToast(`Erro ao processar "${rawFile.name}": ${err?.message || 'falha'}`, 'error');
      }
    }

    setUploadingQueue(null);
    if (createdCardsCount > 0) {
      const splitSuffix =
        splitFilesCount > 0
          ? ` (${createdCardsCount} cards criados com separação automática de extratos e recibos)`
          : '';
      const ofxSuffix =
        triggeredOfxCount > 0
          ? ` • Agente OFX iniciado automaticamente para ${triggeredOfxCount} extrato(s).`
          : '';
      showToast(`Importação concluída!${splitSuffix}${ofxSuffix}`);
    }
  };

  // Update category or status (drag-and-drop or modal edit)
  const handleUpdateDocument = async (
    docId: string,
    updates: Partial<CompanyDocument>,
    silentToast = false
  ) => {
    const existing = documents.find((d) => d.id === docId);
    if (!existing) return;

    const optimistic: CompanyDocument = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    setDocuments((prev) => {
      const next = prev.map((d) => (d.id === docId ? optimistic : d));
      persistCacheList(next);
      return next;
    });

    if (selectedDoc && selectedDoc.id === docId) {
      setSelectedDoc(optimistic);
    }

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const updatedFromApi = await res.json();
        setDocuments((prev) => {
          const next = prev.map((d) => (d.id === docId ? { ...optimistic, ...updatedFromApi } : d));
          persistCacheList(next);
          return next;
        });
      }
    } catch (err) {
      console.warn('API update document warning:', err);
    }

    try {
      await saveDocumentToFirestore(currentCompany.id, optimistic);
    } catch (fErr) {
      console.warn('Firestore update document warning:', fErr);
    }

    if (!silentToast) {
      showToast('Classificação e dados do arquivo atualizados.');
    }
  };

  // Delete document
  const handleDeleteDocument = async (docId: string) => {
    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      persistCacheList(next);
      return next;
    });
    if (selectedDoc?.id === docId) {
      closeDetailModal();
    }
    setConfirmDeleteId(null);

    await deleteBlobFromIdb(docId);

    try {
      await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    } catch {}

    try {
      await deleteDocumentFromFirestore(currentCompany.id, docId);
    } catch (fErr) {
      console.warn('Firestore delete document warning:', fErr);
    }

    showToast('Arquivo removido com sucesso.');
  };

  const isPdfDoc = (docItem: CompanyDocument) =>
    docItem.mimeType === 'application/pdf' || docItem.fileName.toLowerCase().endsWith('.pdf');

  const isImageDoc = (docItem: CompanyDocument) =>
    (docItem.mimeType || '').startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(docItem.fileName || '');

  const getEffectiveImageMime = (docItem: CompanyDocument) => {
    if ((docItem.mimeType || '').startsWith('image/')) return docItem.mimeType;
    const lower = (docItem.fileName || '').toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  };

  // Fetch file binary (In-memory -> IndexedDB -> API)
  const resolveFileBase64 = async (docItem: CompanyDocument): Promise<string | null> => {
    if (docItem.fileBase64) return cleanBase64(docItem.fileBase64);
    const localB64 = await getBlobFromIdb(docItem.id);
    if (localB64) return cleanBase64(localB64);

    try {
      const res = await fetch(`/api/documents/${docItem.id}`, { cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const full = await res.json();
        if (full?.fileBase64) {
          const cleaned = cleanBase64(full.fileBase64);
          await saveBlobToIdb(docItem.id, cleaned);
          return cleaned;
        }
      }
    } catch {}
    return null;
  };

  const applyPreviewContent = (docItem: CompanyDocument, rawB64: string | null) => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewTextContent(null);
    const b64 = rawB64 ? cleanBase64(rawB64) : null;
    setPreviewBase64(b64);

    if (!b64) return;
    const lower = docItem.fileName.toLowerCase();
    const mime = (docItem.mimeType || '').toLowerCase();

    if (
      mime.startsWith('text/') ||
      mime.includes('xml') ||
      lower.endsWith('.xml') ||
      lower.endsWith('.ofx') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.txt')
    ) {
      try {
        const decoded = new TextDecoder('utf-8').decode(base64ToUint8Array(b64));
        setPreviewTextContent(decoded.slice(0, 25000));
      } catch {}
    } else if (isPdfDoc(docItem)) {
      try {
        const blob = base64ToBlob(b64, 'application/pdf');
        setPreviewBlobUrl(URL.createObjectURL(blob));
      } catch {}
    } else if (isImageDoc(docItem)) {
      try {
        const blob = base64ToBlob(b64, getEffectiveImageMime(docItem));
        setPreviewBlobUrl(URL.createObjectURL(blob));
      } catch {}
    }
  };

  // Open detail modal with preview
  const openDetailModal = async (docItem: CompanyDocument) => {
    setSelectedDoc(docItem);
    setConfirmDeleteId(null);
    setIsPreviewExpanded(false);
    setEditDraft({
      category: docItem.category,
      status: docItem.status,
      competenceMonth: docItem.competenceMonth || new Date().toISOString().slice(0, 7),
      documentDate: docItem.documentDate || '',
      issuerOrBank: docItem.issuerOrBank || '',
      documentNumber: docItem.documentNumber || '',
      amount: docItem.amount !== undefined ? String(docItem.amount) : '',
      detectedCnpj: docItem.detectedCnpj || '',
      notes: docItem.notes || '',
    });

    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewBase64(null);
    setPreviewTextContent(null);
    setLoadingPreview(true);

    const b64 = await resolveFileBase64(docItem);
    applyPreviewContent(docItem, b64);
    setLoadingPreview(false);
  };

  const handleReattachFile = async (docItem: CompanyDocument, rawFile: File) => {
    try {
      setLoadingPreview(true);
      let b64: string;
      let nextFileName = docItem.fileName;
      let nextMimeType = docItem.mimeType;
      let nextSize = docItem.fileSize;

      if (isImageFile(rawFile)) {
        const converted = await convertImageFileToCompressedPdfFile(rawFile);
        b64 = cleanBase64(converted.base64);
        nextFileName = docItem.fileName.toLowerCase().endsWith('.pdf')
          ? docItem.fileName
          : converted.pdfFile.name;
        nextMimeType = 'application/pdf';
        nextSize = converted.compressedSize;
      } else {
        b64 = cleanBase64(await readFileBase64(rawFile));
      }

      await saveBlobToIdb(docItem.id, b64);
      const updatedDoc: CompanyDocument = {
        ...docItem,
        fileName: nextFileName,
        mimeType: nextMimeType,
        fileSize: nextSize,
        hasOriginalFile: true,
      };
      setDocuments((prev) => {
        const next = prev.map((d) => (d.id === docItem.id ? updatedDoc : d));
        persistCacheList(next);
        return next;
      });
      setSelectedDoc((prev) => (prev?.id === docItem.id ? updatedDoc : prev));
      applyPreviewContent(updatedDoc, b64);
      showToast(
        isImageFile(rawFile)
          ? `Foto convertida para PDF comprimido (${formatCompactBytes(nextSize)}) e vinculada!`
          : 'Arquivo vinculado localmente para pré-visualização!'
      );
    } catch (err: any) {
      showToast(err?.message || 'Falha ao vincular arquivo.', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const closeDetailModal = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewBlobUrl(null);
    setPreviewBase64(null);
    setPreviewTextContent(null);
    setSelectedDoc(null);
    setEditDraft(null);
    setConfirmDeleteId(null);
    setIsPreviewExpanded(false);
  };

  const handleDownloadFile = async (docItem: CompanyDocument) => {
    const b64 = selectedDoc?.id === docItem.id && previewBase64 ? previewBase64 : await resolveFileBase64(docItem);
    if (!b64) {
      showToast('Conteúdo original indisponível para download neste dispositivo.', 'error');
      return;
    }
    const blob = base64ToBlob(b64, docItem.mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docItem.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendToOfx = async (docItem: CompanyDocument) => {
    if (!onOpenInOfxConverter) return;
    const b64 = await resolveFileBase64(docItem);
    if (!b64) {
      showToast('Arquivo original indisponível para envio ao Conversor OFX.', 'error');
      return;
    }
    const blob = base64ToBlob(b64, docItem.mimeType);
    const file = new File([blob], docItem.fileName, { type: docItem.mimeType });
    onOpenInOfxConverter(file);
  };

  const handleReclassifyWithAI = async () => {
    if (!selectedDoc) return;
    setReclassifying(true);
    try {
      const b64 = previewBase64 || (await resolveFileBase64(selectedDoc));
      let classificationBase64: string | undefined = b64 || undefined;
      if (b64 && b64.length > 2_200_000 && selectedDoc.fileName.toLowerCase().endsWith('.pdf')) {
        try {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const subDoc = await PDFDocument.create();
          const [firstPage] = await subDoc.copyPages(srcDoc, [0]);
          subDoc.addPage(firstPage);
          const out = await subDoc.save();
          let bin = '';
          for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
          classificationBase64 = btoa(bin);
        } catch {}
      }

      const res = await fetch('/api/documents/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: selectedDoc.fileName,
          mimeType: selectedDoc.mimeType,
          base64Data: classificationBase64,
          textPreview: previewTextContent || undefined,
        }),
      });
      if (!res.ok) throw new Error('Falha na reclassificação');
      const result = await res.json();

      setEditDraft((prev) =>
        prev
          ? {
              ...prev,
              category: result.category || prev.category,
              competenceMonth: result.competenceMonth || prev.competenceMonth,
              documentDate: result.documentDate || prev.documentDate,
              issuerOrBank: result.issuerOrBank || prev.issuerOrBank,
              documentNumber: result.documentNumber || prev.documentNumber,
              amount: result.amount !== undefined ? String(result.amount) : prev.amount,
              detectedCnpj: result.detectedCnpj || prev.detectedCnpj,
            }
          : null
      );

      await handleUpdateDocument(
        selectedDoc.id,
        {
          category: result.category,
          competenceMonth: result.competenceMonth,
          documentDate: result.documentDate,
          issuerOrBank: result.issuerOrBank,
          documentNumber: result.documentNumber,
          amount: result.amount,
          detectedCnpj: result.detectedCnpj,
          summary: result.summary,
          aiClassified: result.aiClassified,
          confidence: result.confidence,
        },
        true
      );
      showToast('Documento reanalisado e classificado com sucesso!');
    } catch (err: any) {
      showToast(err?.message || 'Erro ao reclassificar documento.', 'error');
    } finally {
      setReclassifying(false);
    }
  };

  const handleSaveDetailEdits = async () => {
    if (!selectedDoc || !editDraft) return;
    setSavingDetail(true);
    const parsedAmt = editDraft.amount.trim()
      ? Number(editDraft.amount.replace(',', '.'))
      : undefined;
    await handleUpdateDocument(selectedDoc.id, {
      category: editDraft.category,
      status: editDraft.status,
      competenceMonth: editDraft.competenceMonth || selectedDoc.competenceMonth,
      documentDate: editDraft.documentDate || undefined,
      issuerOrBank: editDraft.issuerOrBank || undefined,
      documentNumber: editDraft.documentNumber || undefined,
      amount: parsedAmt !== undefined && !isNaN(parsedAmt) ? parsedAmt : undefined,
      detectedCnpj: editDraft.detectedCnpj || undefined,
      notes: editDraft.notes || undefined,
    });
    setSavingDetail(false);
  };

  // Drag-and-drop card handlers
  const handleCardDragStart = (e: React.DragEvent, docId: string) => {
    setDraggingDocId(docId);
    e.dataTransfer.setData('text/plain', docId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDropCategory = async (e: React.DragEvent, targetCategory: DocumentCategory) => {
    e.preventDefault();
    setDragTargetCol(null);
    const id = draggingDocId || e.dataTransfer.getData('text/plain');
    setDraggingDocId(null);
    if (!id) return;
    const docItem = documents.find((d) => d.id === id);
    if (!docItem || docItem.category === targetCategory) return;
    await handleUpdateDocument(id, { category: targetCategory }, true);
    const colLabel = CATEGORY_COLUMNS.find((c) => c.id === targetCategory)?.label || targetCategory;
    showToast(`Movido para "${colLabel}".`);
  };

  const handleColumnDropStatus = async (e: React.DragEvent, targetStatus: DocumentStatus) => {
    e.preventDefault();
    setDragTargetCol(null);
    const id = draggingDocId || e.dataTransfer.getData('text/plain');
    setDraggingDocId(null);
    if (!id) return;
    const docItem = documents.find((d) => d.id === id);
    if (!docItem || docItem.status === targetStatus) return;
    await handleUpdateDocument(id, { status: targetStatus }, true);
    const stLabel = STATUS_COLUMNS.find((s) => s.id === targetStatus)?.label || targetStatus;
    showToast(`Status alterado para "${stLabel}".`);
  };

  const handleDownloadGeneratedOfx = async (
    statementId: string | undefined,
    fallbackName: string,
    docItem?: CompanyDocument
  ) => {
    try {
      const findMatch = (list: ConvertedStatement[]) =>
        list.find(
          (s) =>
            (statementId && s.id === statementId) ||
            (docItem && s.sourceDocId === docItem.id)
        );

      let stmt: ConvertedStatement | undefined = findMatch(recentStatements);

      if (!stmt?.ofxContent && currentCompany.id) {
        try {
          const raw = localStorage.getItem(`contsuite_cached_statements_${currentCompany.id}`);
          if (raw) {
            stmt = findMatch(JSON.parse(raw) as ConvertedStatement[]);
          }
        } catch {}
      }

      if (!stmt?.ofxContent && statementId) {
        try {
          const res = await fetch(`/api/ofx/statements/${statementId}`, { cache: 'no-store' });
          if (res.ok) {
            stmt = await res.json();
          }
        } catch {}
      }

      if (!stmt?.ofxContent && currentCompany.id) {
        try {
          const fStmts = await fetchStatementsFromFirestore(currentCompany.id);
          stmt = findMatch(fStmts);
        } catch {}
      }

      if (!stmt?.ofxContent && currentCompany.id) {
        try {
          const histRes = await fetch(`/api/ofx/history?companyId=${currentCompany.id}`, {
            cache: 'no-store',
          });
          if (histRes.ok) {
            const histList: ConvertedStatement[] = await histRes.json();
            stmt = findMatch(histList);
          }
        } catch {}
      }

      if (!stmt?.ofxContent) {
        throw new Error('Conteúdo OFX ainda indisponível. Clique em "Refazer" para gerar novamente.');
      }

      const blob = new Blob([stmt.ofxContent], { type: 'application/x-ofx;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fallbackName.replace(/\.[^/.]+$/, '')}.ofx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível baixar o arquivo OFX.', 'error');
    }
  };

  const handleArchiveDocument = async (docItem: CompanyDocument) => {
    await handleUpdateDocument(docItem.id, { status: 'concluido' }, true);
    showToast(`"${docItem.fileName}" arquivado em Concluído.`);
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleToggleSelectAllFiltered = () => {
    const visibleIds = filteredDocs.map((d) => d.id);
    if (visibleIds.length === 0) return;
    const allSelected = visibleIds.every((id) => selectedDocIds.includes(id));
    if (allSelected) {
      setSelectedDocIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedDocIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleConvertSelectedToSingleOfx = async () => {
    const selectedDocs = documents.filter((d) => selectedDocIds.includes(d.id));
    if (selectedDocs.length === 0) {
      showToast('Selecione pelo menos um arquivo para gerar o OFX.', 'error');
      return;
    }

    const stmt = await convertMultipleDocsToSingleOfx(selectedDocs, resolveFileBase64);
    if (stmt) {
      setDocuments((prev) => {
        const next = prev.map((d) =>
          selectedDocIds.includes(d.id)
            ? {
                ...d,
                ofxStatus: 'done' as DocumentOfxStatus,
                ofxStatementId: stmt.id,
                ofxError: '',
              }
            : d
        );
        persistCacheList(next);
        return next;
      });
      setSelectedDocIds([]);
      if (onNavigateToOfx) {
        onNavigateToOfx();
      }
    }
  };

  const renderDocCard = (docItem: CompanyDocument, showCategoryLabel: boolean) => {
    const Icon = getFileIcon(docItem.mimeType, docItem.fileName);
    const catMeta = CATEGORY_COLUMNS.find((c) => c.id === docItem.category) || CATEGORY_COLUMNS[5];
    const stMeta = STATUS_COLUMNS.find((s) => s.id === docItem.status) || STATUS_COLUMNS[0];

    const liveJob = docJobs[docItem.id];
    const matchedRecentStmt = recentStatements.find(
      (s) =>
        (docItem.ofxStatementId && s.id === docItem.ofxStatementId) ||
        s.sourceDocId === docItem.id
    );
    const effectiveStatementId =
      liveJob?.statementId || docItem.ofxStatementId || matchedRecentStmt?.id;
    const effectiveOfxStatus: DocumentOfxStatus | undefined =
      liveJob?.status || docItem.ofxStatus || (effectiveStatementId ? 'done' : undefined);
    const progressPct =
      liveJob && liveJob.totalPages > 0
        ? Math.min(100, Math.round((liveJob.processedPages / liveJob.totalPages) * 100))
        : 0;

    const docProcJob = docProcessJobs[docItem.id];
    const isNonExtratoProcessed =
      docItem.category !== 'extrato' &&
      (docProcJob?.status === 'done' ||
        Boolean(docItem.notes && docItem.notes.includes('[Processado IA]')));
    const isSelected = selectedDocIds.includes(docItem.id);

    return (
      <div
        key={docItem.id}
        draggable
        onDragStart={(e) => handleCardDragStart(e, docItem.id)}
        onDragEnd={() => {
          setDraggingDocId(null);
          setDragTargetCol(null);
        }}
        onClick={() => openDetailModal(docItem)}
        className={`group bg-white border rounded-xl p-3 transition-colors cursor-pointer select-none ${
          isSelected
            ? 'border-[#00897b] ring-2 ring-[#00897b]/25 bg-teal-50/20'
            : 'border-slate-200 hover:border-teal-400'
        } ${draggingDocId === docItem.id ? 'opacity-50' : ''}`}
      >
        {/* Top line: Radio selector + Icon + File Name */}
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Selecionar ${docItem.fileName} para OFX único`}
            title={isSelected ? 'Desmarcar arquivo' : 'Selecionar para unificar em 1 OFX'}
            onClick={(e) => {
              e.stopPropagation();
              toggleDocSelection(docItem.id);
            }}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-colors cursor-pointer ${
              isSelected
                ? 'border-[#00897b] bg-teal-50'
                : 'border-slate-300 hover:border-[#00897b] bg-white'
            }`}
          >
            {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-[#00897b]" />}
          </button>

          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 truncate" title={docItem.fileName}>
              {docItem.fileName}
            </p>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-slate-500">
              <span className="font-mono tabular-nums">{docItem.competenceMonth}</span>
              {docItem.issuerOrBank && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[130px]">{docItem.issuerOrBank}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatFileSize(docItem.fileSize)}</span>
            </div>
          </div>
        </div>

        {/* Separated group origin tag */}
        {docItem.sourceGroupLabel && (
          <div className="mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700 truncate max-w-full">
              {docItem.sourceGroupLabel}
            </span>
          </div>
        )}

        {/* Live Background OFX Agent Signaling (Extratos AND Notas Fiscais / outros convertidos para OFX) */}
        {(effectiveOfxStatus === 'queued' || effectiveOfxStatus === 'processing') && (
          <div className="mt-2 p-2 rounded-lg bg-teal-50 border border-teal-200 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-teal-900">
              <span className="flex items-center gap-1.5 truncate">
                <Loader2 className="w-3 h-3 animate-spin text-teal-600 shrink-0" />
                <span className="truncate">
                  {liveJob?.statusLabel || 'Agente OFX processando...'}
                </span>
              </span>
              {liveJob && liveJob.totalPages > 1 && (
                <span className="font-mono text-[10px] text-teal-700 shrink-0">
                  {progressPct}%
                </span>
              )}
            </div>
            {liveJob && liveJob.totalPages > 1 && (
              <div className="w-full h-1.5 bg-teal-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00897b] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
        )}

        {effectiveOfxStatus === 'done' && (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-1.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 truncate min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">
                {liveJob?.statusLabel || 'Enviado ao OFX'}
              </span>
            </span>
            <div className="flex items-center gap-1 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownloadGeneratedOfx(effectiveStatementId, docItem.fileName, docItem);
                }}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                title="Baixar arquivo OFX gerado"
              >
                <Download className="w-3 h-3" />
                <span>Baixar OFX</span>
              </button>
              {onNavigateToOfx && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToOfx();
                  }}
                  className="px-2 py-0.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  title="Visualizar no módulo Conversor OFX"
                >
                  <ArrowRight className="w-2.5 h-2.5" />
                  <span>Ver OFX</span>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (docItem.category === 'extrato') {
                    enqueueDocumentForOfx(docItem);
                  } else {
                    enqueueNonExtratoProcessing(docItem);
                  }
                }}
                className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                title="Processar e gerar OFX novamente"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Refazer</span>
              </button>
            </div>
          </div>
        )}

        {effectiveOfxStatus === 'error' && (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-700 truncate">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{liveJob?.error || docItem.ofxError || 'Falha no agente OFX'}</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (docItem.category === 'extrato') {
                  enqueueDocumentForOfx(docItem);
                } else {
                  enqueueNonExtratoProcessing(docItem);
                }
              }}
              className="text-[10px] font-bold text-rose-800 underline cursor-pointer shrink-0"
            >
              Reprocessar
            </button>
          </div>
        )}

        {/* Live Background Non-Extrato AI Processing Signaling */}
        {docItem.category !== 'extrato' &&
          (docProcJob?.status === 'queued' || docProcJob?.status === 'processing') && (
            <div className="mt-2 p-2 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center gap-1.5 text-[11px] font-bold text-indigo-900">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-600 shrink-0" />
              <span className="truncate">{docProcJob.statusLabel}</span>
            </div>
          )}

        {docItem.category !== 'extrato' && docProcJob?.status === 'error' && (
          <div className="mt-2 px-2 py-1.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-700 truncate">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span className="truncate">{docProcJob.error || 'Falha no processamento'}</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                enqueueNonExtratoProcessing(docItem);
              }}
              className="text-[10px] font-bold text-rose-800 underline cursor-pointer shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {docItem.category !== 'extrato' &&
          isNonExtratoProcessed &&
          docProcJob?.status !== 'queued' &&
          docProcJob?.status !== 'processing' && (
            <div className="mt-2 px-2 py-1.5 rounded-lg bg-indigo-50/80 border border-indigo-200/80 space-y-0.5">
              <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-800">
                <CheckCircle2 className="w-3 h-3 text-indigo-600 shrink-0" />
                <span>Processado via IA · Dados Extraídos</span>
              </div>
              {docItem.notes && (
                <p className="text-[10px] text-indigo-950/80 line-clamp-2 leading-snug">
                  {docItem.notes.replace('[Processado IA]', '').trim()}
                </p>
              )}
            </div>
          )}

        {/* Optional AI summary */}
        {docItem.summary && (
          <p className="mt-2 text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
            {docItem.summary}
          </p>
        )}

        {/* Value & Metadata row */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stMeta.dotColor}`} />
            <span className={`font-medium truncate ${stMeta.textColor}`}>{stMeta.label}</span>
            {showCategoryLabel && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="text-slate-500 truncate">{catMeta.shortLabel}</span>
              </>
            )}
          </div>

          {docItem.amount !== undefined && docItem.amount > 0 && (
            <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
              {formatCurrency(docItem.amount)}
            </span>
          )}
        </div>

        {/* Quick Card Footer Actions */}
        {confirmDeleteId === docItem.id ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2 pt-2 border-t border-rose-200 bg-rose-50/90 -mx-1 px-2 py-1.5 rounded-lg flex items-center justify-between gap-2"
          >
            <span className="text-[11px] font-semibold text-rose-800 truncate">
              Excluir este arquivo?
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteDocument(docItem.id);
                }}
                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
              >
                Excluir
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(null);
                }}
                className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-medium cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void openDetailModal(docItem);
                }}
                className="text-[11px] font-bold text-orange-700 hover:text-orange-900 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                title="Visualizar PDF / Documento"
              >
                <Eye className="w-3.5 h-3.5 text-orange-600" />
                <span>Ver</span>
              </button>

              {docItem.category === 'extrato' &&
                effectiveOfxStatus !== 'queued' &&
                effectiveOfxStatus !== 'processing' &&
                effectiveOfxStatus !== 'done' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      enqueueDocumentForOfx(docItem);
                    }}
                    className="text-[11px] font-semibold text-teal-800 hover:text-teal-950 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    title="Gerar arquivo OFX agora"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Gerar OFX</span>
                  </button>
                )}

              {onOpenInOfxConverter && docItem.category === 'extrato' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSendToOfx(docItem);
                  }}
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Abrir no Conversor OFX"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>OFX</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}

              {docItem.category !== 'extrato' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    enqueueNonExtratoProcessing(docItem);
                  }}
                  disabled={
                    docProcJob?.status === 'queued' || docProcJob?.status === 'processing'
                  }
                  className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  title="Processar com IA e enviar automaticamente para o Conversor OFX"
                >
                  {docProcJob?.status === 'queued' || docProcJob?.status === 'processing' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                  <span>{isNonExtratoProcessed || effectiveOfxStatus === 'done' ? 'Reprocessar' : 'Processar'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {docItem.status !== 'concluido' && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleArchiveDocument(docItem);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 text-[10px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  title="Arquivar em Concluído"
                >
                  <Archive className="w-3 h-3" />
                  <span>Concluir</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownloadFile(docItem);
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900 hover:bg-slate-100 p-1 rounded cursor-pointer"
                title="Baixar arquivo original"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteId(docItem.id);
                }}
                className="text-[11px] text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded cursor-pointer"
                title="Excluir arquivo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Company Selector + View Mode Switch + Upload CTA */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                Arquivos Contábeis da Empresa
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Envio, classificação automática com IA e organização em Kanban
              </p>
            </div>
          </div>

          {/* Company Selector */}
          <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-200 shrink-0">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {isMaster ? (
              <select
                value={currentCompany.id}
                onChange={(e) => onSelectCompany(e.target.value)}
                aria-label="Selecionar empresa"
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 cursor-pointer max-w-[190px] xl:max-w-[210px]"
              >
                {visibleCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fantasyName || c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[200px]">
                {currentCompany.fantasyName || currentCompany.name}
              </span>
            )}
          </div>
        </div>

        {/* Right Controls: View Switcher + Compact Folder Upload CTA */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full xl:w-auto min-w-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/70 overflow-x-auto max-w-full min-w-0">
            <button
              type="button"
              onClick={() => setViewMode('kanban_category')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'kanban_category'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban (Tipos)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban_status')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'kanban_status'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Kanban (Status)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('explorer')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'explorer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5 text-teal-700" />
              <span>Explorador (Pastas)</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.ofx,.csv,.txt,.xls,.xlsx,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFilesUpload(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(uploadingQueue)}
            title="Enviar arquivos (Upload)"
            aria-label="Upload de arquivos"
            className="px-3.5 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {uploadingQueue ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FolderUp className="w-4 h-4" />
            )}
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Summary Strip + Dropzone Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* 4 Numeric Metrics */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 items-center">
          <div>
            <span className="text-[11px] text-slate-500 block">Documentos</span>
            <span className="text-lg font-bold text-slate-900 font-mono tabular-nums">
              {stats.total}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block">Via IA</span>
            <span className="text-lg font-bold text-teal-700 font-mono tabular-nums">
              {stats.aiCount}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block">Pendentes</span>
            <span className="text-lg font-bold text-amber-700 font-mono tabular-nums">
              {stats.pendingCount}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block">Contabilizados</span>
            <span className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
              {stats.doneCount}
            </span>
          </div>
        </div>

        {/* Drag & Drop Multi-File Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!draggingDocId) setIsDragOverDropzone(true);
          }}
          onDragLeave={() => setIsDragOverDropzone(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOverDropzone(false);
            if (!draggingDocId && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleFilesUpload(e.dataTransfer.files);
            }
          }}
          onClick={() => !uploadingQueue && fileInputRef.current?.click()}
          className={`lg:col-span-7 border border-dashed rounded-xl px-4 py-3 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
            isDragOverDropzone
              ? 'border-teal-600 bg-teal-50/70'
              : 'border-slate-300 bg-white hover:border-teal-500 hover:bg-slate-50/60'
          }`}
        >
          {uploadingQueue ? (
            <div className="flex items-center gap-3 w-full">
              <Loader2 className="w-5 h-5 animate-spin text-teal-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  Classificando com IA ({uploadingQueue.completed + 1}/{uploadingQueue.total}):{' '}
                  {uploadingQueue.currentFileName}
                </p>
                <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-[#00897b] transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        ((uploadingQueue.completed + 0.5) / uploadingQueue.total) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-teal-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    Arraste e solte extratos, notas fiscais (PDF/XML), guias ou recibos aqui
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    Classificação automática por tipo, competência e emissor · Múltiplos arquivos suportados
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-block text-xs font-semibold text-teal-700 whitespace-nowrap shrink-0">
                Selecionar
              </span>
            </>
          )}
        </div>
      </div>

      {/* Agente Automático OFX & Processamento Contábil Bar */}
      <div className="bg-white border border-teal-200/80 rounded-xl p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                Agente Automático OFX & Processamento Contábil
              </span>
              {activeQueueCount + activeDocProcessCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[10px] font-bold">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {activeQueueCount + activeDocProcessCount} em processamento
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              Gera .OFX para extratos bancários e extrai dados contábeis de notas, guias e recibos
              {lastSweepAt
                ? ` · Última verificação: ${new Date(lastSweepAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
              {autoRunEnabled && nextSweepAt
                ? ` · Próxima: ${new Date(nextSweepAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRunEnabled}
              onChange={(e) => setAutoRunEnabled(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
            />
            <span>Ativo</span>
          </label>

          <select
            value={scheduleMode}
            onChange={(e) => setScheduleMode(e.target.value as OfxAgentScheduleMode)}
            aria-label="Frequência do agente OFX"
            className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600 cursor-pointer"
          >
            <option value="on_upload">Ao Importar Arquivo</option>
            <option value="hourly">Verificação a Cada Hora</option>
            <option value="daily">Verificação Diária</option>
          </select>

          <button
            type="button"
            onClick={() =>
              void runPendingSweep(documents).then((count) => {
                showToast(
                  count > 0
                    ? `Agente OFX disparado para ${count} extrato(s) pendente(s).`
                    : 'Nenhum extrato pendente para conversão no momento.'
                );
              })
            }
            disabled={isSweeping}
            className="px-3 py-1.5 rounded-lg bg-[#004d40] hover:bg-[#00695c] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {isSweeping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Analisar Extratos (OFX)</span>
          </button>

          <button
            type="button"
            onClick={() =>
              void runPendingNonExtratoSweep(documents).then((count) => {
                showToast(
                  count > 0
                    ? `Processamento iniciado para ${count} documento(s) (notas, guias, recibos).`
                    : 'Todos os outros documentos pendentes já foram processados.'
                );
              })
            }
            disabled={isProcessingOtherDocs}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
            title="Extrair dados contábeis e sugestão de lançamento de Notas Fiscais, Guias, Recibos e Outros"
          >
            {isProcessingOtherDocs || activeDocProcessCount > 0 ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Processar Outros Docs</span>
          </button>

          <button
            type="button"
            onClick={() =>
              void syncEmailInboxNow({ silent: false }).then((count) => {
                if (count > 0) {
                  void loadDocuments();
                }
              })
            }
            disabled={isSyncingInbox}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap border ${
              inboxConfigured
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title={`Verificar anexos enviados para ${inboxEmailAddress || 'contsuitesistemas@gmail.com'}`}
          >
            {isSyncingInbox ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Mail className="w-3.5 h-3.5" />
            )}
            <span>{isSyncingInbox ? 'Verificando E-mail...' : 'Receber E-mails'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do arquivo, banco, fornecedor, nº documento ou CNPJ..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={competenceFilter}
              onChange={(e) => setCompetenceFilter(e.target.value)}
              aria-label="Filtrar por competência"
              className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              <option value="all">Todas as competências</option>
              {competenceOptions.map((m) => (
                <option key={m} value={m}>
                  Competência {m}
                </option>
              ))}
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | 'all')}
            aria-label="Filtrar por status"
            className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600 cursor-pointer"
          >
            <option value="all">Todos os status</option>
            <option value="pendente">Recebido / Pendente</option>
            <option value="em_analise">Em Análise</option>
            <option value="contabilizado">Contabilizado</option>
            <option value="concluido">Concluído / Arquivado</option>
          </select>

          <button
            type="button"
            onClick={handleToggleSelectAllFiltered}
            disabled={filteredDocs.length === 0}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50 ${
              filteredDocs.length > 0 && filteredDocs.every((d) => selectedDocIds.includes(d.id))
                ? 'bg-teal-50 border-[#00897b] text-teal-900'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Selecionar ou desmarcar todos os arquivos visíveis para gerar um único OFX"
          >
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                filteredDocs.length > 0 && filteredDocs.every((d) => selectedDocIds.includes(d.id))
                  ? 'border-[#00897b]'
                  : 'border-slate-400'
              }`}
            >
              {filteredDocs.length > 0 && filteredDocs.every((d) => selectedDocIds.includes(d.id)) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00897b]" />
              )}
            </span>
            <span>Selecionar ({filteredDocs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => void loadDocuments()}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Atualizar documentos"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#00897b]" />
          <p className="text-xs font-medium">Carregando arquivos da empresa...</p>
        </div>
      ) : viewMode === 'explorer' ? (
        /* FILE EXPLORER VIEW ([Nome] - [CNPJ] -> Categorias) */
        <div className="space-y-4">
          {!explorerCompanyId ? (
            /* Level 1: Companies Folders */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-[#00897b]" />
                  Pastas de Empresas (Formato [Nome] - [CNPJ])
                </h3>
                <span className="text-xs font-semibold text-slate-500">
                  {visibleCompanies.length} {visibleCompanies.length === 1 ? 'empresa disponível' : 'empresas disponíveis'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {visibleCompanies.map((comp) => {
                  const folderLabel = `${comp.fantasyName || comp.name} - ${comp.cnpj}`;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => {
                        setExplorerCompanyId(comp.id);
                        setExplorerCategory(null);
                        if (isMaster) onSelectCompany(comp.id);
                      }}
                      className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md transition cursor-pointer flex items-start gap-3 group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-teal-50 group-hover:bg-teal-600 text-teal-700 group-hover:text-white transition flex items-center justify-center shrink-0 border border-teal-200/80 shadow-xs">
                        <FolderOpen className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">
                          Pasta do Cliente
                        </span>
                        <h4 className="font-extrabold text-slate-900 text-sm truncate group-hover:text-teal-800 transition">
                          {comp.fantasyName || comp.name}
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          {comp.cnpj}
                        </p>
                        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Sistema: {comp.accountingSystem.toUpperCase()}</span>
                          <span className="text-teal-700 font-bold group-hover:underline flex items-center gap-1">
                            Abrir <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !explorerCategory ? (
            /* Level 2: Category Subfolders inside Selected Company */
            <div className="space-y-4">
              {(() => {
                const comp = allCompanies.find((c) => c.id === explorerCompanyId) || currentCompany;
                return (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setExplorerCompanyId(null)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        ← Voltar às Empresas
                      </button>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm truncate">
                          📁 {comp.fantasyName || comp.name} — <span className="font-mono text-xs text-slate-500">{comp.cnpj}</span>
                        </h3>
                        <p className="text-[11px] text-slate-500">Selecione uma pasta de tipo de documento</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {CATEGORY_COLUMNS.map((col) => {
                  const catDocs = filteredDocs.filter((d) => d.category === col.id);
                  return (
                    <div
                      key={col.id}
                      onClick={() => setExplorerCategory(col.id)}
                      className={`p-4 rounded-2xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-md transition cursor-pointer flex items-center justify-between gap-3 group ${col.accentBg}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl bg-white border ${col.accentBorder} ${col.accentText} flex items-center justify-center shrink-0 shadow-2xs`}>
                          <FolderOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-bold text-xs truncate ${col.accentText}`}>
                            {col.label}
                          </h4>
                          <p className="text-[11px] text-slate-500 truncate">{col.description}</p>
                          <span className="text-[10px] font-mono font-bold text-slate-600 block mt-0.5">
                            {catDocs.length} {catDocs.length === 1 ? 'arquivo' : 'arquivos'}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 transition shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Level 3: Documents List inside Category Subfolder */
            <div className="space-y-4">
              {(() => {
                const comp = allCompanies.find((c) => c.id === explorerCompanyId) || currentCompany;
                const catMeta = CATEGORY_COLUMNS.find((c) => c.id === explorerCategory);
                const catDocs = filteredDocs.filter((d) => d.category === explorerCategory);
                return (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => setExplorerCategory(null)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                        >
                          ← Voltar às Pastas
                        </button>
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                            <span>📁 {comp.fantasyName || comp.name}</span>
                            <span className="text-slate-400">/</span>
                            <span className={catMeta?.accentText || 'text-teal-700'}>{catMeta?.label}</span>
                          </h3>
                          <p className="text-[11px] text-slate-500">{catDocs.length} arquivos nesta pasta</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {catDocs.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
                          Nenhum documento encontrado nesta pasta.
                        </div>
                      ) : (
                        catDocs.map((docItem) => renderDocCard(docItem, false))
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      ) : viewMode === 'kanban_category' ? (
        /* KANBAN BY CATEGORY */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {CATEGORY_COLUMNS.map((col) => {
            const colDocs = filteredDocs.filter((d) => d.category === col.id);
            const isOver = dragTargetCol === `cat-${col.id}`;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggingDocId) setDragTargetCol(`cat-${col.id}`);
                }}
                onDragLeave={() => setDragTargetCol(null)}
                onDrop={(e) => void handleColumnDropCategory(e, col.id)}
                className={`rounded-xl border transition-colors flex flex-col min-h-[240px] ${
                  isOver
                    ? 'border-teal-500 bg-teal-50/40'
                    : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                {/* Column Header */}
                <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-white rounded-t-xl flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-xs font-bold truncate ${col.accentText}`}>
                        {col.label}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">{col.description}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 tabular-nums shrink-0 px-2 py-0.5 bg-slate-100 rounded-md">
                    {colDocs.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-2.5 space-y-2 flex-1">
                  {colDocs.length === 0 ? (
                    <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-center px-4 text-slate-400">
                      <p className="text-[11px]">Nenhum arquivo nesta categoria</p>
                      <p className="text-[10px] mt-0.5">Arraste um card para mover para cá</p>
                    </div>
                  ) : (
                    colDocs.map((docItem) => renderDocCard(docItem, false))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'kanban_status' ? (
        /* KANBAN BY ACCOUNTING STATUS (INCLUDING LAST COLUMN CONCLUÍDO / ARQUIVADO) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {STATUS_COLUMNS.map((col) => {
            const colDocs = filteredDocs.filter((d) => d.status === col.id);
            const isOver = dragTargetCol === `st-${col.id}`;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggingDocId) setDragTargetCol(`st-${col.id}`);
                }}
                onDragLeave={() => setDragTargetCol(null)}
                onDrop={(e) => void handleColumnDropStatus(e, col.id)}
                className={`rounded-xl border transition-colors flex flex-col min-h-[320px] ${
                  isOver
                    ? 'border-teal-500 bg-teal-50/40'
                    : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-white rounded-t-xl flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotColor}`} />
                      <h3 className="text-xs font-bold text-slate-900 truncate">{col.label}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{col.description}</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700 tabular-nums shrink-0 px-2 py-0.5 bg-slate-100 rounded-md">
                    {colDocs.length}
                  </span>
                </div>

                <div className="p-2.5 space-y-2 flex-1">
                  {colDocs.length === 0 ? (
                    <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-4 text-slate-400">
                      <p className="text-[11px]">Sem documentos neste estágio</p>
                    </div>
                  ) : (
                    colDocs.map((docItem) => renderDocCard(docItem, true))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* HIGH-DENSITY TABLE VIEW */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredDocs.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Nenhum documento encontrado para {currentCompany.fantasyName || currentCompany.name}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Adicione extratos bancários, notas fiscais, guias de impostos ou contratos. A classificação será feita automaticamente.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Enviar Primeiro Arquivo</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                    <th className="py-2.5 px-2.5 w-9 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllFiltered}
                        title="Selecionar todos visíveis"
                        className="w-4 h-4 rounded-full border-2 border-slate-400 inline-flex items-center justify-center cursor-pointer hover:border-[#00897b]"
                      >
                        {filteredDocs.length > 0 && filteredDocs.every((d) => selectedDocIds.includes(d.id)) && (
                          <span className="w-2 h-2 rounded-full bg-[#00897b]" />
                        )}
                      </button>
                    </th>
                    <th className="py-2.5 px-3.5">Arquivo</th>
                    <th className="py-2.5 px-3">Classificação</th>
                    <th className="py-2.5 px-3">Competência</th>
                    <th className="py-2.5 px-3">Emissor / Banco</th>
                    <th className="py-2.5 px-3 text-right">Valor</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocs.map((docItem) => {
                    const Icon = getFileIcon(docItem.mimeType, docItem.fileName);
                    const isRowSelected = selectedDocIds.includes(docItem.id);
                    const rowStmtId =
                      docJobs[docItem.id]?.statementId ||
                      docItem.ofxStatementId ||
                      recentStatements.find((s) => s.sourceDocId === docItem.id)?.id;
                    const rowOfxDone =
                      docJobs[docItem.id]?.status === 'done' ||
                      docItem.ofxStatus === 'done' ||
                      Boolean(rowStmtId);
                    const rowNonExtratoDone =
                      docItem.category !== 'extrato' &&
                      (docProcessJobs[docItem.id]?.status === 'done' ||
                        Boolean(docItem.notes && docItem.notes.includes('[Processado IA]')));
                    return (
                      <tr
                        key={docItem.id}
                        onClick={() => openDetailModal(docItem)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isRowSelected ? 'bg-teal-50/40' : ''
                        }`}
                      >
                        <td
                          className="py-2.5 px-2.5 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDocSelection(docItem.id);
                          }}
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isRowSelected}
                            aria-label={`Selecionar ${docItem.fileName}`}
                            className={`w-5 h-5 rounded-full border-2 inline-flex items-center justify-center cursor-pointer transition-colors ${
                              isRowSelected
                                ? 'border-[#00897b] bg-teal-50'
                                : 'border-slate-300 hover:border-[#00897b] bg-white'
                            }`}
                          >
                            {isRowSelected && <span className="w-2.5 h-2.5 rounded-full bg-[#00897b]" />}
                          </button>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5 max-w-[220px] sm:max-w-[260px]">
                            <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">
                                {docItem.fileName}
                              </p>
                              <p className="text-[11px] text-slate-400 tabular-nums">
                                {formatFileSize(docItem.fileSize)}
                                {docItem.documentNumber ? ` · Doc. ${docItem.documentNumber}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={docItem.category}
                            onChange={(e) =>
                              void handleUpdateDocument(docItem.id, {
                                category: e.target.value as DocumentCategory,
                              })
                            }
                            className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:border-teal-600"
                          >
                            {CATEGORY_COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                          {docItem.competenceMonth}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 max-w-[160px] truncate">
                          {docItem.issuerOrBank || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                          {docItem.amount !== undefined && docItem.amount > 0
                            ? formatCurrency(docItem.amount)
                            : '—'}
                        </td>
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={docItem.status}
                            onChange={(e) =>
                              void handleUpdateDocument(docItem.id, {
                                status: e.target.value as DocumentStatus,
                              })
                            }
                            className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:border-teal-600"
                          >
                            {STATUS_COLUMNS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td
                          className="py-2.5 px-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            {docItem.status !== 'concluido' && (
                              <button
                                type="button"
                                onClick={() => void handleArchiveDocument(docItem)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-teal-800 hover:bg-teal-50 rounded cursor-pointer whitespace-nowrap"
                                title="Arquivar em Concluído"
                              >
                                Concluir
                              </button>
                            )}
                            {rowOfxDone && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDownloadGeneratedOfx(
                                    rowStmtId,
                                    docItem.fileName,
                                    docItem
                                  )
                                }
                                className="px-2 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                                title="Baixar OFX gerado"
                              >
                                <Download className="w-3 h-3" />
                                <span>Baixar OFX</span>
                              </button>
                            )}
                            {rowOfxDone && onNavigateToOfx && (
                              <button
                                type="button"
                                onClick={() => onNavigateToOfx()}
                                className="px-2 py-1 text-[11px] font-bold bg-teal-700 hover:bg-teal-800 text-white rounded cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                                title="Abrir no Conversor OFX"
                              >
                                <ArrowRight className="w-3 h-3" />
                                <span>Ver OFX</span>
                              </button>
                            )}
                            {docItem.category === 'extrato' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => enqueueDocumentForOfx(docItem)}
                                  disabled={
                                    docJobs[docItem.id]?.status === 'queued' ||
                                    docJobs[docItem.id]?.status === 'processing'
                                  }
                                  className="px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 rounded cursor-pointer whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
                                  title="Processar / refazer OFX"
                                >
                                  {docJobs[docItem.id]?.status === 'queued' ||
                                  docJobs[docItem.id]?.status === 'processing' ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : rowOfxDone ? (
                                    <RefreshCw className="w-3 h-3" />
                                  ) : (
                                    <Play className="w-3 h-3 fill-current" />
                                  )}
                                  <span>{rowOfxDone ? 'Refazer OFX' : 'Gerar OFX'}</span>
                                </button>
                                {onOpenInOfxConverter && (
                                  <button
                                    type="button"
                                    onClick={() => void handleSendToOfx(docItem)}
                                    className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 rounded cursor-pointer whitespace-nowrap"
                                    title="Abrir no Conversor OFX"
                                  >
                                    Conversor
                                  </button>
                                )}
                              </>
                            )}
                            {docItem.category !== 'extrato' && (
                              <button
                                type="button"
                                onClick={() => enqueueNonExtratoProcessing(docItem)}
                                disabled={
                                  docProcessJobs[docItem.id]?.status === 'queued' ||
                                  docProcessJobs[docItem.id]?.status === 'processing'
                                }
                                className="px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer whitespace-nowrap inline-flex items-center gap-1 disabled:opacity-50"
                                title="Processar com IA e enviar para o Conversor OFX"
                              >
                                {docProcessJobs[docItem.id]?.status === 'queued' ||
                                docProcessJobs[docItem.id]?.status === 'processing' ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current" />
                                )}
                                <span>{rowNonExtratoDone || rowOfxDone ? 'Reprocessar' : 'Processar'}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void openDetailModal(docItem)}
                              className="p-1.5 text-orange-600 hover:text-orange-800 hover:bg-orange-50 border border-orange-200/80 rounded-md cursor-pointer transition-colors"
                              title="Visualizar e editar"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownloadFile(docItem)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                              title="Baixar arquivo"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteId === docItem.id ? (
                              <span className="inline-flex items-center gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDocument(docItem.id)}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(docItem.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                title="Excluir arquivo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Sticky Bottom Batch Action Bar for Unified OFX */}
      {(selectedDocIds.length > 0 || isConvertingBatchOfx) && (
        <div className="sticky bottom-2 z-30 pb-[env(safe-area-inset-bottom)]">
          <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-teal-500/40 p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-6 h-6 rounded-full bg-[#00897b] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                {isConvertingBatchOfx ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  selectedDocIds.length
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">
                  {isConvertingBatchOfx
                    ? batchOfxProgress?.label || 'Consolidando arquivos em OFX...'
                    : `${selectedDocIds.length} ${selectedDocIds.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}`}
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  Unifique notas fiscais, comprovantes ou extratos em um único arquivo .OFX
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedDocIds([])}
                disabled={isConvertingBatchOfx}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => void handleConvertSelectedToSingleOfx()}
                disabled={isConvertingBatchOfx || selectedDocIds.length === 0}
                className="px-3.5 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {isConvertingBatchOfx ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Transformar em Único OFX</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview & Edit Modal */}
      {selectedDoc && editDraft && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4"
          onClick={closeDetailModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-none sm:rounded-xl shadow-2xl w-full max-w-6xl h-[100dvh] sm:h-[92dvh] sm:max-h-[92dvh] flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {selectedDoc.fileName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {formatFileSize(selectedDoc.fileSize)} · Enviado em{' '}
                    {new Date(selectedDoc.uploadedAt).toLocaleDateString('pt-BR')}
                    {selectedDoc.aiClassified && selectedDoc.confidence
                      ? ` · Classificado via IA (${selectedDoc.confidence}%)`
                      : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="sm:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsPreviewExpanded((v) => !v)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title={isPreviewExpanded ? 'Restaurar visualização dividida' : 'Expandir pré-visualização'}
                >
                  {isPreviewExpanded ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>Dividir Tela</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Expandir Preview</span>
                    </>
                  )}
                </button>
                {selectedDoc.status !== 'concluido' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft((prev) => (prev ? { ...prev, status: 'concluido' } : prev));
                      void handleArchiveDocument(selectedDoc);
                    }}
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Arquivar</span>
                  </button>
                )}
                {(docJobs[selectedDoc.id]?.status === 'done' ||
                  selectedDoc.ofxStatus === 'done' ||
                  docJobs[selectedDoc.id]?.statementId ||
                  selectedDoc.ofxStatementId ||
                  recentStatements.some((s) => s.sourceDocId === selectedDoc.id)) && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownloadGeneratedOfx(
                          docJobs[selectedDoc.id]?.statementId ||
                            selectedDoc.ofxStatementId ||
                            recentStatements.find((s) => s.sourceDocId === selectedDoc.id)?.id,
                          selectedDoc.fileName,
                          selectedDoc
                        )
                      }
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar OFX</span>
                    </button>
                    {onNavigateToOfx && (
                      <button
                        type="button"
                        onClick={() => {
                          closeDetailModal();
                          onNavigateToOfx();
                        }}
                        className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>Ver no OFX</span>
                      </button>
                    )}
                  </>
                )}
                {editDraft.category === 'extrato' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        enqueueDocumentForOfx(selectedDoc, previewBase64 || undefined)
                      }
                      disabled={
                        docJobs[selectedDoc.id]?.status === 'queued' ||
                        docJobs[selectedDoc.id]?.status === 'processing'
                      }
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#004d40] hover:bg-[#00695c] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                    >
                      {docJobs[selectedDoc.id]?.status === 'queued' ||
                      docJobs[selectedDoc.id]?.status === 'processing' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : selectedDoc.ofxStatus === 'done' || selectedDoc.ofxStatementId ? (
                        <RefreshCw className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>
                        {selectedDoc.ofxStatus === 'done' || selectedDoc.ofxStatementId
                          ? 'Refazer OFX'
                          : 'Gerar OFX'}
                      </span>
                    </button>
                    {onOpenInOfxConverter && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = selectedDoc;
                          closeDetailModal();
                          void handleSendToOfx(target);
                        }}
                        className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Conversor OFX</span>
                      </button>
                    )}
                  </>
                )}
                {editDraft.category !== 'extrato' && (
                  <button
                    type="button"
                    onClick={() =>
                      enqueueNonExtratoProcessing(selectedDoc, previewBase64 || undefined)
                    }
                    disabled={
                      docProcessJobs[selectedDoc.id]?.status === 'queued' ||
                      docProcessJobs[selectedDoc.id]?.status === 'processing'
                    }
                    className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {docProcessJobs[selectedDoc.id]?.status === 'queued' ||
                    docProcessJobs[selectedDoc.id]?.status === 'processing' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>
                      {selectedDoc.ofxStatus === 'done' || selectedDoc.ofxStatementId
                        ? 'Reprocessar & OFX'
                        : 'Processar & OFX'}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(selectedDoc)}
                  className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="hidden sm:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Preview Left + Metadata Form Right */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12">
              {/* Preview Area */}
              <div
                className={`${
                  isPreviewExpanded ? 'lg:col-span-12' : 'lg:col-span-7 border-b lg:border-b-0 lg:border-r border-slate-200'
                } bg-slate-100 p-3 sm:p-4 flex flex-col min-h-[240px] lg:min-h-0 lg:h-full`}
              >
                <input
                  ref={reattachInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.xml,.ofx,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && selectedDoc) {
                      void handleReattachFile(selectedDoc, f);
                    }
                    e.target.value = '';
                  }}
                />
                {loadingPreview ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00897b]" />
                    <p className="text-xs">Carregando pré-visualização...</p>
                  </div>
                ) : previewTextContent ? (
                  <pre className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-3.5 text-[11px] font-mono text-slate-800 overflow-auto whitespace-pre-wrap break-all">
                    {previewTextContent}
                  </pre>
                ) : previewBase64 && isPdfDoc(selectedDoc) ? (
                  <PdfCanvasViewer
                    base64={previewBase64}
                    fileName={selectedDoc.fileName}
                    mimeType="application/pdf"
                    className="flex-1 min-h-0"
                    maxHeightClass="flex-1 min-h-[220px] sm:min-h-[340px]"
                  />
                ) : previewBlobUrl && isImageDoc(selectedDoc) ? (
                  <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-white rounded-xl border border-slate-200 p-3">
                    <img
                      src={previewBlobUrl}
                      alt={selectedDoc.fileName}
                      className="max-h-full max-w-full w-auto object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white rounded-xl border border-slate-200 gap-3">
                    <FileIcon className="w-10 h-10 text-slate-400" />
                    <div className="max-w-sm">
                      <p className="text-xs font-semibold text-slate-800">
                        {!previewBase64
                          ? 'Arquivo original não está armazenado localmente neste navegador'
                          : 'Pré-visualização direta não disponível para este formato'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {!previewBase64
                          ? 'Se o documento foi importado em outro navegador/sessão, você pode reanexá-lo para visualizar o PDF aqui.'
                          : selectedDoc.summary || 'Use o botão Baixar para abrir o documento original.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {!previewBase64 ? (
                        <button
                          type="button"
                          onClick={() => reattachInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Reanexar Arquivo para Visualizar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDownloadFile(selectedDoc)}
                          className="px-3.5 py-2 rounded-lg bg-[#00897b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Baixar Arquivo</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Classification & Metadata Form */}
              <div
                className={`${
                  isPreviewExpanded ? 'hidden' : 'lg:col-span-5 lg:h-full lg:overflow-y-auto'
                } p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3.5`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    Classificação e Dados Contábeis
                  </h4>
                  <button
                    type="button"
                    onClick={() => void handleReclassifyWithAI()}
                    disabled={reclassifying}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {reclassifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Reanalisar com IA</span>
                  </button>
                </div>

                {selectedDoc.summary && (
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 leading-relaxed">
                    {selectedDoc.summary}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tipo de Documento
                    </label>
                    <select
                      value={editDraft.category}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          category: e.target.value as DocumentCategory,
                        })
                      }
                      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    >
                      {CATEGORY_COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Status Contábil
                    </label>
                    <select
                      value={editDraft.status}
                      onChange={(e) =>
                        setEditDraft({
                          ...editDraft,
                          status: e.target.value as DocumentStatus,
                        })
                      }
                      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    >
                      {STATUS_COLUMNS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Competência (AAAA-MM)
                    </label>
                    <input
                      type="month"
                      value={editDraft.competenceMonth}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, competenceMonth: e.target.value })
                      }
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Data do Documento
                    </label>
                    <input
                      type="date"
                      value={editDraft.documentDate}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, documentDate: e.target.value })
                      }
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Emissor / Banco / Órgão
                    </label>
                    <input
                      type="text"
                      value={editDraft.issuerOrBank}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, issuerOrBank: e.target.value })
                      }
                      placeholder="Ex: Itaú, Receita Federal..."
                      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nº Documento / NF
                    </label>
                    <input
                      type="text"
                      value={editDraft.documentNumber}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, documentNumber: e.target.value })
                      }
                      placeholder="Ex: 001452"
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Valor Total (R$)
                    </label>
                    <input
                      type="text"
                      value={editDraft.amount}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, amount: e.target.value })
                      }
                      placeholder="0.00"
                      className="w-full text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      CNPJ Identificado
                    </label>
                    <input
                      type="text"
                      value={editDraft.detectedCnpj}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, detectedCnpj: e.target.value })
                      }
                      placeholder="00.000.000/0001-00"
                      className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Observações para Contabilização
                  </label>
                  <textarea
                    rows={3}
                    value={editDraft.notes}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, notes: e.target.value })
                    }
                    placeholder="Ex: Lançar em despesas administrativas, centro de custo Matriz..."
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-teal-600 resize-none"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                  {confirmDeleteId === selectedDoc.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-rose-700">Excluir?</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteDocument(selectedDoc.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedDoc.id)}
                      className="px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSaveDetailEdits()}
                    disabled={savingDetail}
                    className="px-4 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {savingDetail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
