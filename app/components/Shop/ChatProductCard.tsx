import {useState} from 'react';
import {useFetcher} from 'react-router';
import {CartForm} from '@shopify/hydrogen';
import type {Product} from './ProductCard';

interface ChatProductCardProps {
  product: Product;
}

/**
 * Compact product card for inside chat bubbles.
 * Shows thumbnail, title, price, and a quick-add button.
 */
export function ChatProductCard({product}: ChatProductCardProps) {
  const fetcher = useFetcher();
  const [added, setAdded] = useState(false);

  const isAdding = fetcher.state !== 'idle';
  const firstVariant = product.variants?.find((v) => v.availableForSale);

  const handleAdd = () => {
    if (!firstVariant || isAdding || added) return;

    const formData = new FormData();
    formData.append(
      CartForm.INPUT_NAME,
      JSON.stringify({
        action: CartForm.ACTIONS.LinesAdd,
        inputs: {
          lines: [{merchandiseId: firstVariant.id, quantity: 1}],
        },
      }),
    );

    fetcher.submit(formData, {method: 'POST', action: '/cart'});
    setAdded(true);

    // Reset after 2s so the user can add again
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--moa-surface-elevated)] border border-[var(--moa-border)]">
      {/* Thumbnail */}
      {product.image_url ? (
        <img
          src={product.image_url}
          alt={product.title}
          className="w-12 h-12 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-[var(--moa-surface)] shrink-0" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--moa-text)] truncate leading-tight">
          {product.title}
        </p>
        <p className="text-xs text-[var(--moa-text-secondary)] font-[var(--font-mono)]">
          {product.price}
        </p>
      </div>

      {/* Add button */}
      {firstVariant && product.availableForSale ? (
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding}
          className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            added
              ? 'bg-[var(--moa-accent)] text-[var(--moa-bg)]'
              : 'bg-[var(--moa-surface)] text-[var(--moa-text)] border border-[var(--moa-border)] hover:border-[var(--moa-accent)] hover:text-[var(--moa-accent)]'
          }`}
        >
          {isAdding ? '...' : added ? '✓' : 'Add'}
        </button>
      ) : (
        <span className="shrink-0 text-xs text-[var(--moa-text-tertiary)]">
          Sold out
        </span>
      )}
    </div>
  );
}
