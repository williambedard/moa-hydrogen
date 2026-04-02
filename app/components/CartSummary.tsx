import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useRef} from 'react';
import {useFetcher} from 'react-router';
import type {FetcherWithComponents} from 'react-router';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({cart, layout}: CartSummaryProps) {
  return (
    <div
      aria-labelledby="cart-summary"
      className={`pt-4 border-t border-[var(--moa-border)] ${
        layout === 'page' ? 'max-w-md' : ''
      }`}
    >
      <dl className="flex items-center justify-between mb-4">
        <dt className="font-[var(--font-body)] text-sm text-[var(--moa-text-secondary)]">
          Subtotal
        </dt>
        <dd className="font-[var(--font-mono)] text-base text-[var(--moa-accent)]">
          {cart?.cost?.subtotalAmount?.amount ? (
            <Money data={cart?.cost?.subtotalAmount} />
          ) : (
            '-'
          )}
        </dd>
      </dl>
      <CartDiscounts discountCodes={cart?.discountCodes} />
      <CartGiftCard giftCardCodes={cart?.appliedGiftCards} />
      <CartCheckoutActions checkoutUrl={cart?.checkoutUrl} />
    </div>
  );
}

function CartCheckoutActions({checkoutUrl}: {checkoutUrl?: string}) {
  if (!checkoutUrl) return null;

  return (
    <div className="mt-4">
      <a
        href={checkoutUrl}
        target="_self"
        className="block w-full py-3 px-6 rounded-lg font-[var(--font-body)] text-sm font-medium tracking-wide uppercase text-center transition-all duration-200 bg-[var(--moa-accent)] text-[var(--moa-bg)] hover:bg-[var(--moa-accent-dim)]"
      >
        Continue to Checkout &rarr;
      </a>
    </div>
  );
}

function CartDiscounts({
  discountCodes,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
}) {
  const codes: string[] =
    discountCodes
      ?.filter((discount) => discount.applicable)
      ?.map(({code}) => code) || [];

  return (
    <div className="space-y-2">
      <dl hidden={!codes.length}>
        <div className="flex items-center gap-2">
          <dt className="font-[var(--font-body)] text-xs text-[var(--moa-text-secondary)]">Discount:</dt>
          <UpdateDiscountForm>
            <div className="flex items-center gap-2">
              <code className="font-[var(--font-mono)] text-xs text-[var(--moa-accent)]">{codes?.join(', ')}</code>
              <button className="font-[var(--font-body)] text-xs text-[var(--moa-text-tertiary)] hover:text-[var(--moa-error)] transition-colors">
                Remove
              </button>
            </div>
          </UpdateDiscountForm>
        </div>
      </dl>
      <UpdateDiscountForm discountCodes={codes}>
        <div className="flex gap-2">
          <input
            type="text"
            name="discountCode"
            placeholder="Discount code"
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--moa-surface-elevated)] border border-[var(--moa-border)] font-[var(--font-body)] text-xs text-[var(--moa-text)] placeholder:text-[var(--moa-text-tertiary)] focus:outline-none focus:border-[var(--moa-accent)]"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg border border-[var(--moa-border)] font-[var(--font-body)] text-xs text-[var(--moa-text-secondary)] hover:border-[var(--moa-accent)] hover:text-[var(--moa-accent)] transition-colors"
          >
            Apply
          </button>
        </div>
      </UpdateDiscountForm>
    </div>
  );
}

function UpdateDiscountForm({
  discountCodes,
  children,
}: {
  discountCodes?: string[];
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{
        discountCodes: discountCodes || [],
      }}
    >
      {children}
    </CartForm>
  );
}

function CartGiftCard({
  giftCardCodes,
}: {
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
}) {
  const appliedGiftCardCodes = useRef<string[]>([]);
  const giftCardCodeInput = useRef<HTMLInputElement>(null);
  const giftCardAddFetcher = useFetcher({key: 'gift-card-add'});

  // Clear the gift card code input after the gift card is added
  useEffect(() => {
    if (giftCardAddFetcher.data) {
      giftCardCodeInput.current!.value = '';
    }
  }, [giftCardAddFetcher.data]);

  function saveAppliedCode(code: string) {
    const formattedCode = code.replace(/\s/g, ''); // Remove spaces
    if (!appliedGiftCardCodes.current.includes(formattedCode)) {
      appliedGiftCardCodes.current.push(formattedCode);
    }
  }

  return (
    <div className="space-y-2">
      {giftCardCodes && giftCardCodes.length > 0 && (
        <dl className="space-y-1">
          <dt className="font-[var(--font-body)] text-xs text-[var(--moa-text-secondary)]">Gift Card(s)</dt>
          {giftCardCodes.map((giftCard) => (
            <RemoveGiftCardForm key={giftCard.id} giftCardId={giftCard.id}>
              <div className="flex items-center gap-2">
                <code className="font-[var(--font-mono)] text-xs text-[var(--moa-accent)]">***{giftCard.lastCharacters}</code>
                <span className="font-[var(--font-mono)] text-xs text-[var(--moa-text-secondary)]">
                  <Money data={giftCard.amountUsed} />
                </span>
                <button type="submit" className="font-[var(--font-body)] text-xs text-[var(--moa-text-tertiary)] hover:text-[var(--moa-error)] transition-colors">
                  Remove
                </button>
              </div>
            </RemoveGiftCardForm>
          ))}
        </dl>
      )}
      <UpdateGiftCardForm
        giftCardCodes={appliedGiftCardCodes.current}
        saveAppliedCode={saveAppliedCode}
        fetcherKey="gift-card-add"
      >
        <div className="flex gap-2">
          <input
            type="text"
            name="giftCardCode"
            placeholder="Gift card code"
            ref={giftCardCodeInput}
            className="flex-1 px-3 py-2 rounded-lg bg-[var(--moa-surface-elevated)] border border-[var(--moa-border)] font-[var(--font-body)] text-xs text-[var(--moa-text)] placeholder:text-[var(--moa-text-tertiary)] focus:outline-none focus:border-[var(--moa-accent)]"
          />
          <button
            type="submit"
            disabled={giftCardAddFetcher.state !== 'idle'}
            className="px-4 py-2 rounded-lg border border-[var(--moa-border)] font-[var(--font-body)] text-xs text-[var(--moa-text-secondary)] hover:border-[var(--moa-accent)] hover:text-[var(--moa-accent)] transition-colors disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </UpdateGiftCardForm>
    </div>
  );
}

function UpdateGiftCardForm({
  giftCardCodes,
  saveAppliedCode,
  fetcherKey,
  children,
}: {
  giftCardCodes?: string[];
  saveAppliedCode?: (code: string) => void;
  fetcherKey?: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm
      fetcherKey={fetcherKey}
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesUpdate}
      inputs={{
        giftCardCodes: giftCardCodes || [],
      }}
    >
      {(fetcher: FetcherWithComponents<any>) => {
        const code = fetcher.formData?.get('giftCardCode');
        if (code && saveAppliedCode) {
          saveAppliedCode(code as string);
        }
        return children;
      }}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  children,
}: {
  giftCardId: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{
        giftCardCodes: [giftCardId],
      }}
    >
      {children}
    </CartForm>
  );
}
