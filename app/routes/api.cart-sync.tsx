/**
 * API route for syncing cart ID between MCP and Hydrogen session.
 * When the AI creates a cart via MCP, this endpoint syncs that cart to the Hydrogen session.
 */

import type {Route} from './+types/api.cart-sync';

export async function action({request, context}: Route.ActionArgs): Promise<Response> {
  const formData = await request.formData();
  const cartId = String(formData.get('cartId') || '').trim();

  if (!cartId) {
    return new Response(
      JSON.stringify({error: 'Missing cartId'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  console.log('[api.cart-sync] Syncing cart ID:', cartId);

  try {
    const {cart} = context;

    // Check if we already have a cart with a different ID
    const existingCart = await cart.get();
    if (existingCart?.id && existingCart.id !== cartId) {
      console.log('[api.cart-sync] Replacing existing cart:', existingCart.id, 'with:', cartId);
    }

    // Use Hydrogen's cart.setCartId() to properly set the cart ID
    // This returns headers with the Set-Cookie for the cart session
    const headers = cart.setCartId(cartId);
    headers.set('Content-Type', 'application/json');

    console.log('[api.cart-sync] Cart ID synced successfully');

    return new Response(
      JSON.stringify({success: true, cartId}),
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error('[api.cart-sync] Error:', error);
    return new Response(
      JSON.stringify({error: error instanceof Error ? error.message : 'Failed to sync cart'}),
      {
        status: 500,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }
}
