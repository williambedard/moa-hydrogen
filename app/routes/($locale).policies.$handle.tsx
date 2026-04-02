import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/policies.$handle';
import {type Shop} from '@shopify/hydrogen/storefront-api-types';

type SelectedPolicies = keyof Pick<
  Shop,
  'privacyPolicy' | 'shippingPolicy' | 'termsOfService' | 'refundPolicy'
>;

export const meta: Route.MetaFunction = ({data}) => {
  return [{title: `MOA | ${data?.policy.title ?? ''}`}];
};

export async function loader({params, context}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Response('No handle was passed in', {status: 404});
  }

  const policyName = params.handle.replace(
    /-([a-z])/g,
    (_: unknown, m1: string) => m1.toUpperCase(),
  ) as SelectedPolicies;

  const data = await context.storefront.query(POLICY_CONTENT_QUERY, {
    variables: {
      privacyPolicy: false,
      shippingPolicy: false,
      termsOfService: false,
      refundPolicy: false,
      [policyName]: true,
      language: context.storefront.i18n?.language,
    },
  });

  const policy = data.shop?.[policyName];

  if (!policy) {
    throw new Response('Could not find the policy', {status: 404});
  }

  return {policy};
}

export default function Policy() {
  const {policy} = useLoaderData<typeof loader>();

  // policy.body is trusted HTML authored by the store admin via Shopify settings
  const policyBody = policy.body;

  return (
    <div className="min-h-screen bg-[var(--moa-bg)] pt-8 pb-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link
          to="/policies"
          className="inline-block font-[var(--font-body)] text-xs text-[var(--moa-text-tertiary)] hover:text-[var(--moa-accent)] transition-colors mb-6"
        >
          &larr; All Policies
        </Link>
        <p className="font-[var(--font-body)] text-xs font-medium tracking-[0.3em] text-[var(--moa-text-tertiary)] uppercase mb-3">
          Mechanism of Action
        </p>
        <h1 className="font-[var(--font-heading)] text-[clamp(2rem,4vw,3rem)] text-[var(--moa-text)] leading-tight mb-8">
          {policy.title}
        </h1>
        {/* eslint-disable-next-line react/no-danger -- Store policy content from Shopify admin */}
        <div
          className="prose-page font-[var(--font-body)] text-[var(--moa-text-secondary)] leading-relaxed"
          dangerouslySetInnerHTML={{__html: policyBody}}
        />
      </div>
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/Shop
const POLICY_CONTENT_QUERY = `#graphql
  fragment Policy on ShopPolicy {
    body
    handle
    id
    title
    url
  }
  query Policy(
    $country: CountryCode
    $language: LanguageCode
    $privacyPolicy: Boolean!
    $refundPolicy: Boolean!
    $shippingPolicy: Boolean!
    $termsOfService: Boolean!
  ) @inContext(language: $language, country: $country) {
    shop {
      privacyPolicy @include(if: $privacyPolicy) {
        ...Policy
      }
      shippingPolicy @include(if: $shippingPolicy) {
        ...Policy
      }
      termsOfService @include(if: $termsOfService) {
        ...Policy
      }
      refundPolicy @include(if: $refundPolicy) {
        ...Policy
      }
    }
  }
` as const;
