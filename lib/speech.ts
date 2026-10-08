import { LANGUAGES, type ReaderSettings, type TrackedWord } from './types';
export interface SpeechCallbacks {
  start: (id: string) => void;
  complete: (ids: string[]) => void;
  interrupted: (reason: string | null) => void;
  idle: () => void;
}
export class SpeechPlayer {
  private generation = 0;
  private current: SpeechSynthesisUtterance | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private remaining = 0;
  private deadline = 0;
  private timeoutAction: (() => void) | null = null;
  private completedSentence: TrackedWord[] = [];
  private sentenceBuffer: TrackedWord[] = [];
  private lastChunk: TrackedWord[] = [];
  get lastSentence(): TrackedWord[] { return this.completedSentence.length ? this.completedSentence : this.sentenceBuffer.length ? this.sentenceBuffer : this.lastChunk; }
  clearHistory() { this.completedSentence = []; this.sentenceBuffer = []; this.lastChunk = []; }
  private remember(words: TrackedWord[]) {
    for (const word of words) {
      const previous = this.sentenceBuffer.at(-1);
      if (previous && (Number(word.id.match(/w(\d+)$/)?.[1]) !== Number(previous.id.match(/w(\d+)$/)?.[1]) + 1 || word.id.replace(/w\d+$/, '') !== previous.id.replace(/w\d+$/, ''))) this.sentenceBuffer = [];
      this.sentenceBuffer.push({ ...word });
      if (/[.!?][”"')]*$/.test(word.text)) { this.completedSentence = this.sentenceBuffer; this.sentenceBuffer = []; }
      if (this.sentenceBuffer.length > 80) this.sentenceBuffer.shift();
    }
  }
  activeIds: string[] = [];
  constructor(private callbacks: SpeechCallbacks) {}
  get supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }
  get busy() { return this.current !== null; }
  unlock() {
    if (!this.supported || this.busy) return;
    const warmup = new SpeechSynthesisUtterance(' ');
    warmup.volume = 0;
    window.speechSynthesis.speak(warmup);
  }
  speak(words: TrackedWord[], settings: ReaderSettings) {
    if (!words.length || this.busy) return;
    if (!this.supported) { this.callbacks.interrupted('Speech is unavailable in this browser. Try Safari or Chrome.'); return; }
    const generation = ++this.generation;
    const utterance = new SpeechSynthesisUtterance(words.map(w => w.text).join(' '));
    const locale = LANGUAGES.find(l => l.code === settings.language)?.locale ?? 'en-US';
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.voiceURI === settings.voiceURI) ?? voices.find(v => v.localService && v.lang.startsWith(locale.slice(0, 2))) ?? voices.find(v => v.lang.startsWith(locale.slice(0, 2))) ?? null;
    utterance.lang = locale; utterance.rate = settings.speed;
    this.current = utterance; this.activeIds = words.map(w => w.id); this.lastChunk = words.map(w => ({ ...w })); this.paused = false;
    let offset = 0, completed = 0, started = false;
    const offsets = words.map(word => { const start = offset; offset += word.text.length + 1; return { start, end: offset - 1 }; });
    const valid = () => generation === this.generation && this.current === utterance;
    utterance.onstart = () => { if (valid()) { started = true; this.callbacks.start(words[0].id); } };
    utterance.onboundary = event => {
      if (!valid()) return;
      const newlyComplete: string[] = [];
      while (completed < words.length && offsets[completed].end <= event.charIndex) newlyComplete.push(words[completed++].id);
      if (newlyComplete.length) { this.remember(words.filter(w => newlyComplete.includes(w.id))); this.callbacks.complete(newlyComplete); }
      const index = offsets.findIndex(item => event.charIndex >= item.start && event.charIndex < item.end);
      if (index >= 0) this.callbacks.start(words[index].id);
    };
    utterance.onend = () => {
      if (!valid()) return;
      this.clearTimer(); this.current = null; this.activeIds = [];
      if (started) { this.remember(words.slice(completed)); this.callbacks.complete(words.slice(completed).map(w => w.id)); }
      else this.callbacks.interrupted('Tap Play to enable audio on this device.');
      this.callbacks.idle();
    };
    utterance.onerror = event => {
      if (!valid()) return;
      this.clearTimer(); this.current = null; this.activeIds = [];
      const expected = ['canceled', 'interrupted'].includes(event.error);
      this.callbacks.interrupted(expected ? null : `Audio paused (${event.error}). Tap Play to try again.`);
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    this.remaining = Math.max(20000, words.length * 2200 / settings.speed);
    this.timeoutAction = () => {
      if (valid() && !this.paused) { this.stop(); this.callbacks.interrupted('Audio did not finish. Tap Play to resume the unread words.'); }
    };
    this.armWatchdog();
  }
  pause() { if (this.supported && this.busy) { this.paused = true; this.remaining = Math.max(3000, this.deadline - Date.now()); this.clearTimer(); window.speechSynthesis.pause(); } }
  resume() { if (this.supported) { this.paused = false; window.speechSynthesis.resume(); if (this.busy) this.armWatchdog(); } }
  stop() {
    ++this.generation; this.clearTimer(); this.current = null; this.activeIds = []; this.paused = false;
    if (this.supported) window.speechSynthesis.cancel();
    this.callbacks.interrupted(null);
  }
  private armWatchdog() {
    this.clearTimer(); this.deadline = Date.now() + this.remaining;
    if (this.timeoutAction) this.watchdog = setTimeout(this.timeoutAction, this.remaining);
  }
  private clearTimer() { if (this.watchdog) clearTimeout(this.watchdog); this.watchdog = null; }
}
