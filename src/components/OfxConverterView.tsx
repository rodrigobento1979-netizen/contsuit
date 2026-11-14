import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Landmark, 
  Loader2, 
  X, 
  FileCheck, 
  Building, 
  Calendar, 
  Layers, 
  ArrowRight, 
  Eye, 
  Trash2, 
  Filter, 
  Printer, 
  Search, 
  ExternalLink,
  Copy,
  Code,
  Check,
  FileCode
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Company, ConvertedStatement } from '../types';
import { ReportPrintModal, ReportColumn } from './ReportPrintModal';

/**
 * Robust fallback parser to reconstruct transactions list directly from OFX text
 * in case transactions array was not cached in the database.
 */
function parseTransactionsFromOfx(ofxText: string) {
  if (!ofxText) return [];
  const transactions: any[] = [];
  const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;
  let idx = 1;
  while ((match = trnRegex.exec(ofxText)) !== null) {
    const block = match[1];
    const typeMatch = block.match(/<TRNTYPE>([^<\r\n]+)/i);
    const dateMatch = block.match(/<DTPOSTED>([^<\r\n]+)/i);
    const amtMatch = block.match(/<TRNAMT>([^<\r\n]+)/i);
    const fitidMatch = block.match(/<FITID>([^<\r\n]+)/i);
    const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);

    const rawDate = dateMatch ? dateMatch[1].trim() : '';
    let formattedDate = rawDate;
    if (rawDate.length >= 8) {
      formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    }
    const amt = amtMatch ? parseFloat(amtMatch[1].trim().replace(',', '.')) : 0;
    const type = typeMatch ? typeMatch[1].trim().toUpperCase() : (amt >= 0 ? 'CREDIT' : 'DEBIT');

    transactions.push({
      id: `parsed-${idx++}`,
      date: formattedDate,
      type: type.includes('CREDIT') ? 'CREDIT' : 'DEBIT',
      amount: Math.abs(amt),
      memo: memoMatch ? memoMatch[1].trim() : 'Lançamento Bancário',
      fitid: fitidMatch ? fitidMatch[1].trim() : `fit-${idx}`,
    });
  }
  return transactions;
}

interface OfxConverterViewProps {
  currentCompany: Company;
  allCompanies: Company[];
  onOpenCompanyModalWithData: (prefill: { name: string; cnpj: string; fantasyName?: string }) => void;
  onSelectCompany: (companyId: string) => void;
  historyStatements: ConvertedStatement[];
  onRefreshHistory: () => void;
}

export const OfxConverterView: React.FC<OfxConverterViewProps> = ({
  currentCompany,
  allCompanies,
  onOpenCompanyModalWithData,
  onSelectCompany,
  historyStatements,
  onRefreshHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload & File states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [accountingAccount, setAccountingAccount] = useState<string>('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    totalPages: number;
    processedPages: number;
    foundTransactions: number;
    statusLabel: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [convertedResult, setConvertedResult] = useState<ConvertedStatement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Date Filters & Search for imported statements cards
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [searchBankTerm, setSearchBankTerm] = useState<string>('');

  // PDF / Document Viewer Modal State
  const [previewStatement, setPreviewStatement] = useState<ConvertedStatement | null>(null);
  const [previewTab, setPreviewTab] = useState<'transactions' | 'ofx' | 'document'>('transactions');
  const [previewFilterType, setPreviewFilterType] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [previewSearchTerm, setPreviewSearchTerm] = useState<string>('');
  const [copiedOfx, setCopiedOfx] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Synchronize Blob URL for PDF preview without data: URI restrictions in Chrome
  useEffect(() => {
    if (previewStatement?.fileBase64 && !previewStatement.fileMimeType?.includes('image')) {
      try {
        const byteCharacters = atob(previewStatement.fileBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: previewStatement.fileMimeType || 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to create PDF blob url', e);
        setPdfBlobUrl(null);
      }
    } else {
      setPdfBlobUrl(null);
    }
  }, [previewStatement]);

  // Lazy-load original fileBase64 if omitted from lightweight /api/ofx/history list
  useEffect(() => {
    if (
      previewTab === 'document' &&
      previewStatement &&
      !previewStatement.fileBase64 &&
      previewStatement.hasOriginalFile &&
      previewStatement.id
    ) {
      let cancelled = false;
      fetch(`/api/ofx/statements/${previewStatement.id}`)
        .then(r => (r.ok ? r.json() : null))
        .then(full => {
          if (!cancelled && full?.fileBase64) {
            setPreviewStatement(prev => (prev && prev.id === full.id ? { ...prev, fileBase64: full.fileBase64 } : prev));
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [previewTab, previewStatement]);

  // Robust transactions array for the preview modal (with automatic fallback to OFX parser)
  const previewTransactions = useMemo(() => {
    if (!previewStatement) return [];
    if (Array.isArray(previewStatement.transactions) && previewStatement.transactions.length > 0) {
      return previewStatement.transactions;
    }
    if (previewStatement.ofxContent) {
      return parseTransactionsFromOfx(previewStatement.ofxContent);
    }
    return [];
  }, [previewStatement]);

  const filteredPreviewTransactions = useMemo(() => {
    return previewTransactions.filter(t => {
      if (previewFilterType !== 'ALL' && t.type !== previewFilterType) return false;
      if (previewSearchTerm) {
        const term = previewSearchTerm.toLowerCase();
        const matchesMemo = (t.memo || '').toLowerCase().includes(term);
        const matchesFitid = (t.fitid || '').toLowerCase().includes(term);
        const matchesDate = (t.date || '').includes(term);
        if (!matchesMemo && !matchesFitid && !matchesDate) return false;
      }
      return true;
    });
  }, [previewTransactions, previewFilterType, previewSearchTerm]);

  const handleCopyOfx = async () => {
    if (!previewStatement?.ofxContent) return;
    try {
      await navigator.clipboard.writeText(previewStatement.ofxContent);
      setCopiedOfx(true);
      setTimeout(() => setCopiedOfx(false), 2500);
    } catch (e) {
      console.error('Failed to copy OFX:', e);
    }
  };

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Report Modal State
  const [reportStatement, setReportStatement] = useState<ConvertedStatement | null>(null);
  const [showConsolidatedReport, setShowConsolidatedReport] = useState(false);

  // Unregistered Company Detection Modal State
  const [unregisteredPrompt, setUnregisteredPrompt] = useState<{
    cnpj?: string;
    companyName?: string;
    pendingStatement?: ConvertedStatement;
  } | null>(null);

  // File handling
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    setConvertedResult(null);
    setPdfPageCount(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setFileBase64(base64Data);
      const detectedMime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      setFileMimeType(detectedMime);

      if (detectedMime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const ab = await file.arrayBuffer();
          const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
          setPdfPageCount(pdfDoc.getPageCount());
        } catch (err) {
          console.warn('Não foi possível ler contagem de páginas do PDF no navegador:', err);
        }
      }
    };
    reader.onerror = () => {
      setErrorMessage('Erro ao ler o arquivo selecionado.');
    };
    reader.readAsDataURL(file);

    // Check immediately if file is OFX or TXT to verify company registration
    if (file.name.toLowerCase().endsWith('.ofx') || file.name.toLowerCase().endsWith('.txt')) {
      const textReader = new FileReader();
      textReader.onload = () => {
        const text = (textReader.result as string) || '';
        const cnpjMatch = text.match(/([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/);
        const orgMatch = text.match(/<ORG>([^<]+)<\/ORG>/i);
        const detectedCnpj = cnpjMatch ? cnpjMatch[1] : undefined;
        const detectedOrg = orgMatch ? orgMatch[1].trim() : undefined;

        if (detectedCnpj || detectedOrg) {
          const clean = (detectedCnpj || '').replace(/\D/g, '');
          const exists = allCompanies.find(c => {
            const cClean = c.cnpj.replace(/\D/g, '');
            if (clean && cClean && clean === cClean) return true;
            if (detectedOrg && c.name.toLowerCase().includes(detectedOrg.toLowerCase())) return true;
            return false;
          });

          if (!exists) {
            setUnregisteredPrompt({
              cnpj: detectedCnpj,
              companyName: detectedOrg || file.name.replace(/\.[^/.]+$/, ''),
            });
          }
        }
      };
      textReader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFileBase64(null);
    setFileMimeType(null);
    setPdfPageCount(null);
    setConvertedResult(null);
    setErrorMessage(null);
    setProcessingProgress(null);
    setUnregisteredPrompt(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Helper to convert Uint8Array to base64 safely in browser
  const uint8ToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunkSize = 0x4000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  // Helper: Safe JSON parser that handles Vercel HTML/text error responses (413, 502, 504, 500) cleanly
  const parseSafeJson = async (res: Response): Promise<any> => {
    const rawText = await res.text();
    try {
      return rawText ? JSON.parse(rawText) : {};
    } catch {
      if (res.status === 413) {
        throw new Error('O bloco de páginas/arquivo excedeu o limite de envio (4,5 MB). Tente um arquivo menor.');
      }
      if (res.status === 504 || res.status === 502) {
        throw new Error('O servidor demorou para responder (Timeout). Tente processar novamente em instantes.');
      }
      throw new Error(`Erro no servidor (${res.status}): ${rawText.slice(0, 140) || 'Resposta inválida.'}`);
    }
  };

  // Helper: Compress large photos/images so they stay well below Vercel's 4.5MB limit
  const compressImageIfNeeded = async (b64: string, mime: string): Promise<{ base64: string; mimeType: string }> => {
    if (!mime.startsWith('image/') || b64.length < 1_400_000) {
      return { base64: b64, mimeType: mime === 'image/jpg' ? 'image/jpeg' : mime };
    }
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Falha ao carregar imagem para otimização'));
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
  };

  // Convert with AI (automatic byte-safe multi-page chunking for PDFs)
  const handleConvert = async () => {
    if (!fileBase64 && !selectedFile) {
      setErrorMessage('Por favor, selecione ou arraste um arquivo de extrato bancário.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingProgress(null);

    try {
      const fileNameLower = (selectedFile?.name || '').toLowerCase();
      const isPdf = fileMimeType === 'application/pdf' || fileNameLower.endsWith('.pdf');
      const isPlainTextOrOfx =
        fileNameLower.endsWith('.txt') ||
        fileNameLower.endsWith('.ofx') ||
        fileNameLower.endsWith('.csv') ||
        (fileMimeType || '').startsWith('text/');

      let finalData: any = null;

      // Multi-page PDF handling: read first batch for bank/year context, then byte-safe chunks (max 3 pages & < 2.4MB base64)
      if (isPdf && selectedFile) {
        let srcPdf: PDFDocument | null = null;
        let totalPages = 0;
        try {
          const ab = await selectedFile.arrayBuffer();
          srcPdf = await PDFDocument.load(ab, { ignoreEncryption: true });
          totalPages = srcPdf.getPageCount();
          setPdfPageCount(totalPages);
        } catch (pdfLoadErr) {
          console.warn('Falha ao fatiar PDF no navegador, enviando arquivo completo:', pdfLoadErr);
          srcPdf = null;
          totalPages = 0;
        }

        if (srcPdf && totalPages > 1) {
          const MAX_CHUNK_BASE64 = 2_400_000; // safely below Vercel's 4.5MB limit
          const DEFAULT_BATCH = totalPages > 2 ? 3 : 2;

          const buildSliceBase64 = async (start: number, end: number) => {
            const subDoc = await PDFDocument.create();
            const indices: number[] = [];
            for (let p = start; p <= end; p++) indices.push(p);
            const copied = await subDoc.copyPages(srcPdf!, indices);
            copied.forEach(p => subDoc.addPage(p));
            const subBytes = await subDoc.save();
            return uint8ToBase64(subBytes);
          };

          // Build size-checked ranges so even heavy scanned PDFs never trigger 413 on Vercel
          const chunkQueue: { start: number; end: number; prebuiltB64?: string }[] = [];
          const splitRangeToFit = async (start: number, end: number) => {
            const b64 = await buildSliceBase64(start, end);
            if (b64.length <= MAX_CHUNK_BASE64 || start === end) {
              if (b64.length > 3_600_000) {
                throw new Error(
                  `A página ${start + 1} do PDF possui imagem muito pesada (${(b64.length / 1_000_000).toFixed(1)} MB) e excede o limite de upload do servidor.`
                );
              }
              chunkQueue.push({ start, end, prebuiltB64: b64 });
              return;
            }
            const mid = Math.floor((start + end) / 2);
            await splitRangeToFit(start, mid);
            await splitRangeToFit(mid + 1, end);
          };

          if (totalPages > 2 || (fileBase64 && fileBase64.length > MAX_CHUNK_BASE64)) {
            setProcessingProgress({
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
                    if (
                      chunkRes.status === 429 ||
                      chunkRes.status === 403 ||
                      chunkRes.status === 400 ||
                      chunkRes.status === 413
                    ) {
                      err.noRetry = true;
                    }
                    throw err;
                  }
                  return chunkJson.extraction;
                } catch (err: any) {
                  lastError = err;
                  if (err?.noRetry || attempt === 1) {
                    throw err;
                  }
                  await new Promise(r => setTimeout(r, 800));
                }
              }
              throw lastError;
            };

            const extractedChunks: any[] = new Array(chunkQueue.length);
            const baseHint = accountingAccount ? `Conta contábil: ${accountingAccount}` : '';
            const firstRange = chunkQueue[0];
            const firstLabel =
              firstRange.start === firstRange.end
                ? `página ${firstRange.start + 1}`
                : `páginas ${firstRange.start + 1} a ${firstRange.end + 1}`;

            setProcessingProgress({
              totalPages,
              processedPages: 0,
              foundTransactions: 0,
              statusLabel: `Lendo ${firstLabel} de ${totalPages} (cabeçalho e lançamentos iniciais)...`,
            });

            // 1. Read first batch first to capture Bank, Agency, Account, CNPJ, and Year
            const firstExtraction = await extractRange(firstRange, baseHint || undefined);
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

            const sharedContextParts = [
              baseHint,
              firstExtraction?.bankName ? `Banco: ${firstExtraction.bankName} (${firstExtraction.bankCode || ''})` : '',
              firstExtraction?.agency ? `Agência: ${firstExtraction.agency}` : '',
              firstExtraction?.accountNumber ? `Conta: ${firstExtraction.accountNumber}` : '',
              inferredYear ? `Ano do extrato: ${inferredYear} (use este ano se a página mostrar apenas DD/MM)` : '',
            ].filter(Boolean);
            const sharedContextHint = sharedContextParts.join(' | ') || undefined;

            setProcessingProgress({
              totalPages,
              processedPages,
              foundTransactions,
              statusLabel: `${processedPages} de ${totalPages} páginas lidas • ${foundTransactions} lançamentos extraídos`,
            });

            // 2. Read remaining batches in parallel (concurrency = 2)
            const CONCURRENCY = 2;
            for (let i = 1; i < chunkQueue.length; i += CONCURRENCY) {
              const batchSlice = chunkQueue.slice(i, i + CONCURRENCY);
              const rangeLabel = batchSlice
                .map(r => (r.start === r.end ? `pág. ${r.start + 1}` : `págs. ${r.start + 1}-${r.end + 1}`))
                .join(' e ');

              setProcessingProgress({
                totalPages,
                processedPages,
                foundTransactions,
                statusLabel: `Lendo ${rangeLabel} de ${totalPages} com IA...`,
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

              setProcessingProgress({
                totalPages,
                processedPages,
                foundTransactions,
                statusLabel: `${processedPages} de ${totalPages} páginas lidas • ${foundTransactions} lançamentos extraídos`,
              });
            }

            setProcessingProgress({
              totalPages,
              processedPages: totalPages,
              foundTransactions,
              statusLabel: `Consolidando ${foundTransactions} lançamentos e gerando arquivo OFX...`,
            });

            const finalizeRes = await fetch('/api/ofx/finalize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chunks: extractedChunks,
                totalPages,
                pagesProcessed: totalPages,
                companyId: currentCompany.id,
                fileName: selectedFile.name,
                // Keep original PDF in history only if well below Vercel 4.5MB limit alongside chunks JSON
                fileBase64: fileBase64 && fileBase64.length < 1_500_000 ? fileBase64 : undefined,
                mimeType: 'application/pdf',
              }),
            });
            const finalizeData = await parseSafeJson(finalizeRes);
            if (!finalizeRes.ok) {
              throw new Error(finalizeData.error || 'Erro ao consolidar páginas do extrato.');
            }
            finalData = finalizeData;
          }
        }
      }

      // Single-request path for images, TXT/OFX, or small 1–2 page PDFs
      if (!finalData) {
        let payloadBody: any = {
          fileName: selectedFile?.name || 'extrato_bancario.pdf',
          bankHint: accountingAccount ? `Conta contábil: ${accountingAccount}` : undefined,
          companyId: currentCompany.id,
        };

        if (isPlainTextOrOfx && selectedFile) {
          payloadBody.rawText = await selectedFile.text();
        } else if (fileBase64) {
          const prepared = await compressImageIfNeeded(fileBase64, fileMimeType || 'application/pdf');
          if (prepared.base64.length > 3_400_000) {
            throw new Error(
              'O arquivo selecionado ultrapassa o limite de envio de 3,4 MB. Reduza a resolução ou divida o PDF.'
            );
          }
          payloadBody.fileBase64 = prepared.base64;
          payloadBody.mimeType = prepared.mimeType;
        }

        const response = await fetch('/api/ofx/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBody),
        });

        const data = await parseSafeJson(response);
        if (!response.ok) {
          throw new Error(data.error || 'Erro ao processar o extrato com IA.');
        }
        finalData = data;
      }

      // Check if statement contains CNPJ or company info that is NOT registered
      const detectedCnpj = finalData.statement?.extractedCnpj || finalData.statement?.detectedCnpj;
      const detectedOrg = finalData.statement?.extractedCompanyName || finalData.statement?.bankName || finalData.statement?.companyName;

      let companyFound = true;
      if (detectedCnpj) {
        const cleanDetected = detectedCnpj.replace(/\D/g, '');
        const exists = allCompanies.some(c => c.cnpj.replace(/\D/g, '') === cleanDetected);
        if (!exists) companyFound = false;
      }

      if (!companyFound && detectedCnpj) {
        setUnregisteredPrompt({
          cnpj: detectedCnpj,
          companyName: detectedOrg || 'Empresa Identificada no Extrato',
          pendingStatement: finalData.statement,
        });
      } else {
        setConvertedResult(finalData.statement);
        onRefreshHistory();
      }
    } catch (err: any) {
      console.error('Error converting statement:', err);
      setErrorMessage(err.message || 'Erro inesperado ao converter extrato.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(null);
    }
  };

  // Delete Statement handler
  const handleDeleteStatement = async (id: string) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/ofx/statements/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir extrato.');
      setDeletingId(null);
      if (convertedResult?.id === id) {
        setConvertedResult(null);
      }
      onRefreshHistory();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir extrato.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmRegisterCompany = () => {
    if (!unregisteredPrompt) return;

    const prefill = {
      name: unregisteredPrompt.companyName || 'Empresa Identificada no Extrato',
      cnpj: unregisteredPrompt.cnpj || '',
      fantasyName: unregisteredPrompt.companyName || 'Nova Empresa',
    };

    if (unregisteredPrompt.pendingStatement) {
      setConvertedResult(unregisteredPrompt.pendingStatement);
    }
    setUnregisteredPrompt(null);
    onOpenCompanyModalWithData(prefill);
  };

  const handleSkipCompanyRegistration = () => {
    if (unregisteredPrompt?.pendingStatement) {
      setConvertedResult(unregisteredPrompt.pendingStatement);
      onRefreshHistory();
    }
    setUnregisteredPrompt(null);
  };

  // Download OFX
  const handleDownloadOfx = (content?: string, filename?: string) => {
    const textToDownload = content || convertedResult?.ofxContent;
    if (!textToDownload) return;

    const blob = new Blob([textToDownload], { type: 'application/x-ofx;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `extrato_${convertedResult?.bankName || 'banco'}_${currentCompany.fantasyName || 'empresa'}.ofx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered statements list based on date filters and bank search
  const filteredHistory = useMemo(() => {
    return historyStatements.filter((stmt) => {
      // Date filter check
      if (startDateFilter && stmt.endDate && stmt.endDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && stmt.startDate && stmt.startDate > endDateFilter) {
        return false;
      }
      // Bank / File search
      if (searchBankTerm) {
        const term = searchBankTerm.toLowerCase();
        const matchesBank = stmt.bankName.toLowerCase().includes(term);
        const matchesFile = (stmt.originalFileName || '').toLowerCase().includes(term);
        if (!matchesBank && !matchesFile) return false;
      }
      return true;
    });
  }, [historyStatements, startDateFilter, endDateFilter, searchBankTerm]);

  // Table columns for the report modal
  const statementReportColumns: ReportColumn[] = [
    { key: 'date', label: 'Data', align: 'left' },
    { key: 'memo', label: 'Histórico / Descrição', align: 'left' },
    { key: 'fitid', label: 'Documento / FITID', align: 'left' },
    { 
      key: 'type', 
      label: 'Tipo', 
      align: 'center',
      format: (val) => (
        <span className={val === 'CREDIT' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
          {val === 'CREDIT' ? 'CRÉDITO (+)' : 'DÉBITO (-)'}
        </span>
      )
    },
    { 
      key: 'amount', 
      label: 'Valor (R$)', 
      align: 'right',
      format: (val, row) => (
        <span className={`font-mono font-bold ${row?.type === 'CREDIT' ? 'text-emerald-700' : 'text-rose-700'}`}>
          {row?.type === 'CREDIT' ? '+' : '-'} R$ {Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
      )
    },
  ];

  const consolidatedReportColumns: ReportColumn[] = [
    { key: 'bankName', label: 'Banco / Instituição', align: 'left' },
    { key: 'accountNumber', label: 'Conta / Agência', align: 'left', format: (val, row) => `Ag: ${row.agency || 'N/D'} / Cta: ${val || 'N/D'}` },
    { key: 'period', label: 'Período', align: 'center', format: (_, row) => `${row.startDate} a ${row.endDate}` },
    { key: 'transactionsCount', label: 'Lançamentos', align: 'center' },
    { 
      key: 'totalCredits', 
      label: 'Entradas (R$)', 
      align: 'right',
      format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    },
    { 
      key: 'totalDebits', 
      label: 'Saídas (R$)', 
      align: 'right',
      format: (val) => `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    },
  ];

  return (
    <div className="w-full max-w-full space-y-3.5 overflow-hidden">
      
      {/* Compact Header with "Emitir Relatório" button */}
      <div className="bg-white rounded-xl p-3.5 sm:p-4 border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60">
            <Sparkles className="w-4 h-4 text-[#00897b]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
              Conversor de Extrato Bancário para OFX com IA
            </h1>
            <p className="text-[11px] text-slate-500 truncate">
              Conversão direta para .OFX (Domínio, Questor, Fortes, Alterdata) • Empresa: <strong>{currentCompany.fantasyName || currentCompany.name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowConsolidatedReport(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Emitir relatório geral de extratos"
          >
            <Printer className="w-3.5 h-3.5 text-teal-700" />
            <span>Emitir Relatório</span>
          </button>
        </div>
      </div>

      {/* Unregistered Company Modal Prompt */}
      {unregisteredPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-teal-200 space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 inline-block">
                    Empresa Não Cadastrada
                  </div>
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm">
                    Deseja cadastrar esta empresa?
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setUnregisteredPrompt(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <p className="text-slate-600 text-[11px]">
                O extrato contém dados de uma empresa que ainda não está cadastrada:
              </p>
              
              <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-0.5 text-[11px]">
                {unregisteredPrompt.companyName && (
                  <div>
                    <span className="text-slate-400 font-medium">Nome: </span>
                    <strong className="text-slate-900">{unregisteredPrompt.companyName}</strong>
                  </div>
                )}
                {unregisteredPrompt.cnpj && (
                  <div>
                    <span className="text-slate-400 font-medium">CNPJ: </span>
                    <strong className="font-mono text-teal-800">{unregisteredPrompt.cnpj}</strong>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSkipCompanyRegistration}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Manter Atual
              </button>

              <button
                type="button"
                onClick={handleConfirmRegisterCompany}
                className="flex-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
              >
                <Building className="w-3.5 h-3.5" />
                <span>Cadastrar Empresa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Upload Card */}
      <div className="bg-white rounded-xl shadow-2xs border border-slate-200 p-4 space-y-3">
        
        {/* Error notification */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* 1. Drag & Drop Upload Zone */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">
              Arquivo do Extrato Bancário:
            </label>
            <span className="text-[10px] text-slate-400">
              PDF, TXT, OFX ou Foto/Imagem (.png, .jpg)
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.txt,.pdf,image/png,image/jpeg,image/webp,image/jpg"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition flex items-center justify-center gap-3 ${
                isDragOver
                  ? 'border-teal-500 bg-teal-50/60'
                  : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50 bg-slate-50/40'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  Arraste e solte o extrato aqui ou <span className="text-teal-600 underline">clique para selecionar</span>
                </p>
                <p className="text-[10px] text-slate-400">
                  Compatível com extratos de qualquer banco brasileiro (Itaú, Bradesco, BB, Caixa, Santander, Inter, Nubank, Sicoob, etc.)
                </p>
              </div>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-teal-50/80 border border-teal-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center shrink-0">
                  {selectedFile.type.includes('pdf') ? (
                    <FileText className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Arquivo'}
                    {pdfPageCount ? (
                      <span className="ml-1.5 font-bold text-teal-700">
                        • {pdfPageCount} {pdfPageCount === 1 ? 'página' : 'páginas'} {pdfPageCount > 2 ? '(leitura integral por lotes)' : ''}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearSelectedFile}
                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                title="Remover arquivo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Multi-page progress indicator */}
        {isProcessing && processingProgress && (
          <div className="p-3 rounded-xl bg-teal-50/90 border border-teal-200 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-teal-900">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                {processingProgress.statusLabel}
              </span>
              <span className="font-mono text-teal-700">
                {Math.round((processingProgress.processedPages / Math.max(1, processingProgress.totalPages)) * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-teal-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#00897b] transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((processingProgress.processedPages / Math.max(1, processingProgress.totalPages)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 2. Optional Accounting Account Input Field & Convert Button */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <div className="flex-1 relative">
            <input
              type="text"
              value={accountingAccount}
              onChange={(e) => setAccountingAccount(e.target.value)}
              placeholder="Conta contábil do banco (opcional, ex: 1.1.1.02.0001 - Itaú)"
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
            />
          </div>

          <button
            type="button"
            onClick={handleConvert}
            disabled={isProcessing || !selectedFile}
            className="py-2 px-4 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0 shadow-2xs"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {processingProgress
                    ? `Lendo ${processingProgress.processedPages}/${processingProgress.totalPages} págs...`
                    : 'Processando com IA...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-teal-200" />
                <span>Processar e Gerar OFX</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result Section (Just Processed) */}
      {convertedResult && (
        <div className="bg-white rounded-xl shadow-2xs border border-emerald-200 p-4 space-y-3 animate-in fade-in">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Extrato Processado com Sucesso
                </span>
                {convertedResult.totalPages && convertedResult.totalPages > 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[10px] font-bold border border-teal-200">
                    <Layers className="w-3 h-3 text-teal-600" />
                    {convertedResult.pagesProcessed || convertedResult.totalPages}/{convertedResult.totalPages} páginas lidas
                  </span>
                )}
              </div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {convertedResult.bankName} • Agência: {convertedResult.agency || 'N/D'} / Conta: {convertedResult.accountNumber || 'N/D'}
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setPreviewStatement(convertedResult);
                  setPreviewTab('transactions');
                }}
                className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Visualizar extrato, lançamentos e código OFX"
              >
                <Eye className="w-3.5 h-3.5 text-teal-600" />
                <span>Visualizar</span>
              </button>

              <button
                type="button"
                onClick={() => setReportStatement(convertedResult)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Emitir Relatório</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadOfx()}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar .OFX</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 font-semibold block">Lançamentos</span>
              <span className="text-xs font-extrabold text-slate-800">{convertedResult.transactionsCount}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
              <span className="text-[10px] text-slate-400 font-semibold block">Período</span>
              <span className="text-[11px] font-bold text-slate-700 truncate block">
                {convertedResult.startDate} a {convertedResult.endDate}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-100">
              <span className="text-[10px] text-emerald-700 font-semibold block">Entradas (+)</span>
              <span className="text-xs font-extrabold text-emerald-800">
                R$ {convertedResult.totalCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-rose-50/80 border border-rose-100">
              <span className="text-[10px] text-rose-700 font-semibold block">Saídas (-)</span>
              <span className="text-xs font-extrabold text-rose-800">
                R$ {convertedResult.totalDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FILTER BAR FOR IMPORTED STATEMENTS (FILTROS POR DATA & BUSCA) */}
      <div className="bg-white rounded-xl shadow-2xs border border-slate-200 p-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Filter className="w-3.5 h-3.5 text-[#00897b]" />
            <span>Filtros dos Extratos Importados</span>
            <span className="text-[10px] text-slate-400 font-normal ml-1">
              ({filteredHistory.length} de {historyStatements.length} encontrados)
            </span>
          </div>

          {(startDateFilter || endDateFilter || searchBankTerm) && (
            <button
              onClick={() => {
                setStartDateFilter('');
                setEndDateFilter('');
                setSearchBankTerm('');
              }}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer self-start sm:self-auto"
            >
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
              Data Inicial:
            </label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 bg-white cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
              Data Final:
            </label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 bg-white cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
              Buscar Banco / Arquivo:
            </label>
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Ex: Itaú, Bradesco, extrato..."
                value={searchBankTerm}
                onChange={(e) => setSearchBankTerm(e.target.value)}
                className="w-full pl-7 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* LISTA E TABELA DOS EXTRATOS IMPORTADOS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
              <FileCheck className="w-4 h-4 text-[#00897b]" />
            </span>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Extratos Importados ({filteredHistory.length})
              </h3>
              <p className="text-[10px] text-slate-400">
                Histórico estruturado de conciliação com emissão de relatórios, visualização e exportação
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
            {filteredHistory.reduce((s, x) => s + (x.transactionsCount || 0), 0)} Lançamentos Totais
          </span>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
            Nenhum extrato bancário encontrado com os filtros aplicados.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Desktop / Tablet Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3.5">Banco / Conta</th>
                    <th className="py-3 px-3">Período</th>
                    <th className="py-3 px-3">Arquivo Original</th>
                    <th className="py-3 px-2.5 text-center">Lançamentos</th>
                    <th className="py-3 px-3 text-right">Créditos (+)</th>
                    <th className="py-3 px-3 text-right">Débitos (-)</th>
                    <th className="py-3 px-3 text-right">Saldo Final</th>
                    <th className="py-3 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((stmt) => (
                    <tr key={stmt.id} className="hover:bg-teal-50/30 transition">
                      {/* Banco / Conta */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 font-bold">
                            <Landmark className="w-3.5 h-3.5 text-[#00897b]" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 block truncate">
                              {stmt.bankName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Ag: {stmt.agency || 'N/D'} • Cta: {stmt.accountNumber || 'N/D'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Período */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-mono text-slate-700 font-semibold block text-[11px]">
                          {stmt.startDate} a {stmt.endDate}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {stmt.uploadedAt ? new Date(stmt.uploadedAt).toLocaleDateString('pt-BR') : 'Hoje'}
                        </span>
                      </td>

                      {/* Arquivo */}
                      <td className="py-3 px-3 max-w-[160px] truncate" title={stmt.originalFileName}>
                        <span className="text-slate-800 font-medium block truncate text-[11px]">
                          {stmt.originalFileName || 'extrato.pdf'}
                        </span>
                        <span className="text-[9px] text-slate-400 block uppercase">
                          {stmt.fileMimeType?.includes('pdf') ? 'PDF' : stmt.fileMimeType?.includes('image') ? 'IMAGEM' : 'OFX/TXT'}
                        </span>
                      </td>

                      {/* Lançamentos */}
                      <td className="py-3 px-2.5 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700 text-[11px]">
                          {stmt.transactionsCount}
                        </span>
                      </td>

                      {/* Créditos */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        + R$ {stmt.totalCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Débitos */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                        - R$ {stmt.totalDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Saldo Final */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                        R$ {stmt.closingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Visualizar Extrato / OFX */}
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewStatement(stmt);
                              setPreviewTab('transactions');
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-200 text-slate-600 transition cursor-pointer"
                            title="Visualizar Extrato, Lançamentos e OFX"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-600" />
                          </button>

                          {/* Baixar OFX */}
                          <button
                            type="button"
                            onClick={() => handleDownloadOfx(stmt.ofxContent, `extrato_${stmt.bankName || 'banco'}.ofx`)}
                            className="px-2 py-1 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                            title="Baixar arquivo OFX"
                          >
                            <Download className="w-3 h-3" />
                            <span>OFX</span>
                          </button>

                          {/* Emitir Relatório */}
                          <button
                            type="button"
                            onClick={() => setReportStatement(stmt)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                            title="Emitir relatório impresso deste extrato"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-500" />
                          </button>

                          {/* Excluir Extrato */}
                          <button
                            type="button"
                            onClick={() => setDeletingId(stmt.id || null)}
                            className="p-1.5 rounded-lg border border-transparent hover:border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Excluir este extrato importado"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card/Row View */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredHistory.map((stmt) => (
                <div key={stmt.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 font-bold">
                        <Landmark className="w-3.5 h-3.5 text-[#00897b]" />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">
                          {stmt.bankName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Ag: {stmt.agency || 'N/D'} • Cta: {stmt.accountNumber || 'N/D'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-slate-700 text-[10px]">
                      {stmt.transactionsCount} lançamentos
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-[9px] text-emerald-700 font-sans block">Entradas:</span>
                      <strong className="text-emerald-700">+ R$ {stmt.totalCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-rose-700 font-sans block">Saídas:</span>
                      <strong className="text-rose-700">- R$ {stmt.totalDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span className="truncate max-w-[180px]">Arq: {stmt.originalFileName}</span>
                    <span>{stmt.startDate} a {stmt.endDate}</span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewStatement(stmt);
                        setPreviewTab('transactions');
                      }}
                      className="flex-1 py-1 px-2 rounded-lg border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3 h-3 text-teal-600" />
                      <span>Visualizar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadOfx(stmt.ofxContent, `extrato_${stmt.bankName || 'banco'}.ofx`)}
                      className="flex-1 py-1 px-2 rounded-lg bg-[#00897b] text-white text-[11px] font-bold flex items-center justify-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>OFX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportStatement(stmt)}
                      className="p-1 rounded-lg border border-slate-200 text-slate-600"
                      title="Emitir Relatório"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(stmt.id || null)}
                      className="p-1 rounded-lg border border-transparent text-slate-400 hover:text-rose-600"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: VISUALIZAR EXTRATO, LANÇAMENTOS E OFX */}
      {previewStatement && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Landmark className="w-5 h-5 text-teal-100" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                      {previewStatement.bankName}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200 shrink-0">
                      {previewTransactions.length} Lançamentos
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    Ag: {previewStatement.agency || 'N/D'} • Conta: {previewStatement.accountNumber || 'N/D'} • Período: {previewStatement.startDate} a {previewStatement.endDate}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => handleDownloadOfx(previewStatement.ofxContent, `extrato_${previewStatement.bankName || 'banco'}.ofx`)}
                  className="px-3 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Baixar arquivo OFX"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar OFX</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportStatement(previewStatement)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Emitir relatório para impressão ou PDF"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Relatório</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewStatement(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                  title="Fechar visualizador"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="px-4 bg-slate-50/80 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-xs font-bold">
              <button
                type="button"
                onClick={() => setPreviewTab('transactions')}
                className={`py-2.5 px-3.5 border-b-2 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  previewTab === 'transactions'
                    ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Extrato & Lançamentos ({previewTransactions.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewTab('ofx')}
                className={`py-2.5 px-3.5 border-b-2 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                  previewTab === 'ofx'
                    ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg shadow-2xs'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Código OFX (XML/SGML)</span>
              </button>

              {(previewStatement.fileBase64 || previewStatement.hasOriginalFile) && (
                <button
                  type="button"
                  onClick={() => setPreviewTab('document')}
                  className={`py-2.5 px-3.5 border-b-2 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                    previewTab === 'document'
                      ? 'border-teal-600 text-teal-800 bg-white rounded-t-lg shadow-2xs'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Documento Original ({previewStatement.fileMimeType?.includes('pdf') ? 'PDF' : previewStatement.fileMimeType?.includes('image') ? 'Foto' : 'Arquivo'})</span>
                </button>
              )}
            </div>

            {/* Content Body */}
            <div className="p-4 flex-1 overflow-y-auto bg-slate-100/60 min-h-[480px]">
              {/* TAB 1: TRANSACTIONS & SUMMARY */}
              {previewTab === 'transactions' && (
                <div className="space-y-3.5">
                  {/* Financial metric cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Total Lançamentos</span>
                      <span className="text-base font-extrabold text-slate-800">{previewTransactions.length}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-2xs">
                      <span className="text-[10px] text-emerald-700 font-semibold block uppercase">Créditos / Entradas (+)</span>
                      <span className="text-base font-extrabold text-emerald-800 font-mono">
                        R$ {(previewStatement.totalCredits || previewTransactions.filter(t => t.type === 'CREDIT').reduce((s, x) => s + (x.amount || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 shadow-2xs">
                      <span className="text-[10px] text-rose-700 font-semibold block uppercase">Débitos / Saídas (-)</span>
                      <span className="text-base font-extrabold text-rose-800 font-mono">
                        R$ {(previewStatement.totalDebits || previewTransactions.filter(t => t.type === 'DEBIT').reduce((s, x) => s + (x.amount || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Saldo Informado</span>
                      <span className="text-base font-extrabold text-slate-800 font-mono">
                        R$ {(previewStatement.closingBalance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Filter bar inside preview */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex-1 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={previewSearchTerm}
                        onChange={(e) => setPreviewSearchTerm(e.target.value)}
                        placeholder="Filtrar por histórico, documento ou data..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setPreviewFilterType('ALL')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${previewFilterType === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        Todos ({previewTransactions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilterType('CREDIT')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${previewFilterType === 'CREDIT' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}
                      >
                        Créditos (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilterType('DEBIT')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${previewFilterType === 'DEBIT' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'}`}
                      >
                        Débitos (-)
                      </button>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    {filteredPreviewTransactions.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        Nenhum lançamento encontrado para os critérios de busca.
                      </div>
                    ) : (
                      <div className="max-h-[380px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0 uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">Data</th>
                              <th className="py-2.5 px-3">Histórico / Descrição</th>
                              <th className="py-2.5 px-3">Doc / FITID</th>
                              <th className="py-2.5 px-2.5 text-center">Tipo</th>
                              <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredPreviewTransactions.map((tx, idx) => (
                              <tr key={tx.id || idx} className="hover:bg-teal-50/20 transition">
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                  {tx.date}
                                </td>
                                <td className="py-2 px-3 font-medium text-slate-900">
                                  {tx.memo}
                                </td>
                                <td className="py-2 px-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                                  {tx.fitid || '-'}
                                </td>
                                <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                    tx.type === 'CREDIT' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {tx.type === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO'}
                                  </span>
                                </td>
                                <td className={`py-2 px-3 text-right font-mono font-bold whitespace-nowrap ${
                                  tx.type === 'CREDIT' ? 'text-emerald-700' : 'text-rose-700'
                                }`}>
                                  {tx.type === 'CREDIT' ? '+' : '-'} R$ {Number(tx.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: OFX SOURCE CODE */}
              {previewTab === 'ofx' && (
                <div className="space-y-2.5">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Conteúdo do Arquivo OFX 1.02</span>
                      <span className="text-[10px] text-slate-400">Padrão XML/SGML compatível com Domínio, Fortes, Sage, Contmatic e demais ERPs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyOfx}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedOfx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                        <span>{copiedOfx ? 'Copiado!' : 'Copiar Código'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadOfx(previewStatement.ofxContent, `extrato_${previewStatement.bankName || 'banco'}.ofx`)}
                        className="px-3 py-1.5 rounded-lg bg-[#00897b] hover:bg-[#00796b] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar Arquivo</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-emerald-400 font-mono text-[11px] p-4 rounded-xl border border-slate-800 shadow-inner max-h-[460px] overflow-auto select-all leading-relaxed whitespace-pre">
                    {previewStatement.ofxContent || '// Arquivo OFX não gerado ou vazio'}
                  </div>
                </div>
              )}

              {/* TAB 3: ORIGINAL DOCUMENT / PDF */}
              {previewTab === 'document' && (
                <div className="space-y-2.5">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Documento Anexo: {previewStatement.originalFileName || 'extrato'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Formato: {previewStatement.fileMimeType || 'application/pdf'}
                      </span>
                    </div>
                    {pdfBlobUrl && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => window.open(pdfBlobUrl, '_blank')}
                          className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Abrir em Nova Aba</span>
                        </button>
                        <a
                          href={pdfBlobUrl}
                          download={previewStatement.originalFileName || 'extrato.pdf'}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Baixar Original</span>
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-center min-h-[480px]">
                    {previewStatement.fileBase64 ? (
                      previewStatement.fileMimeType?.includes('image') ? (
                        <img
                          src={`data:${previewStatement.fileMimeType || 'image/png'};base64,${previewStatement.fileBase64}`}
                          alt="Extrato Original"
                          className="max-h-[580px] max-w-full rounded-lg shadow-sm border border-slate-200 object-contain mx-auto"
                        />
                      ) : (
                        <object
                          data={pdfBlobUrl || `data:application/pdf;base64,${previewStatement.fileBase64}`}
                          type="application/pdf"
                          className="w-full h-[580px] rounded-lg border border-slate-200"
                        >
                          <div className="p-8 text-center text-slate-500 space-y-3">
                            <p className="text-xs">O visualizador embutido do navegador não suportou renderizar o PDF nesta janela.</p>
                            {pdfBlobUrl && (
                              <button
                                type="button"
                                onClick={() => window.open(pdfBlobUrl, '_blank')}
                                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Clique aqui para abrir o PDF diretamente
                              </button>
                            )}
                          </div>
                        </object>
                      )
                    ) : previewStatement.hasOriginalFile ? (
                      <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                        <span>Carregando documento original...</span>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        Nenhum documento original em base64 anexado a este registro.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-[11px] text-slate-400">
                ContSuite • Conciliação Bancária & OFX
              </span>
              <button
                type="button"
                onClick={() => setPreviewStatement(null)}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Excluir Extrato Importado?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Tem certeza que deseja remover este extrato da base de dados? Esta ação não pode ser desfeita.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeletingId(null)}
                disabled={deleteLoading}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-semibold border border-slate-200 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteStatement(deletingId)}
                disabled={deleteLoading}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT PRINT MODAL: SINGLE STATEMENT */}
      {reportStatement && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setReportStatement(null)}
          title={`Extrato Bancário & Conciliação - ${reportStatement.bankName}`}
          subtitle={`Agência: ${reportStatement.agency || 'N/D'} • Conta: ${reportStatement.accountNumber || 'N/D'} • Período: ${reportStatement.startDate} a ${reportStatement.endDate}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Qtd Lançamentos', value: reportStatement.transactionsCount },
            { label: 'Total Entradas (+)', value: `R$ ${reportStatement.totalCredits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'Total Saídas (-)', value: `R$ ${reportStatement.totalDebits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
            { label: 'Saldo Informado', value: `R$ ${reportStatement.closingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
          ]}
          columns={statementReportColumns}
          data={reportStatement.transactions}
        />
      )}

      {/* REPORT PRINT MODAL: CONSOLIDATED STATEMENTS */}
      {showConsolidatedReport && (
        <ReportPrintModal
          isOpen={true}
          onClose={() => setShowConsolidatedReport(false)}
          title="Relatório Consolidado de Extratos Bancários"
          subtitle={`Relação geral de extratos processados • Empresa: ${currentCompany.fantasyName || currentCompany.name}`}
          company={currentCompany}
          summaryMetrics={[
            { label: 'Extratos Cadastrados', value: filteredHistory.length },
            { 
              label: 'Total Entradas (+)', 
              value: `R$ ${filteredHistory.reduce((s, x) => s + (x.totalCredits || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
            },
            { 
              label: 'Total Saídas (-)', 
              value: `R$ ${filteredHistory.reduce((s, x) => s + (x.totalDebits || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
            },
            { 
              label: 'Lançamentos Totais', 
              value: filteredHistory.reduce((s, x) => s + (x.transactionsCount || 0), 0) 
            },
          ]}
          columns={consolidatedReportColumns}
          data={filteredHistory}
        />
      )}

    </div>
  );
};
