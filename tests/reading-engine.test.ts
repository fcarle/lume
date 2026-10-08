import { describe, expect, it } from 'vitest';
import { ReadingEngine } from '../lib/reading-engine';
import type { OcrWord } from '../lib/types';
const words = (text: string, line = 0, y = .5, confidence = 95): OcrWord[] => text.split(' ').map((text, i) => ({ text, confidence, line, bbox: { x0: .04 + i * .13, x1: .14 + i * .13, y0: y - .03, y1: y + .03 } }));
function stable(engine: ReadingEngine, frame: OcrWord[], focus = { x: .08, y: .5 }, time = 0) {
  engine.ingest(frame, focus, 65, time); return engine.ingest(frame, focus, 65, time + 800);
}
describe('reading occurrence tracking', () => {
  it('requires stable scans before speaking', () => {
    const engine = new ReadingEngine(); engine.ingest(words('a quiet morning'));
    expect(engine.plan('continuous')).toHaveLength(0);
    engine.ingest(words('a quiet morning')); expect(engine.plan('continuous').map(w => w.text)).toEqual(['a', 'quiet', 'morning']);
  });
  it('preserves overlap while reading newly revealed text', () => {
    const engine = new ReadingEngine(); stable(engine, words('the little light'));
    const queued = engine.plan('continuous'); engine.queue(queued); engine.complete(queued.map(w => w.id));
    stable(engine, words('little light shines'));
    expect(engine.plan('continuous').map(w => w.text)).toEqual(['shines']);
  });
  it('does not collapse repeated words in a sentence', () => {
    const engine = new ReadingEngine(); stable(engine, words('we can can tomatoes'));
    const result = engine.plan('continuous'); expect(result.map(w => w.text)).toEqual(['we', 'can', 'can', 'tomatoes']);
    expect(new Set(result.map(w => w.id)).size).toBe(4);
  });
  it('keeps repeated words on different lines distinct', () => {
    const engine = new ReadingEngine(); stable(engine, [...words('the light', 0, .3), ...words('the light', 1, .7)]);
    const result = engine.plan('continuous'); expect(result).toHaveLength(4); expect(new Set(result.map(w => w.id)).size).toBe(4);
  });
  it('does not reread on a single backwards jitter frame', () => {
    const engine = new ReadingEngine(); const frame = words('a beautiful quiet morning');
    stable(engine, frame, { x: .48, y: .5 }); engine.complete(engine.plan('continuous').map(w => w.id));
    engine.ingest(frame, { x: .08, y: .5 }, 65, 1800); engine.ingest(frame, { x: .48, y: .5 }, 65, 2000);
    expect(engine.plan('continuous')).toHaveLength(0);
  });
  it('permits a deliberate backwards movement after a dwell', () => {
    const engine = new ReadingEngine(); const frame = words('a beautiful quiet morning');
    stable(engine, frame, { x: .48, y: .5 }); engine.complete(engine.plan('continuous').map(w => w.id));
    engine.ingest(frame, { x: .08, y: .5 }, 65, 1800);
    const reread = engine.ingest(frame, { x: .08, y: .5 }, 65, 2600);
    expect(reread.rereading).toBe(true); expect(engine.plan('smart').map(w => w.text)).toEqual(['a', 'beautiful', 'quiet', 'morning']);
    engine.complete(engine.plan('smart').map(w => w.id)); engine.ingest(frame, { x: .08, y: .5 }, 65, 3400);
    expect(engine.plan('smart')).toHaveLength(0);
  });
  it('continues on the next focused line without replaying the previous one', () => {
    const engine = new ReadingEngine(); const frame = [...words('a quiet morning', 0, .3), ...words('a lovely day', 1, .7)];
    stable(engine, frame, { x: .08, y: .3 }); const first = engine.plan('smart'); engine.complete(first.map(w => w.id));
    stable(engine, frame, { x: .08, y: .7 }); expect(engine.plan('smart').map(w => w.text)).toEqual(['a', 'lovely', 'day']);
  });
  it('retains identity through a transient OCR mistake', () => {
    const engine = new ReadingEngine(); const initial = stable(engine, words('the little light'));
    engine.complete(engine.plan('continuous').map(w => w.id)); engine.ingest(words('the little iight'));
    const corrected = engine.ingest(words('the little light'));
    expect(corrected.words.map(w => w.id)).toEqual(initial.words.map(w => w.id)); expect(engine.plan('continuous')).toHaveLength(0);
  });
  it('does not mark canceled or queued words completed', () => {
    const engine = new ReadingEngine(); stable(engine, words('the little light shines'));
    const queued = engine.plan('continuous'); engine.queue(queued); engine.start(queued[0].id); engine.complete([queued[0].id]); engine.interrupt();
    expect(engine.plan('continuous').map(w => w.text)).toEqual(['little', 'light', 'shines']);
    expect(engine.snapshot().words[0].state).toBe('completed');
  });
  it('freezes during rapid movement and resumes after stable reacquisition', () => {
    const engine = new ReadingEngine(); stable(engine, words('the little light'));
    engine.ingest(words('completely different page')); expect(engine.plan('continuous')).toHaveLength(0);
    engine.ingest(words('another moving frame')); expect(engine.plan('continuous')).toHaveLength(0);
    stable(engine, words('another moving frame')); expect(engine.plan('continuous').map(w => w.text)).toEqual(['another', 'moving', 'frame']);
  });
  it('blocks low-confidence gaps instead of joining unrelated words', () => {
    const engine = new ReadingEngine(); const frame = words('the uncertain text'); frame[1].confidence = 30;
    stable(engine, frame); expect(engine.plan('continuous').map(w => w.text)).toEqual(['the']);
    engine.complete(engine.plan('continuous').map(w => w.id)); expect(engine.plan('continuous')).toHaveLength(0);
  });
  it('reads the sentence containing focus across line breaks', () => {
    const engine = new ReadingEngine(); const frame = [...words('First sentence. A', 0, .3), ...words('new sentence here.', 1, .7)];
    stable(engine, frame, { x: .24, y: .7 }); expect(engine.plan('sentence').map(w => w.text)).toEqual(['A', 'new', 'sentence', 'here.']);
  });
  it('does not repeat a stationary word in word mode', () => {
    const engine = new ReadingEngine(); const frame = words('the little light'); stable(engine, frame);
    const first = engine.plan('word'); engine.queue(first); engine.complete(first.map(w => w.id)); stable(engine, frame);
    expect(engine.plan('word')).toHaveLength(0);
  });
});

it('allows returning to a completed passage after it leaves the crop', () => {
  const engine = new ReadingEngine();
  stable(engine, words('the little light')); engine.complete(engine.plan('continuous').map(w => w.id));
  stable(engine, words('a lovely day'), { x: .08, y: .5 }, 2000); engine.ingest(words('a lovely day'), { x: .08, y: .5 }, 65, 3600); engine.complete(engine.plan('continuous').map(w => w.id));
  engine.ingest(words('the little light'), { x: .08, y: .5 }, 65, 4400);
  engine.ingest(words('the little light'), { x: .08, y: .5 }, 65, 5200);
  const returned = engine.ingest(words('the little light'), { x: .08, y: .5 }, 65, 6000);
  expect(returned.rereading).toBe(true); expect(engine.plan('continuous').map(w => w.text)).toEqual(['the', 'little', 'light']);
});
it('requests stale speech cancellation when focus changes lines', () => {
  const engine = new ReadingEngine(); const frame = [...words('a quiet morning', 0, .3), ...words('a lovely day', 1, .7)];
  stable(engine, frame, { x: .08, y: .3 }); engine.consumeCancellation();
  engine.queue(engine.plan('smart')); engine.ingest(frame, { x: .08, y: .7 }, 65, 1600);
  expect(engine.consumeCancellation()).toBe(true);
});
it('waits for low-motion frames even when the text overlaps', () => {
  const engine = new ReadingEngine(); const frame = words('the little light'); stable(engine, frame);
  const moved = frame.map(w => ({ ...w, bbox: { ...w.bbox, y0: w.bbox.y0 + .3, y1: w.bbox.y1 + .3 } }));
  engine.ingest(moved); expect(engine.plan('continuous')).toHaveLength(0);
  stable(engine, moved); expect(engine.plan('continuous')).toHaveLength(3);
});
