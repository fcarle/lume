import { expect, it } from 'vitest';
import { validateSettings } from '../lib/preferences';
it('repairs corrupted stored preferences and bounds controls', () => {
  const result = validateSettings({ speed: NaN, sensitivity: -20, scanInterval: 80000, language: 'unsupported' });
  expect(result.speed).toBe(1); expect(result.sensitivity).toBe(40); expect(result.scanInterval).toBe(2000); expect(result.language).toBe('eng');
});
