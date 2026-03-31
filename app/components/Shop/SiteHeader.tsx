import {Link} from 'react-router';
import {useState, useEffect} from 'react';

interface SiteHeaderProps {
  cartCount?: number;
  onCartClick?: () => void;
}

export function SiteHeader({cartCount = 0, onCartClick}: SiteHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 inset-x-0 h-14 flex items-center justify-between px-6 z-50
        transition-all duration-300 ease-out
        ${isScrolled ? 'bg-[var(--moa-surface)]/95 backdrop-blur-[10px] shadow-[0_1px_0_var(--moa-border)]' : 'bg-transparent'}
      `}
    >
      <div className="flex-1" />

      <Link
        to="/"
        className="font-[var(--font-heading)] text-lg font-normal tracking-[0.25em] no-underline uppercase text-[var(--moa-text)] hover:text-[var(--moa-accent)] transition-colors duration-300"
      >
        M &middot; O &middot; A
      </Link>

      <div className="flex-1 flex items-center justify-end">
        <button
          onClick={onCartClick}
          className="relative w-10 h-10 flex items-center justify-center text-[var(--moa-text-secondary)] hover:text-[var(--moa-text)] transition-colors duration-300"
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
            <span className="absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center text-[0.625rem] font-medium rounded-full px-1 bg-[var(--moa-accent)] text-[var(--moa-bg)]">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
