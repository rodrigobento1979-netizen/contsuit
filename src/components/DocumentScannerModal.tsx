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
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Company, CompanyDocument, User } from '../types';
import { saveDocumentToFirestore } from '../firebase/service';
import { saveBlobToIdb } from '../utils/fileStorage';

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  currentCompany: Company;
  showToast: (text: string, type?: 'success' | 'error') => void;
  onDocumentSaved: (doc: CompanyDocument) => void;
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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

  const captureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedImages((prev) => [...prev, dataUrl]);
    // Pause/close camera so the mobile user immediately sees the photo preview with Enviar & Cancelar
    stopCamera();
    showToast(`Foto capturada! Confira e clique em Enviar ou Cancelar.`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setCapturedImages((prev) => [...prev, result]);
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
  };

  const handleGeneratePdfAndSave = async () => {
    if (capturedImages.length === 0) {
      showToast('Capture ou adicione ao menos uma imagem do documento.', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();

      for (const imgDataUrl of capturedImages) {
        const base64Clean = imgDataUrl.split(',')[1] || imgDataUrl;
        const imgBytes = Uint8Array.from(atob(base64Clean), (c) => c.charCodeAt(0));

        let embeddedImage;
        if (imgDataUrl.includes('image/png')) {
          embeddedImage = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedImage = await pdfDoc.embedJpg(imgBytes);
        }

        const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: embeddedImage.width,
          height: embeddedImage.height,
        });
      }

      const pdfBytes = await pdfDoc.save();
      const base64Pdf = btoa(
        Array.from(pdfBytes)
          .map((b) => String.fromCharCode(b))
          .join('')
      );

      // Strictly bound ONLY to the logged-in / active company
      const lockedCompany = currentCompany;
      const docId = 'doc-scan-' + Date.now().toString(36);
      const fileName = `${documentTitle.trim() || 'Documento_Digitalizado'}.pdf`;

      const newDoc: CompanyDocument = {
        id: docId,
        companyId: lockedCompany.id,
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        category: 'outro',
        status: 'pendente',
        competenceMonth: new Date().toISOString().slice(0, 7),
        documentDate: new Date().toISOString().slice(0, 10),
        issuerOrBank: (lockedCompany.fantasyName || lockedCompany.name).slice(0, 120),
        summary: `Documento digitalizado por ${currentUser.name} para ${lockedCompany.fantasyName || lockedCompany.name}`.slice(0, 250),
        aiClassified: true,
        confidence: 95,
        uploadedBy: currentUser.name.slice(0, 150),
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fileBase64: base64Pdf,
        hasOriginalFile: true,
        ofxStatus: 'idle',
      };

      // Save blob to IndexedDB
      try {
        await saveBlobToIdb(docId, base64Pdf);
      } catch (idbErr) {
        console.warn('Could not save PDF blob to IDB:', idbErr);
      }

      // Save to Firestore & backend API
      try {
        await saveDocumentToFirestore(lockedCompany.id, newDoc);
      } catch (fErr) {
        console.warn('Firestore save scanned doc warning:', fErr);
      }

      try {
        await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDoc),
        });
      } catch (apiErr) {
        console.warn('API save scanned doc warning:', apiErr);
      }

      stopCamera();
      onDocumentSaved(newDoc);
      showToast(`Documento "${fileName}" enviado e vinculado à ${lockedCompany.fantasyName || lockedCompany.name}!`);
      onClose();
    } catch (err: any) {
      console.error('Error generating PDF from scanned images:', err);
      showToast(err.message || 'Erro ao gerar PDF digitalizado.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const latestImage = capturedImages.length > 0 ? capturedImages[capturedImages.length - 1] : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-3xl shadow-2xl border-0 sm:border sm:border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Compact Sticky Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-r from-[#00695c] to-[#00897b] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Scan className="w-5 h-5 text-[#a7ffeb]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base leading-tight truncate">
                Digitalizar Documento
              </h3>
              <p className="text-[11px] text-teal-100 truncate">
                Câmera para PDF • Uso Rápido no Celular
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
            className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Locked Company Banner (NEVER allows switching company) */}
        <div className="px-4 py-2 sm:px-6 bg-teal-50/90 border-b border-teal-200/80 flex items-center justify-between gap-2 text-xs shrink-0">
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

        {/* Main Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* Document Title (Visible on main screen & review) */}
          {!isCameraActive && (
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
          )}

          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* MODE 1: CAMERA OPEN WITH PAGE FRAMING GUIDE LINE */}
          {isCameraActive && (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] sm:aspect-video w-full max-h-[62dvh] flex items-center justify-center border border-slate-800 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Page Framing Line Overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5 sm:p-8">
                  <div className="relative w-full h-full border-2 border-dashed border-emerald-400/95 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.42)] flex flex-col items-center justify-between py-2">
                    {/* Corner brackets for document alignment */}
                    <span className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                    <span className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                    <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                    <span className="px-2.5 py-1 rounded-full bg-black/70 text-emerald-300 text-[11px] font-bold tracking-wide border border-emerald-400/40">
                      Enquadre a página dentro da linha
                    </span>

                    {/* Subtle center alignment crosshair */}
                    <div className="w-full border-t border-emerald-300/25" />

                    <span className="text-[10px] text-white/80 bg-black/50 px-2 py-0.5 rounded">
                      Mantenha o documento firme e legível
                    </span>
                  </div>
                </div>
              </div>

              {/* Camera Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="py-3.5 px-4 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-sm sm:text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <X className="w-4 h-4" />
                  <span>Cancelar</span>
                </button>
                <button
                  type="button"
                  onClick={captureSnapshot}
                  className="py-3.5 px-4 rounded-2xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-sm sm:text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Tirar Foto</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: TWO MOBILE-OPTIMIZED MENUS (When camera is closed and no captured image yet) */}
          {!isCameraActive && capturedImages.length === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 text-xs cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* MODE 3: CAPTURED PHOTO PREVIEW WITH PROMINENT ENVIAR & CANCELAR BUTTONS */}
          {!isCameraActive && capturedImages.length > 0 && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Main captured photo preview */}
              {latestImage && (
                <div className="relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-950 aspect-[3/4] sm:aspect-[4/3] max-h-[44dvh] flex items-center justify-center">
                  <img
                    src={latestImage}
                    alt="Foto capturada"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 text-white text-[11px] font-bold">
                    Página {capturedImages.length} de {capturedImages.length}
                  </div>
                </div>
              )}

              {/* Multi-page thumbnails & add another page */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">
                  {capturedImages.length}{' '}
                  {capturedImages.length === 1 ? 'página capturada' : 'páginas capturadas'}
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
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-28 overflow-y-auto p-2 rounded-xl bg-slate-50 border border-slate-200">
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

              {/* Prominent Mobile-First Enviar & Cancelar Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleCancelCaptured}
                  className="py-3.5 px-4 rounded-2xl border-2 border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-sm sm:text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-rose-600" />
                  <span>Cancelar</span>
                </button>
                <button
                  type="button"
                  disabled={isProcessing || capturedImages.length === 0}
                  onClick={handleGeneratePdfAndSave}
                  className="py-3.5 px-4 rounded-2xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-sm sm:text-xs shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95 transition"
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
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
};
