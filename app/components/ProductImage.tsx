import type {ProductVariantFragment} from 'storefrontapi.generated';
import {Image} from '@shopify/hydrogen';

export function ProductImage({
  image,
}: {
  image: ProductVariantFragment['image'];
}) {
  if (!image) {
    return (
      <div className="aspect-square rounded-xl bg-[var(--moa-surface-elevated)]" />
    );
  }
  return (
    <div className="aspect-square rounded-xl overflow-hidden bg-[var(--moa-surface-elevated)]">
      <Image
        alt={image.altText || 'Product Image'}
        aspectRatio="1/1"
        data={image}
        key={image.id}
        sizes="(min-width: 45em) 50vw, 100vw"
        className="w-full h-full object-cover"
      />
    </div>
  );
}
