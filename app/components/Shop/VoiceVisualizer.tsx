/**
 * Compact waveform/frequency bar visualization for the voice mode UI.
 * Renders inside the ConciergePrompt input area.
 */

import {useRef, useEffect, memo} from 'react';
import {useReducedMotion} from '~/hooks/useReducedMotion';

interface VoiceVisualizerProps {
  audioLevel: number; // 0-1
  isActive: boolean;
  className?: string;
}

const BAR_COUNT = 20;
const BAR_GAP = 2;
const BAR_WIDTH = 3;
const MAX_BAR_HEIGHT = 24;
const MIN_BAR_HEIGHT = 2;

export const VoiceVisualizer = memo(function VoiceVisualizer({
  audioLevel,
  isActive,
  className = '',
}: VoiceVisualizerProps) {
  const prefersReducedMotion = useReducedMotion();
  const barsRef = useRef<HTMLDivElement>(null);
  const prevLevelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  useEffect(() => {
    if (!barsRef.current || !isActive) return;

    const bars = barsRef.current.children;
    const prevLevels = prevLevelsRef.current;

    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = bars[i] as HTMLDivElement | undefined;
      if (!bar) continue;

      if (prefersReducedMotion) {
        // Static indicator: uniform height based on audioLevel
        const height = MIN_BAR_HEIGHT + audioLevel * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
        bar.style.height = `${height}px`;
        continue;
      }

      // Create wave-like variation: center bars are taller
      const centerDistance = Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
      const centerBias = 1 - centerDistance * 0.5;

      // Add per-bar randomization for organic feel
      const randomFactor = 0.6 + Math.random() * 0.4;

      // Target height based on audio level
      const target = audioLevel * centerBias * randomFactor;

      // Smooth towards target (ease)
      const smoothed = prevLevels[i] * 0.3 + target * 0.7;
      prevLevels[i] = smoothed;

      const height = MIN_BAR_HEIGHT + smoothed * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
      bar.style.height = `${Math.max(MIN_BAR_HEIGHT, height)}px`;
    }
  });

  if (!isActive) return null;

  const totalWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * BAR_GAP;

  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{width: totalWidth, height: MAX_BAR_HEIGHT}}
    >
      <div
        ref={barsRef}
        className="flex items-center gap-[2px]"
        style={{height: MAX_BAR_HEIGHT}}
        aria-hidden="true"
      >
        {Array.from({length: BAR_COUNT}, (_, i) => (
          <div
            key={i}
            className="rounded-full transition-[height] duration-75"
            style={{
              width: BAR_WIDTH,
              height: MIN_BAR_HEIGHT,
              background: `linear-gradient(180deg, #f4c4ce, #d8c4e8, #c4d4f4)`,
            }}
          />
        ))}
      </div>
    </div>
  );
});
