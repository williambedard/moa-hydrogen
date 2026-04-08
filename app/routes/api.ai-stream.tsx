/**
 * API route for streaming AI responses.
 * This is a resource route (no default export) that returns SSE streams.
 */

import type {Route} from './+types/api.ai-stream';
import {
  streamAIQuery,
  createSSEStream,
  type ConversationHistoryMessage,
} from '~/lib/ai-search-stream.server';
import type {ShoppingContext} from '~/lib/shopping-context';
import type {ProductContext} from '~/lib/product-context';
import {buildCartContext} from '~/lib/shopping-context.server';

export async function action({request, context}: Route.ActionArgs): Promise<Response> {
  console.log('[api.ai-stream] Received request');

  const formData = await request.formData();
  const query = String(formData.get('query') || '').trim();
  const historyJson = String(formData.get('history') || '');
  const contextJson = String(formData.get('shoppingContext') || '');
  const productContextJson = String(formData.get('productContext') || '');

  console.log('[api.ai-stream] Query:', query);

  if (!query) {
    return new Response(
      JSON.stringify({error: 'Please enter a search query'}),
      {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      },
    );
  }

  // Parse conversation history
  let conversationHistory: ConversationHistoryMessage[] | undefined;
  if (historyJson) {
    try {
      const parsed = JSON.parse(historyJson) as unknown;
      if (Array.isArray(parsed)) {
        conversationHistory = parsed
          .filter((m): m is {role: string; content: string} => {
            return (
              m !== null &&
              typeof m === 'object' &&
              'role' in m &&
              'content' in m &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
            );
          })
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
      }
    } catch {
      // Invalid JSON, ignore history
    }
  }

  // Parse shopping context
  let shoppingContext: ShoppingContext | null = null;
  if (contextJson) {
    try {
      shoppingContext = JSON.parse(contextJson) as ShoppingContext;
    } catch {
      // Invalid JSON, ignore context
    }
  }

  // Parse product context
  let productContext: ProductContext | null = null;
  if (productContextJson) {
    try {
      productContext = JSON.parse(productContextJson) as ProductContext;
    } catch {
      // Invalid JSON, ignore context
    }
  }

  const {env, storefront, cart, session} = context;
  const storeDomain = `https://${env.PUBLIC_STORE_DOMAIN}`;

  // Check for customer access token (from PKCE OAuth login)
  const customerAccessToken = session.get('customer_access_token') as string | undefined;
  const tokenExpiresAt = session.get('customer_token_expires_at') as number | undefined;
  const validCustomerToken = (customerAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt)
    ? customerAccessToken
    : undefined;
  const customerFirstName = validCustomerToken
    ? (session.get('customer_first_name') as string | undefined)
    : undefined;

  // Get or create cart for context
  let cartData = await cart.get();
  let cartHeaders: Headers | null = null;

  // If no cart exists, create an empty one so we have a cart ID for MCP
  if (!cartData?.id) {
    console.log('[api.ai-stream] No Hydrogen cart exists, creating one...');
    try {
      const result = await cart.create({});
      cartData = result.cart;
      if (cartData?.id) {
        cartHeaders = cart.setCartId(cartData.id);
        console.log('[api.ai-stream] Created new Hydrogen cart:', cartData.id);
      }
    } catch (error) {
      console.error('[api.ai-stream] Failed to create cart:', error);
    }
  }

  const cartContext = buildCartContext(cartData);
  console.log('[api.ai-stream] Cart ID from Hydrogen:', cartData?.id);
  console.log('[api.ai-stream] Built cart context:', cartContext);

  const enableExtendedThinking = env.ENABLE_EXTENDED_THINKING === 'true';

  console.log('[api.ai-stream] Starting stream');

  // Return SSE stream
  const generator = streamAIQuery({
    userQuery: query,
    storeDomain,
    storefront,
    apiKey: env.AI_API_KEY,
    baseURL: env.AI_BASE_URL,
    model: env.AI_MODEL,
    storePassword: env.STORE_PASSWORD,
    conversationHistory,
    shoppingContext,
    cartContext,
    productContext,
    enableExtendedThinking,
    imageGenerationUrl: env.IMAGE_GENERATION_URL,
    disableImageGeneration: env.DISABLE_IMAGE_GENERATION === 'true',
    openaiBaseURL: env.OPENAI_BASE_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    customerAccessToken: validCustomerToken,
    isLoggedIn: Boolean(validCustomerToken),
    customerFirstName,
  });

  const stream = createSSEStream(generator);

  // Build response headers
  const responseHeaders = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Include cart cookie if we created a new cart
  if (cartHeaders) {
    const setCookie = cartHeaders.get('Set-Cookie');
    if (setCookie) {
      responseHeaders.set('Set-Cookie', setCookie);
    }
  }

  return new Response(stream, {headers: responseHeaders});
}
