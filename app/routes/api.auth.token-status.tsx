/**
 * Token Status Polling Route
 *
 * Returns the current customer authentication status.
 * The chat UI polls this endpoint after opening the login popup
 * to detect when authentication completes.
 *
 * Response: { authenticated: boolean }
 */

import type {Route} from './+types/api.auth.token-status';

export async function loader({context}: Route.LoaderArgs) {
  const {session} = context;

  const accessToken = session.get('customer_access_token');
  const expiresAt = session.get('customer_token_expires_at');

  const authenticated = Boolean(
    accessToken &&
    typeof expiresAt === 'number' &&
    Date.now() < expiresAt
  );

  return new Response(
    JSON.stringify({authenticated}),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    },
  );
}
