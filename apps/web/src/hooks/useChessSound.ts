import { useCallback, useRef } from 'react';
import { usePrefs } from '../lib/auth';

/** Lightweight move/capture sounds synthesised with the Web Audio API (no asset downloads). */
export function useChessSound() {
  const { prefs } = usePrefs();
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback((kind: 'move' | 'capture' | 'check' | 'end') => {
    if (!prefs.soundEnabled) return;
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const config = {
        move: { freq: 320, type: 'triangle' as OscillatorType, duration: 0.08, volume: 0.05 },
        capture: { freq: 180, type: 'square' as OscillatorType, duration: 0.12, volume: 0.06 },
        check: { freq: 520, type: 'sine' as OscillatorType, duration: 0.16, volume: 0.06 },
        end: { freq: 220, type: 'sine' as OscillatorType, duration: 0.35, volume: 0.07 },
      }[kind];
      osc.type = config.type;
      osc.frequency.setValueAtTime(config.freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(config.freq * (kind === 'end' ? 0.6 : 1.25), ctx.currentTime + config.duration);
      gain.gain.setValueAtTime(config.volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + config.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + config.duration + 0.02);
    } catch { /* audio unavailable */ }
  }, [prefs.soundEnabled]);
}
