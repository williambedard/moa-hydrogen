import {forwardRef} from 'react';
import {motion, useReducedMotion} from 'framer-motion';

export const HERO_PROMPTS = [
  'Build me a recovery stack',
  'Help me sleep better',
  'What helps with focus and energy?',
  'I need help with gut health',
  'What makes MOA different?',
  'What should I start with?',
];

interface WelcomeHeroProps {
  children?: React.ReactNode;
}

/**
 * Hero section — branding, headline, subtitle, chat input slot, shop link.
 * The sentinel ref is forwarded so the parent can observe when the
 * hero scrolls out of view.
 */
export const WelcomeHero = forwardRef<HTMLDivElement, WelcomeHeroProps>(
  function WelcomeHero({children}, sentinelRef) {
    const prefersReducedMotion = useReducedMotion();
    const animateTo = {opacity: 1, y: 0};
    const initial = prefersReducedMotion ? {} : {opacity: 0, y: 16};

    return (
      <section className="relative min-h-screen flex flex-col items-center justify-center bg-[var(--moa-bg)] px-6">
        <div className="relative z-10 w-full max-w-[680px] text-center">
          {/* Brand mark */}
          <motion.div
            className="mb-10"
            initial={initial}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.1}}
          >
            <span className="font-[var(--font-body)] text-[0.8rem] font-medium tracking-[0.35em] text-[var(--moa-text-secondary)] uppercase">
              Mechanism of Action
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="font-[var(--font-heading)] text-[clamp(2.5rem,5vw,4rem)] font-normal text-[var(--moa-text)] mb-6 leading-[1.15]"
            initial={initial}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.2}}
          >
            The first supplement brand built for the age of agents.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="font-[var(--font-body)] text-base text-[var(--moa-text-secondary)] mb-10 max-w-[520px] mx-auto leading-relaxed"
            initial={initial}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.3}}
          >
            Tell us your goal. We&apos;ll build your protocol, answer every
            question, and handle everything in a single conversation &mdash;
            no forms, no funnels.
          </motion.p>

          {/* Sentinel + chat input slot */}
          <motion.div
            ref={sentinelRef}
            initial={initial}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.4}}
          >
            {children}
          </motion.div>

          {/* Shop the traditional way */}
          <motion.div
            className="mt-6"
            initial={initial}
            animate={animateTo}
            transition={{duration: 0.6, delay: 0.55}}
          >
            <a
              href="/collections/all"
              className="text-sm font-[var(--font-body)] text-[var(--moa-text-tertiary)] underline underline-offset-4 decoration-[var(--moa-border)] hover:text-[var(--moa-text-secondary)] hover:decoration-[var(--moa-text-tertiary)] transition-colors"
            >
              Shop the traditional way
            </a>
          </motion.div>
        </div>


      </section>
    );
  },
);
