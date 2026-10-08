import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SpeechPlayer, type SpeechCallbacks } from '../lib/speech';
import { DEFAULT_SETTINGS, type TrackedWord } from '../lib/types';
class Utterance {
  voice: unknown = null; lang = ''; rate = 1; volume = 1;
  onstart?: () => void; onend?: () => void; onboundary?: (e: { charIndex: number }) => void; onerror?: (e: { error: string }) => void;
  constructor(public text: string) {}
}
const words = ['A', 'quiet', 'morning.'].map((text, i) => ({ id: `w${i}`, text })) as TrackedWord[];
let spoken: Utterance[] = [];
let player: SpeechPlayer;
let callbacks: { [K in keyof SpeechCallbacks]: Mock<SpeechCallbacks[K]> };
beforeEach(() => {
  spoken = []; callbacks = { start: vi.fn(), complete: vi.fn(), interrupted: vi.fn(), idle: vi.fn() };
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('window', { speechSynthesis: { speak: (u: Utterance) => spoken.push(u), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), getVoices: () => [] } });
  player = new SpeechPlayer(callbacks);
});
afterEach(() => { player.stop(); vi.unstubAllGlobals(); });
describe('speech completion and interruption', () => {
  it('never queues overlapping speech', () => {
    player.speak(words, DEFAULT_SETTINGS); player.speak(words, DEFAULT_SETTINGS);
    expect(spoken).toHaveLength(1);
  });
  it('only completes words before a boundary and completes remainder on end', () => {
    player.speak(words, DEFAULT_SETTINGS); spoken[0].onstart?.();
    expect(callbacks.complete).not.toHaveBeenCalled();
    spoken[0].onboundary?.({ charIndex: 2 });
    expect(callbacks.complete).toHaveBeenLastCalledWith(['w0']); expect(callbacks.start).toHaveBeenLastCalledWith('w1');
    spoken[0].onend?.(); expect(callbacks.complete).toHaveBeenLastCalledWith(['w1', 'w2']);
  });
  it('ignores late completion callbacks after cancellation', () => {
    player.speak(words, DEFAULT_SETTINGS); const stale = spoken[0]; stale.onstart?.(); player.stop(); stale.onend?.(); stale.onboundary?.({ charIndex: 8 });
    expect(callbacks.complete).not.toHaveBeenCalled(); expect(player.busy).toBe(false);
  });
  it('returns interrupted words for retry without pretending they completed', () => {
    player.speak(words, DEFAULT_SETTINGS); spoken[0].onstart?.(); spoken[0].onerror?.({ error: 'interrupted' });
    expect(callbacks.complete).not.toHaveBeenCalled(); expect(callbacks.interrupted).toHaveBeenCalledWith(null); expect(player.busy).toBe(false);
  });
  it('handles browsers with no boundary events on successful playback', () => {
    player.speak(words, DEFAULT_SETTINGS); spoken[0].onstart?.(); spoken[0].onend?.();
    expect(callbacks.complete).toHaveBeenCalledWith(['w0', 'w1', 'w2']);
  });
  it('does not complete speech that never started', () => {
    player.speak(words, DEFAULT_SETTINGS); spoken[0].onend?.();
    expect(callbacks.complete).not.toHaveBeenCalled(); expect(callbacks.interrupted).toHaveBeenCalledWith('Tap Play to enable audio on this device.');
  });
});

it('restores stall recovery after pause and resume', () => {
  vi.useFakeTimers();
  try {
    player.speak(words, DEFAULT_SETTINGS); spoken[0].onstart?.(); vi.advanceTimersByTime(5000);
    player.pause(); vi.advanceTimersByTime(50000); expect(player.busy).toBe(true);
    player.resume(); vi.advanceTimersByTime(16000);
    expect(player.busy).toBe(false); expect(callbacks.interrupted).toHaveBeenCalledWith('Audio did not finish. Tap Play to resume the unread words.');
  } finally { vi.useRealTimers(); }
});

it('remembers a completed sentence across line-sized utterances', () => {
  const first = [{ id: 'w0', text: 'A' }, { id: 'w1', text: 'quiet' }] as TrackedWord[];
  const second = [{ id: 'w2', text: 'morning.' }] as TrackedWord[];
  player.speak(first, DEFAULT_SETTINGS); spoken[0].onstart?.(); spoken[0].onend?.();
  player.speak(second, DEFAULT_SETTINGS); spoken[1].onstart?.(); spoken[1].onend?.();
  expect(player.lastSentence.map(w => w.text)).toEqual(['A', 'quiet', 'morning.']);
  player.clearHistory(); expect(player.lastSentence).toHaveLength(0);
});
