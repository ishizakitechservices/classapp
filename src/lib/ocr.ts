/**
 * Client-side OCR using Tesseract.js.
 *
 * Free, no API keys, runs in the browser via WebAssembly.
 * The heavy WASM worker is loaded from a CDN; the student's device does the
 * recognition, so the server never sees the image and no tokens are spent.
 *
 * Usage:
 *   import { ocrImage } from '../lib/ocr';
 *   const text = await ocrImage(fileOrDataUrl);
 */

let tesseractModule: any = null;
let loadingPromise: Promise<void> | null = null;

const TESSERACT_CDN =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

async function ensureTesseract(): Promise<void> {
  if (tesseractModule) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    if (typeof window === 'undefined') return;
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.async = true;
    document.head.appendChild(script);
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
    });
    // @ts-ignore — injected global
    tesseractModule = window.Tesseract;
  })();

  return loadingPromise;
}

/** Recognize text from a File, Blob, or data URL. Returns the recognized text. */
export async function ocrImage(
  input: File | Blob | string,
  lang = 'eng'
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new Error('OCR is only available in the browser.');
  }

  await ensureTesseract();
  const Tesseract = (window as any).Tesseract;
  if (!Tesseract) {
    throw new Error('Tesseract.js failed to load. Check your internet connection.');
  }

  const result = await Tesseract.recognize(input, lang);
  return result.data.text.trim();
}

/** Recognize text and return words with bounding boxes (for highlighting). */
export async function ocrImageWithBoxes(
  input: File | Blob | string,
  lang = 'eng'
): Promise<{ text: string; words: Array<{ text: string; bbox: [number, number, number, number] }> }> {
  await ensureTesseract();
  const Tesseract = (window as any).Tesseract;
  const result = await Tesseract.recognize(input, lang);
  const words = result.data.words?.map((w: any) => ({
    text: w.text,
    bbox: [w.bbox?.x0 ?? 0, w.bbox?.y0 ?? 0, w.bbox?.x1 ?? 0, w.bbox?.y1 ?? 0],
  })) || [];
  return { text: result.data.text.trim(), words };
}
