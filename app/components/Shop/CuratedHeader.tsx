import {useState, useEffect, useRef, useCallback} from 'react';

interface CuratedHeaderProps {
  title: string;
  subtitle?: string;
  showFlourish?: boolean;
  imageUrl?: string;
}

export function CuratedHeader({
  title,
  subtitle,
  showFlourish = true,
  imageUrl,
}: CuratedHeaderProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check if image is already complete (e.g. data URL decoded synchronously or cached)
  const checkComplete = useCallback(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, []);

  // Reset load/error state when imageUrl changes
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    // After state reset, check if the new image is already decoded
    // Use rAF to check after the browser has had a chance to process the src
    const id = requestAnimationFrame(checkComplete);
    return () => cancelAnimationFrame(id);
  }, [imageUrl, checkComplete]);

  if (!imageUrl || imageError) {
    return (
      <section id="curated-products" className="py-12 md:py-16 px-6 md:px-8 text-center bg-[#e9e5e0]">
        {showFlourish && (
          <div className="w-[60px] mx-auto mb-4 text-[#6b6560] opacity-60">
            <svg viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
              <path
                d="M0 10C10 10 10 5 20 5C30 5 30 15 40 15C50 15 50 10 60 10"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
              />
            </svg>
          </div>
        )}
        <h2 className="font-[Cormorant_Garamond,Georgia,serif] text-2xl md:text-[1.75rem] font-normal m-0 mb-2 text-[#3d3a36] tracking-[0.02em]">
          {title}
        </h2>
        {subtitle && (
          <p className="font-[Cormorant_Garamond,Georgia,serif] text-base md:text-lg font-normal italic text-[#6b6560] m-0 max-w-[400px] mx-auto">
            {subtitle}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      id="curated-products"
      className="relative overflow-hidden py-16 md:py-24 px-6 md:px-8 text-center bg-[#e9e5e0]"
    >
      {/* Background image */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
        style={{opacity: imageLoaded ? 1 : 0}}
      />

      {/* Gradient overlay for text readability */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out"
        style={{
          opacity: imageLoaded ? 1 : 0,
          background: 'linear-gradient(to bottom, rgba(233, 229, 224, 0.65) 0%, rgba(61, 58, 54, 0.45) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {showFlourish && (
          <div className="w-[60px] mx-auto mb-4 text-[#6b6560] opacity-60">
            <svg viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
              <path
                d="M0 10C10 10 10 5 20 5C30 5 30 15 40 15C50 15 50 10 60 10"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
              />
            </svg>
          </div>
        )}
        <h2
          className="font-[Cormorant_Garamond,Georgia,serif] text-2xl md:text-[1.75rem] font-normal m-0 mb-2 tracking-[0.02em] transition-colors duration-700"
          style={{color: imageLoaded ? '#ffffff' : '#3d3a36', textShadow: imageLoaded ? '0 1px 4px rgba(0,0,0,0.3)' : 'none'}}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="font-[Cormorant_Garamond,Georgia,serif] text-base md:text-lg font-normal italic m-0 max-w-[400px] mx-auto transition-colors duration-700"
            style={{color: imageLoaded ? 'rgba(255,255,255,0.9)' : '#6b6560', textShadow: imageLoaded ? '0 1px 3px rgba(0,0,0,0.25)' : 'none'}}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
