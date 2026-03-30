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
      className="block text-left relative appearance-none border-none bg-none p-0 cursor-pointer group focus:outline-2 focus:outline-[#8b7355] focus:outline-offset-4"
      onClick={handleClick}
      type="button"
      aria-label={`View ${product.title}`}
    >
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-white">
        {product.image_url ? (
          <img
            alt={product.title}
            src={product.image_url}
            loading={loading}
            className="w-full h-full object-cover object-top rounded-none transition-transform duration-500 ease-out group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#ddd8d2] to-[#e9e5e0]" />
        )}
        {!product.availableForSale && (
          <span className="absolute bottom-6 left-6 py-2 px-4 text-[0.65rem] font-medium uppercase tracking-[0.15em] bg-[rgba(44,40,37,0.85)] text-[#e9e5e0] backdrop-blur-[4px]">
            Sold out
          </span>
        )}
      </div>
      <div className="absolute bottom-4 left-4 right-4 py-3 px-4 bg-white rounded-lg">
        <h4 className="m-0 mb-1 font-[Cormorant_Garamond,Georgia,serif] text-base font-medium text-[#3d3a36] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
          {product.title}
        </h4>
        <span className="text-[0.8rem] text-[#6b6560] font-normal tracking-[0.05em]">
          {product.price}
        </span>
      </div>
    </button>
  );
}
