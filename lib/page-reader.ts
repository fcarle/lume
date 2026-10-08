import type { OcrWord, TrackedWord } from './types';

export interface PageSnapshot { words: TrackedWord[]; cursor: number; nextIndex: number; finished: boolean; lastSpoken: string }
/** A captured page is immutable: one recognition pass, one explicit playback cursor. */
export class PageReader {
  private words: TrackedWord[] = [];
  private cursor = 0;
  private nextIndex = 0;
  private page = 0;
  private threshold = 65;
  private lastSpoken = '';
  load(words: OcrWord[], threshold = 65) {
    this.page++; this.cursor = 0; this.nextIndex = 0; this.lastSpoken = ''; this.threshold = threshold;
    this.words = words.filter(w => w.text.trim()).map((w, index) => ({ ...w, bbox: { ...w.bbox }, id: `p${this.page}-w${index}`, normalized: w.text, candidate: w.text,
      observations: 1, lastSeen: 1, state: w.confidence >= threshold ? 'confirmed' : 'detected' }));
  }
  snapshot(): PageSnapshot { return { words: this.words.map(w => ({ ...w })), cursor: this.cursor, nextIndex: this.nextIndex, finished: this.words.length > 0 && this.nextIndex >= this.words.length, lastSpoken: this.lastSpoken }; }
  plan(singleWord = false): TrackedWord[] {
    const result: TrackedWord[] = [];
    for (const word of this.words.slice(this.nextIndex)) {
      if (!singleWord && word.confidence < this.threshold) break;
      result.push(word);
      if (singleWord || result.length >= 32 || /[.!?][”"')]*$/.test(word.text)) break;
    }
    return result;
  }
  queue(words: TrackedWord[]) { for (const word of words) word.state = 'queued'; }
  start(id: string) { const index = this.words.findIndex(w => w.id === id); if (index < 0) return; this.cursor = index; this.words[index].state = 'speaking'; }
  complete(ids: string[]) {
    for (const id of ids) {
      const index = this.words.findIndex(w => w.id === id);
      if (index < 0) continue;
      this.words[index].state = 'completed'; this.cursor = index; this.nextIndex = index + 1; this.lastSpoken = this.words[index].text;
    }
  }
  interrupt() { for (const word of this.words) if (word.state === 'speaking' || word.state === 'queued') word.state = word.confidence >= this.threshold ? 'confirmed' : 'detected'; }
  seek(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.words.length) return false;
    this.interrupt(); this.cursor = index; this.nextIndex = index;
    for (const word of this.words.slice(index)) word.state = word.confidence >= this.threshold ? 'confirmed' : 'detected';
    return true;
  }
}
