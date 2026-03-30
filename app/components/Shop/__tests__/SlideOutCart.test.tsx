/**
 * Tests for SlideOutCart component.
 * Verifies rendering, quantity controls, remove functionality, and edge cases.
 *
 * The component uses CartForm (from @shopify/hydrogen) for
 * quantity updates and line removal, matching the pattern in CartLineItem.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {SlideOutCart} from '../SlideOutCart';

// --- Mock CartForm from @shopify/hydrogen ---
// CartForm wraps children in a <form> and injects hidden inputs.
// We mock it so tests can run without the full Hydrogen/Router context.
vi.mock('@shopify/hydrogen', () => {
  const ACTIONS = {
    LinesUpdate: 'LinesUpdate',
    LinesRemove: 'LinesRemove',
  };

  function CartForm({
    children,
    action,
    inputs,
  }: {
    children: React.ReactNode;
    action: string;
    inputs: Record<string, unknown>;
    route?: string;
    fetcherKey?: string;
  }) {
    return (
      <form data-testid={`cart-form-${action}`} data-action={action} data-inputs={JSON.stringify(inputs)}>
        {typeof children === 'function' ? (children as (fetcher: null) => React.ReactNode)(null) : children}
      </form>
    );
  }

  CartForm.ACTIONS = ACTIONS;

  return {
    CartForm,
    useOptimisticCart: (cart: unknown) => cart,
    Image: ({alt, ...props}: {alt: string; [key: string]: unknown}) => (
      <img alt={alt} {...props} />
    ),
  };
});

// --- Mock framer-motion to avoid animation complexity in tests ---
vi.mock('framer-motion', () => ({
  motion: {
    div: ({children, ...props}: {children?: React.ReactNode; [key: string]: unknown}) => {
      // Filter out motion-specific props
      const htmlProps: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(props)) {
        if (!['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap'].includes(key)) {
          htmlProps[key] = val;
        }
      }
      return <div {...htmlProps}>{children}</div>;
    },
  },
  AnimatePresence: ({children}: {children: React.ReactNode}) => <>{children}</>,
}));

// --- Test fixtures ---

function makeCartLine(overrides: Partial<{
  id: string;
  title: string;
  quantity: number;
  price: string;
  image: string;
  variantTitle: string;
  merchandiseId: string;
}> = {}) {
  return {
    id: overrides.id ?? 'gid://shopify/CartLine/1',
    quantity: overrides.quantity ?? 1,
    isOptimistic: false,
    merchandise: {
      id: overrides.merchandiseId ?? 'gid://shopify/ProductVariant/1',
      availableForSale: true,
      requiresShipping: true,
      title: overrides.variantTitle ?? 'Small / Black',
      price: {amount: overrides.price ?? '29.99', currencyCode: 'GBP'},
      product: {
        title: overrides.title ?? 'Test Product',
        handle: 'test-product',
        id: 'gid://shopify/Product/1',
        vendor: 'Test Vendor',
      },
      image: overrides.image
        ? {id: 'gid://shopify/Image/1', url: overrides.image, altText: overrides.title ?? 'Test Product', width: 100, height: 100}
        : undefined,
      selectedOptions: [{name: 'Size', value: 'Small'}],
    },
    attributes: [],
    cost: {
      totalAmount: {amount: overrides.price ?? '29.99', currencyCode: 'GBP'},
      amountPerQuantity: {amount: overrides.price ?? '29.99', currencyCode: 'GBP'},
    },
  };
}

function makeCart(lines: ReturnType<typeof makeCartLine>[] = [], checkoutUrl = 'https://shop.example.com/checkout') {
  const totalAmount = lines.reduce(
    (sum, l) => sum + parseFloat(l.cost.totalAmount.amount) * l.quantity,
    0,
  );
  return {
    id: 'gid://shopify/Cart/1',
    checkoutUrl,
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    updatedAt: new Date().toISOString(),
    note: '',
    cost: {
      subtotalAmount: {amount: totalAmount.toFixed(2), currencyCode: 'GBP'},
      totalAmount: {amount: totalAmount.toFixed(2), currencyCode: 'GBP'},
    },
    lines: {nodes: lines},
    discountCodes: [],
    appliedGiftCards: [],
    buyerIdentity: {countryCode: null, email: null, phone: null},
  } as unknown as Parameters<typeof SlideOutCart>[0]['cart'];
}

const defaultOnClose = vi.fn();

// --- Tests ---

describe('SlideOutCart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore body overflow after each test
    document.body.style.overflow = '';
  });

  // ---- Basic Rendering ----

  describe('basic rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <SlideOutCart isOpen={false} onClose={defaultOnClose} cart={null} />,
      );
      expect(screen.queryByText('Your Cart')).toBeNull();
    });

    it('renders the cart panel when isOpen is true', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(screen.getByText('Your Cart')).toBeTruthy();
    });

    it('shows empty state when cart is null', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(screen.getByText('Your cart is empty')).toBeTruthy();
    });

    it('shows empty state when cart has no items', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={makeCart()} />,
      );
      expect(screen.getByText('Your cart is empty')).toBeTruthy();
    });

    it('shows empty state message for adding items', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(screen.getByText('Add items to get started')).toBeTruthy();
    });

    it('renders close button with aria-label', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      const closeButton = screen.getByLabelText('Close cart');
      expect(closeButton).toBeTruthy();
    });

    it('calls onClose when close button is clicked', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      const closeButton = screen.getByLabelText('Close cart');
      fireEvent.click(closeButton);
      expect(defaultOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose on Escape key', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      fireEvent.keyDown(window, {key: 'Escape'});
      expect(defaultOnClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Cart Items Display ----

  describe('cart items display', () => {
    it('renders item title', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({title: 'Silk Blouse'})])}
        />,
      );
      expect(screen.getByText('Silk Blouse')).toBeTruthy();
    });

    it('renders variant title when present', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({variantTitle: 'Medium / Navy'})])}
        />,
      );
      expect(screen.getByText('Medium / Navy')).toBeTruthy();
    });

    it('does not render variant title for Default Title', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({variantTitle: 'Default Title'})])}
        />,
      );
      expect(screen.queryByText('Default Title')).toBeNull();
    });

    it('renders item price', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({price: '49.99'})])}
        />,
      );
      expect(screen.getAllByText(/49\.99/).length).toBeGreaterThanOrEqual(1);
    });

    it('renders item quantity', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 3})])}
        />,
      );
      expect(screen.getByText('3')).toBeTruthy();
    });

    it('renders multiple items', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([
            makeCartLine({id: 'line-1', title: 'Silk Blouse'}),
            makeCartLine({id: 'line-2', title: 'Wool Trousers'}),
          ])}
        />,
      );
      expect(screen.getByText('Silk Blouse')).toBeTruthy();
      expect(screen.getByText('Wool Trousers')).toBeTruthy();
    });
  });

  // ---- Quantity Controls ----

  describe('quantity controls', () => {
    it('renders decrease button for each item', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 2})])}
        />,
      );
      const decreaseBtn = screen.getByLabelText(/decrease quantity/i);
      expect(decreaseBtn).toBeTruthy();
    });

    it('renders increase button for each item', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 2})])}
        />,
      );
      const increaseBtn = screen.getByLabelText(/increase quantity/i);
      expect(increaseBtn).toBeTruthy();
    });

    it('decrease button is wrapped in a CartForm for LinesUpdate', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 2})])}
        />,
      );
      const decreaseBtn = screen.getByLabelText(/decrease quantity/i);
      const form = decreaseBtn.closest('form');
      expect(form).toBeTruthy();
      expect(form!.getAttribute('data-action')).toBe('LinesUpdate');
    });

    it('increase button is wrapped in a CartForm for LinesUpdate', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 2})])}
        />,
      );
      const increaseBtn = screen.getByLabelText(/increase quantity/i);
      const form = increaseBtn.closest('form');
      expect(form).toBeTruthy();
      expect(form!.getAttribute('data-action')).toBe('LinesUpdate');
    });

    it('decrease button form sends correct quantity (current - 1)', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({id: 'line-1', quantity: 3})])}
        />,
      );
      const decreaseBtn = screen.getByLabelText(/decrease quantity/i);
      const form = decreaseBtn.closest('form');
      const inputs = JSON.parse(form!.getAttribute('data-inputs')!);
      expect(inputs.lines[0].quantity).toBe(2);
    });

    it('increase button form sends correct quantity (current + 1)', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({id: 'line-1', quantity: 3})])}
        />,
      );
      const increaseBtn = screen.getByLabelText(/increase quantity/i);
      const form = increaseBtn.closest('form');
      const inputs = JSON.parse(form!.getAttribute('data-inputs')!);
      expect(inputs.lines[0].quantity).toBe(4);
    });

    it('decrease button is disabled when quantity is 1', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 1})])}
        />,
      );
      const decreaseBtn = screen.getByLabelText(/decrease quantity/i);
      expect(decreaseBtn).toHaveProperty('disabled', true);
    });

    it('decrease button is enabled when quantity is greater than 1', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 3})])}
        />,
      );
      const decreaseBtn = screen.getByLabelText(/decrease quantity/i);
      expect(decreaseBtn).toHaveProperty('disabled', false);
    });

    it('increase button is enabled for any quantity', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 1})])}
        />,
      );
      const increaseBtn = screen.getByLabelText(/increase quantity/i);
      expect(increaseBtn).toHaveProperty('disabled', false);
    });

    it('displays correct quantity between +/- buttons', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({quantity: 5})])}
        />,
      );
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('each item in a multi-item cart has its own quantity controls', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([
            makeCartLine({id: 'line-1', quantity: 2}),
            makeCartLine({id: 'line-2', quantity: 4}),
          ])}
        />,
      );
      const decreaseBtns = screen.getAllByLabelText(/decrease quantity/i);
      const increaseBtns = screen.getAllByLabelText(/increase quantity/i);
      expect(decreaseBtns).toHaveLength(2);
      expect(increaseBtns).toHaveLength(2);
    });
  });

  // ---- Remove Functionality ----

  describe('remove functionality', () => {
    it('renders a remove button for each item', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine()])}
        />,
      );
      const removeBtn = screen.getByRole('button', {name: /remove/i});
      expect(removeBtn).toBeTruthy();
    });

    it('remove button is wrapped in a CartForm for LinesRemove', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine()])}
        />,
      );
      const removeBtn = screen.getByRole('button', {name: /remove/i});
      const form = removeBtn.closest('form');
      expect(form).toBeTruthy();
      expect(form!.getAttribute('data-action')).toBe('LinesRemove');
    });

    it('remove form sends correct lineIds', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({id: 'gid://shopify/CartLine/42'})])}
        />,
      );
      const removeBtn = screen.getByRole('button', {name: /remove/i});
      const form = removeBtn.closest('form');
      const inputs = JSON.parse(form!.getAttribute('data-inputs')!);
      expect(inputs.lineIds).toEqual(['gid://shopify/CartLine/42']);
    });

    it('renders remove buttons for each item in a multi-item cart', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([
            makeCartLine({id: 'line-1', title: 'Product A'}),
            makeCartLine({id: 'line-2', title: 'Product B'}),
          ])}
        />,
      );
      const removeBtns = screen.getAllByRole('button', {name: /remove/i});
      expect(removeBtns).toHaveLength(2);
    });
  });

  // ---- Checkout ----

  describe('checkout', () => {
    it('renders a checkout link when cart has checkoutUrl', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine()])}
        />,
      );
      const checkoutLink = screen.getByRole('link', {name: /checkout/i});
      expect(checkoutLink).toBeTruthy();
      expect(checkoutLink.getAttribute('href')).toBe('https://shop.example.com/checkout');
    });

    it('checkout button is disabled when cart is null', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      const checkoutBtn = screen.getByRole('button', {name: /checkout/i});
      expect(checkoutBtn).toHaveProperty('disabled', true);
    });
  });

  // ---- Subtotal Display ----

  describe('subtotal', () => {
    it('displays subtotal label', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(screen.getByText('Subtotal')).toBeTruthy();
    });

    it('displays correct subtotal amount', () => {
      render(
        <SlideOutCart
          isOpen={true}
          onClose={defaultOnClose}
          cart={makeCart([makeCartLine({price: '50.00'})])}
        />,
      );
      // Both the line item price and the subtotal show "GBP 50.00"
      expect(screen.getAllByText('GBP 50.00').length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---- Continue Shopping ----

  describe('continue shopping', () => {
    it('renders Continue Shopping button', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      const continueBtn = screen.getByRole('button', {name: /continue shopping/i});
      expect(continueBtn).toBeTruthy();
    });

    it('calls onClose when Continue Shopping is clicked', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      const continueBtn = screen.getByRole('button', {name: /continue shopping/i});
      fireEvent.click(continueBtn);
      expect(defaultOnClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Accessibility ----

  describe('accessibility', () => {
    it('locks body scroll when open', () => {
      render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when closed', () => {
      const {rerender} = render(
        <SlideOutCart isOpen={true} onClose={defaultOnClose} cart={null} />,
      );
      expect(document.body.style.overflow).toBe('hidden');

      rerender(
        <SlideOutCart isOpen={false} onClose={defaultOnClose} cart={null} />,
      );
      expect(document.body.style.overflow).toBe('');
    });
  });
});
