'use client';
import { useEffect, useRef } from 'react';
import type { useReader } from './use-reader';
import { type ReaderSettings } from './types';
interface ToolContext {
  registerTool(tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown }, options: { signal: AbortSignal }): void | Promise<void>;
}
// Optional browser API: the normal camera/speech interface never depends on it.
export function useReaderTools(reader: ReturnType<typeof useReader>) {
  const current = useRef(reader); current.current = reader;
  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<ToolContext['registerTool']>[0]) => {
      try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Unsupported experimental API. */ }
    };
    register({ name: 'read_lume_status', title: 'Read Lume status', description: 'Read the camera state, saved reading preferences, and recognition measurements. Does not start the camera or audio.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Expected an empty object.');
        const r = current.current;
        return { phase: r.phase, cursor: r.snapshot.cursor, finished: r.snapshot.finished, playing: r.playing, settings: r.settings, metrics: r.metrics, offlineReady: r.offlineReady };
      },
    });
    register({ name: 'configure_lume_reading', title: 'Configure Lume reading', description: 'Change playback after scanning, reading speed, or word highlighting. Saves device preferences without starting camera or speech.',
      inputSchema: { type: 'object', properties: { autoRead: { type: 'boolean' }, speed: { type: 'number', minimum: .5, maximum: 2 }, highlight: { type: 'boolean' } }, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a settings object.');
        const values = input as Record<string, unknown>;
        if (Object.keys(values).some(key => !['autoRead', 'speed', 'highlight'].includes(key))) throw new Error('Unknown reading setting.');
        if (values.autoRead !== undefined && typeof values.autoRead !== 'boolean') throw new Error('Auto-read must be a boolean.');
        if (values.speed !== undefined && (typeof values.speed !== 'number' || !Number.isFinite(values.speed) || values.speed < .5 || values.speed > 2)) throw new Error('Speed must be between 0.5 and 2.');
        if (values.highlight !== undefined && typeof values.highlight !== 'boolean') throw new Error('Highlight must be a boolean.');
        current.current.updateSettings(values as Partial<ReaderSettings>);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { settings: current.current.settings };
      },
    });
    return () => lifecycle.abort();
  }, []);
}
