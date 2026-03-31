export interface ProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: string;
  compareAtPrice?: string;
  selectedOptions: Array<{name: string; value: string}>;
  image?: {
    url: string;
    altText?: string;
  };
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface Product {
  id: string;
  handle: string;
  title: string;
  description: string;
  url: string;
  price: string;
  compareAtPrice?: string;
  image_url?: string;
  images: string[];
  vendor?: string;
  productType?: string;
  tags: string[];
  availableForSale: boolean;
  variants?: ProductVariant[];
  options?: ProductOption[];
}

interface ProductCardProps {
  product: Product;
  loading?: 'eager' | 'lazy';
  onSelect?: (product: Product) => void;
}

export function ProductCard({
  product,
  loading = 'lazy',
  onSelect,
}: ProductCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      e.preventDefault();
      onSelect(product);
    }
  };

  return (
    <button
      className="block text-left relative appearance-none border-none bg-none p-0 cursor-pointer group focus:outline-2 focus:outline-[var(--moa-accent)] focus:outline-offset-4 rounded-lg"
      onClick={handleClick}
      type="button"
      aria-label={`View ${product.title}`}
    >
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-[var(--moa-surface)] rounded-lg border border-[var(--moa-border)] transition-shadow duration-300 group-hover:shadow-[0_0_20px_var(--moa-accent-glow)]">
        {product.image_url ? (
          <img
            alt={product.title}
            src={product.image_url}
            loading={loading}
            className="w-full h-full object-cover object-top rounded-lg transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--moa-surface)] to-[var(--moa-surface-elevated)]" />
        )}
        {!product.availableForSale && (
          <span className="absolute bottom-6 left-6 py-2 px-4 text-[0.65rem] font-medium uppercase tracking-[0.15em] bg-[var(--moa-accent-dim)] text-[var(--moa-bg)] backdrop-blur-[4px] rounded">
            Sold out
          </span>
        )}
      </div>
      <div className="mt-3 px-1">
        <h4 className="m-0 mb-1 font-[var(--font-body)] text-sm font-medium text-[var(--moa-text)] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {product.title}
        </h4>
        <span className="text-[0.8rem] text-[var(--moa-text-secondary)] font-[var(--font-mono)] tracking-[0.02em]">
          {product.price}
        </span>
      </div>
    </button>
  );
}
