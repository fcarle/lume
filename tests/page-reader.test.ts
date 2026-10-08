import { describe, expect, it } from 'vitest';
import { PageReader } from '../lib/page-reader';
import type { OcrWord } from '../lib/types';
const words = (text: string, confidence = 95): OcrWord[] => text.split(' ').map((text, index) => ({ text, confidence, line: Math.floor(index / 10), bbox: { x0: .1, y0: .1, x1: .2, y1: .2 } }));
describe('captured page reading', () => {
  it('retains a whole page over 200 words from one capture', () => {
    const page = new PageReader(); page.load(words(Array.from({ length: 650 }, (_, i) => `word${i}`).join(' ')));
    expect(page.snapshot().words).toHaveLength(650); expect(page.plan()).toHaveLength(32);
    expect(page.snapshot().words.every(w => w.state === 'confirmed')).toBe(true);
  });
  it('preserves repeated occurrences and speaks sentences in order', () => {
    const page = new PageReader(); page.load(words('We can can tomatoes. Then we read.'));
    const first = page.plan(); expect(first.map(w => w.text)).toEqual(['We', 'can', 'can', 'tomatoes.']);
    expect(new Set(first.map(w => w.id)).size).toBe(4);
    page.queue(first); page.complete(first.map(w => w.id));
    expect(page.plan().map(w => w.text)).toEqual(['Then', 'we', 'read.']);
  });
  it('steps to a selected word and continues from the following word', () => {
    const page = new PageReader(); page.load(words('one two three four'));
    page.seek(1); const single = page.plan(true); expect(single.map(w => w.text)).toEqual(['two']);
    page.start(single[0].id); page.complete([single[0].id]);
    expect(page.snapshot().cursor).toBe(1); expect(page.plan().map(w => w.text)).toEqual(['three', 'four']);
  });
  it('supports backwards rereading without rescan', () => {
    const page = new PageReader(); page.load(words('one two three')); page.complete(page.plan().map(w => w.id));
    expect(page.snapshot().finished).toBe(true); page.seek(0); expect(page.plan().map(w => w.text)).toEqual(['one', 'two', 'three']);
  });
  it('does not advance past interrupted or merely queued words', () => {
    const page = new PageReader(); page.load(words('one two three')); const pending = page.plan(); page.queue(pending); page.start(pending[0].id); page.complete([pending[0].id]); page.start(pending[1].id); page.interrupt();
    expect(page.plan().map(w => w.text)).toEqual(['two', 'three']);
  });
  it('ignores word callbacks from a replaced page', () => {
    const page = new PageReader(); page.load(words('old page')); const oldIds = page.plan().map(w => w.id); page.load(words('new page')); page.complete(oldIds);
    expect(page.snapshot().nextIndex).toBe(0); expect(page.snapshot().words.every(w => w.state === 'confirmed')).toBe(true);
  });
  it('avoids automatically reading unreliable words but permits explicit taps', () => {
    const page = new PageReader(); const frame = words('clear unclear after'); frame[1].confidence = 20; page.load(frame);
    expect(page.plan().map(w => w.text)).toEqual(['clear']); page.complete(page.plan().map(w => w.id));
    expect(page.plan()).toHaveLength(0); expect(page.plan(true).map(w => w.text)).toEqual(['unclear']);
  });
  it('does not loop after finishing a page', () => {
    const page = new PageReader(); page.load(words('the end.')); page.complete(page.plan().map(w => w.id));
    expect(page.snapshot().finished).toBe(true); expect(page.plan()).toHaveLength(0);
  });
});
