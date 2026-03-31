import {useRef, useState, useCallback, useEffect} from 'react';
import {motion, useReducedMotion} from 'framer-motion';

const HERO_PROMPTS = [
  'Build my stack',
  'How is your omega-3 different?',
  'What makes MOA unique?',
  'Tell me about creatine stability',
  'What clinical evidence backs this?',
  'Help me optimize recovery',
];

interface WelcomeHeroProps {
  backgroundImage?: string;
  backgroundVideo?: string;
  videoPoster?: string;
  title?: string;
  subtitle?: string;
  onSubmit?: (formData: FormData) => void;
}

export function WelcomeHero({
  title = "What's your mechanism?",
  subtitle,
  onSubmit,
}: WelcomeHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const query = inputValue.trim();
      if (!query || !onSubmit) return;
      const formData = new FormData();
      formData.set('query', query);
      onSubmit(formData);
      setInputValue('');
    },
    [inputValue, onSubmit],
  );

  const handleChipClick = useCallback(
    (prompt: string) => {
      if (!onSubmit) return;
      const formData = new FormData();
      formData.set('query', prompt);
      onSubmit(formData);
    },
    [onSubmit],
  );

  // Stagger config
  const stagger = (delay: number) =>
    prefersReducedMotion ? {} : {opacity: 0, y: 16};
  const animateTo = {opacity: 1, y: 0};

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center bg-[var(--moa-bg)] moa-dots overflow-hidden px-6">

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

        {/* Search input */}
        <motion.form
          onSubmit={handleSubmit}
          className="relative mb-8"
          initial={prefersReducedMotion ? {} : {opacity: 0, y: 16}}
          animate={animateTo}
          transition={{duration: 0.6, delay: 0.4}}
        >
          <div className="relative rounded-2xl border border-[var(--moa-border)] bg-[var(--moa-surface)] transition-shadow focus-within:shadow-[0_0_0_1px_var(--moa-accent),0_0_20px_var(--moa-accent-glow)]">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask about our formulations, ingredients, clinical research..."
              className="w-full px-6 py-4 bg-transparent text-[var(--moa-text)] text-base placeholder:text-[var(--moa-text-tertiary)] outline-none rounded-2xl font-[var(--font-body)]"
              autoComplete="off"
              autoCorrect="off"
              data-form-type="other"
              data-1p-ignore
              data-lpignore="true"
              data-protonpass-ignore="true"
              data-bwignore="true"
            />
            <button
              type="submit"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-accent)] transition-colors rounded-xl hover:bg-[var(--moa-surface-elevated)]"
              aria-label="Submit"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </motion.form>

        {/* Prompt chips */}
        <motion.div
          className="flex flex-wrap justify-center gap-2"
          initial={prefersReducedMotion ? {} : {opacity: 0, y: 16}}
          animate={animateTo}
          transition={{duration: 0.6, delay: 0.55}}
        >
          {HERO_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleChipClick(prompt)}
              className="px-4 py-2 text-sm font-[var(--font-body)] text-[var(--moa-text-secondary)] bg-[var(--moa-surface)] border border-[var(--moa-border)] rounded-full hover:text-[var(--moa-accent)] hover:border-[var(--moa-accent)]/30 transition-all duration-200"
            >
              {prompt}
            </button>
          ))}
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
}
