import {useMemo} from 'react';
import {motion, useReducedMotion} from 'framer-motion';

interface ConciergeAvatarProps {
  size?: number;
  className?: string;
  isSpeaking?: boolean;
  audioLevel?: number;
}

/**
 * Compute mouth shape paths from audioLevel (0-1).
 * All paths use identical command structure (M...Q...) so Framer Motion
 * can interpolate the `d` attribute smoothly.
 */
function getMouthPaths(audioLevel: number) {
  const a = Math.max(0, Math.min(1, audioLevel));

  if (a < 0.1) {
    // Closed / smirk
    return {
      upperLip: 'M27 48 Q32 50 37 48',
      lowerLip: 'M27 48 Q32 50 37 48',
      interiorCy: 48.5,
      interiorRx: 0,
      interiorRy: 0,
    };
  }
  if (a < 0.3) {
    // Slightly open
    return {
      upperLip: 'M27 47.5 Q32 49 37 47.5',
      lowerLip: 'M27 48.5 Q32 51 37 48.5',
      interiorCy: 49,
      interiorRx: 2.5,
      interiorRy: 0.8,
    };
  }
  if (a < 0.6) {
    // Medium open
    return {
      upperLip: 'M27 47 Q32 48 37 47',
      lowerLip: 'M27 49 Q32 52 37 49',
      interiorCy: 49.5,
      interiorRx: 3.5,
      interiorRy: 1.8,
    };
  }
  // Wide open
  return {
    upperLip: 'M27 46.5 Q32 47.5 37 46.5',
    lowerLip: 'M27 49.5 Q32 53 37 49.5',
    interiorCy: 50,
    interiorRx: 4,
    interiorRy: 2.5,
  };
}

const FAST_TRANSITION = {duration: 0.05, ease: 'linear' as const};

export function ConciergeAvatar({
  size = 48,
  className = '',
  isSpeaking = false,
  audioLevel = 0,
}: ConciergeAvatarProps) {
  const shouldReduceMotion = useReducedMotion();
  const speaking = isSpeaking && audioLevel !== undefined;

  const mouth = useMemo(() => {
    if (!speaking) return null;
    if (shouldReduceMotion) {
      // Static slightly-open shape for reduced-motion users
      return getMouthPaths(0.2);
    }
    return getMouthPaths(audioLevel);
  }, [speaking, shouldReduceMotion, audioLevel]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AI Concierge"
    >
      <defs>
        {/* Gold gradient for monocle and hat band */}
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d4a85c" />
          <stop offset="50%" stopColor="#c9a054" />
          <stop offset="100%" stopColor="#b8934c" />
        </linearGradient>
        {/* Face skin tone */}
        <linearGradient id="skinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f5e6d3" />
          <stop offset="100%" stopColor="#e8d4be" />
        </linearGradient>
      </defs>

      {/* Hair - dark navy, visible on sides under hat */}
      <path
        d="M18 30 Q16 34 17 40 Q18 44 20 46 L20 32 Q19 30 18 30"
        fill="#1e3a5f"
      />
      <path
        d="M46 30 Q48 34 47 40 Q46 44 44 46 L44 32 Q45 30 46 30"
        fill="#1e3a5f"
      />
      {/* Hair top - under hat brim */}
      <path
        d="M19 28 Q20 32 22 34 L22 28 Q20 28 19 28"
        fill="#1e3a5f"
      />
      <path
        d="M45 28 Q44 32 42 34 L42 28 Q44 28 45 28"
        fill="#1e3a5f"
      />

      {/* Face shape */}
      <ellipse cx="32" cy="40" rx="14" ry="16" fill="url(#skinGradient)" />

      {/* Ears */}
      <ellipse cx="17" cy="38" rx="3" ry="4" fill="url(#skinGradient)" />
      <ellipse cx="47" cy="38" rx="3" ry="4" fill="url(#skinGradient)" />
      <path d="M16 36 Q15 38 16 40" stroke="#1e3a5f" strokeWidth="0.5" fill="none" opacity="0.3" />
      <path d="M48 36 Q49 38 48 40" stroke="#1e3a5f" strokeWidth="0.5" fill="none" opacity="0.3" />

      {/* Chin definition */}
      <path d="M26 52 Q32 56 38 52" stroke="#1e3a5f" strokeWidth="0.8" fill="none" opacity="0.2" />

      {/* Top hat - main body */}
      <path
        d="M18 28 L18 10 Q18 6 22 6 L42 6 Q46 6 46 10 L46 28 Z"
        fill="#1e3a5f"
      />

      {/* Top hat - brim */}
      <ellipse cx="32" cy="28" rx="18" ry="4" fill="#1e3a5f" />
      <ellipse cx="32" cy="27" rx="14" ry="2.5" fill="#162d4d" />

      {/* Top hat - top */}
      <ellipse cx="32" cy="6" rx="10" ry="2" fill="#243f5f" />

      {/* Hat band - gold */}
      <rect x="18" y="20" width="28" height="5" fill="url(#goldGradient)" />

      {/* Cream stripe on hat */}
      <rect x="23" y="6" width="3" height="14" fill="#f5e6d3" opacity="0.9" />

      {/* Gold "C" on hat */}
      <text
        x="36"
        y="17"
        textAnchor="middle"
        fontSize="10"
        fontWeight="bold"
        fontFamily="Georgia, serif"
        fill="url(#goldGradient)"
      >
        C
      </text>

      {/* Eyebrows */}
      <path d="M24 33 Q27 31 30 33" stroke="#1e3a5f" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M34 33 Q37 31 40 33" stroke="#1e3a5f" strokeWidth="1.2" fill="none" strokeLinecap="round" />

      {/* Eyes */}
      <ellipse cx="27" cy="37" rx="2.5" ry="1.5" fill="#1e3a5f" />
      <ellipse cx="37" cy="37" rx="2.5" ry="1.5" fill="#1e3a5f" />

      {/* Eye highlights */}
      <circle cx="26.5" cy="36.5" r="0.5" fill="white" opacity="0.6" />
      <circle cx="36.5" cy="36.5" r="0.5" fill="white" opacity="0.6" />

      {/* Eyelids */}
      <path d="M24 36 Q27 35 30 36" stroke="#1e3a5f" strokeWidth="0.5" fill="none" opacity="0.4" />
      <path d="M34 36 Q37 35 40 36" stroke="#1e3a5f" strokeWidth="0.5" fill="none" opacity="0.4" />

      {/* Nose */}
      <path d="M32 38 L32 43 Q32 44 31 44.5 Q32 45 33 44.5 Q32 44 32 43" stroke="#1e3a5f" strokeWidth="0.8" fill="none" opacity="0.4" />

      {/* Mouth */}
      {speaking && mouth ? (
        <>
          {/* Mouth interior (dark opening) */}
          {mouth.interiorRy > 0 && (
            <motion.ellipse
              cx="32"
              animate={{
                cy: mouth.interiorCy,
                rx: mouth.interiorRx,
                ry: mouth.interiorRy,
              }}
              fill="#2d1a1a"
              transition={shouldReduceMotion ? {duration: 0} : FAST_TRANSITION}
            />
          )}
          {/* Upper lip */}
          <motion.path
            animate={{d: mouth.upperLip}}
            stroke="#1e3a5f"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
            transition={shouldReduceMotion ? {duration: 0} : FAST_TRANSITION}
          />
          {/* Lower lip */}
          <motion.path
            animate={{d: mouth.lowerLip}}
            stroke="#1e3a5f"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            opacity="0.6"
            transition={shouldReduceMotion ? {duration: 0} : FAST_TRANSITION}
          />
        </>
      ) : (
        <>
          {/* Static smile/smirk (original) */}
          <path d="M27 48 Q32 51 37 48" stroke="#1e3a5f" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
          <path d="M28 48.5 Q30 49 32 48.5" stroke="#1e3a5f" strokeWidth="0.5" fill="none" opacity="0.3" />
        </>
      )}

      {/* Monocle - gold ring */}
      <circle cx="37" cy="37" r="5.5" stroke="url(#goldGradient)" strokeWidth="2" fill="none" />

      {/* Monocle - inner rim highlight */}
      <circle cx="37" cy="37" r="4" stroke="#f5e6d3" strokeWidth="0.3" fill="none" opacity="0.5" />

      {/* Monocle chain */}
      <path
        d="M42 39 Q46 42 47 46 Q48 50 46 54"
        stroke="url(#goldGradient)"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />

      {/* Shadow under hat brim */}
      <ellipse cx="32" cy="30" rx="13" ry="2" fill="#1e3a5f" opacity="0.15" />
    </svg>
  );
}
