import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderOpen,
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
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import {
  Company,
  CompanyDocument,
  DocumentCategory,
  DocumentStatus,
  User,
} from '../types';
import {
  fetchDocumentsFromFirestore,
  saveDocumentToFirestore,
  deleteDocumentFromFirestore,
} from '../firebase/service';

interface DocumentsViewProps {
  currentUser: User;
  currentCompany: Company;
  allCompanies: Company[];
  onSelectCompany: (companyId: string) => void;
  onOpenInOfxConverter?: (file: File) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
}

type ViewMode = 'kanban_category' | 'kanban_status' | 'list';

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
];

// Lightweight IndexedDB binary cache so preview/download also works offline or across cold starts
const IDB_NAME = 'contsuite_documents_db';
const IDB_STORE = 'file_blobs';

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBlobToIdb(docId: string, base64: string): Promise<void> {
  try {
    const db = await openBlobDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(base64, docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB quota/availability errors gracefully
  }
}

async function getBlobFromIdb(docId: string): Promise<string | null> {
  try {
    const db = await openBlobDb();
    const res = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(docId);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

async function deleteBlobFromIdb(docId: string): Promise<void> {
  try {
    const db = await openBlobDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {}
}

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

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
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
  showToast,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban_category');

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
  const [savingDetail, setSavingDetail] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const loadDocuments = useCallback(async () => {
    if (!currentCompany.id) return;
    setLoading(true);
    let apiDocs: CompanyDocument[] = [];
    try {
      const res = await fetch(`/api/documents?companyId=${currentCompany.id}`, { cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        apiDocs = await res.json();
      }
    } catch (err) {
      console.warn('Could not load documents from API:', err);
    }

    let firestoreDocs: CompanyDocument[] = [];
    try {
      firestoreDocs = await fetchDocumentsFromFirestore(currentCompany.id);
    } catch (err) {
      console.warn('Could not load documents from Firestore:', err);
    }

    let localDocs: CompanyDocument[] = [];
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) localDocs = JSON.parse(raw);
    } catch {}

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
  }, [currentCompany.id, cacheKey]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
    const doneCount = filteredDocs.filter((d) => d.status === 'contabilizado').length;
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

  // Upload & classify batch of files
  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploadingQueue({ total: files.length, completed: 0, currentFileName: files[0].name });
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadingQueue({ total: files.length, completed: i, currentFileName: file.name });

      try {
        const fullBase64 = await readFileBase64(file);
        const { classificationBase64, textPreview } = await prepareClassificationPayload(file, fullBase64);

        // Keep API payload safely under Vercel 4.5MB limit
        const sendFullFile = fullBase64.length <= 3_300_000 ? fullBase64 : undefined;
        const mimeType =
          file.type ||
          (file.name.toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : file.name.toLowerCase().endsWith('.xml')
              ? 'application/xml'
              : 'application/octet-stream');

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
          // Offline/fallback record creation if server rejected large payload or temporarily errored
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
          // Always save original binary in browser IndexedDB for guaranteed local preview & download
          await saveBlobToIdb(savedDoc.id, fullBase64);
          savedDoc.hasOriginalFile = true;

          // Sync metadata to Firestore
          try {
            await saveDocumentToFirestore(currentCompany.id, savedDoc);
          } catch (fErr) {
            console.warn('Firestore save document warning:', fErr);
          }

          setDocuments((prev) => {
            const next = [savedDoc!, ...prev.filter((d) => d.id !== savedDoc!.id)];
            persistCacheList(next);
            return next;
          });
          successCount++;
        }
      } catch (err: any) {
        showToast(`Erro ao processar "${file.name}": ${err?.message || 'falha'}`, 'error');
      }
    }

    setUploadingQueue(null);
    if (successCount > 0) {
      showToast(
        successCount === 1
          ? 'Arquivo enviado e classificado automaticamente!'
          : `${successCount} arquivos enviados e classificados automaticamente!`
      );
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

  // Fetch file binary (IndexedDB -> API)
  const resolveFileBase64 = async (docItem: CompanyDocument): Promise<string | null> => {
    if (docItem.fileBase64) return docItem.fileBase64;
    const localB64 = await getBlobFromIdb(docItem.id);
    if (localB64) return localB64;

    try {
      const res = await fetch(`/api/documents/${docItem.id}`, { cache: 'no-store' });
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const full = await res.json();
        if (full?.fileBase64) {
          await saveBlobToIdb(docItem.id, full.fileBase64);
          return full.fileBase64;
        }
      }
    } catch {}
    return null;
  };

  // Open detail modal with preview
  const openDetailModal = async (docItem: CompanyDocument) => {
    setSelectedDoc(docItem);
    setConfirmDeleteId(null);
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
    setPreviewBase64(b64);

    if (b64) {
      const lower = docItem.fileName.toLowerCase();
      const mime = docItem.mimeType || '';
      if (
        mime.startsWith('text/') ||
        mime.includes('xml') ||
        lower.endsWith('.xml') ||
        lower.endsWith('.ofx') ||
        lower.endsWith('.csv') ||
        lower.endsWith('.txt')
      ) {
        try {
          const decoded = new TextDecoder('utf-8').decode(
            Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          );
          setPreviewTextContent(decoded.slice(0, 20000));
        } catch {}
      } else if (mime === 'application/pdf' || mime.startsWith('image/') || lower.endsWith('.pdf')) {
        try {
          const effectiveMime = lower.endsWith('.pdf') ? 'application/pdf' : mime;
          const blob = base64ToBlob(b64, effectiveMime);
          setPreviewBlobUrl(URL.createObjectURL(blob));
        } catch {}
      }
    }
    setLoadingPreview(false);
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

  const renderDocCard = (docItem: CompanyDocument, showCategoryLabel: boolean) => {
    const Icon = getFileIcon(docItem.mimeType, docItem.fileName);
    const catMeta = CATEGORY_COLUMNS.find((c) => c.id === docItem.category) || CATEGORY_COLUMNS[5];
    const stMeta = STATUS_COLUMNS.find((s) => s.id === docItem.status) || STATUS_COLUMNS[0];

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
        className={`group bg-white border border-slate-200 hover:border-teal-400 rounded-xl p-3 transition-colors cursor-pointer select-none ${
          draggingDocId === docItem.id ? 'opacity-50' : ''
        }`}
      >
        {/* Top line: Icon + File Name */}
        <div className="flex items-start gap-2.5">
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

        {/* Contextual quick action for Bank Statements */}
        {docItem.category === 'extrato' && onOpenInOfxConverter && (
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleSendToOfx(docItem);
              }}
              className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3 h-3" />
              <span>Converter OFX</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownloadFile(docItem);
              }}
              className="text-[11px] text-slate-500 hover:text-slate-900 p-1 rounded cursor-pointer"
              title="Baixar arquivo original"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Company Selector + Upload Action + View Mode Switch */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate">
                Arquivos Contábeis da Empresa
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Envio, classificação automática com IA e organização em Kanban
              </p>
            </div>
          </div>

          {/* Company Selector */}
          <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-200">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {isAdmin ? (
              <select
                value={currentCompany.id}
                onChange={(e) => onSelectCompany(e.target.value)}
                aria-label="Selecionar empresa"
                className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 cursor-pointer max-w-[230px]"
              >
                {allCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fantasyName || c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[220px]">
                {currentCompany.fantasyName || currentCompany.name}
              </span>
            )}
          </div>
        </div>

        {/* Right Controls: View Switcher + Add Files CTA */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200/70">
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
            className="px-4 py-2 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {uploadingQueue ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>Adicionar Arquivos</span>
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
          </select>

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
        /* KANBAN BY ACCOUNTING STATUS */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    return (
                      <tr
                        key={docItem.id}
                        onClick={() => openDetailModal(docItem)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5 max-w-[260px]">
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
                            {docItem.category === 'extrato' && onOpenInOfxConverter && (
                              <button
                                type="button"
                                onClick={() => void handleSendToOfx(docItem)}
                                className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 rounded cursor-pointer whitespace-nowrap"
                                title="Abrir no Conversor OFX"
                              >
                                OFX
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void openDetailModal(docItem)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
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
                            <button
                              type="button"
                              onClick={() => void handleDeleteDocument(docItem.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Excluir arquivo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* Document Preview & Edit Modal */}
      {selectedDoc && editDraft && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={closeDetailModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {selectedDoc.fileName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatFileSize(selectedDoc.fileSize)} · Enviado em{' '}
                  {new Date(selectedDoc.uploadedAt).toLocaleDateString('pt-BR')}
                  {selectedDoc.aiClassified && selectedDoc.confidence
                    ? ` · Classificado via IA (${selectedDoc.confidence}%)`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editDraft.category === 'extrato' && onOpenInOfxConverter && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedDoc;
                      closeDetailModal();
                      void handleSendToOfx(target);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Abrir no Conversor OFX</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleDownloadFile(selectedDoc)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Preview Left + Metadata Form Right */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12">
              {/* Preview Area */}
              <div className="lg:col-span-7 bg-slate-100 border-b lg:border-b-0 lg:border-r border-slate-200 p-4 flex flex-col min-h-[320px]">
                {loadingPreview ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00897b]" />
                    <p className="text-xs">Carregando pré-visualização...</p>
                  </div>
                ) : previewTextContent ? (
                  <pre className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-[11px] font-mono text-slate-800 overflow-auto max-h-[520px] whitespace-pre-wrap break-all">
                    {previewTextContent}
                  </pre>
                ) : previewBlobUrl &&
                  (selectedDoc.mimeType === 'application/pdf' ||
                    selectedDoc.fileName.toLowerCase().endsWith('.pdf')) ? (
                  <iframe
                    src={previewBlobUrl}
                    title={selectedDoc.fileName}
                    className="w-full flex-1 min-h-[460px] rounded-lg border border-slate-200 bg-white"
                  />
                ) : previewBlobUrl && selectedDoc.mimeType.startsWith('image/') ? (
                  <div className="flex-1 flex items-center justify-center bg-white rounded-lg border border-slate-200 p-2">
                    <img
                      src={previewBlobUrl}
                      alt={selectedDoc.fileName}
                      className="max-h-[480px] w-auto object-contain rounded"
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-white rounded-lg border border-slate-200 gap-3">
                    <FileIcon className="w-10 h-10 text-slate-400" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        Pré-visualização direta não disponível para este formato
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {selectedDoc.summary || 'Use o botão Baixar para abrir o documento original.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownloadFile(selectedDoc)}
                      className="px-3.5 py-2 rounded-lg bg-[#00897b] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar Arquivo</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Classification & Metadata Form */}
              <div className="lg:col-span-5 p-5 space-y-3.5">
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
