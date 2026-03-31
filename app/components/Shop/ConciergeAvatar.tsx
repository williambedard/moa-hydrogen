import {useMemo} from 'react';
import {motion, useReducedMotion} from 'framer-motion';

interface ConciergeAvatarProps {
  size?: number;
  className?: string;
  isSpeaking?: boolean;
  audioLevel?: number;
}

const FAST_TRANSITION = {duration: 0.05, ease: 'linear' as const};

/**
 * Molecular hexagon icon — benzene-inspired with pulsing center node.
 * Replaces the top-hat concierge for MOA's scientific aesthetic.
 */
export function ConciergeAvatar({
  size = 48,
  className = '',
  isSpeaking = false,
  audioLevel = 0,
}: ConciergeAvatarProps) {
  const shouldReduceMotion = useReducedMotion();
  const speaking = isSpeaking && audioLevel !== undefined;

  const centerScale = useMemo(() => {
    if (!speaking || shouldReduceMotion) return 1;
    return 1 + Math.min(audioLevel, 1) * 0.6;
  }, [speaking, shouldReduceMotion, audioLevel]);

  // Hexagon points for a regular hexagon centered at (24, 24) with radius 16
  const hex = 'M24,8 L38.9,16 L38.9,32 L24,40 L9.1,32 L9.1,16 Z';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MOA AI Assistant"
    >
      {/* Outer glow when speaking */}
      {speaking && (
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="var(--moa-accent, #00D4AA)"
          strokeWidth="0.5"
          animate={shouldReduceMotion ? {} : {opacity: [0.1, 0.3, 0.1]}}
          transition={{duration: 1.5, repeat: Infinity, ease: 'easeInOut'}}
        />
      )}

      {/* Hexagonal ring */}
      <path
        d={hex}
        stroke="var(--moa-accent, #00D4AA)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />

      {/* Inner hexagon (subtle) */}
      <path
        d="M24,14 L32.9,18.5 L32.9,27.5 L24,32 L15.1,27.5 L15.1,18.5 Z"
        stroke="var(--moa-accent, #00D4AA)"
        strokeWidth="0.5"
        fill="none"
        opacity="0.3"
        strokeLinejoin="round"
      />

      {/* Connection lines (molecular bonds) */}
      <line x1="24" y1="14" x2="24" y2="8" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />
      <line x1="32.9" y1="18.5" x2="38.9" y2="16" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />
      <line x1="32.9" y1="27.5" x2="38.9" y2="32" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />
      <line x1="24" y1="32" x2="24" y2="40" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />
      <line x1="15.1" y1="27.5" x2="9.1" y2="32" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />
      <line x1="15.1" y1="18.5" x2="9.1" y2="16" stroke="var(--moa-accent, #00D4AA)" strokeWidth="0.5" opacity="0.4" />

      {/* Center node */}
      <motion.circle
        cx="24"
        cy="24"
        r="3"
        fill="var(--moa-accent, #00D4AA)"
        animate={speaking ? {r: 3 * centerScale} : {r: 3}}
        transition={shouldReduceMotion ? {duration: 0} : FAST_TRANSITION}
      />

      {/* Center glow */}
      <circle
        cx="24"
        cy="24"
        r="5"
        fill="var(--moa-accent, #00D4AA)"
        opacity="0.1"
      />

      {/* Vertex nodes */}
      {[
        [24, 8], [38.9, 16], [38.9, 32],
        [24, 40], [9.1, 32], [9.1, 16],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="1.5"
          fill="var(--moa-accent, #00D4AA)"
          opacity="0.6"
        />
      ))}
    </svg>
  );
}
