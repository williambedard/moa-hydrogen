import {Suspense, useState, useEffect} from 'react';
import {Await, NavLink, useAsyncValue} from 'react-router';
import {
  type CartViewPayload,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import type {HeaderQuery, CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';

interface HeaderProps {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
}

type Viewport = 'desktop' | 'mobile';

export function Header({
  header,
  isLoggedIn,
  cart,
  publicStoreDomain,
}: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        fixed top-0 inset-x-0 h-14 flex items-center justify-between px-6 z-50
        transition-all duration-300 ease-out
        ${isScrolled
          ? 'bg-[var(--moa-surface)]/95 backdrop-blur-[10px] shadow-[0_1px_0_var(--moa-border)]'
          : 'bg-[var(--moa-surface)]/80 backdrop-blur-[6px]'}
      `}
    >
      {/* Logo */}
      <NavLink
        prefetch="intent"
        to="/"
        end
        className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] uppercase text-[var(--moa-text)] hover:text-[var(--moa-accent)] transition-colors duration-300 no-underline shrink-0"
      >
        MOA
      </NavLink>

      {/* Desktop nav */}
      <HeaderMenu
        menu={header.menu}
        viewport="desktop"
        primaryDomainUrl={header.shop.primaryDomain.url}
        publicStoreDomain={publicStoreDomain}
      />

      {/* Right side: mobile toggle + cart */}
      <div className="flex items-center gap-2">
        <MobileMenuToggle />
        <CartToggle cart={cart} />
      </div>
    </header>
  );
}

export function HeaderMenu({
  menu,
  primaryDomainUrl,
  viewport,
  publicStoreDomain,
}: {
  menu: HeaderProps['header']['menu'];
  primaryDomainUrl: HeaderProps['header']['shop']['primaryDomain']['url'];
  viewport: Viewport;
  publicStoreDomain: HeaderProps['publicStoreDomain'];
}) {
  const {close} = useAside();
  const items = (menu || FALLBACK_HEADER_MENU).items;

  if (viewport === 'mobile') {
    return (
      <nav className="flex flex-col gap-1 py-4" role="navigation">
        <MobileNavLink to="/" onClick={close}>
          Home
        </MobileNavLink>
        {items.map((item) => {
          if (!item.url) return null;
          const url = stripDomain(item.url, publicStoreDomain, primaryDomainUrl);
          return (
            <MobileNavLink key={item.id} to={url} onClick={close}>
              {item.title}
            </MobileNavLink>
          );
        })}
      </nav>
    );
  }

  // Desktop
  return (
    <nav className="hidden md:flex items-center gap-8" role="navigation">
      {items.map((item) => {
        if (!item.url) return null;
        const url = stripDomain(item.url, publicStoreDomain, primaryDomainUrl);
        return (
          <NavLink
            key={item.id}
            end
            prefetch="intent"
            to={url}
            className={({isActive}) =>
              `font-[var(--font-body)] text-[0.8125rem] tracking-wide transition-colors duration-200 no-underline ${
                isActive
                  ? 'text-[var(--moa-accent)] font-medium'
                  : 'text-[var(--moa-text-secondary)] hover:text-[var(--moa-text)]'
              }`
            }
          >
            {item.title}
          </NavLink>
        );
      })}
    </nav>
  );
}

function MobileNavLink({
  to,
  onClick,
  children,
}: {
  to: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      end
      to={to}
      onClick={onClick}
      prefetch="intent"
      className={({isActive}) =>
        `block px-4 py-3 font-[var(--font-body)] text-sm rounded-lg transition-colors duration-200 no-underline ${
          isActive
            ? 'text-[var(--moa-accent)] bg-[var(--moa-accent-glow)]'
            : 'text-[var(--moa-text-secondary)] hover:text-[var(--moa-text)] hover:bg-[var(--moa-surface-elevated)]'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function MobileMenuToggle() {
  const {open} = useAside();
  return (
    <button
      className="md:hidden w-10 h-10 flex items-center justify-center text-[var(--moa-text-secondary)] hover:text-[var(--moa-text)] transition-colors duration-200"
      onClick={() => open('mobile')}
      aria-label="Open menu"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 6h18M3 12h18M3 18h18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function CartBadge({count}: {count: number | null}) {
  const {open} = useAside();
  const {publish, shop, cart, prevCart} = useAnalytics();

  return (
    <button
      onClick={() => {
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: window.location.href || '',
        } as CartViewPayload);
      }}
      className="relative w-10 h-10 flex items-center justify-center text-[var(--moa-text-secondary)] hover:text-[var(--moa-text)] transition-colors duration-200"
      aria-label="Open cart"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 6H4L2 20H22L20 6H18M6 6V4C6 2.89543 6.89543 2 8 2H16C17.1046 2 18 2.89543 18 4V6M6 6H18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {count !== null && count > 0 && (
        <span className="absolute top-1 right-1 min-w-4 h-4 flex items-center justify-center text-[0.625rem] font-medium rounded-full px-1 bg-[var(--moa-accent)] text-[var(--moa-bg)]">
          {count}
        </span>
      )}
    </button>
  );
}

function CartToggle({cart}: Pick<HeaderProps, 'cart'>) {
  return (
    <Suspense fallback={<CartBadge count={null} />}>
      <Await resolve={cart}>
        <CartBanner />
      </Await>
    </Suspense>
  );
}

function CartBanner() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return <CartBadge count={cart?.totalQuantity ?? 0} />;
}

/** Strip store domain from menu URLs to keep links relative */
function stripDomain(
  url: string,
  publicStoreDomain: string,
  primaryDomainUrl: string,
): string {
  if (
    url.includes('myshopify.com') ||
    url.includes(publicStoreDomain) ||
    url.includes(primaryDomainUrl)
  ) {
    return new URL(url).pathname;
  }
  return url;
}

const FALLBACK_HEADER_MENU = {
  id: 'gid://shopify/Menu/fallback',
  items: [
    {
      id: 'fallback-home',
      resourceId: null,
      tags: [],
      title: 'Home',
      type: 'HTTP',
      url: '/',
      items: [],
    },
    {
      id: 'fallback-products',
      resourceId: null,
      tags: [],
      title: 'Our Products',
      type: 'HTTP',
      url: '/collections/all',
      items: [],
    },
    {
      id: 'fallback-about',
      resourceId: null,
      tags: [],
      title: 'About',
      type: 'PAGE',
      url: '/pages/about',
      items: [],
    },
  ],
};
