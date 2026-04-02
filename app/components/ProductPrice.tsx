import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';

export function ProductPrice({
  price,
  compareAtPrice,
}: {
  price?: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
}) {
  return (
    <div className="font-[var(--font-mono)] text-lg text-[var(--moa-accent)]">
      {compareAtPrice ? (
        <div className="flex items-center gap-3">
          {price ? <Money data={price} /> : null}
          <s className="text-[var(--moa-text-tertiary)] text-base">
            <Money data={compareAtPrice} />
          </s>
        </div>
      ) : price ? (
        <Money data={price} />
      ) : (
        <span>&nbsp;</span>
      )}
    </div>
  );
}
