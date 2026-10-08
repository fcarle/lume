export type ReadingMode = 'smart' | 'word' | 'sentence' | 'continuous';
export type WordState = 'detected' | 'confirmed' | 'queued' | 'speaking' | 'completed';
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface OcrWord { text: string; confidence: number; bbox: Box; line: number }
export interface TrackedWord extends OcrWord {
  id: string;
  state: WordState;
  observations: number;
  normalized: string;
  candidate: string;
  lastSeen: number;
}
export interface ReaderSettings {
  language: string;
  voiceURI: string;
  speed: number;
  mode: ReadingMode;
  sensitivity: number;
  focusSize: 'small' | 'medium' | 'large';
  autoRead: boolean;
  highlight: boolean;
  scanInterval: number;
}
export const DEFAULT_SETTINGS: ReaderSettings = {
  language: 'eng', voiceURI: '', speed: 1, mode: 'smart', sensitivity: 65,
  focusSize: 'medium', autoRead: true, highlight: true, scanInterval: 800,
};
export const LANGUAGES = [
  { code: 'eng', locale: 'en-US', name: 'English', short: 'EN' },
  { code: 'spa', locale: 'es-ES', name: 'Español', short: 'ES' },
  { code: 'fra', locale: 'fr-FR', name: 'Français', short: 'FR' },
  { code: 'deu', locale: 'de-DE', name: 'Deutsch', short: 'DE' },
  { code: 'ita', locale: 'it-IT', name: 'Italiano', short: 'IT' },
  { code: 'por', locale: 'pt-PT', name: 'Português', short: 'PT' },
];
export const MODES: { id: ReadingMode; name: string; description: string }[] = [
  { id: 'smart', name: 'Smart', description: 'Follow your focus, without repeating text.' },
  { id: 'word', name: 'Word', description: 'One word at a time, right where you point.' },
  { id: 'sentence', name: 'Sentence', description: 'Read the sentence around your focus.' },
  { id: 'continuous', name: 'Continuous', description: 'Keep reading as new text comes into view.' },
];
