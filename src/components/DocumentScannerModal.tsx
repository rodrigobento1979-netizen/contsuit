import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Trash2,
  Loader2,
  Building2,
  AlertCircle,
  Scan,
  Lock,
  Send,
  Plus,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Company, CompanyDocument, User } from '../types';
import { saveDocumentToFirestore } from '../firebase/service';
import { saveBlobToIdb } from '../utils/fileStorage';
import { PdfCanvasViewer } from './PdfCanvasViewer';

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentCompany: Company;
  showToast: (text: string, type?: 'success' | 'error') => void;
  onDocumentSaved: (doc: CompanyDocument) => void;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function compressImageDataUrl(dataUrl: string, maxDim = 1600, quality = 0.78): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentCompany,
  showToast,
  onDocumentSaved,
}) => {
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'pdf' | 'photo'>('pdf');
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedImages([]);
      setPreviewPdfBase64(null);
      setPreviewMode('pdf');
      setDocumentTitle(`Documento Digitalizado - ${new Date().toLocaleDateString('pt-BR')}`);
      setCameraError(null);
      setIsCameraActive(false);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  // Attach active MediaStream once the <video> element mounts
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Could not start camera:', err);
      setCameraError(
        'Câmera não disponível ou permissão negada. Utilize a opção de enviar imagem do dispositivo.'
      );
      setIsCameraActive(false);
    }
  };

  const buildPdfFromImages = async (images: string[]): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.create();
    for (const imgDataUrl of images) {
      const base64Clean = imgDataUrl.split(',')[1] || imgDataUrl;
      const imgBytes = Uint8Array.from(atob(base64Clean), (c) => c.charCodeAt(0));

      let embeddedImage;
      if (imgDataUrl.includes('image/png')) {
        embeddedImage = await pdfDoc.embedPng(imgBytes);
      } else {
        embeddedImage = await pdfDoc.embedJpg(imgBytes);
      }

      // Normalize to A4 width (595pt) preserving aspect ratio so all PDF viewers display cleanly
      const pageWidth = 595;
      const pageHeight = Math.max(
        200,
        Math.round((embeddedImage.height / Math.max(1, embeddedImage.width)) * pageWidth)
      );
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    }
    return pdfDoc.save();
  };

  // Automatically generate live PDF preview whenever captured images change
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || capturedImages.length === 0) {
      setPreviewPdfBase64(null);
      return;
    }
    setBuildingPreview(true);
    buildPdfFromImages(capturedImages)
      .then((bytes) => {
        if (!cancelled) {
          setPreviewPdfBase64(uint8ToBase64(bytes));
        }
      })
      .catch((err) => {
        console.warn('Could not build live PDF preview:', err);
        if (!cancelled) setPreviewPdfBase64(null);
      })
      .finally(() => {
        if (!cancelled) setBuildingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, capturedImages]);

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      showToast('Aguarde 1 segundo a câmera focar e tente novamente.', 'error');
      return;
    }

    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    const maxDim = 1600;
    let targetW = rawW;
    let targetH = rawH;
    if (rawW > maxDim || rawH > maxDim) {
      if (rawW >= rawH) {
        targetH = Math.round((rawH * maxDim) / rawW);
        targetW = maxDim;
      } else {
        targetW = Math.round((rawW * maxDim) / rawH);
        targetH = maxDim;
      }
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    setCapturedImages((prev) => [...prev, dataUrl]);
    setPreviewMode('pdf');
    stopCamera();
    showToast(`Foto capturada e PDF gerado! Confira a visualização e clique em Enviar.`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const result = event.target?.result as string;
        if (result) {
          const compressed = await compressImageDataUrl(result);
          setCapturedImages((prev) => [...prev, compressed]);
          setPreviewMode('pdf');
        }
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePage = (index: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancelCaptured = () => {
    stopCamera();
    setCapturedImages([]);
    setPreviewPdfBase64(null);
  };

  const handleGeneratePdfAndSave = async () => {
    if (capturedImages.length === 0) {
      showToast('Capture ou adicione ao menos uma imagem do documento.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const pdfBytes = await buildPdfFromImages(capturedImages);
      const base64Pdf = uint8ToBase64(pdfBytes);

      // Strictly bound ONLY to the logged-in / active company
      const lockedCompany = currentCompany;
      const docId = 'doc-scan-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
      const cleanTitle = (documentTitle.trim() || 'Documento_Digitalizado').replace(/\.pdf$/i, '');
      const fileName = `${cleanTitle}.pdf`;
      const nowIso = new Date().toISOString();

      let finalDoc: CompanyDocument = {
        id: docId,
        companyId: lockedCompany.id,
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        category: 'outro',
        status: 'pendente',
        competenceMonth: nowIso.slice(0, 7),
        documentDate: nowIso.slice(0, 10),
        issuerOrBank: (lockedCompany.fantasyName || lockedCompany.name).slice(0, 120),
        summary: `Digitalizado por ${currentUser.name} (${lockedCompany.fantasyName || lockedCompany.name})`.slice(0, 250),
        aiClassified: true,
        confidence: 95,
        uploadedBy: currentUser.name.slice(0, 150),
        uploadedAt: nowIso,
        updatedAt: nowIso,
        fileBase64: base64Pdf,
        hasOriginalFile: true,
        ofxStatus: 'idle',
      };

      // 1. Save immediately to server API (preserves same docId for cross-device sync)
      let apiSynced = false;
      try {
        const apiRes = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...finalDoc,
            autoClassify: false,
          }),
        });
        if (apiRes.ok) {
          const savedMeta = await apiRes.json();
          if (savedMeta && savedMeta.id) {
            finalDoc = {
              ...finalDoc,
              ...savedMeta,
              fileBase64: base64Pdf,
              hasOriginalFile: true,
            };
          }
          apiSynced = true;
        } else {
          console.warn('API save scanned doc returned status:', apiRes.status);
        }
      } catch (apiErr) {
        console.warn('API save scanned doc error:', apiErr);
      }

      // 2. Save to Firestore with exact same ID for instant real-time cross-device sync
      let firestoreSynced = false;
      try {
        await saveDocumentToFirestore(lockedCompany.id, finalDoc);
        firestoreSynced = true;
      } catch (fErr) {
        console.warn('Firestore save scanned doc warning:', fErr);
      }

      if (!apiSynced && !firestoreSynced) {
        throw new Error('Falha de conexão ao sincronizar o documento com o servidor. Tente novamente.');
      }

      // 3. Save binary locally to IndexedDB & update local cache
      try {
        await saveBlobToIdb(finalDoc.id, base64Pdf);
      } catch (idbErr) {
        console.warn('Could not save PDF blob to IDB:', idbErr);
      }

      try {
        const cacheKey = `contsuite_cached_docs_${lockedCompany.id}`;
        const raw = localStorage.getItem(cacheKey);
        const existingList: CompanyDocument[] = raw ? JSON.parse(raw) : [];
        const { fileBase64: _, ...metaOnly } = finalDoc;
        const nextList = [metaOnly, ...existingList.filter((d) => d.id !== finalDoc.id)];
        localStorage.setItem(cacheKey, JSON.stringify(nextList));
      } catch {}

      // 4. Notify open DocumentsView immediately in same window/tab
      window.dispatchEvent(new CustomEvent('contsuite:document-saved', { detail: finalDoc }));

      stopCamera();
      onDocumentSaved(finalDoc);
      showToast(`"${fileName}" enviado e sincronizado com a plataforma!`);
      onClose();
    } catch (err: any) {
      console.error('Error generating PDF from scanned images:', err);
      showToast(err.message || 'Erro ao gerar e enviar PDF digitalizado.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const latestImage = capturedImages.length > 0 ? capturedImages[capturedImages.length - 1] : null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xs flex flex-col sm:items-center sm:justify-center sm:p-4">
      <div className="bg-white w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-3xl shadow-2xl border-0 sm:border sm:border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Compact Sticky Header */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-gradient-to-r from-[#00695c] to-[#00897b] text-white flex items-center justify-between shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Scan className="w-4 h-4 text-[#a7ffeb]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm leading-tight truncate">
                Digitalizar Documento
              </h3>
              <p className="text-[11px] text-teal-100 truncate">
                {isCameraActive
                  ? `Enquadre a página • ${currentCompany.fantasyName || currentCompany.name}`
                  : 'Câmera para PDF • Sincronização Imediata'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Fechar digitalização"
            className="text-white/90 hover:text-white p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Locked Company Banner (Hidden when camera active to give full space to viewfinder & buttons) */}
        {!isCameraActive && (
          <div className="px-3.5 py-2 sm:px-5 bg-teal-50/90 border-b border-teal-200/80 flex items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
              <div className="min-w-0 truncate">
                <span className="font-semibold text-teal-800 mr-1">Empresa:</span>
                <span className="font-extrabold text-slate-900">
                  {currentCompany.fantasyName || currentCompany.name}
                </span>
                <span className="hidden sm:inline text-slate-500 font-mono text-[11px] ml-1.5">
                  ({currentCompany.cnpj})
                </span>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold text-[10px] shrink-0"
              title="Sempre vinculado automaticamente à empresa logada"
            >
              <Lock className="w-3 h-3" />
              Fixa
            </span>
          </div>
        )}

        {/* MIDDLE CONTENT AREA */}
        {isCameraActive ? (
          /* CAMERA VIEWPORT: flex-1 min-h-0 guarantees bottom buttons are NEVER pushed off-screen */
          <div className="flex-1 min-h-0 relative bg-black overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Page Framing Guide Line Overlay */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 sm:p-7">
              <div className="relative w-full h-full border-2 border-dashed border-emerald-400/95 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] flex flex-col items-center justify-between py-2">
                <span className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <span className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                <span className="px-2.5 py-0.5 rounded-full bg-black/75 text-emerald-300 text-[11px] font-bold tracking-wide border border-emerald-400/40">
                  Enquadre a página dentro da linha
                </span>

                <div className="w-full border-t border-emerald-300/25" />

                <span className="text-[10px] text-white/85 bg-black/55 px-2 py-0.5 rounded">
                  Mantenha o documento firme e legível
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* SCROLLABLE FORM / PREVIEW AREA */
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Título do Documento
              </label>
              <input
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="Ex: Nota Fiscal / Recibo"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm sm:text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              />
            </div>

            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}

            {capturedImages.length === 0 ? (
              /* TWO MOBILE-OPTIMIZED MENUS */
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={startCamera}
                  className="p-4 sm:p-5 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/60 hover:bg-teal-50 active:scale-[0.98] text-teal-900 transition flex flex-col items-center justify-center gap-2 cursor-pointer text-center min-h-[140px]"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#00897b] text-white flex items-center justify-center shadow-md">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="font-extrabold text-xs sm:text-sm leading-tight">
                    Abrir Câmera
                  </span>
                  <span className="text-[11px] text-teal-700 font-medium leading-tight">
                    Tirar foto da página
                  </span>
                </button>

                <label className="p-4 sm:p-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-800 transition flex flex-col items-center justify-center gap-2 cursor-pointer text-center min-h-[140px]">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-md">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="font-extrabold text-xs sm:text-sm leading-tight">
                    Enviar Foto
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium leading-tight">
                    Galeria / Arquivo
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              /* CAPTURED DOCUMENT PREVIEW (PDF + PHOTO TOGGLE) */
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex p-0.5 rounded-xl bg-slate-100 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('pdf')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                        previewMode === 'pdf'
                          ? 'bg-white text-teal-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Visualizar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('photo')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                        previewMode === 'photo'
                          ? 'bg-white text-teal-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Foto ({capturedImages.length})</span>
                    </button>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600">
                    {capturedImages.length}{' '}
                    {capturedImages.length === 1 ? 'página' : 'páginas'}
                  </span>
                </div>

                {previewMode === 'pdf' ? (
                  buildingPreview ? (
                    <div className="h-[38dvh] sm:h-[42dvh] rounded-2xl border border-slate-200 bg-slate-100 flex flex-col items-center justify-center gap-2 text-slate-600">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00897b]" />
                      <span className="text-xs font-semibold">Gerando visualização do PDF...</span>
                    </div>
                  ) : previewPdfBase64 ? (
                    <PdfCanvasViewer
                      base64={previewPdfBase64}
                      fileName={`${(documentTitle.trim() || 'Documento_Digitalizado').replace(/\.pdf$/i, '')}.pdf`}
                      mimeType="application/pdf"
                      maxHeightClass="h-[38dvh] sm:h-[42dvh]"
                    />
                  ) : latestImage ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-950 h-[36dvh] sm:h-[40dvh] flex items-center justify-center">
                      <img src={latestImage} alt="Foto capturada" className="w-full h-full object-contain" />
                    </div>
                  ) : null
                ) : (
                  latestImage && (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-950 h-[36dvh] sm:h-[40dvh] flex items-center justify-center">
                      <img
                        src={latestImage}
                        alt="Foto capturada"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 text-white text-[11px] font-bold">
                        Página {capturedImages.length} de {capturedImages.length}
                      </div>
                    </div>
                  )
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Pronto para envio em PDF
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Outra Página</span>
                    </button>
                    <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Galeria</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {capturedImages.length > 1 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-24 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
                    {capturedImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group aspect-[3/4] rounded-lg overflow-hidden border border-slate-300 bg-white"
                      >
                        <img src={img} alt={`Página ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/70 text-white font-mono text-[9px]">
                          #{idx + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePage(idx)}
                          className="absolute top-1 right-1 p-1 rounded bg-rose-600 text-white cursor-pointer"
                          title="Excluir página"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PINNED BOTTOM ACTION BAR: Never suppressed by browser toolbars */}
        <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          {isCameraActive ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={stopCamera}
                className="py-3 px-4 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-extrabold text-sm sm:text-xs flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
                <span>Cancelar</span>
              </button>
              <button
                type="button"
                onClick={captureSnapshot}
                className="py-3 px-4 rounded-2xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-sm sm:text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Tirar Foto</span>
              </button>
            </div>
          ) : capturedImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleCancelCaptured}
                className="py-3 px-4 rounded-2xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-sm sm:text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4 text-rose-600" />
                <span>Cancelar</span>
              </button>
              <button
                type="button"
                disabled={isProcessing || capturedImages.length === 0}
                onClick={handleGeneratePdfAndSave}
                className="py-3 px-4 rounded-2xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-sm sm:text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 transition"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 text-xs cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};
