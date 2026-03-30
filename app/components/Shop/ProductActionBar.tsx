import {useState} from 'react';
import type {Product, ProductVariant} from './ProductCard';

type ActionBarMode = 'default' | 'colors' | 'sizes';

interface ProductActionBarProps {
  product: Product;
  selectedVariant: ProductVariant | null;
  onSelectColor: (colorIndex: number) => void;
  onSelectSize: (size: string) => void;
  onAddToCart: () => void;
  onClose: () => void;
  selectedColorIndex: number;
  selectedSize: string | null;
}

export function ProductActionBar({
  product,
  selectedVariant,
  onSelectColor,
  onSelectSize,
  onAddToCart,
  onClose,
  selectedColorIndex,
  selectedSize,
}: ProductActionBarProps) {
  const [mode, setMode] = useState<ActionBarMode>('default');

  // Get color options
  const colorOption = product.options?.find(
    (opt) => opt.name.toLowerCase() === 'color' || opt.name.toLowerCase() === 'colour',
  );
  const colors = colorOption?.values || [];

  // Get size options
  const sizeOption = product.options?.find(
    (opt) => opt.name.toLowerCase() === 'size',
  );
  const sizes = sizeOption?.values || [];

  // Get current color name
  const currentColor = colors[selectedColorIndex] || '';

  // Get variant images for color swatches
  const getColorVariantImage = (colorIndex: number) => {
    if (!product.variants) return product.image_url;
    const colorValue = colors[colorIndex];
    const variant = product.variants.find((v) =>
      v.selectedOptions.some(
        (opt) =>
          (opt.name.toLowerCase() === 'color' || opt.name.toLowerCase() === 'colour') &&
          opt.value === colorValue,
      ),
    );
    return variant?.image?.url || product.image_url;
  };

  const handleBackToDefault = () => {
    setMode('default');
  };

  // Shared wrapper component for the gradient border
  const ActionBarWrapper = ({children, expanded = false}: {children: React.ReactNode; expanded?: boolean}) => (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] z-50 ${expanded ? 'max-w-[700px]' : 'max-w-[600px]'}`}>
      {/* Soft glow effect */}
      <div
        className="absolute inset-0 rounded-[20px] blur-2xl opacity-40 -z-10"
        style={{
          background: 'linear-gradient(90deg, #fdd, #e8d5f0, #dde8fd)',
        }}
      />

      {/* Outer gradient border */}
      <div
        className="rounded-[20px] p-[1px]"
        style={{
          background: 'linear-gradient(90deg, #f4c4ce, #d8c4e8, #c4d4f4, #f4c4ce)',
          backgroundSize: '300% 100%',
          animation: 'gradientRotate 6s linear infinite',
        }}
      >
        {/* White inner container */}
        <div className="bg-white rounded-[19px] p-4">
          {children}
        </div>
      </div>
    </div>
  );

  if (mode === 'colors') {
    return (
      <ActionBarWrapper expanded>
        <div className="flex items-center gap-4">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            onClick={handleBackToDefault}
            type="button"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19 12H5M5 12L12 19M5 12L12 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex gap-3 overflow-x-auto py-1 flex-1">
            {colors.map((color, index) => (
              <button
                key={color}
                className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all shrink-0 ${
                  index === selectedColorIndex
                    ? 'border-gray-800 bg-gray-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
                onClick={() => {
                  onSelectColor(index);
                  setMode('default');
                }}
                type="button"
                aria-label={`Select ${color}`}
              >
                <img
                  src={getColorVariantImage(index)}
                  alt={color}
                  className="w-16 h-20 object-cover rounded-lg"
                />
                <span className="text-xs text-gray-600">{color}</span>
              </button>
            ))}
          </div>
        </div>
      </ActionBarWrapper>
    );
  }

  if (mode === 'sizes') {
    return (
      <ActionBarWrapper expanded>
        <div className="flex items-center gap-4">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors shrink-0"
            onClick={handleBackToDefault}
            type="button"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19 12H5M5 12L12 19M5 12L12 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex-1 text-center">
            <span className="text-sm text-gray-500 block mb-3">Select your size</span>
            <div className="flex gap-2 justify-center flex-wrap">
              {sizes.map((size) => (
                <button
                  key={size}
                  className={`w-11 h-11 flex items-center justify-center rounded-full border text-sm transition-all ${
                    size === selectedSize
                      ? 'border-gray-800 bg-gray-800 text-white'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                  onClick={() => {
                    onSelectSize(size);
                    setMode('default');
                  }}
                  type="button"
                  aria-label={`Select size ${size}`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ActionBarWrapper>
    );
  }

  // Default mode
  return (
    <ActionBarWrapper>
      <div className="flex items-center gap-3 mb-3">
        <img
          src={product.image_url}
          alt={product.title}
          className="w-14 h-[70px] object-cover rounded-lg shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-800 truncate">{product.title}</h3>
          <span className="text-sm text-gray-600">{selectedVariant?.price || product.price}</span>
          {currentColor && colors.length > 1 && (
            <span className="text-xs text-gray-400 block mt-0.5">
              {currentColor} · {colors.length} colors
            </span>
          )}
        </div>
        <button
          className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          type="button"
          aria-label="Add to favorites"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="px-5 py-2.5 bg-gray-800 text-white text-sm font-medium rounded-full hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onAddToCart}
          type="button"
          disabled={!selectedSize && sizes.length > 0}
        >
          Add to cart
        </button>

        {colors.length > 1 && (
          <button
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
            onClick={() => setMode('colors')}
            type="button"
          >
            Colors
          </button>
        )}

        {sizes.length > 0 && (
          <button
            className="px-4 py-2.5 bg-gray-100 text-gray-700 text-sm rounded-full hover:bg-gray-200 transition-colors"
            onClick={() => setMode('sizes')}
            type="button"
          >
            {selectedSize ? `Size: ${selectedSize}` : 'Size'}
          </button>
        )}

        <button
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors ml-auto"
          onClick={onClose}
          type="button"
          aria-label="Close"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </ActionBarWrapper>
  );
}
