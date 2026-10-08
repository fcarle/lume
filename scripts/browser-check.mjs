import { chromium, webkit, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.LUME_TEST_URL || 'http://localhost:3000';
await mkdir('test-results', { recursive: true });
for (const [name, browserType, options] of [['desktop', chromium, { viewport: { width: 1440, height: 1000 } }], ['iphone', webkit, { ...devices['iPhone 13'] }]]) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext(options);
  try {
    await context.addInitScript(() => {
      window.__spoken = []; window.__readerTools = new Map();
      Object.defineProperty(document, 'modelContext', { value: { registerTool(tool, options) { window.__readerTools.set(tool.name, tool); options.signal.addEventListener('abort', () => window.__readerTools.delete(tool.name)); } } });
      class TestUtterance { constructor(text) { this.text = text; } }
      let epoch = 0;
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: TestUtterance });
      Object.defineProperty(window, 'speechSynthesis', { value: {
        getVoices: () => [], addEventListener() {}, removeEventListener() {}, resume() {}, pause() {}, cancel() { epoch++; },
        speak(utterance) {
          if (!utterance.text.trim()) return;
          const version = epoch; window.__spoken.push(utterance.text);
          setTimeout(() => { if (version === epoch) utterance.onstart?.(); }, 10);
          let offset = 0;
          utterance.text.split(' ').forEach((word, i) => { const charIndex = offset; offset += word.length + 1; setTimeout(() => { if (version === epoch) utterance.onboundary?.({ charIndex }); }, 30 + i * 60); });
          setTimeout(() => { if (version === epoch) utterance.onend?.(); }, 60 + utterance.text.split(' ').length * 60);
        },
      }});
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const status = () => page.evaluate(() => window.__readerTools.get('read_lume_status').execute({}));
    await page.goto(base);
    await page.getByRole('button', { name: 'Open camera', exact: true }).waitFor();
    await page.screenshot({ path: `test-results/${name}-home.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.waitForFunction(() => window.__readerTools.has('configure_lume_reading'));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Play after scanning', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Close Settings' }).click();
    await page.reload();
    await page.waitForFunction(() => window.__readerTools.get('read_lume_status')?.execute({}).settings.autoRead === false);
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.page-text')?.textContent?.includes('There is a quiet kind of magic'), null, { timeout: 30000 });
    const sample = await status();
    assert.equal(sample.metrics.scans, 1, 'Exactly one OCR pass'); assert.ok(sample.metrics.words > 30); assert.equal(sample.playing, false);
    await page.getByRole('button', { name: 'Next word', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-word-index="1"]')?.getAttribute('data-state') === 'completed');
    assert.equal((await status()).cursor, 1); assert.equal(await page.evaluate(() => window.__spoken.at(-1)), 'is');
    const manualCount = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(250); assert.equal(await page.evaluate(() => window.__spoken.length), manualCount, 'Manual stepping speaks only one word');
    await page.getByRole('button', { name: 'Next word', exact: true }).click();
    await page.getByRole('button', { name: 'Previous word', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-word-index="1"]')?.getAttribute('data-state') === 'completed');
    await page.locator('[data-word-index="0"]').click();
    await page.waitForFunction(() => document.querySelector('[data-word-index="0"]')?.getAttribute('data-state') === 'completed');
    await page.getByRole('button', { name: 'Play reading', exact: true }).click();
    await page.getByRole('button', { name: 'Pause reading', exact: true }).click();
    assert.equal((await status()).playing, false);
    await page.getByRole('button', { name: 'Play reading', exact: true }).click();
    await page.getByRole('button', { name: 'Read again', exact: true }).waitFor({ timeout: 15000 });
    const completedCount = await page.evaluate(() => window.__spoken.length);
    await page.waitForTimeout(500); assert.equal(await page.evaluate(() => window.__spoken.length), completedCount, 'Finished page must not loop');
    assert.equal((await status()).metrics.scans, 1, 'Playback never rescans');
    await page.locator('[data-word-index="3"]').click();
    await page.waitForFunction(() => document.querySelector('[data-word-index="3"]')?.getAttribute('data-state') === 'completed');
    await page.screenshot({ path: `test-results/${name}-reading.png`, fullPage: true });
    const controls = await page.getByRole('button', { name: 'Scan next page' }).boundingBox();
    const viewport = page.viewportSize(); assert.ok(controls.y + controls.height <= viewport.height + 1, 'Next page fits on screen');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1), false, 'Only captured text scrolls');
    assert.ok((await page.locator('.app-header').boundingBox()).y >= 0, 'Header remains on screen while stepping');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Scan details', exact: true }).click();
    await page.getByRole('heading', { name: 'Scan details' }).waitFor();
    await page.getByRole('button', { name: 'Close Scan details' }).click();
    const toolCheck = await page.evaluate(async () => {
      const configure = window.__readerTools.get('configure_lume_reading'); await configure.execute({ speed: 1.2 });
      let invalid = false; try { await configure.execute({ speed: 9 }); } catch { invalid = true; }
      return { invalid, speed: window.__readerTools.get('read_lume_status').execute({}).settings.speed };
    });
    assert.deepEqual(toolCheck, { invalid: true, speed: 1.2 });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await context.setOffline(true); await page.reload();
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.page-text')?.textContent?.includes('There is a quiet kind of magic'), null, { timeout: 30000 });
    assert.equal((await status()).metrics.scans, 1); await context.setOffline(false);

    if (name === 'desktop') {
      await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
      await page.getByRole('button', { name: 'Scan next page' }).click();
      await page.getByRole('alert').filter({ hasText: 'Camera access is turned off' }).waitFor();
      assert.equal((await status()).phase, 'reading', 'Denied permission keeps the captured page');
      await page.evaluate(() => {
        window.__cameraStreams = []; window.__cameraRequests = [];
        navigator.mediaDevices.getUserMedia = async constraints => {
          window.__cameraRequests.push(constraints);
          const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1600;
          const ctx = canvas.getContext('2d');
          const draw = () => {
            ctx.fillStyle = 'white'; ctx.fillRect(0,0,1000,1600); ctx.fillStyle = 'black'; ctx.font = '30px Georgia';
            ctx.fillText('First words at the top of the page.', 65, 70);
            for (let i = 0; i < 35; i++) ctx.fillText('These quiet words are here for you to read.', 65, 120 + i * 39);
            ctx.fillText('This is the last line of the page.', 65, 1535);
          };
          draw(); const stream = canvas.captureStream(5); const timer = setInterval(() => { if (stream.getVideoTracks()[0].readyState === 'ended') clearInterval(timer); else draw(); },200);
          window.__cameraStreams.push(stream); return stream;
        };
      });
      await page.getByRole('button', { name: 'Scan next page' }).click();
      await page.getByRole('button', { name: 'Capture page', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.shutter-button')?.disabled);
      await page.screenshot({ path: 'test-results/desktop-camera.png', fullPage: true });
      await page.getByRole('button', { name: 'Capture page', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true, 'Shutter releases camera immediately');
      await page.waitForFunction(() => document.querySelector('.page-text')?.textContent?.includes('last line'), null, { timeout: 30000 });
      const captured = await status(); assert.ok(captured.metrics.words > 200, 'Full page exceeds old 200-word cap'); assert.equal(captured.metrics.scans, 2);
      assert.match(await page.locator('.page-text').innerText(), /First words at the top/);
      const constraints = await page.evaluate(() => window.__cameraRequests[0]); assert.equal(constraints.video.facingMode.ideal, 'environment'); assert.equal(constraints.audio, false);
      // Abandon a new recognition task immediately. Its completion must not replace the existing page.
      await page.getByRole('button', { name: 'Scan next page' }).click(); await page.waitForFunction(() => !document.querySelector('.shutter-button')?.disabled);
      await page.getByRole('button', { name: 'Capture page', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForTimeout(1500);
      assert.equal((await status()).metrics.scans, 2, 'Cancelled OCR result ignored');
      assert.equal((await status()).phase, 'reading');
      await page.getByRole('button', { name: 'Scan next page' }).click(); await page.waitForFunction(() => !document.querySelector('.shutter-button')?.disabled);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.evaluate(() => window.__cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true);
      assert.equal((await status()).phase, 'reading');
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 900;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,640,900);
          return canvas.captureStream(5);
        };
      });
      const scansBeforeFailure = (await status()).metrics.scans;
      await page.getByRole('button', { name: 'Scan next page' }).click(); await page.waitForFunction(() => !document.querySelector('.shutter-button')?.disabled);
      await page.getByRole('button', { name: 'Capture page', exact: true }).click();
      await page.getByRole('button', { name: 'Retake page', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Dismiss error', exact: true }).count(), 0, 'Failed scans retain visible recovery actions');
      await page.getByRole('button', { name: 'Retry this image', exact: true }).click();
      await page.waitForFunction(expected => window.__readerTools.get('read_lume_status').execute({}).metrics.scans === expected, scansBeforeFailure + 2);
      await page.getByRole('button', { name: 'Retake page', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal((await status()).phase, 'reading');
      console.log(`Camera: full-page OCR (${captured.metrics.words} words, ${captured.metrics.duration} ms), immediate stream release, cancellation, denial recovery and pagehide passed.`);
    }
    await page.evaluate(async () => { await window.__readerTools.get('configure_lume_reading').execute({ autoRead: true }); });
    await page.reload();
    await page.waitForFunction(() => window.__readerTools.get('read_lume_status')?.execute({}).settings.autoRead === true);
    await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
    await page.getByRole('button', { name: 'Read again', exact: true }).waitFor({ timeout: 15000 });
    assert.ok(await page.evaluate(() => window.__spoken.length) > 0, 'Autoplay works after one capture');
    assert.equal((await status()).metrics.scans, 1);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(`${name}: simple viewport, saved settings, single-pass real OCR (${sample.metrics.duration} ms), word stepping, playback, no rescanning, and offline reading passed.`);
  } finally { await context.close(); await browser.close(); }
}
