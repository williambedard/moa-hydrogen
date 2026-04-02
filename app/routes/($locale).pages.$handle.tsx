import {useLoaderData} from 'react-router';
import type {Route} from './+types/pages.$handle';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';

export const meta: Route.MetaFunction = ({data}) => {
  return [{title: `MOA | ${data?.page.title ?? ''}`}];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, request, params}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Error('Missing page handle');
  }

  const [{page}] = await Promise.all([
    context.storefront.query(PAGE_QUERY, {
      variables: {
        handle: params.handle,
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!page) {
    throw new Response('Not Found', {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle: params.handle, data: page});

  return {
    page,
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Page() {
  const {page} = useLoaderData<typeof loader>();

  // page.body is trusted HTML from Shopify CMS (admin-authored content)
  const pageBody = page.body;

  return (
    <div className="min-h-screen bg-[var(--moa-bg)] pt-8 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <p className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] text-[var(--moa-text-tertiary)] uppercase mb-3">
          Mechanism of Action
        </p>
        <h1 className="font-[var(--font-heading)] text-[clamp(2rem,4vw,3rem)] text-[var(--moa-text)] leading-tight mb-8">
          {page.title}
        </h1>
        {/* eslint-disable-next-line react/no-danger -- Shopify CMS content is trusted */}
        <div
          className="prose-page font-[var(--font-body)] text-[var(--moa-text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{__html: pageBody}}
        />
      </div>
    </div>
  );
}

const PAGE_QUERY = `#graphql
  query Page(
    $language: LanguageCode,
    $country: CountryCode,
    $handle: String!
  )
  @inContext(language: $language, country: $country) {
    page(handle: $handle) {
      handle
      id
      title
      body
      seo {
        description
        title
      }
    }
  }
` as const;
