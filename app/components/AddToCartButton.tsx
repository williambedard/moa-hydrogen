import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';

export function AddToCartButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
}) {
  return (
    <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<any>) => (
        <>
          <input
            name="analytics"
            type="hidden"
            value={JSON.stringify(analytics)}
          />
          <button
            type="submit"
            onClick={onClick}
            disabled={disabled ?? fetcher.state !== 'idle'}
            className="w-full py-3 px-6 rounded-lg font-[var(--font-body)] text-sm font-medium tracking-wide uppercase transition-all duration-200 bg-[var(--moa-accent)] text-[var(--moa-bg)] hover:bg-[var(--moa-accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {children}
          </button>
        </>
      )}
    </CartForm>
  );
}
