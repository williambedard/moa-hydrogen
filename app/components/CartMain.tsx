import {useOptimisticCart} from '@shopify/hydrogen';
import {Link} from 'react-router';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem} from '~/components/CartLineItem';
import {CartSummary} from './CartSummary';

export type CartLayout = 'page' | 'aside';

export type CartMainProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

/**
 * The main cart component that displays the cart items and summary.
 * It is used by both the /cart route and the cart aside dialog.
 */
export function CartMain({layout, cart: originalCart}: CartMainProps) {
  const cart = useOptimisticCart(originalCart);

  const linesCount = Boolean(cart?.lines?.nodes?.length || 0);
  const cartHasItems = cart?.totalQuantity ? cart.totalQuantity > 0 : false;

  return (
    <div>
      <CartEmpty hidden={linesCount} layout={layout} />
      <div>
        <div aria-labelledby="cart-lines">
          <ul className="list-none p-0 m-0">
            {(cart?.lines?.nodes ?? []).map((line) => (
              <CartLineItem key={line.id} line={line} layout={layout} />
            ))}
          </ul>
        </div>
        {cartHasItems && <CartSummary cart={cart} layout={layout} />}
      </div>
    </div>
  );
}

function CartEmpty({
  hidden = false,
}: {
  hidden: boolean;
  layout?: CartMainProps['layout'];
}) {
  const {close} = useAside();
  return (
    <div hidden={hidden} className="flex flex-col items-center justify-center py-12 text-center">
      <p className="font-[var(--font-body)] text-sm text-[var(--moa-text-secondary)] mb-4">
        Your cart is empty
      </p>
      <Link
        to="/collections/all"
        onClick={close}
        prefetch="viewport"
        className="font-[var(--font-body)] text-sm text-[var(--moa-accent)] hover:text-[var(--moa-accent-dim)] transition-colors"
      >
        Continue shopping &rarr;
      </Link>
    </div>
  );
}
