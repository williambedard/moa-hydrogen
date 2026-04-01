import {forwardRef} from 'react';
import {motion, useReducedMotion} from 'framer-motion';

export const HERO_PROMPTS = [
  'Build my stack',
  'How is your omega-3 different?',
  'What makes MOA unique?',
  'Tell me about creatine stability',
  'What clinical evidence backs this?',
  'Help me optimize recovery',
];

interface WelcomeHeroProps {
  title?: string;
  /** Render children (e.g. ConciergePrompt) in the slot where the input used to be */
  children?: React.ReactNode;
}

/**
 * Hero section — branding + headline + slot for the chat input.
 * The sentinel ref is forwarded so the parent can observe when the
 * hero scrolls out of view.
 */
export const WelcomeHero = forwardRef<HTMLDivElement, WelcomeHeroProps>(
  function WelcomeHero(
    {title = "What's your mechanism?", children},
    sentinelRef,
  ) {
    const prefersReducedMotion = useReducedMotion();
    const animateTo = {opacity: 1, y: 0};

    return (
      <section className="relative min-h-screen flex flex-col items-center justify-center bg-[var(--moa-bg)] moa-dots px-6">
        {/* Content */}
        <div className="relative z-10 w-full max-w-[640px] text-center">
          {/* Brand mark */}
          <motion.div
            className="mb-8"
            initial={prefersReducedMotion ? {} : {opacity: 0, y: 16}}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.1}}
          >
            <span className="font-[var(--font-heading)] text-[1.8rem] font-normal tracking-[0.25em] text-[var(--moa-text)] uppercase">
              M &middot; O &middot; A
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="font-[var(--font-heading)] text-[clamp(2.5rem,5vw,4rem)] font-normal text-[var(--moa-text)] mb-10 leading-[1.1] italic"
            initial={prefersReducedMotion ? {} : {opacity: 0, y: 16}}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.25}}
          >
            {title}
          </motion.h1>

          {/* Sentinel — observed by IntersectionObserver to detect scroll.
              ConciergePrompt renders here in relative position (hero mode). */}
          <motion.div
            ref={sentinelRef}
            initial={prefersReducedMotion ? {} : {opacity: 0, y: 16}}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.4}}
          >
            {children}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-[var(--moa-text-tertiary)]"
          initial={prefersReducedMotion ? {} : {opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: 0.6, delay: 0.8}}
        >
          <svg
            className="w-5 h-8"
            viewBox="0 0 24 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="1"
              y="1"
              width="22"
              height="38"
              rx="11"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <motion.circle
              cx="12"
              cy="12"
              r="3"
              fill="currentColor"
              animate={prefersReducedMotion ? {} : {y: [0, 12, 0]}}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </svg>
        </motion.div>
      </section>
    );
  },
);
