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
  imageUrl,
}: CuratedHeaderProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const checkComplete = useCallback(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, []);

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    const id = requestAnimationFrame(checkComplete);
    return () => cancelAnimationFrame(id);
  }, [imageUrl, checkComplete]);

  if (!imageUrl || imageError) {
    return (
      <section id="curated-products" className="py-12 md:py-16 px-6 md:px-8 text-center bg-[var(--moa-bg)]">
        <h2 className="font-[var(--font-heading)] text-2xl md:text-[1.75rem] font-normal m-0 mb-2 text-[var(--moa-text)] tracking-[0.02em] italic">
          {title}
        </h2>
        {subtitle && (
          <p className="font-[var(--font-body)] text-base text-[var(--moa-text-secondary)] m-0 max-w-[400px] mx-auto">
            {subtitle}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      id="curated-products"
      className="relative overflow-hidden py-16 md:py-24 px-6 md:px-8 text-center bg-[var(--moa-bg)]"
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

      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0 transition-opacity duration-700 ease-in-out"
        style={{
          opacity: imageLoaded ? 1 : 0,
          background: 'linear-gradient(to bottom, rgba(8, 12, 10, 0.7) 0%, rgba(8, 12, 10, 0.5) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <h2
          className="font-[var(--font-heading)] text-2xl md:text-[1.75rem] font-normal m-0 mb-2 tracking-[0.02em] italic text-[var(--moa-text)] transition-all duration-700"
          style={{textShadow: imageLoaded ? '0 1px 4px rgba(0,0,0,0.5)' : 'none'}}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="font-[var(--font-body)] text-base m-0 max-w-[400px] mx-auto text-[var(--moa-text-secondary)] transition-all duration-700"
            style={{textShadow: imageLoaded ? '0 1px 3px rgba(0,0,0,0.4)' : 'none'}}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
