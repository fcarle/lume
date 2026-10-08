'use client';
import type { useReader } from '@/lib/use-reader';
import { Dialog } from './dialog';
export function Diagnostics({ reader, open, onClose }: { reader: ReturnType<typeof useReader>; open: boolean; onClose: () => void }) {
  return <Dialog open={open} onClose={onClose} title="Scan details" wide>
    <div className="metric-grid">{[
      ['Recognition', reader.metrics.duration ? `${reader.metrics.duration} ms` : '—'], ['Confidence', reader.metrics.scans ? `${reader.metrics.confidence}%` : '—'],
      ['Words', String(reader.metrics.words)], ['Camera', reader.phase === 'camera' ? 'Live' : 'Off'],
      ['Scans', String(reader.metrics.scans)], ['Last spoken', reader.snapshot.lastSpoken || '—'],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {reader.error && <p className="diagnostic-error">{reader.error}</p>}
    <div className="diagnostic-section"><h3>Speech queue</h3><p>{reader.queue.map(w => w.text).join(' ') || 'Nothing queued'}</p></div>
    {!!reader.snapshot.words.length && <div className="word-table-wrap"><table><thead><tr><th>Word</th><th>Confidence</th><th>State</th></tr></thead><tbody>{reader.snapshot.words.map(word => <tr key={word.id}><td>{word.text}</td><td>{Math.round(word.confidence)}%</td><td>{word.state}</td></tr>)}</tbody></table></div>}
  </Dialog>;
}
