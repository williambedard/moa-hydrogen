import {useState, useEffect} from 'react';
import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';
import type {Product} from './ProductCard';

interface ChatProductCardProps {
  product: Product;
}

/**
 * Compact product card for inside chat bubbles.
 * Shows thumbnail, title, price, and a quick-add button.
 * Uses CartForm for reliable cart integration + dispatches
 * a custom event to open the cart drawer.
 */
export function ChatProductCard({product}: ChatProductCardProps) {
  const firstVariant = product.variants?.find((v) => v.availableForSale);

  if (!firstVariant) {
    return (
      <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--moa-surface-elevated)] border border-[var(--moa-border)]">
        <Thumbnail product={product} />
        <ProductInfo product={product} />
        <span className="shrink-0 text-xs text-[var(--moa-text-tertiary)]">
          Sold out
        </span>
      </div>
    );
  }

  const lines: OptimisticCartLineInput[] = [
    {merchandiseId: firstVariant.id, quantity: 1},
  ];

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--moa-surface-elevated)] border border-[var(--moa-border)]">
      <Thumbnail product={product} />
      <ProductInfo product={product} />
      <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
        {(fetcher: FetcherWithComponents<unknown>) => (
          <AddButton fetcher={fetcher} />
        )}
      </CartForm>
    </div>
  );
}

function Thumbnail({product}: {product: Product}) {
  return product.image_url ? (
    <img
      src={product.image_url}
      alt={product.title}
      className="w-12 h-12 rounded-md object-cover shrink-0"
    />
  ) : (
    <div className="w-12 h-12 rounded-md bg-[var(--moa-surface)] shrink-0" />
  );
}

function ProductInfo({product}: {product: Product}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-[var(--moa-text)] truncate leading-tight">
        {product.title}
      </p>
      <p className="text-xs text-[var(--moa-text-secondary)] font-[var(--font-mono)]">
        {product.price}
      </p>
    </div>
  );
}

function AddButton({fetcher}: {fetcher: FetcherWithComponents<unknown>}) {
  const [showCheck, setShowCheck] = useState(false);
  const isAdding = fetcher.state !== 'idle';

  // When fetcher completes (idle after submitting), show checkmark + open cart
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setShowCheck(true);
      window.dispatchEvent(new CustomEvent('cart:item-added'));
      const timer = setTimeout(() => setShowCheck(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <button
      type="submit"
      disabled={isAdding}
      className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
        showCheck
          ? 'bg-[var(--moa-accent)] text-[var(--moa-bg)]'
          : 'bg-[var(--moa-surface)] text-[var(--moa-text)] border border-[var(--moa-border)] hover:border-[var(--moa-accent)] hover:text-[var(--moa-accent)]'
      }`}
    >
      {isAdding ? '...' : showCheck ? '✓' : 'Add'}
    </button>
  );
}
