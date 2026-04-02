import {redirect, useLoaderData, Link} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';

export const meta: Route.MetaFunction = ({data}) => {
  return [{title: `MOA | ${data?.collection.title ?? 'Collection'}`}];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  return {...deferredData, ...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const paginationVariables = getPaginationVariables(request, {pageBy: 12});

  if (!handle) {
    throw redirect('/collections');
  }

  const [{collection}] = await Promise.all([
    storefront.query(COLLECTION_QUERY, {
      variables: {handle, ...paginationVariables},
    }),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle, data: collection});

  return {collection};
}

function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

interface CollectionProduct {
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

export default function Collection() {
  const {collection} = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-[var(--moa-bg)] pt-8 pb-16">
      <div className="max-w-5xl mx-auto px-6 mb-12">
        <p className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] text-[var(--moa-text-tertiary)] uppercase mb-3">
          Mechanism of Action
        </p>
        <h1 className="font-[var(--font-heading)] text-[clamp(2rem,4vw,3rem)] text-[var(--moa-text)] leading-tight mb-2">
          {collection.title}
        </h1>
        {collection.description && (
          <p className="font-[var(--font-body)] text-base text-[var(--moa-text-secondary)] max-w-lg">
            {collection.description}
          </p>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <PaginatedResourceSection<CollectionProduct>
          connection={collection.products}
          resourcesClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {({node: product, index}) => (
            <CollectionCard
              key={product.id}
              product={product}
              loading={index < 6 ? 'eager' : 'lazy'}
            />
          )}
        </PaginatedResourceSection>
      </div>

      <Analytics.CollectionView
        data={{
          collection: {
            id: collection.id,
            handle: collection.handle,
          },
        }}
      />
    </div>
  );
}

function CollectionCard({
  product,
  loading,
}: {
  product: CollectionProduct;
  loading: 'eager' | 'lazy';
}) {
  const price = `${product.priceRange.minVariantPrice.currencyCode} ${product.priceRange.minVariantPrice.amount}`;
  const ingredients = product.metafields?.[0]?.value || null;

  return (
    <Link
      to={`/products/${product.handle}`}
      className="group block rounded-xl overflow-hidden border border-[var(--moa-border)] bg-[var(--moa-surface)] transition-shadow duration-300 hover:shadow-[0_0_24px_var(--moa-accent-glow)] focus:outline-2 focus:outline-[var(--moa-accent)] focus:outline-offset-2"
      prefetch="intent"
    >
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

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="font-[var(--font-body)] text-base font-medium text-[var(--moa-text)] leading-tight">
            {product.title}
          </h2>
          <span className="shrink-0 font-[var(--font-mono)] text-sm text-[var(--moa-accent)]">
            {price}
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

const COLLECTION_QUERY = `#graphql
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        sortKey: BEST_SELLING
      ) {
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
  }
` as const;
