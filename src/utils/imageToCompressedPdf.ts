import { PDFDocument } from 'pdf-lib';

const DEFAULT_PAGE_JPEG_BUDGET_BYTES = 85 * 1024; // ~85 KB per page = ultra-compressed & still legible

export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|jfif)$/i.test(file.name || '');
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function base64ByteLengthFromDataUrl(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

/**
 * Draws an image/video/canvas onto an offscreen canvas with white backdrop,
 * slight document contrast boost, and iteratively shrinks resolution + JPEG quality
 * until the resulting image is compact enough for an ultra-lightweight PDF.
 */
export function compressSourceToUltraSmallJpegDataUrl(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
  targetMaxBytes: number = DEFAULT_PAGE_JPEG_BUDGET_BYTES
): string {
  const safeW = Math.max(1, sourceWidth);
  const safeH = Math.max(1, sourceHeight);

  // Progressive compression ladder: legible A4 document resolution -> tighter fallback if needed
  const attempts: Array<{ maxDim: number; quality: number }> = [
    { maxDim: 1120, quality: 0.54 },
    { maxDim: 1120, quality: 0.42 },
    { maxDim: 940, quality: 0.36 },
    { maxDim: 800, quality: 0.30 },
    { maxDim: 680, quality: 0.25 },
  ];

  const canvas = document.createElement('canvas');
  let bestDataUrl = '';

  for (const step of attempts) {
    let targetW = safeW;
    let targetH = safeH;
    if (safeW > step.maxDim || safeH > step.maxDim) {
      if (safeW >= safeH) {
        targetH = Math.max(1, Math.round((safeH * step.maxDim) / safeW));
        targetW = step.maxDim;
      } else {
        targetW = Math.max(1, Math.round((safeW * step.maxDim) / safeH));
        targetH = step.maxDim;
      }
    }

    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // Solid white background ensures transparent PNGs become tiny opaque JPEGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    // Subtle sharpening/contrast boost keeps printed/handwritten text crisp at lower bitrates
    try {
      ctx.filter = 'contrast(1.08) brightness(1.02)';
    } catch {}

    ctx.drawImage(source, 0, 0, targetW, targetH);

    try {
      ctx.filter = 'none';
    } catch {}

    const candidate = canvas.toDataURL('image/jpeg', step.quality);
    bestDataUrl = candidate;

    if (base64ByteLengthFromDataUrl(candidate) <= targetMaxBytes) {
      return candidate;
    }
  }

  return bestDataUrl;
}

export function compressImageInputToJpegDataUrl(
  input: string | Blob,
  targetMaxBytes: number = DEFAULT_PAGE_JPEG_BUDGET_BYTES
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = typeof input === 'string' ? null : URL.createObjectURL(input);
    const img = new Image();

    img.onload = () => {
      try {
        const result = compressSourceToUltraSmallJpegDataUrl(
          img,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          targetMaxBytes
        );
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(result);
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (typeof input === 'string') {
        resolve(input);
      } else {
        reject(new Error('Não foi possível ler a imagem selecionada.'));
      }
    };

    img.src = objectUrl || (input as string);
  });
}

/**
 * Converts one or more image data URLs into the smallest valid PDF possible
 * using JPEG streams + pdf-lib object stream compression.
 */
export async function buildCompressedPdfFromDataUrls(
  images: string[],
  targetMaxBytesPerPage: number = DEFAULT_PAGE_JPEG_BUDGET_BYTES
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const rawDataUrl of images) {
    let jpegDataUrl = rawDataUrl;
    const isAlreadyCompactJpeg =
      jpegDataUrl.startsWith('data:image/jpeg') &&
      base64ByteLengthFromDataUrl(jpegDataUrl) <= targetMaxBytesPerPage * 1.15;

    if (!isAlreadyCompactJpeg) {
      jpegDataUrl = await compressImageInputToJpegDataUrl(rawDataUrl, targetMaxBytesPerPage);
    }

    const base64Clean = jpegDataUrl.includes(',') ? jpegDataUrl.split(',')[1] : jpegDataUrl;
    const imgBytes = Uint8Array.from(atob(base64Clean), (c) => c.charCodeAt(0));
    const embeddedImage = await pdfDoc.embedJpg(imgBytes);

    // Normalize page to A4 width (595pt) preserving aspect ratio
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

  return pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}

export async function convertImageFileToCompressedPdfFile(
  file: File,
  targetMaxBytesPerPage: number = DEFAULT_PAGE_JPEG_BUDGET_BYTES
): Promise<{
  pdfFile: File;
  bytes: Uint8Array;
  base64: string;
  originalSize: number;
  compressedSize: number;
}> {
  const compressedJpegDataUrl = await compressImageInputToJpegDataUrl(file, targetMaxBytesPerPage);
  const pdfBytes = await buildCompressedPdfFromDataUrls(
    [compressedJpegDataUrl],
    targetMaxBytesPerPage
  );
  const baseName = (file.name || 'documento_foto').replace(/\.[^/.]+$/, '');
  const pdfFileName = `${baseName}.pdf`;
  const pdfArrayBuffer = new Uint8Array(pdfBytes).buffer;
  const pdfFile = new File([pdfArrayBuffer], pdfFileName, {
    type: 'application/pdf',
    lastModified: Date.now(),
  });

  return {
    pdfFile,
    bytes: pdfBytes,
    base64: uint8ToBase64(pdfBytes),
    originalSize: file.size || 0,
    compressedSize: pdfBytes.length,
  };
}
