/**
 * PKCE OAuth Login Route
 *
 * Generates a PKCE code challenge, stores the verifier in the session,
 * and redirects the customer to Shopify's Customer Account login page.
 *
 * Called when the AI agent detects the customer needs account access
 * (e.g., asking about order status). The chat UI opens this in a popup.
 *
 * Flow:
 *   1. Generate PKCE code_verifier + code_challenge
 *   2. Store code_verifier + state in session cookie
 *   3. Redirect to Shopify authorization endpoint
 */

import type {Route} from './+types/api.auth.login';
import {
  CustomerAccountMcpClient,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from '~/lib/customer-account-mcp.server';

export async function loader({request, context}: Route.LoaderArgs) {
  const {env, session} = context;

  const clientId = env.CUSTOMER_ACCOUNT_CLIENT_ID;
  if (!clientId) {
    return new Response('CUSTOMER_ACCOUNT_CLIENT_ID not configured', {status: 500});
  }

  const storeDomain = env.PUBLIC_STORE_DOMAIN;

  // Discover OAuth endpoints from the store
  const mcpClient = new CustomerAccountMcpClient(storeDomain);
  const {authorizationEndpoint} = await mcpClient.discoverEndpoints();

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Build redirect URI — the callback route on this storefront
  const url = new URL(request.url);
  const redirectUri = env.CUSTOMER_ACCOUNT_REDIRECT_URI
    || `${url.origin}/api/auth/callback`;

  // Store PKCE state in session
  session.set('pkce_code_verifier', codeVerifier);
  session.set('pkce_state', state);
  session.set('pkce_redirect_uri', redirectUri);

  // Build authorization URL
  const authUrl = new URL(authorizationEndpoint);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'customer-account-mcp-api:full');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Optionally pre-fill email if provided
  const loginHint = new URL(request.url).searchParams.get('login_hint');
  if (loginHint) {
    authUrl.searchParams.set('login_hint', loginHint);
  }

  console.log('[Auth Login] Redirecting to:', authUrl.toString());

  // Redirect to Shopify login — commit session to persist PKCE state
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': await session.commit(),
    },
  });
}
