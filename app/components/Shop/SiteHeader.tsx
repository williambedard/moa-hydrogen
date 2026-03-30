import {Link} from 'react-router';
import {useState, useEffect} from 'react';

interface SiteHeaderProps {
  cartCount?: number;
  onCartClick?: () => void;
}

export function SiteHeader({cartCount = 0, onCartClick}: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOverHero, setIsOverHero] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);

      // Check if header is over the welcome hero section
      // The hero is 100vh, header is 56px (h-14)
      const heroBottom = window.innerHeight;
      const headerBottom = 56;
      const overHero = window.scrollY + headerBottom < heroBottom;
      setIsOverHero(overHero);
    };

    // Run immediately on mount
    handleScroll();

    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 inset-x-0 h-14 flex items-center justify-between px-6 z-50
        transition-all duration-300 ease-out
        ${isScrolled && !isOverHero ? 'bg-[#e9e5e0]/95 backdrop-blur-[10px] shadow-[0_4px_20px_rgba(0,0,0,0.08)]' : 'bg-transparent'}
      `}
    >
      <div className="flex-1 flex items-center">
        {/* Placeholder for potential left content */}
      </div>

      <Link
        to="/"
        className={`
          font-[Cormorant_Garamond,Georgia,serif] text-xl font-medium tracking-[0.2em] no-underline uppercase
          transition-colors duration-300
          ${isOverHero ? 'text-white hover:text-white/70' : 'text-[#3d3a36] hover:text-[#8b7355]'}
        `}
      >
        CURATE
      </Link>

      <div className="flex-1 flex items-center justify-end gap-2">
        <Link
          to="/account"
          className={`
            w-10 h-10 flex items-center justify-center transition-colors duration-300
            ${isOverHero ? 'text-white hover:text-white/70' : 'text-[#3d3a36] hover:text-[#8b7355]'}
          `}
          aria-label="Account"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M4 20C4 16.6863 7.58172 14 12 14C16.4183 14 20 16.6863 20 20"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </Link>

        <button
          onClick={onCartClick}
          className={`
            relative w-10 h-10 flex items-center justify-center transition-colors duration-300
            ${isOverHero ? 'text-white hover:text-white/70' : 'text-[#3d3a36] hover:text-[#8b7355]'}
          `}
          aria-label="Open cart"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 6H4L2 20H22L20 6H18M6 6V4C6 2.89543 6.89543 2 8 2H16C17.1046 2 18 2.89543 18 4V6M6 6H18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {cartCount > 0 && (
            <span
              className={`
                absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center
                text-[0.625rem] font-medium rounded-full px-1 transition-colors duration-300
                ${isOverHero ? 'bg-white text-[#3d3a36]' : 'bg-[#2c2825] text-[#e9e5e0]'}
              `}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
