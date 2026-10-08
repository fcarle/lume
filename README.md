# Lume Reader

A phone-first reading assistant: **capture one full page, put the phone down, then listen or step through the words.** Built with Next.js, TypeScript, Tailwind CSS, Tesseract.js, Web Speech, and IndexedDB. No account, paid API, or application backend.

## Run

```sh
npm ci
npm run dev
```

Open http://localhost:3000. **Try a sample** processes a printed sample with the real OCR worker.

For the production version, including offline support:

```sh
npm run build
npm start
```

## Phone workflow

1. Tap **Open camera**, frame the whole page, and tap **Capture page**.
2. The image freezes immediately and the camera turns off. The phone can move while OCR finishes.
3. Lume reads automatically if **Play after scanning** is enabled. Play/Pause and Previous/Next word stay at the bottom of the screen.
4. Tap any word to hear it. Word stepping stops automatic playback and reads only the selected word. Press Play to continue from there.
5. Tap **Scan next page** when ready. Cancelling or denying camera access preserves the previous page.

Settings contains autoplay, highlighting, speed, language, voice, and scan diagnostics. There are no marketing sections or live scanning mode selectors on the reading screen.

The OCR worker warms while the camera opens and is reused for later pages. Each shutter tap creates one full-frame capture and one recognition pass using Tesseract's automatic page layout. It no longer waits for repeated live frames or limits a page to 200 words. Capture dimensions are capped at 2400 pixels on the longest edge to balance small-text recognition and phone memory.

Recognition time still depends on the device, page, and initial language download. The application does not promise a fixed number of seconds. Unlike a continuous scanner, holding the phone steady is unnecessary after the shutter tap.

## Deploy to Vercel

Import this repository as a Next.js project. `vercel.json` uses `npm run build` and the static `out` directory. No environment variables are needed. Alternatively, sign into your own Vercel account and run `npx vercel`.

An iPhone needs the **HTTPS deployment URL** for camera access; plain HTTP LAN URLs will not work. Open directly in Safari. Choose Share → Add to Home Screen to install. Select headphones in iOS Control Center.

## Reliability and privacy

- Captures live only in memory; images are never uploaded or saved to disk by the app. Starting a new capture replaces the temporary preview.
- One OCR task runs at a time. Cancelled and stale results cannot replace a newer page.
- Playback uses occurrence IDs and a page cursor, preserving repeated words. Speech boundaries complete preceding words, and `end` completes the remaining utterance. Stale callbacks after cancellation are ignored.
- Low-confidence words remain visible and underlined. Automatic playback pauses at an uncertain word; explicitly tap it to hear it or use Next word.
- Pausing, stepping, or leaving the page cancels pending speech. Without reliable speech boundary events, an interrupted portion may replay instead of skipping unread words.
- The camera turns off immediately after capture and when leaving the app. Torch and zoom only appear when supported.
- The production service worker caches the app, fonts, OCR runtime, and English model. First use requires internet. Browser storage eviction can remove offline resources.
- Additional languages download on first use and are cached in IndexedDB. Preferences also remain on the device.
- Offline audio requires an installed local voice. Voices marked online may use the platform's speech service.

## Checks

```sh
npm run typecheck
npm test
npm run build
# Run npm start in another terminal, then:
npx playwright install chromium webkit
npm run test:browser
```

Unit tests cover single-pass pages exceeding 200 words, word stepping, backwards rereading, low-confidence handling, interrupted speech, late callbacks, and the underlying legacy live tracker.

Browser tests use real Tesseract recognition and deterministic simulated speech. They cover desktop and iPhone-sized WebKit, one-pass capture, word stepping, playback, saved settings, offline OCR, camera denial, full-page recognition from a synthetic video stream, immediate camera release, cancelled OCR, and pagehide cleanup. Screenshots are saved under `test-results/`.

Physical iPhone tests are still needed for actual camera sharpness, recognition latency, audible Safari speech, and Bluetooth output. Check a full printed page, manual word stepping, repeat playback, next-page cancellation, returning from another app, and offline use with a downloaded voice.

## Main implementation

- `lib/page-reader.ts`: captured page, word states, and explicit reading cursor
- `lib/use-reader.ts`: capture, worker warm-up, cancellation, speech, and lifecycle
- `lib/ocr.ts`: reused single-flight OCR worker with full-page segmentation
- `lib/camera.ts`: full-frame capture and supported hardware controls
- `lib/speech.ts`: speech events and interruption guards
- `lib/preferences.ts`: device preferences
- `lib/reading-engine.ts`: retained live-tracking engine; not used in the single-capture flow
- `scripts/build-sw.mjs`: build-specific offline bundle
