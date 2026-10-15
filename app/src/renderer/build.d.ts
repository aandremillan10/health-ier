// Fixed by the selected Vite configuration, never by runtime input.
declare const __CLINIC_BROWSER_QA__: boolean;

// Side-effect import registers PDF.js's bundled local message handler.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {}
