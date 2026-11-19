import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  FileText,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Building2,
  AlertCircle,
  Scan,
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
  allCompanies: Company[];
  onSelectCompany: (companyId: string) => void;
  showToast: (text: string, type?: 'success' | 'error') => void;
  onDocumentSaved: (doc: CompanyDocument) => void;
}

export const DocumentScannerModal: React.FC<DocumentScannerModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentCompany,
  allCompanies,
  onSelectCompany,
  showToast,
  onDocumentSaved,
}) => {
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetCompanyId, setTargetCompanyId] = useState(currentCompany.id);
  const [documentTitle, setDocumentTitle] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCapturedImages([]);
      setTargetCompanyId(currentCompany.id);
      setDocumentTitle(`Documento Digitalizado - ${new Date().toLocaleDateString('pt-BR')}`);
      setCameraError(null);
      setIsCameraActive(false);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, currentCompany.id]);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Could not start camera:', err);
      setCameraError('Câmera não disponível ou permissão negada. Utilize a opção de enviar imagem/foto do dispositivo.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImages((prev) => [...prev, dataUrl]);
    showToast(`Página ${capturedImages.length + 1} capturada com sucesso!`);
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

      const activeComp = allCompanies.find((c) => c.id === targetCompanyId) || currentCompany;
      const docId = 'doc-scan-' + Date.now().toString(36);
      const fileName = `${documentTitle.trim() || 'Documento_Digitalizado'}.pdf`;

      const newDoc: CompanyDocument = {
        id: docId,
        companyId: activeComp.id,
        fileName,
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        category: 'outro',
        status: 'pendente',
        competenceMonth: new Date().toISOString().slice(0, 7),
        documentDate: new Date().toISOString().slice(0, 10),
        issuerOrBank: activeComp.fantasyName || activeComp.name,
        summary: `Documento digitalizado por ${currentUser.name} para a empresa ${activeComp.fantasyName || activeComp.name}`,
        aiClassified: true,
        confidence: 95,
        uploadedBy: currentUser.name,
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
        await saveDocumentToFirestore(activeComp.id, newDoc);
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
      showToast(`Documento "${fileName}" digitalizado e salvo com sucesso!`);
      onClose();
    } catch (err: any) {
      console.error('Error generating PDF from scanned images:', err);
      showToast(err.message || 'Erro ao gerar PDF digitalizado.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
              <Scan className="w-5 h-5 text-[#00897b]" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Digitalizar Documento (Câmera / Scanner)</h3>
              <p className="text-xs text-slate-500">Capture fotos de notas, recibos ou extratos e converta em PDF automaticamente</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Company Selector */}
        <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span className="font-bold text-teal-950">Vincular à Empresa:</span>
          </div>
          <select
            value={targetCompanyId}
            onChange={(e) => setTargetCompanyId(e.target.value)}
            className="bg-white text-slate-900 font-bold border border-teal-300 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            {allCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fantasyName || c.name} (CNPJ: {c.cnpj})
              </option>
            ))}
          </select>
        </div>

        {/* Document Title Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Título do Documento Digitalizado</label>
          <input
            type="text"
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            placeholder="Ex: Recibo Pagamento Fornecedor - Novembro"
            className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Camera / Capture Viewport */}
        <div className="space-y-3">
          {cameraError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {isCameraActive ? (
            <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-800 shadow-inner">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={captureSnapshot}
                  className="px-6 py-3 rounded-2xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-xs shadow-xl flex items-center gap-2 cursor-pointer transition transform active:scale-95 border border-teal-300/40"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capturar Página</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-3 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition backdrop-blur-xs"
                >
                  Fechar Câmera
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={startCamera}
                className="p-5 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50/50 hover:bg-teal-50 text-teal-900 transition flex flex-col items-center justify-center gap-2 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="font-extrabold text-xs">Abrir Câmera do Dispositivo</span>
                <span className="text-[10px] text-teal-700 font-medium">Webcam ou Câmera Celular</span>
              </button>

              <label className="p-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition flex flex-col items-center justify-center gap-2 cursor-pointer group">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-extrabold text-xs">Enviar Foto do Arquivo</span>
                <span className="text-[10px] text-slate-500 font-medium">JPEG, PNG ou Imagem de Nota</span>
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
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Captured Pages Gallery */}
        {capturedImages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Páginas Capturadas ({capturedImages.length})</span>
              <span className="text-[11px] text-slate-400">Serão unificadas em 1 arquivo PDF</span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-40 overflow-y-auto p-2 rounded-2xl bg-slate-50 border border-slate-200">
              {capturedImages.map((img, idx) => (
                <div key={idx} className="relative group aspect-[3/4] rounded-xl overflow-hidden border border-slate-300 bg-white shadow-2xs">
                  <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-white font-mono text-[9px]">
                    #{idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removePage(idx)}
                    className="absolute inset-0 bg-rose-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white cursor-pointer"
                    title="Excluir página"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 text-xs cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing || capturedImages.length === 0}
            onClick={handleGeneratePdfAndSave}
            className="px-6 py-2.5 rounded-xl bg-[#00897b] hover:bg-[#00695c] text-white font-extrabold text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando PDF & Salvando...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>Gerar PDF & Salvar no Sistema</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
