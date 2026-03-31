import {motion} from 'framer-motion';
import {useReducedMotion} from '~/hooks/useReducedMotion';
import {ConciergeAvatar} from './ConciergeAvatar';

const LOADING_QUOTES = [
  'Analyzing formulations...',
  'Cross-referencing clinical data...',
  'Searching the catalog...',
  'Building your recommendation...',
];

export function LoadingOverlay() {
  const prefersReducedMotion = useReducedMotion();
  const quote = LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)];

  return (
    <motion.div
      className="fixed inset-0 bg-[var(--moa-bg)]/95 backdrop-blur-sm z-[100] flex items-center justify-center"
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      transition={{duration: 0.3}}
    >
      <motion.div
        className="text-center px-8 max-w-[500px]"
        initial={prefersReducedMotion ? {} : {opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.4, delay: 0.1}}
      >
        {/* Animated molecular avatar */}
        <motion.div
          className="flex justify-center mb-8"
          animate={prefersReducedMotion ? {} : {
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <ConciergeAvatar size={96} />
        </motion.div>

        <motion.p
          className="font-[var(--font-body)] text-base md:text-lg text-[var(--moa-text-secondary)] leading-relaxed"
          initial={prefersReducedMotion ? {} : {opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.4, delay: 0.3}}
        >
          {quote}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
