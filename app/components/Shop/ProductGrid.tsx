import {ProductCard, type Product} from './ProductCard';

interface ProductGridProps {
  products: Product[];
  onSelectProduct?: (product: Product) => void;
}

export function ProductGrid({products, onSelectProduct}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-24 px-8 text-[var(--moa-text-secondary)] font-[var(--font-body)] text-base min-h-[50vh] flex items-center justify-center">
        <p>No products found. Try a different search.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-8 px-4 py-6">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            loading={index < 4 ? 'eager' : 'lazy'}
            onSelect={onSelectProduct}
          />
        ))}
      </div>
    </div>
  );
}
