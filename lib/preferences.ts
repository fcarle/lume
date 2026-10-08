import { DEFAULT_SETTINGS, LANGUAGES, MODES, type ReaderSettings } from './types';
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lume-reader', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('preferences');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function validateSettings(raw: Partial<ReaderSettings>): ReaderSettings {
  const clamp = (n: unknown, min: number, max: number, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return { ...DEFAULT_SETTINGS,
    language: LANGUAGES.some(l => l.code === raw.language) ? raw.language! : 'eng',
    voiceURI: typeof raw.voiceURI === 'string' ? raw.voiceURI : '',
    speed: clamp(raw.speed, .5, 2, 1),
    mode: MODES.some(m => m.id === raw.mode) ? raw.mode! : 'smart',
    sensitivity: clamp(raw.sensitivity, 40, 90, 65),
    focusSize: ['small', 'medium', 'large'].includes(raw.focusSize ?? '') ? raw.focusSize! : 'medium',
    autoRead: typeof raw.autoRead === 'boolean' ? raw.autoRead : true,
    highlight: typeof raw.highlight === 'boolean' ? raw.highlight : true,
    scanInterval: clamp(raw.scanInterval, 500, 2000, 800),
  };
}
export async function loadSettings(): Promise<ReaderSettings> {
  const db = await openDB();
  try {
    const result = await new Promise<Partial<ReaderSettings>>((resolve, reject) => {
      const request = db.transaction('preferences').objectStore('preferences').get('settings');
      request.onsuccess = () => resolve(request.result ?? {}); request.onerror = () => reject(request.error);
    });
    return validateSettings(result);
  } finally { db.close(); }
}
export async function saveSettings(settings: ReaderSettings): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('preferences', 'readwrite');
      tx.objectStore('preferences').put(settings, 'settings');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
