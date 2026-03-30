import {useRef, useEffect} from 'react';
import type {Product} from './ProductCard';

interface ProductDetailProps {
  product: Product;
  selectedColorIndex: number;
  onClose: () => void;
}

export function ProductDetail({
  product,
  selectedColorIndex,
  onClose,
}: ProductDetailProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Get images for the selected color variant, or fall back to all images
  const getImagesForColor = () => {
    if (product.variants && product.variants[selectedColorIndex]?.image) {
      const variantImage = product.variants[selectedColorIndex].image;
      if (variantImage) {
        return [variantImage.url, ...product.images.filter(img => img !== variantImage.url)];
      }
    }
    return product.images.length > 0 ? product.images : [product.image_url].filter(Boolean) as string[];
  };

  const images = getImagesForColor();

  // Scroll into view when mounted
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#e9e5e0] relative animate-[fadeIn_0.4s_ease-out]">
      <button
        className="fixed top-20 left-4 flex items-center gap-2 py-2 px-4 bg-white border-none rounded-full font-[Cormorant_Garamond,Georgia,serif] text-sm text-[#3d3a36] cursor-pointer z-10 shadow-[0_2px_10px_rgba(0,0,0,0.1)] transition-all duration-200 hover:-translate-x-0.5 hover:shadow-[0_4px_15px_rgba(0,0,0,0.15)]"
        onClick={onClose}
        type="button"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M19 12H5M5 12L12 19M5 12L12 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Back</span>
      </button>

      <div className="w-full overflow-x-auto overflow-y-hidden scrollbar-none scroll-snap-x scroll-smooth">
        <div className="flex min-h-screen">
          {images.map((imageUrl, index) => (
            <div
              key={index}
              className="flex-none w-full md:w-1/2 min-w-[300px] h-screen scroll-snap-start"
            >
              <img
                src={imageUrl}
                alt={`${product.title} - Image ${index + 1}`}
                className="w-full h-full object-cover object-top"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
