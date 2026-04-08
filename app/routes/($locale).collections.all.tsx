import type {Route} from './+types/collections.all';
import {Link, useLoaderData} from 'react-router';
import {getPaginationVariables, Money} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';

export const meta: Route.MetaFunction = () => {
  return [{title: 'MOA | Our Products'}];
};

export async function loader({context, request}: Route.LoaderArgs) {
  const {storefront} = context;
  const paginationVariables = getPaginationVariables(request, {pageBy: 12});

  const {products} = await storefront.query(CATALOG_QUERY, {
    variables: {...paginationVariables},
  });

  return {products};
}

interface CatalogProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  availableForSale: boolean;
  featuredImage?: {url: string; altText?: string | null; width?: number; height?: number} | null;
  priceRange: {
    minVariantPrice: {amount: string; currencyCode: string};
  };
  metafields: Array<{key: string; value: string} | null>;
}

export default function CatalogPage() {
  const {products} = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-[var(--moa-bg)] pt-8 pb-16">
      {/* Page header */}
      <div className="max-w-5xl mx-auto px-6 mb-12">
        <p className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] text-[var(--moa-text-tertiary)] uppercase mb-3">
          Mechanism of Action
        </p>
        <h1 className="font-[var(--font-heading)] text-[clamp(2rem,4vw,3rem)] text-[var(--moa-text)] leading-tight mb-2">
          Our Products
        </h1>
        <p className="font-[var(--font-body)] text-base text-[var(--moa-text-secondary)] max-w-lg">
          Clinical-grade supplements, backed by evidence.
        </p>
      </div>

      {/* Product grid */}
      <div className="max-w-5xl mx-auto px-6">
        <PaginatedResourceSection<CatalogProduct>
          connection={products}
          resourcesClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {({node: product, index}) => (
            <CatalogCard
              key={product.id}
              product={product}
              loading={index < 6 ? 'eager' : 'lazy'}
            />
          )}
        </PaginatedResourceSection>
      </div>
    </div>
  );
}

function CatalogCard({
  product,
  loading,
}: {
  product: CatalogProduct;
  loading: 'eager' | 'lazy';
}) {
  const priceData = product.priceRange.minVariantPrice;
  const ingredients = product.metafields?.[0]?.value || null;

  return (
    <Link
      to={`/products/${product.handle}`}
      className="group block rounded-xl overflow-hidden border border-[var(--moa-border)] bg-[var(--moa-surface)] transition-shadow duration-300 hover:shadow-[0_0_24px_var(--moa-accent-glow)] focus:outline-2 focus:outline-[var(--moa-accent)] focus:outline-offset-2"
      prefetch="intent"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--moa-surface-elevated)]">
        {product.featuredImage?.url ? (
          <img
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            loading={loading}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--moa-surface)] to-[var(--moa-surface-elevated)]" />
        )}
        {!product.availableForSale && (
          <span className="absolute top-3 right-3 py-1 px-2.5 text-[0.6rem] font-medium uppercase tracking-[0.12em] bg-[var(--moa-surface)]/90 text-[var(--moa-text-tertiary)] backdrop-blur-sm rounded">
            Sold out
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-[var(--font-body)] text-base font-medium text-[var(--moa-text)] leading-tight">
            {product.title}
          </h2>
          <span className="shrink-0 font-[var(--font-mono)] text-sm text-[var(--moa-accent)]">
            <Money data={priceData} />
          </span>
        </div>

        {product.description && (
          <p className="font-[var(--font-body)] text-sm text-[var(--moa-text-secondary)] leading-relaxed line-clamp-3 mb-4">
            {product.description}
          </p>
        )}

        {ingredients && (
          <div className="pt-3 border-t border-[var(--moa-border)]">
            <p className="font-[var(--font-body)] text-[0.7rem] font-medium uppercase tracking-[0.15em] text-[var(--moa-text-tertiary)] mb-1.5">
              Ingredients
            </p>
            <p className="font-[var(--font-mono)] text-xs text-[var(--moa-text-tertiary)] leading-relaxed line-clamp-3">
              {ingredients}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}

const CATALOG_QUERY = `#graphql
  query Catalog(
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    products(first: $first, last: $last, before: $startCursor, after: $endCursor, sortKey: BEST_SELLING) {
      nodes {
        id
        handle
        title
        description
        availableForSale
        featuredImage {
          url
          altText
          width
          height
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        metafields(identifiers: [{namespace: "custom", key: "ingredients"}]) {
          key
          value
        }
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        startCursor
        endCursor
      }
    }
  }
` as const;
