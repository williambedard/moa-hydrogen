/**
 * OAuth Callback Route
 *
 * Handles the redirect from Shopify's Customer Account login.
 * Exchanges the authorization code for an access token using PKCE,
 * stores the token in the session, and closes the popup window.
 *
 * Flow:
 *   1. Validate state parameter (CSRF protection)
 *   2. Exchange code + code_verifier for access token
 *   3. Store access token in session
 *   4. Render self-closing popup HTML
 */

import type {Route} from './+types/api.auth.callback';
import {CustomerAccountMcpClient} from '~/lib/customer-account-mcp.server';

export async function loader({request, context}: Route.LoaderArgs) {
  const {env, session} = context;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('[Auth Callback] OAuth error:', error, errorDescription);
    return renderPopupClose(`Login failed: ${errorDescription || error}`);
  }

  if (!code || !state) {
    return renderPopupClose('Missing authorization code or state');
  }

  // Validate state (CSRF protection)
  const storedState = session.get('pkce_state');
  if (state !== storedState) {
    console.error('[Auth Callback] State mismatch:', {received: state, expected: storedState});
    return renderPopupClose('Invalid state parameter — please try logging in again');
  }

  // Retrieve PKCE verifier from session
  const codeVerifier = session.get('pkce_code_verifier');
  const redirectUri = session.get('pkce_redirect_uri');
  if (!codeVerifier || !redirectUri) {
    return renderPopupClose('Missing PKCE state — please try logging in again');
  }

  const clientId = env.CUSTOMER_ACCOUNT_CLIENT_ID;
  if (!clientId) {
    return renderPopupClose('Server configuration error');
  }

  // Discover token endpoint
  const storeDomain = env.PUBLIC_STORE_DOMAIN;
  const mcpClient = new CustomerAccountMcpClient(storeDomain);
  const {tokenEndpoint} = await mcpClient.discoverEndpoints();

  // Exchange code for token
  console.log('[Auth Callback] Exchanging code for token at:', tokenEndpoint);

  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error('[Auth Callback] Token exchange failed:', tokenResponse.status, errorBody);
    return renderPopupClose('Failed to complete login — please try again');
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
  };

  console.log('[Auth Callback] Token obtained, scope:', tokenData.scope);

  // Store token in session
  session.set('customer_access_token', tokenData.access_token);
  session.set('customer_token_expires_at', Date.now() + tokenData.expires_in * 1000);
  if (tokenData.refresh_token) {
    session.set('customer_refresh_token', tokenData.refresh_token);
  }

  // Fetch customer name for personalization
  try {
    const customerResponse = await fetch(
      `https://shopify.com/${env.PUBLIC_STORE_DOMAIN?.replace('.myshopify.com', '')}/account/customer/api/2025-01/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
        body: JSON.stringify({
          query: 'query { customer { firstName } }',
        }),
      },
    );
    if (customerResponse.ok) {
      const customerData = await customerResponse.json() as {data?: {customer?: {firstName?: string}}};
      const firstName = customerData?.data?.customer?.firstName;
      if (firstName) {
        session.set('customer_first_name', firstName);
        console.log('[Auth Callback] Customer first name:', firstName);
      }
    }
  } catch (e) {
    console.warn('[Auth Callback] Could not fetch customer name:', e);
  }

  // Clean up PKCE state
  session.unset('pkce_code_verifier');
  session.unset('pkce_state');
  session.unset('pkce_redirect_uri');

  // Return self-closing popup HTML with session cookie
  return new Response(selfClosingPopupHtml('Login successful!'), {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      'Set-Cookie': await session.commit(),
    },
  });
}

/**
 * Render a self-closing popup that posts a message to the parent window.
 */
function renderPopupClose(message: string): Response {
  return new Response(selfClosingPopupHtml(message), {
    status: 200,
    headers: {'Content-Type': 'text/html'},
  });
}

function selfClosingPopupHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>MOA Login</title></head>
<body style="background:#080c0a;color:#e8e4de;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>${escapeHtml(message)}</p>
  <script>
    // Notify the parent window that auth is complete
    if (window.opener) {
      window.opener.postMessage({type: 'moa_auth_complete', message: ${JSON.stringify(message)}}, '*');
      setTimeout(() => window.close(), 1500);
    } else {
      // Not a popup — redirect back to storefront
      setTimeout(() => window.location.href = '/', 2000);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
