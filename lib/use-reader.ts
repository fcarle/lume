'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageReader, type PageSnapshot } from './page-reader';
import { SpeechPlayer } from './speech';
import { OcrService } from './ocr';
import { openCamera, capturePageFrame, setCameraFeature, type CameraFeatures } from './camera';
import { DEFAULT_SETTINGS, type ReaderSettings } from './types';
import { loadSettings, saveSettings } from './preferences';
import { drawDemo } from './demo';

export type ReaderPhase = 'idle' | 'opening' | 'camera' | 'processing' | 'reading';
const empty: PageSnapshot = { words: [], cursor: 0, nextIndex: 0, finished: false, lastSpoken: '' };
export function useReader() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<ReaderPhase>('idle');
  const phaseRef = useRef<ReaderPhase>('idle');
  const [snapshot, setSnapshot] = useState(empty);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [pageNumber, setPageNumber] = useState(0);
  const [previewUrl, setPreviewUrl] = useState('');
  const imageUrl = useRef('');
  const [cameraReady, setCameraReady] = useState(false);
  const [features, setFeatures] = useState<CameraFeatures>({ torch: false, zoom: null });
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [offlineReady, setOfflineReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [metrics, setMetrics] = useState({ duration: 0, confidence: 0, scans: 0, words: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);
  const page = useRef(new PageReader());
  const speech = useRef<SpeechPlayer | null>(null);
  const ocr = useRef<OcrService | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const captured = useRef<HTMLCanvasElement | null>(null);
  const work = useRef<Promise<void>>(Promise.resolve());
  const generation = useRef(0);
  const mounted = useRef(false);
  const settingsReady = useRef(false);
  const pump = useRef<() => void>(() => {});
  const pageLanguage = useRef('eng');
  const refresh = useCallback(() => { if (mounted.current) setSnapshot(page.current.snapshot()); }, []);
  const setScreen = useCallback((next: ReaderPhase) => { phaseRef.current = next; setPhase(next); }, []);
  const setPlayback = useCallback((value: boolean) => { playingRef.current = value; setPlaying(value); }, []);
  const releaseCamera = useCallback(() => {
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false); setTorch(false); setFeatures({ torch: false, zoom: null });
  }, []);
  const pause = useCallback(() => {
    setPlayback(false); speech.current?.stop(); page.current.interrupt(); refresh();
  }, [refresh, setPlayback]);
  const cancel = useCallback(() => {
    generation.current++; pause(); releaseCamera(); setError(null); setProgress(0);
    setScreen(page.current.snapshot().words.length ? 'reading' : 'idle');
  }, [pause, releaseCamera, setScreen]);

  pump.current = () => {
    if (!mounted.current || !playingRef.current || phaseRef.current !== 'reading' || speech.current?.busy) return;
    const state = page.current.snapshot();
    if (state.finished) { setPlayback(false); setStatus('Page finished'); refresh(); return; }
    const words = page.current.plan();
    if (!words.length) {
      setPlayback(false); page.current.seek(state.nextIndex); refresh();
      setError('This word is unclear. Tap it to hear it, or use Next word.'); return;
    }
    page.current.queue(words);
    speech.current?.speak(words, { ...settingsRef.current, language: pageLanguage.current }); refresh();
  };

  const recognize = useCallback((canvas: HTMLCanvasElement, request: number) => {
    const language = settingsRef.current.language;
    const threshold = settingsRef.current.sensitivity;
    captured.current = canvas; setScreen('processing'); setProgress(0); setStatus('Reading the page…'); setError(null);
    canvas.toBlob(blob => {
      if (!blob || request !== generation.current || !mounted.current) return;
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = URL.createObjectURL(blob); setPreviewUrl(imageUrl.current);
    }, 'image/jpeg', .75);
    // Serialize warm-up and recognition; a cancelled capture can never overwrite a new page.
    work.current = work.current.catch(() => {}).then(async () => {
      if (request !== generation.current || !mounted.current) return;
      try {
        ocr.current ??= new OcrService();
        const result = await ocr.current.recognize(canvas, language, (message, value) => {
          if (request === generation.current && mounted.current) { setProgress(value); setStatus(message.includes('language') ? 'Preparing language…' : 'Reading the page…'); }
        });
        if (request !== generation.current || !mounted.current) return;
        if (!result) throw new Error('Reader is busy. Try the capture again.');
        setMetrics(previous => ({ duration: result.duration, confidence: Math.round(result.confidence), scans: previous.scans + 1, words: result.words.length }));
        if (!result.words.length || result.confidence < 45) {
          setError('The text isn’t clear enough. Try again with the whole page in good light.'); setStatus('Try another capture'); return;
        }
        speech.current?.clearHistory(); page.current.load(result.words, threshold); pageLanguage.current = language;
        setPageNumber(n => n + 1); setScreen('reading'); setProgress(1); setStatus(''); refresh();
        if (settingsRef.current.autoRead && !document.hidden) { setPlayback(true); pump.current(); }
      } catch (failure) {
        if (request !== generation.current || !mounted.current) return;
        setError(failure instanceof Error ? failure.message : 'Could not read the page. Try again.'); setStatus('Scan interrupted');
      }
    });
  }, [refresh, setPlayback, setScreen]);

  const startCamera = useCallback(async () => {
    generation.current++; const request = generation.current;
    pause(); releaseCamera(); setError(null); setScreen('opening');
    // Load OCR while the user frames the page, instead of after the shutter tap.
    work.current = work.current.catch(() => {}).then(async () => {
      if (request !== generation.current || !mounted.current) return;
      ocr.current ??= new OcrService();
      await ocr.current.prepare(settingsRef.current.language, () => {}).catch(() => {});
    });
    try {
      const camera = await openCamera();
      if (request !== generation.current || !mounted.current) { camera.stream.getTracks().forEach(t => t.stop()); return; }
      stream.current = camera.stream; setFeatures(camera.features); setScreen('camera');
      setZoom((camera.stream.getVideoTracks()[0].getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? camera.features.zoom?.min ?? 1);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (request !== generation.current || !mounted.current) return;
      if (!videoRef.current) throw new Error('Camera preview could not open. Try again.');
      videoRef.current.srcObject = camera.stream; await videoRef.current.play();
      if (request !== generation.current || !mounted.current) return;
      setCameraReady(true);
      camera.stream.getVideoTracks()[0].onended = () => { cancel(); setError('Camera disconnected. Tap Scan page to reconnect.'); };
    } catch (failure) {
      if (request !== generation.current || !mounted.current) return;
      releaseCamera(); setScreen(page.current.snapshot().words.length ? 'reading' : 'idle');
      setError(failure instanceof Error ? failure.message : 'Camera could not open.');
    }
  }, [cancel, pause, releaseCamera, setScreen]);

  const capture = useCallback(() => {
    if (phaseRef.current !== 'camera' || !videoRef.current) return;
    const canvas = document.createElement('canvas');
    if (!capturePageFrame(videoRef.current, canvas)) { setError('Camera is getting ready. Tap Capture page again.'); return; }
    const request = ++generation.current;
    speech.current?.unlock();
    releaseCamera(); // Pixels are frozen now; no need to keep holding the phone in place.
    recognize(canvas, request);
  }, [recognize, releaseCamera]);
  const trySample = useCallback(() => {
    const request = ++generation.current; pause(); releaseCamera(); speech.current?.unlock();
    const canvas = document.createElement('canvas'); drawDemo(canvas); recognize(canvas, request);
  }, [pause, recognize, releaseCamera]);
  const retry = useCallback(() => {
    if (!captured.current) return;
    const request = ++generation.current; speech.current?.unlock(); recognize(captured.current, request);
  }, [recognize]);
  const togglePlay = useCallback(() => {
    if (phaseRef.current !== 'reading') return;
    setError(null);
    if (playingRef.current) { pause(); return; }
    if (page.current.snapshot().finished) page.current.seek(0);
    speech.current?.unlock(); setPlayback(true); setStatus(''); pump.current();
  }, [pause, setPlayback]);
  const seek = useCallback((index: number) => {
    if (phaseRef.current !== 'reading') return;
    pause(); setError(null);
    if (!page.current.seek(index)) return;
    speech.current?.unlock(); const words = page.current.plan(true); page.current.queue(words);
    speech.current?.speak(words, { ...settingsRef.current, language: pageLanguage.current }); refresh();
  }, [pause, refresh]);
  const step = useCallback((direction: -1 | 1) => seek(page.current.snapshot().cursor + direction), [seek]);
  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    const next = { ...settingsRef.current, ...patch }; settingsRef.current = next; setSettings(next);
    if (settingsReady.current) void saveSettings(next).catch(() => setStorageWarning(true));
    if (patch.speed !== undefined || patch.voiceURI !== undefined) {
      const wasPlaying = playingRef.current; speech.current?.stop(); refresh();
      if (wasPlaying) pump.current();
    }
  }, [refresh]);
  const changeTorch = useCallback(async () => {
    if (!stream.current) return;
    try { await setCameraFeature(stream.current, 'torch', !torch); setTorch(!torch); } catch { setError('Flashlight is unavailable.'); }
  }, [torch]);
  const changeZoom = useCallback(async (value: number) => {
    if (!stream.current) return;
    try { await setCameraFeature(stream.current, 'zoom', value); setZoom(value); } catch { setError('Could not change zoom.'); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    speech.current = new SpeechPlayer({
      start: id => { if (mounted.current) { page.current.start(id); refresh(); } },
      complete: ids => { if (mounted.current) { page.current.complete(ids); refresh(); } },
      interrupted: reason => {
        page.current.interrupt();
        if (mounted.current) { refresh(); if (reason) { setPlayback(false); setError(reason); } }
      },
      idle: () => { if (mounted.current) pump.current(); },
    });
    void loadSettings().then(value => { if (mounted.current) { settingsRef.current = value; setSettings(value); } }).catch(() => { if (mounted.current) setStorageWarning(true); }).finally(() => { settingsReady.current = true; });
    const updateVoices = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    updateVoices(); window.speechSynthesis?.addEventListener('voiceschanged', updateVoices);
    const onHide = () => {
      if (!document.hidden) return;
      pause(); if (phaseRef.current === 'camera' || phaseRef.current === 'opening') cancel();
    };
    const onPageHide = () => { generation.current++; pause(); releaseCamera(); if (phaseRef.current !== 'reading') setScreen(page.current.snapshot().words.length ? 'reading' : 'idle'); };
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', onPageHide);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then(() => { if (mounted.current) setOfflineReady(true); }).catch(() => {});
    }
    return () => {
      mounted.current = false; generation.current++; speech.current?.stop(); stream.current?.getTracks().forEach(t => t.stop());
      const service = ocr.current; ocr.current = null; void work.current.finally(() => service?.destroy());
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      window.speechSynthesis?.removeEventListener('voiceschanged', updateVoices);
      document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide);
    };
  }, [cancel, pause, refresh, releaseCamera, setPlayback, setScreen]);
  return { settings, updateSettings, phase, snapshot, playing, error, clearError: () => setError(null), status, progress, pageNumber, previewUrl,
    cameraReady, features, torch, zoom, changeTorch, changeZoom, voices, offlineReady, storageWarning, metrics, videoRef,
    startCamera, capture, trySample, cancel, retry, togglePlay, pause, seek, step,
    queue: snapshot.words.filter(w => w.state === 'queued' || w.state === 'speaking') };
}
