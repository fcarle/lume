import type { Worker } from 'tesseract.js';
import type { OcrWord } from './types';
export class OcrService {
  private worker: Worker | null = null;
  private initializing: Promise<Worker> | null = null;
  private language = '';
  private busy = false;
  private destroyed = false;
  async prepare(language: string, progress: (message: string, value: number) => void): Promise<Worker> {
    if (this.initializing) await this.initializing;
    if (this.destroyed) throw new Error('Recognition session closed.');
    if (this.worker && this.language === language) return this.worker;
    if (this.worker) { await this.worker.terminate(); this.worker = null; }
    this.initializing = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker(language, 1, {
        workerPath: `${window.location.origin}/ocr/worker.min.js`,
        corePath: `${window.location.origin}/ocr`,
        langPath: language === 'eng' ? `${window.location.origin}/ocr/lang` : 'https://tessdata.projectnaptha.com/4.0.0_fast',
        logger: message => { if (message.status !== 'recognizing text') progress(message.status, message.progress); },
      });
      if (this.destroyed) { await worker.terminate(); throw new Error('Recognition session closed.'); }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      this.worker = worker; this.language = language; return worker;
    })();
    try { return await this.initializing; } finally { this.initializing = null; }
  }
  async recognize(canvas: HTMLCanvasElement, language: string, progress: (message: string, value: number) => void): Promise<{ words: OcrWord[]; confidence: number; duration: number } | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const worker = await this.prepare(language, progress);
      const start = performance.now();
      const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
      let lineId = 0;
      const words: OcrWord[] = [];
      for (const block of result.data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
        for (const word of line.words) words.push({ text: word.text, confidence: word.confidence, line: lineId,
          bbox: { x0: word.bbox.x0 / canvas.width, y0: word.bbox.y0 / canvas.height, x1: word.bbox.x1 / canvas.width, y1: word.bbox.y1 / canvas.height } });
        lineId++;
      }
      return { words, confidence: result.data.confidence, duration: Math.round(performance.now() - start) };
    } finally { this.busy = false; }
  }
  async destroy() { this.destroyed = true; if (this.initializing) await this.initializing.catch(() => {}); if (this.worker) await this.worker.terminate(); this.worker = null; }
}
