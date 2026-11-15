/// <reference types="vite/client" />

declare module 'pdfjs-dist/build/pdf.min.mjs' {
  const pdfjs: any;
  export = pdfjs;
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}
