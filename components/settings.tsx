'use client';
import { ChevronRight } from 'lucide-react';
import { LANGUAGES, type ReaderSettings } from '@/lib/types';
import { Dialog } from './dialog';
export function Settings({ open, onClose, settings, update, voices, storageWarning, offlineReady, onDiagnostics }: {
  open: boolean; onClose: () => void; settings: ReaderSettings; update: (patch: Partial<ReaderSettings>) => void;
  voices: SpeechSynthesisVoice[]; storageWarning: boolean; offlineReady: boolean; onDiagnostics: () => void;
}) {
  const locale = LANGUAGES.find(l => l.code === settings.language)?.locale ?? 'en-US';
  return <Dialog open={open} onClose={onClose} title="Settings">
    <div className="settings-body">
      <Toggle label="Play after scanning" checked={settings.autoRead} onChange={autoRead => update({ autoRead })} />
      <Toggle label="Highlight current word" checked={settings.highlight} onChange={highlight => update({ highlight })} />
      <label className="field"><span>Reading speed <output>{Number(settings.speed.toFixed(2))}×</output></span><input type="range" aria-label="Reading speed" min="0.5" max="2" step="0.05" value={settings.speed} onChange={e => update({ speed: +e.target.value })} /></label>
      <label className="field"><span>Language</span><select aria-label="Reading language" value={settings.language} onChange={e => update({ language: e.target.value, voiceURI: '' })}>{LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.name}</option>)}</select><small>Applies to the next scan. New languages download once.</small></label>
      <label className="field"><span>Voice</span><select aria-label="Reading voice" value={settings.voiceURI} onChange={e => update({ voiceURI: e.target.value })}><option value="">Device default</option>{voices.filter(v => v.lang.startsWith(locale.slice(0, 2))).map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name}{voice.localService ? '' : ' · online'}</option>)}</select></label>
      <button className="settings-link" onClick={onDiagnostics}>Scan details<ChevronRight size={18} /></button>
      <p className="settings-footnote">{storageWarning ? 'Settings apply for this session.' : 'Settings saved on this device.'}{offlineReady ? ' English is available offline with an installed voice.' : ''}</p>
    </div>
  </Dialog>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span>{label}</span><input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="toggle-visual" aria-hidden="true" /></label>;
}
