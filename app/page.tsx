'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, ScanLine, Settings2, X, Zap } from 'lucide-react';
import { useReader } from '@/lib/use-reader';
import { useReaderTools } from '@/lib/use-reader-tools';
import { Settings } from '@/components/settings';
import { Diagnostics } from '@/components/diagnostics';

export default function Home() {
  const reader = useReader();
  useReaderTools(reader);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const reading = reader.phase === 'reading';
  const scanning = reader.phase === 'camera' || reader.phase === 'opening';
  const processing = reader.phase === 'processing';
  const current = reader.snapshot.cursor;
  const words = reader.snapshot.words;
  useEffect(() => {
    if (!reading) return;
    const container = textRef.current;
    const word = container?.querySelector<HTMLElement>(`[data-word-index="${current}"]`);
    if (container && word) {
      const position = word.getBoundingClientRect().top - container.getBoundingClientRect().top;
      if (position < 20 || position > container.clientHeight - 80) container.scrollTop += position - container.clientHeight * .35;
    }
  }, [current, reading]);

  return <div className="reader-app">
    <header className="app-header">
      <a className="wordmark" href="/" aria-label="Lume home">lume<span>.</span></a>
      <button className="icon-button" aria-label="Settings" onClick={() => setSettingsOpen(true)} disabled={processing}><Settings2 size={22} strokeWidth={1.6} /></button>
    </header>
    <main className={`reader-main ${reading ? 'reading-screen' : 'capture-screen'}`}>
      {reader.error && <div className="error-banner" role="alert"><p>{reader.error}</p>{!processing && <button className="icon-button" onClick={reader.clearError} aria-label="Dismiss error"><X size={18} /></button>}</div>}
      {reading ? <>
        <div className="page-meta"><h1>Page {reader.pageNumber}</h1><span>{reader.snapshot.finished ? 'Finished' : `${current + 1} / ${words.length} words`}</span></div>
        <div className="page-text" ref={textRef} aria-label="Scanned page">
          <p>{words.map((word, index) => {
            const previous = words[index - 1];
            const paragraph = previous && (word.bbox.y0 - previous.bbox.y1 > .035 || word.bbox.x0 < previous.bbox.x0 && word.bbox.y0 < previous.bbox.y0 - .05);
            return <span key={word.id}>{paragraph && <span className="paragraph-break" />}<button
              className={`page-word ${reader.settings.highlight && current === index ? 'current-word' : ''} ${word.state === 'completed' ? 'completed-word' : ''} ${word.confidence < reader.settings.sensitivity ? 'uncertain-word' : ''}`}
              data-word-index={index} data-state={word.state} tabIndex={current === index ? 0 : -1} aria-label={`Read word ${index + 1}: ${word.text}`} aria-current={current === index ? 'true' : undefined}
              onClick={() => reader.seek(index)}>{word.text}</button>{' '}</span>;
          })}</p>
        </div>
        <div className="reading-controls">
          <div className="transport">
            <button className="step-button" aria-label="Previous word" onClick={() => reader.step(-1)} disabled={current === 0}><ChevronLeft size={26} /><span>Previous</span></button>
            <button className="play-button" aria-label={reader.playing ? 'Pause reading' : reader.snapshot.finished ? 'Read again' : 'Play reading'} onClick={reader.togglePlay}>{reader.playing ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}</button>
            <button className="step-button" aria-label="Next word" onClick={() => reader.step(1)} disabled={current >= words.length - 1}><ChevronRight size={26} /><span>Next word</span></button>
          </div>
          <button className="next-page-button" onClick={reader.startCamera}><ScanLine size={19} />Scan next page</button>
        </div>
      </> : <>
        <div className={`camera-stage ${reader.phase === 'idle' ? 'camera-idle' : ''}`}>
          <video ref={reader.videoRef} className={`camera-video ${scanning ? 'visible' : ''}`} autoPlay playsInline muted aria-label="Full-page camera preview" />
          {processing && reader.previewUrl && <img className="frozen-page" src={reader.previewUrl} alt="Captured page" />}
          {reader.phase === 'idle' && <div className="camera-empty"><ScanLine size={42} strokeWidth={1.2} /><h1>Scan a page</h1></div>}
          {scanning && <>
            <div className="camera-top-controls"><button className="camera-button" aria-label="Cancel scan" onClick={reader.cancel}><X size={21} /></button>{reader.features.torch && <button className={`camera-button ${reader.torch ? 'enabled' : ''}`} aria-label={reader.torch ? 'Turn light off' : 'Turn light on'} onClick={reader.changeTorch}><Zap size={20} /></button>}</div>
            <div className="page-guide" aria-hidden="true"><i /><i /><i /><i /></div>
            <span className="camera-instruction">{reader.phase === 'opening' ? 'Opening camera…' : 'Fit the whole page in view'}</span>
          </>}
          {processing && <div className="processing-overlay"><div className="processing-card">{reader.error ? <ScanLine size={25} /> : <LoaderCircle size={25} className="spin" />}<h1>{reader.error ? 'Try another scan' : 'Page captured'}</h1><p>{reader.error ? 'You can retake it below.' : 'You can move your phone now.'}</p>{!reader.error && <span className="processing-status" role="status">{reader.status}</span>}</div></div>}
        </div>
        <div className="capture-controls">
          {reader.phase === 'idle' && <><button className="primary-button" onClick={reader.startCamera}><Camera size={21} />Open camera</button><button className="quiet-button" onClick={reader.trySample}>Try a sample</button></>}
          {scanning && <>
            {reader.features.zoom && <label className="zoom-control"><span>{reader.zoom.toFixed(1)}×</span><input type="range" aria-label="Camera zoom" min={reader.features.zoom.min} max={reader.features.zoom.max} step={reader.features.zoom.step || .1} value={reader.zoom} onChange={event => reader.changeZoom(+event.target.value)} /></label>}
            <button className="shutter-button" disabled={!reader.cameraReady} onClick={reader.capture} aria-label="Capture page"><span>{reader.phase === 'opening' ? <LoaderCircle size={25} className="spin" /> : <Camera size={26} strokeWidth={1.6} />}</span></button><p className="shutter-label">Capture page</p>
          </>}
          {processing && <>{reader.error ? <div className="recovery-actions"><button className="primary-button" onClick={reader.startCamera}><Camera size={20} />Retake page</button><button className="quiet-button" onClick={reader.retry}>Retry this image</button></div> : <span className="capture-confirmation"><Check size={17} />Camera off</span>}<button className="quiet-button" onClick={reader.cancel}>Cancel</button></>}
        </div>
      </>}
    </main>
    <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={reader.settings} update={reader.updateSettings} voices={reader.voices} storageWarning={reader.storageWarning} offlineReady={reader.offlineReady} onDiagnostics={() => { setSettingsOpen(false); setDiagnosticsOpen(true); }} />
    <Diagnostics open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} reader={reader} />
  </div>;
}
