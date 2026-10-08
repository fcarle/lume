import type { OcrWord, ReadingMode, TrackedWord } from './types';

export function normalize(text: string) { return text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}
const cx = (w: OcrWord) => (w.bbox.x0 + w.bbox.x1) / 2;
const cy = (w: OcrWord) => (w.bbox.y0 + w.bbox.y1) / 2;
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// Ordered, one-to-one alignment retains occurrences, including repeated words.
function align(previous: TrackedWord[], incoming: OcrWord[]): Map<number, TrackedWord> {
  const newTokens = incoming.map(w => normalize(w.text));
  const oldTokens = previous.map(w => w.normalized);
  const offsets: { x: number; y: number }[] = [];
  newTokens.forEach((token, j) => {
    const i = oldTokens.indexOf(token);
    if (token && i >= 0 && oldTokens.lastIndexOf(token) === i && newTokens.indexOf(token) === newTokens.lastIndexOf(token)) {
      offsets.push({ x: cx(incoming[j]) - cx(previous[i]), y: cy(incoming[j]) - cy(previous[i]) });
    }
  });
  const dx = median(offsets.map(p => p.x));
  const dy = median(offsets.map(p => p.y));
  const n = previous.length, m = incoming.length;
  const scores = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const matches = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const sim = similarity(oldTokens[i], newTokens[j]);
    const x = Math.abs(cx(incoming[j]) - cx(previous[i]) - dx);
    const y = Math.abs(cy(incoming[j]) - cy(previous[i]) - dy);
    const allowed = sim >= (Math.min(oldTokens[i].length, newTokens[j].length) < 4 ? 1 : .74) && y < .16 && x < .3;
    if (allowed) {
      const neighbor = Number(!!oldTokens[i - 1] && oldTokens[i - 1] === newTokens[j - 1]) + Number(!!oldTokens[i + 1] && oldTokens[i + 1] === newTokens[j + 1]);
      matches[i][j] = sim * 3 + neighbor * .8 + Math.max(0, 1 - (x + y) * 3);
    }
    scores[i + 1][j + 1] = Math.max(scores[i][j + 1], scores[i + 1][j], scores[i][j] + matches[i][j]);
  }
  const result = new Map<number, TrackedWord>();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const match = matches[i - 1][j - 1];
    if (match > 0 && Math.abs(scores[i][j] - scores[i - 1][j - 1] - match) < .001) {
      result.set(j - 1, previous[i - 1]); i--; j--;
    } else if (scores[i - 1][j] > scores[i][j - 1]) i--; else j--;
  }
  return result;
}

export interface EngineSnapshot {
  words: TrackedWord[];
  focusedId: string | null;
  focusedLine: number | null;
  lastSpoken: string;
  stable: boolean;
  rereading: boolean;
}

export class ReadingEngine {
  private sequence = 0;
  private frame = 0;
  private visible: TrackedWord[] = [];
  private history = new Map<string, TrackedWord>();
  private focusId: string | null = null;
  private previousFocus: string | null = null;
  private backward: { id: string; since: number; count: number } | null = null;
  private stableFrames = 0;
  private lastSpoken = '';
  private rereading = false;
  private selectionKey = '';
  private minConfidence = 65;
  private needsCancellation = false;

  reset() {
    this.visible = []; this.history.clear(); this.focusId = null; this.previousFocus = null;
    this.backward = null; this.stableFrames = 0; this.lastSpoken = ''; this.selectionKey = '';
    this.needsCancellation = true;
  }

  ingest(words: OcrWord[], focus = { x: .5, y: .5 }, minConfidence = 65, now = Date.now(), mode: ReadingMode = 'smart'): EngineSnapshot {
    this.frame++; this.minConfidence = minConfidence; this.rereading = false;
    const valid = words.filter(w => normalize(w.text) && Number.isFinite(w.confidence)).slice(0, 200);
    const prior = this.visible;
    let matches = align(prior, valid);
    const matchedPrevious = matches.size;
    // Reacquire a recent view after a pan. Require at least three contextual matches.
    if (matches.size < Math.min(2, valid.length) && this.history.size > prior.length) {
      const recent = [...this.history.values()].filter(w => !prior.some(p => p.id === w.id)).slice(-350);
      const recovered = align(recent, valid);
      if (recovered.size >= Math.min(3, valid.length) && recovered.size > matches.size) matches = recovered;
    }
    const overlap = matchedPrevious / Math.max(1, Math.min(prior.length, valid.length));
    const motion = median([...matches].map(([i, w]) => Math.hypot(cx(valid[i]) - cx(w), cy(valid[i]) - cy(w))));
    const changedView = prior.length > 0 && (overlap < .4 || valid.length === 0 || motion > .24);
    if (changedView) { this.stableFrames = 0; this.needsCancellation = true; }
    else this.stableFrames++;
    this.visible = valid.map((word, index) => {
      const old = matches.get(index);
      const token = normalize(word.text);
      if (!old) {
        const created: TrackedWord = { ...word, id: `w${++this.sequence}`, normalized: token, candidate: token, state: 'detected', observations: 1, lastSeen: this.frame };
        this.history.set(created.id, created); return created;
      }
      const consecutive = old.lastSeen === this.frame - 1;
      const sameCandidate = old.candidate === token;
      old.observations = consecutive && sameCandidate ? old.observations + 1 : 1;
      old.candidate = token;
      old.bbox = word.bbox; old.line = word.line; old.confidence = word.confidence; old.lastSeen = this.frame;
      const required = word.confidence >= 85 ? 2 : 3;
      if (old.observations >= required && word.confidence >= minConfidence) {
        old.text = word.text; old.normalized = token;
        if (old.state === 'detected') old.state = 'confirmed';
      }
      return old;
    });
    // Memory is bounded. Never evict an active speech occurrence.
    if (this.history.size > 700) for (const [id, w] of this.history) {
      if (this.history.size <= 500) break;
      if (w.lastSeen < this.frame - 3 && w.state !== 'queued' && w.state !== 'speaking') this.history.delete(id);
    }
    const lines = new Map<number, TrackedWord[]>();
    for (const word of this.visible) lines.set(word.line, [...(lines.get(word.line) ?? []), word]);
    const focusedLine = [...lines.values()].sort((a, b) => Math.abs(cy(a[0]) - focus.y) - Math.abs(cy(b[0]) - focus.y))[0] ?? [];
    const focused = [...focusedLine].sort((a, b) => Math.abs(cx(a) - focus.x) - Math.abs(cx(b) - focus.x))[0];
    this.focusId = focused?.id ?? null;
    const previousIndex = this.visible.findIndex(w => w.id === this.previousFocus);
    const currentIndex = this.visible.findIndex(w => w.id === this.focusId);
    const earlierInHistory = previousIndex < 0 && this.previousFocus !== null && Number(focused?.id.slice(1)) < Number(this.previousFocus.slice(1));
    if (focused && focused.id !== this.previousFocus && ((previousIndex >= 0 && currentIndex < previousIndex) || earlierInHistory) && focused.state === 'completed') {
      this.backward = this.backward?.id === focused.id ? { ...this.backward, count: this.backward.count + 1 } : { id: focused.id, count: 1, since: now };
    } else if (this.backward?.id === this.focusId) this.backward.count++;
    else this.backward = null;
    if (this.backward && this.backward.count >= 2 && now - this.backward.since >= 700 && this.stableFrames >= 2) {
      this.interrupt();
      for (const w of this.visible.slice(currentIndex)) if (w.state === 'completed') w.state = 'confirmed';
      this.needsCancellation = true; this.rereading = true; this.backward = null; this.selectionKey = '';
    }
    // A selected word/line changing makes old pending speech obsolete. Continuous mode ignores focus.
    if (focused && this.previousFocus && this.focusId !== this.previousFocus && this.stableFrames >= 2 && mode !== 'continuous') {
      const previousWord = this.visible.find(w => w.id === this.previousFocus);
      if (mode === 'word' || (previousWord && previousWord.line !== focused.line)) this.needsCancellation = true;
    }
    if (this.focusId) this.previousFocus = this.focusId;
    return this.snapshot();
  }

  consumeCancellation(): boolean { const result = this.needsCancellation; this.needsCancellation = false; return result; }

  plan(mode: ReadingMode): TrackedWord[] {
    if (this.stableFrames < 2 || !this.focusId) return [];
    const index = this.visible.findIndex(w => w.id === this.focusId);
    let selected: TrackedWord[] = [];
    if (mode === 'word') selected = this.visible.slice(index, index + 1);
    else if (mode === 'continuous') selected = this.visible;
    else if (mode === 'smart') selected = this.visible.slice(index).filter(w => w.line === this.visible[index].line);
    else {
      let start = index, end = index;
      while (start > 0 && !/[.!?][”"')]*$/.test(this.visible[start - 1].text)) start--;
      while (end < this.visible.length - 1 && !/[.!?][”"')]*$/.test(this.visible[end].text)) end++;
      selected = this.visible.slice(start, end + 1);
    }
    const key = selected.map(w => w.id).join(',');
    if (mode === 'word' && key === this.selectionKey && selected.every(w => w.state === 'completed')) return [];
    this.selectionKey = key;
    const ready: TrackedWord[] = [];
    for (const word of selected) {
      if (word.state === 'completed') continue;
      // Preserve a gap rather than inventing a sentence around uncertain OCR.
      if (word.state !== 'confirmed' || word.confidence < this.minConfidence || word.candidate !== word.normalized) break;
      ready.push(word);
      if (ready.length >= 28 || /[.!?][”"')]*$/.test(word.text)) break;
    }
    return ready;
  }

  queue(words: TrackedWord[]) { words.forEach(w => { const stored = this.history.get(w.id); if (stored?.state === 'confirmed') stored.state = 'queued'; }); }
  start(id: string) { const w = this.history.get(id); if (w && w.state !== 'completed') w.state = 'speaking'; }
  complete(ids: string[]) { ids.forEach(id => { const w = this.history.get(id); if (w) { w.state = 'completed'; this.lastSpoken = w.text; } }); }
  interrupt() { for (const w of this.history.values()) if (w.state === 'queued' || w.state === 'speaking') w.state = 'confirmed'; }
  reread(ids: string[]) { this.interrupt(); ids.forEach(id => { const w = this.history.get(id); if (w) w.state = 'confirmed'; }); this.selectionKey = ''; }
  snapshot(): EngineSnapshot {
    return { words: this.visible.map(w => ({ ...w, bbox: { ...w.bbox } })), focusedId: this.focusId, focusedLine: this.visible.find(w => w.id === this.focusId)?.line ?? null,
      lastSpoken: this.lastSpoken, stable: this.stableFrames >= 2, rereading: this.rereading };
  }
}
