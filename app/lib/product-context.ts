/**
 * Type definitions for product context passed to AI when a product is selected.
 */

export interface ProductContext {
  id: string;
  handle: string;
  title: string;
  vendor?: string;
  description?: string;
  price: string;
  compareAtPrice?: string;
  availableOptions: Array<{
    name: string;  // "Size", "Color"
    values: string[];
  }>;
  selectedVariant?: {
    id: string;
    title: string;
    availableForSale: boolean;
  };
  /** True when user has closed the product detail but this was the last product viewed. */
  isLastViewed?: boolean;
}

/**
 * Formats product context into a system prompt section.
 */
export function formatProductContextForPrompt(
  product: ProductContext | null,
): string {
  if (!product) {
    return '';
  }

  const isLastViewed = product.isLastViewed === true;
  const tag = isLastViewed ? 'last_viewed_product' : 'current_product';

  const lines: string[] = [
    isLastViewed
      ? `The user was recently viewing: "${product.title}"${product.vendor ? ` by ${product.vendor}` : ''} (they have now closed the product detail view)`
      : `You are currently viewing: "${product.title}"${product.vendor ? ` by ${product.vendor}` : ''}`,
    `Price: ${product.price}${product.compareAtPrice ? ` (was ${product.compareAtPrice})` : ''}`,
  ];

  // Add available options
  for (const option of product.availableOptions) {
    lines.push(`Available ${option.name.toLowerCase()}s: ${option.values.join(', ')}`);
  }

  if (product.selectedVariant) {
    lines.push(`${isLastViewed ? 'Last selected' : 'Currently selected'} variant: ${product.selectedVariant.title}${!product.selectedVariant.availableForSale ? ' (out of stock)' : ''}`);
  }

  lines.push(`Product ID: ${product.id}`);
  lines.push(`Product handle: ${product.handle}`);
  lines.push(`Note: This context only includes general product info. For variant-specific details (availability per size/color, per-variant pricing, stock), ALWAYS call get_product_details with handle "${product.handle}".`);

  return `
<${tag}>
${lines.join('\n')}
</${tag}>`;
}
