import {motion, AnimatePresence} from 'framer-motion';
import {useEffect} from 'react';
import {CartForm, useOptimisticCart, type OptimisticCartLine} from '@shopify/hydrogen';
import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

type CartLine = OptimisticCartLine<CartApiQueryFragment>;

interface SlideOutCartProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartApiQueryFragment | null;
}

export function SlideOutCart({
  isOpen,
  onClose,
  cart: originalCart,
}: SlideOutCartProps) {
  const cart = useOptimisticCart(originalCart);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const lines = (cart?.lines?.nodes ?? []) as CartLine[];
  const total = cart?.cost?.totalAmount?.amount
    ? `${cart.cost.totalAmount.currencyCode} ${parseFloat(cart.cost.totalAmount.amount).toFixed(2)}`
    : '$0.00';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-[120]"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.2}}
            onClick={onClose}
          />

          {/* Cart Panel */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-[var(--moa-surface-elevated)] z-[121] shadow-[-4px_0_20px_rgba(0,0,0,0.3)] flex flex-col border-l border-[var(--moa-border)]"
            initial={{x: '100%'}}
            animate={{x: 0}}
            exit={{x: '100%'}}
            transition={{type: 'spring', damping: 25, stiffness: 300}}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--moa-border)]">
              <h2 className="font-[var(--font-heading)] text-xl font-normal text-[var(--moa-text)] italic">
                Your Cart
              </h2>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center text-[var(--moa-text-tertiary)] hover:text-[var(--moa-text-secondary)] transition-colors"
                aria-label="Close cart"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <svg className="w-16 h-16 text-[var(--moa-text-tertiary)] mb-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M6 6H4L2 20H22L20 6H18M6 6V4C6 2.89543 6.89543 2 8 2H16C17.1046 2 18 2.89543 18 4V6M6 6H18"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="font-[var(--font-heading)] text-lg italic text-[var(--moa-text-tertiary)]">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-[var(--moa-text-tertiary)] mt-2">
                    Ask MOA to help you build a stack
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lines.map((line) => (
                    <SlideOutCartLine key={line.id} line={line} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--moa-border)] px-6 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--moa-text)]">Subtotal</span>
                <span className="font-[var(--font-mono)] text-[var(--moa-text)]">{total}</span>
              </div>
              {cart?.checkoutUrl ? (
                <a
                  href={cart.checkoutUrl}
                  className="block w-full py-3 bg-[var(--moa-accent)] text-[var(--moa-bg)] font-medium rounded-full hover:bg-[var(--moa-accent-dim)] transition-colors text-center"
                >
                  Checkout
                </a>
              ) : (
                <button
                  className="w-full py-3 bg-[var(--moa-accent)] text-[var(--moa-bg)] font-medium rounded-full hover:bg-[var(--moa-accent-dim)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled
                >
                  Checkout
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 text-[var(--moa-text-secondary)] font-medium hover:text-[var(--moa-text)] transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SlideOutCartLine({line}: {line: CartLine}) {
  const {id: lineId, quantity, merchandise, isOptimistic} = line;
  const {product, title, image, price} = merchandise;
  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));
  const formattedPrice = price?.amount
    ? `${price.currencyCode} ${parseFloat(price.amount).toFixed(2)}`
    : '';
  const variantTitle = title !== 'Default Title' ? title : undefined;

  return (
    <div className="flex gap-4 py-4 border-b border-[var(--moa-border)]">
      {image && (
        <img
          src={image.url}
          alt={image.altText ?? product.title}
          className="w-20 h-24 object-cover rounded-lg border border-[var(--moa-border)]"
        />
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-[var(--moa-text)] text-sm truncate">
          {product.title}
        </h3>
        {variantTitle && (
          <p className="text-xs text-[var(--moa-text-tertiary)] mt-0.5">{variantTitle}</p>
        )}
        <p className="text-sm text-[var(--moa-text-secondary)] font-[var(--font-mono)] mt-1">{formattedPrice}</p>
        <div className="flex items-center gap-2 mt-2">
          <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1 || !!isOptimistic}
              className="w-7 h-7 flex items-center justify-center border border-[var(--moa-border)] rounded text-[var(--moa-text-secondary)] hover:bg-[var(--moa-surface)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              -
            </button>
          </CartLineUpdateButton>
          <span className="text-sm w-8 text-center text-[var(--moa-text)] font-[var(--font-mono)]">{quantity}</span>
          <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
            <button
              aria-label="Increase quantity"
              disabled={!!isOptimistic}
              className="w-7 h-7 flex items-center justify-center border border-[var(--moa-border)] rounded text-[var(--moa-text-secondary)] hover:bg-[var(--moa-surface)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              +
            </button>
          </CartLineUpdateButton>
          <CartLineRemoveButton lineIds={[lineId]} disabled={!!isOptimistic} />
        </div>
      </div>
    </div>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        disabled={disabled}
        type="submit"
        aria-label="Remove item"
        className="ml-auto text-xs text-[var(--moa-text-tertiary)] hover:text-[var(--moa-error)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Remove
      </button>
    </CartForm>
  );
}

function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
