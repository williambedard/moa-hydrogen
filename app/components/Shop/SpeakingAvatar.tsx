import {motion, useReducedMotion} from 'framer-motion';
import {ConciergeAvatar} from './ConciergeAvatar';

interface SpeakingAvatarProps {
  size?: number;
  className?: string;
  isSpeaking: boolean;
  audioLevel: number;
}

export function SpeakingAvatar({
  size = 48,
  className = '',
  isSpeaking,
  audioLevel,
}: SpeakingAvatarProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      style={{display: 'inline-flex', position: 'relative'}}
      animate={
        isSpeaking && !shouldReduceMotion
          ? {
              scale: [1, 1.02, 1],
              translateY: [0, -0.5, 0],
            }
          : {scale: 1, translateY: 0}
      }
      transition={
        isSpeaking
          ? {
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }
          : {duration: 0.2}
      }
    >
      {/* Subtle glow behind avatar when speaking */}
      {isSpeaking && !shouldReduceMotion && (
        <motion.div
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(212,168,92,0.25) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
          animate={{opacity: [0.4, 0.7, 0.4]}}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
      <ConciergeAvatar
        size={size}
        isSpeaking={isSpeaking}
        audioLevel={audioLevel}
      />
    </motion.div>
  );
}
