import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { base64ToBlob, base64ToUint8Array } from '../utils/fileStorage';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  base64: string;
  fileName?: string;
  mimeType?: string;
  maxHeightClass?: string;
  className?: string;
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  base64,
  fileName = 'documento.pdf',
  mimeType = 'application/pdf',
  maxHeightClass = 'h-[520px]',
  className = '',
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  // null = auto fit container width
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [effectiveScale, setEffectiveScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Reset to fit-width when opening a different document
  useEffect(() => {
    setManualScale(null);
  }, [base64]);

  useEffect(() => {
    if (!base64) {
      setBlobUrl(null);
      return;
    }
    try {
      const blob = base64ToBlob(base64, mimeType || 'application/pdf');
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } catch {
      setBlobUrl(null);
    }
  }, [base64, mimeType]);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: any = null;

    const renderPdf = async () => {
      if (!base64 || !containerRef.current) return;
      setLoading(true);
      setError(null);

      try {
        const data = base64ToUint8Array(base64);
        const loadingTask = pdfjsLib.getDocument({ data });
        pdfDoc = await loadingTask.promise;

        if (cancelled) return;
        setNumPages(pdfDoc.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Compute fit-width scale from page 1 when manualScale is null
        let renderScale = manualScale ?? 1.0;
        if (manualScale === null && pdfDoc.numPages >= 1) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          const areaWidth = scrollAreaRef.current?.clientWidth || 520;
          const firstPage = await pdfDoc.getPage(1);
          const baseVp = firstPage.getViewport({ scale: 1 });
          const availWidth = Math.max(240, areaWidth - 36);
          if (baseVp.width > 0) {
            renderScale = Math.min(2.0, Math.max(0.2, Number((availWidth / baseVp.width).toFixed(2))));
          }
          firstPage.cleanup?.();
        }
        if (!cancelled) {
          setEffectiveScale(renderScale);
        }

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(pageNum);
          if (cancelled) break;

          const viewport = page.getViewport({ scale: renderScale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 2);

          const pageWrapper = document.createElement('div');
          pageWrapper.className =
            'mb-4 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mx-auto max-w-full';
          pageWrapper.style.width = `${Math.floor(viewport.width)}px`;

          const pageHeader = document.createElement('div');
          pageHeader.className =
            'px-3 py-1 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-500 flex items-center justify-between';
          pageHeader.textContent = `Página ${pageNum} de ${pdfDoc.numPages}`;
          pageWrapper.appendChild(pageHeader);

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.maxWidth = manualScale === null ? '100%' : 'none';
          canvas.style.height = manualScale === null ? 'auto' : `${Math.floor(viewport.height)}px`;
          canvas.style.display = 'block';

          const ctx = canvas.getContext('2d');
          if (ctx) {
            const transform =
              outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
            await page.render({
              canvasContext: ctx,
              transform,
              viewport,
            }).promise;
          }

          page.cleanup?.();
          pageWrapper.appendChild(canvas);
          container.appendChild(pageWrapper);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Erro ao renderizar PDF via PDF.js:', err);
          setError(err?.message || 'Não foi possível renderizar o PDF nesta visualização.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    renderPdf();

    return () => {
      cancelled = true;
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        pdfDoc.destroy().catch(() => {});
      }
    };
  }, [base64, manualScale]);

  const activeScale = manualScale ?? effectiveScale;

  return (
    <div className={`flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-slate-100 ${className}`}>
      {/* Toolbar */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-[#00897b] shrink-0" />
          <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]" title={fileName}>
            {fileName}
          </span>
          {numPages > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
              {numPages} {numPages === 1 ? 'página' : 'páginas'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() =>
              setManualScale(Math.max(0.25, Number((activeScale - 0.15).toFixed(2))))
            }
            title="Diminuir zoom"
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-bold text-slate-600 w-11 text-center tabular-nums">
            {Math.round(activeScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() =>
              setManualScale(Math.min(2.6, Number((activeScale + 0.15).toFixed(2))))
            }
            title="Aumentar zoom"
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setManualScale(null)}
            title="Ajustar à largura"
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-600 flex items-center gap-1 cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span>Ajustar</span>
          </button>

          {blobUrl && (
            <>
              <a
                href={blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700"
              >
                <ExternalLink className="w-3 h-3" />
                Abrir Aba
              </a>
              <a
                href={blobUrl}
                download={fileName}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#004d40] hover:bg-[#00695c] text-white text-[11px] font-bold"
              >
                <Download className="w-3 h-3" />
                Baixar PDF
              </a>
            </>
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={scrollAreaRef}
        className={`${maxHeightClass} overflow-auto p-3 sm:p-4 bg-slate-200/70 relative flex flex-col`}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 gap-2 min-h-[280px]">
            <Loader2 className="w-6 h-6 animate-spin text-[#00897b]" />
            <span className="text-xs font-semibold">Renderizando páginas do PDF...</span>
          </div>
        )}

        {error && !loading && (
          blobUrl ? (
            <div className="flex-1 flex flex-col gap-2 min-h-[360px]">
              <iframe
                src={blobUrl}
                title={fileName}
                className="w-full flex-1 min-h-[340px] rounded-lg bg-white border border-slate-300"
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600">
                <span>Visualizador alternativo ativado</span>
                <a
                  href={blobUrl}
                  download={fileName}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#004d40] text-white font-bold"
                >
                  <Download className="w-3 h-3" />
                  Baixar PDF
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-rose-200 rounded-xl p-5 text-center max-w-md mx-auto my-6">
              <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800 mb-1">Não foi possível pré-visualizar no canvas</p>
              <p className="text-[11px] text-slate-500 mb-3">{error}</p>
            </div>
          )
        )}

        <div
          ref={containerRef}
          className={loading || error ? 'hidden' : manualScale === null ? 'w-full' : 'min-w-full w-max'}
        />
      </div>
    </div>
  );
};
