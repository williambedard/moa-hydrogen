import {Suspense} from 'react';
import {Await, NavLink} from 'react-router';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

export function Footer({
  footer: footerPromise,
  header,
  publicStoreDomain,
}: FooterProps) {
  return (
    <Suspense>
      <Await resolve={footerPromise}>
        {(footer) => (
          <footer className="bg-[var(--moa-surface)] border-t border-[var(--moa-border)]">
            <div className="max-w-5xl mx-auto px-6 py-12">
              {/* Top section: brand + policy links */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 mb-10">
                {/* Brand */}
                <div>
                  <NavLink
                    to="/"
                    className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] uppercase text-[var(--moa-text)] hover:text-[var(--moa-accent)] transition-colors duration-300 no-underline"
                  >
                    MOA
                  </NavLink>
                  <p className="mt-2 font-[var(--font-body)] text-sm text-[var(--moa-text-tertiary)] max-w-xs leading-relaxed">
                    Clinical-grade supplements, backed by evidence.
                  </p>
                </div>

                {/* Policy links */}
                {footer?.menu && header.shop.primaryDomain?.url && (
                  <FooterMenu
                    menu={footer.menu}
                    primaryDomainUrl={header.shop.primaryDomain.url}
                    publicStoreDomain={publicStoreDomain}
                  />
                )}
              </div>

              {/* Bottom: copyright */}
              <div className="pt-6 border-t border-[var(--moa-border)]">
                <p className="font-[var(--font-body)] text-xs text-[var(--moa-text-tertiary)]">
                  &copy; {new Date().getFullYear()} Mechanism of Action. All rights reserved.
                </p>
              </div>
            </div>
          </footer>
        )}
      </Await>
    </Suspense>
  );
}

function FooterMenu({
  menu,
  primaryDomainUrl,
  publicStoreDomain,
}: {
  menu: FooterQuery['menu'];
  primaryDomainUrl: FooterProps['header']['shop']['primaryDomain']['url'];
  publicStoreDomain: string;
}) {
  const items = (menu || FALLBACK_FOOTER_MENU).items;

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2" role="navigation">
      {items.map((item) => {
        if (!item.url) return null;
        const url =
          item.url.includes('myshopify.com') ||
          item.url.includes(publicStoreDomain) ||
          item.url.includes(primaryDomainUrl)
            ? new URL(item.url).pathname
            : item.url;
        const isExternal = !url.startsWith('/');
        return isExternal ? (
          <a
            href={url}
            key={item.id}
            rel="noopener noreferrer"
            target="_blank"
            className="font-[var(--font-body)] text-sm text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors duration-200 no-underline"
          >
            {item.title}
          </a>
        ) : (
          <NavLink
            end
            key={item.id}
            prefetch="intent"
            to={url}
            className="font-[var(--font-body)] text-sm text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors duration-200 no-underline"
          >
            {item.title}
          </NavLink>
        );
      })}
    </nav>
  );
}

const FALLBACK_FOOTER_MENU = {
  id: 'gid://shopify/Menu/fallback-footer',
  items: [
    {
      id: 'fallback-privacy',
      resourceId: null,
      tags: [],
      title: 'Privacy Policy',
      type: 'SHOP_POLICY',
      url: '/policies/privacy-policy',
      items: [],
    },
    {
      id: 'fallback-refund',
      resourceId: null,
      tags: [],
      title: 'Refund Policy',
      type: 'SHOP_POLICY',
      url: '/policies/refund-policy',
      items: [],
    },
    {
      id: 'fallback-shipping',
      resourceId: null,
      tags: [],
      title: 'Shipping Policy',
      type: 'SHOP_POLICY',
      url: '/policies/shipping-policy',
      items: [],
    },
    {
      id: 'fallback-terms',
      resourceId: null,
      tags: [],
      title: 'Terms of Service',
      type: 'SHOP_POLICY',
      url: '/policies/terms-of-service',
      items: [],
    },
  ],
};
