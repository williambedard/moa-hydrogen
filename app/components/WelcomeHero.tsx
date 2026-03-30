import {motion, useReducedMotion} from 'framer-motion';

interface WelcomeHeroProps {
  backgroundImage?: string;
  backgroundVideo?: string;
  videoPoster?: string;
  title?: string;
  subtitle?: string;
}

export function WelcomeHero({
  backgroundImage,
  backgroundVideo,
  videoPoster,
  title = 'Welcome',
  subtitle = 'We are trying to rethink what it means to shop online',
}: WelcomeHeroProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative h-screen min-h-[600px] flex flex-col items-center justify-center bg-gradient-to-br from-[#d4c4b5] via-[#e9e5e0] to-[#d8d0c7] overflow-hidden">
      {/* Background media */}
      {backgroundVideo ? (
        <video
          className="absolute inset-0 w-full h-full object-cover z-0"
          autoPlay
          muted
          loop
          playsInline
          poster={videoPoster}
        >
          <source src={backgroundVideo} type="video/mp4" />
        </video>
      ) : backgroundImage ? (
        <img
          src={backgroundImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      ) : null}

      {/* Overlay for text readability */}
      <div className="absolute inset-0 bg-black/15 z-0 pointer-events-none" />

      {/* Content */}
      <motion.div
        className="relative z-10 text-center px-8 max-w-[700px]"
        initial={prefersReducedMotion ? {} : {opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.6, delay: 0.2}}
      >
        <h1 className="font-[Cormorant_Garamond,Georgia,serif] text-5xl md:text-6xl font-normal text-white m-0 mb-4 tracking-[0.05em] drop-shadow-[0_2px_20px_rgba(0,0,0,0.3)]">
          {title}
        </h1>
        {subtitle && (
          <p className="font-[Cormorant_Garamond,Georgia,serif] text-lg md:text-xl font-normal italic text-white/90 m-0 leading-relaxed drop-shadow-[0_1px_10px_rgba(0,0,0,0.3)]">
            {subtitle}
          </p>
        )}
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/80"
        initial={prefersReducedMotion ? {} : {opacity: 0}}
        animate={{opacity: 1}}
        transition={{duration: 0.6, delay: 0.8}}
      >
        <svg
          className="w-6 h-10"
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
            strokeWidth="2"
          />
          <motion.circle
            cx="12"
            cy="12"
            r="4"
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
