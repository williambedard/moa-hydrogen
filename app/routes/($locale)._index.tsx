import {useLoaderData, useRouteLoaderData, Await, useRevalidator} from 'react-router';
import {useState, useCallback, useEffect, useRef, Suspense} from 'react';
import {useOptimisticCart} from '@shopify/hydrogen';
import type {RootLoader} from '~/root';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {Route} from './+types/($locale)._index';
import {
  ConciergePrompt,
  SiteHeader,
  SlideOutCart,
} from '~/components/Shop';
import {WelcomeHero} from '~/components/WelcomeHero';
import {ClientOnly} from '~/components/ClientOnly';
import {
  ConversationProvider,
  useConversationContext,
} from '~/components/ConversationProvider';
import {
  streamAIQuery,
  createSSEStream,
  type ConversationHistoryMessage,
} from '~/lib/ai-search-stream.server';
import type {ShoppingContext} from '~/lib/shopping-context';
import type {ProductContext} from '~/lib/product-context';
import {buildCartContext} from '~/lib/shopping-context.server';
import {useStreamingChat} from '~/hooks/useStreamingChat';
import {useVoiceMode} from '~/hooks/useVoiceMode';

interface LoaderData {
  enableExtendedThinking: boolean;
}

export const meta: Route.MetaFunction = () => {
  return [{title: 'MOA | Mechanism of Action'}];
};

export async function loader({context}: Route.LoaderArgs): Promise<LoaderData> {
  const {env} = context;
  return {
    enableExtendedThinking: env.ENABLE_EXTENDED_THINKING === 'true',
  };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<Response> {
  const url = new URL(request.url);
  const isStreamRequest = url.searchParams.get('_stream') === '1';

  const formData = await request.formData();
  const query = String(formData.get('query') || '').trim();
  const historyJson = String(formData.get('history') || '');
  const contextJson = String(formData.get('shoppingContext') || '');
  const productContextJson = String(formData.get('productContext') || '');

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

  // Get cart data for context
  const cartData = await cart.get();
  const cartContext = buildCartContext(cartData);

  const enableExtendedThinking = env.ENABLE_EXTENDED_THINKING === 'true';

  if (isStreamRequest) {
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
      customerAccessToken: validCustomerToken,
    });

    const stream = createSSEStream(generator);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming fallback
  return new Response(
    JSON.stringify({error: 'Please use streaming endpoint'}),
    {
      status: 400,
      headers: {'Content-Type': 'application/json'},
    },
  );
}

export default function Homepage() {
  return (
    <ClientOnly fallback={<HomepageShell />}>
      <ConversationProvider>
        <HomepageContent />
      </ConversationProvider>
    </ClientOnly>
  );
}

/** SSR/loading fallback — hero without the chat (no ConversationProvider). */
function HomepageShell() {
  const rootData = useRouteLoaderData<RootLoader>('root');
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <Suspense fallback={
        <header>
          <SiteHeader cartCount={0} onCartClick={() => setIsCartOpen(true)} />
        </header>
      }>
        <Await resolve={rootData?.cart}>
          {(cart) => (
            <HeaderAndCart
              cart={cart}
              isCartOpen={isCartOpen}
              onCartOpen={() => setIsCartOpen(true)}
              onCartClose={() => setIsCartOpen(false)}
            />
          )}
        </Await>
      </Suspense>
      <main className="min-h-screen bg-[var(--moa-bg)]">
        <WelcomeHero />
      </main>
    </>
  );
}

function HomepageContent() {
  const rootData = useRouteLoaderData<RootLoader>('root');

  // Cart state
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Open cart drawer when a ChatProductCard adds an item
  useEffect(() => {
    const handleCartAdd = () => setIsCartOpen(true);
    window.addEventListener('cart:item-added', handleCartAdd);
    return () => window.removeEventListener('cart:item-added', handleCartAdd);
  }, []);

  return (
    <>
      <Suspense fallback={
        <>
          <header>
            <SiteHeader cartCount={0} onCartClick={() => setIsCartOpen(true)} />
          </header>
          <SlideOutCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cart={null} />
        </>
      }>
        <Await resolve={rootData?.cart}>
          {(cart) => (
            <HeaderAndCart
              cart={cart}
              isCartOpen={isCartOpen}
              onCartOpen={() => setIsCartOpen(true)}
              onCartClose={() => setIsCartOpen(false)}
            />
          )}
        </Await>
      </Suspense>

      <main className="min-h-screen bg-[var(--moa-bg)]">
        {/* Welcome Hero — branding + headline, chat rendered as normal DOM child */}
        <WelcomeHero>
          <StreamingConversationPromptInner />
        </WelcomeHero>
      </main>
    </>
  );
}

function StreamingConversationPromptInner() {
  const {
    messages,
    addUserMessage,
    addAssistantMessage,
    updateShoppingContext,
    startNewConversation,
    getHistoryForSubmission,
    getContextForSubmission,
    hasHistory,
  } = useConversationContext();

  const {state, startStream, reset} = useStreamingChat();
  const voiceMode = useVoiceMode();
  const {revalidate} = useRevalidator();
  const lastQueryRef = useRef<string | null>(null);
  const lastSubmittedTranscriptRef = useRef<string | null>(null);
  const spokenPreToolRef = useRef(false);
  const spokenFinalRef = useRef(false);

  // Handle streaming completion
  useEffect(() => {
    console.log(
      '[StreamingPrompt] Effect triggered, fullText:',
      !!state.fullText,
      'isStreaming:',
      state.isStreaming,
      'products:',
      state.products?.length,
    );

    // Save assistant message when streaming finishes — even if fullText is empty
    // (the AI may respond with only tool calls / products and no prose)
    const hasContent = state.fullText || (state.products && state.products.length > 0) || state.toolCalls.length > 0;
    if (hasContent && !state.isStreaming) {
      // Add the completed assistant message to conversation
      addAssistantMessage(state.fullText || '', {
        toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
        thinkingText: state.thinkingText || undefined,
        contentBlocks: state.contentBlocks.length > 0 ? state.contentBlocks : undefined,
        products: state.products && state.products.length > 0
          ? state.products.map((p) => ({
              id: p.id,
              handle: p.handle,
              title: p.title,
              description: p.description,
              url: p.url,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              image_url: p.image_url,
              images: p.images,
              availableForSale: p.availableForSale,
              variants: p.variants?.map((v) => ({
                id: v.id,
                title: v.title,
                availableForSale: v.availableForSale,
                price: v.price,
              })),
            }))
          : undefined,
      });

      // Handle context update
      if (state.contextUpdate) {
        updateShoppingContext(state.contextUpdate);
      }

      // Sync cart ID if a new cart was created
      if (state.cartId) {
        console.log('[StreamingPrompt] Syncing cart ID:', state.cartId);
        fetch('/api/cart-sync', {
          method: 'POST',
          body: new URLSearchParams({cartId: state.cartId}),
        })
          .then((res) => res.json())
          .then((data) => {
            console.log('[StreamingPrompt] Cart sync result:', data);
            revalidate();
          })
          .catch((err) =>
            console.error('[StreamingPrompt] Cart sync error:', err),
          );
      }
    }
  }, [
    state.fullText,
    state.isStreaming,
    state.products,
    state.contextUpdate,
    state.error,
    state.toolCalls,
    state.thinkingText,
    state.cartId,
    addAssistantMessage,
    updateShoppingContext,
  ]);

  const handleSubmit = useCallback(
    (formData: FormData) => {
      const query = formData.get('query')?.toString().trim();
      if (!query) return;

      lastQueryRef.current = query;
      // Cancel any in-progress TTS queue from previous response
      if (voiceMode.isVoiceMode) {
        voiceMode.stopSpeaking();
      }
      // Reset TTS segment tracking for the new stream
      spokenPreToolRef.current = false;
      spokenFinalRef.current = false;
      addUserMessage(query);

      // Build form data with all context
      const streamFormData = new FormData();
      streamFormData.set('query', query);
      streamFormData.set('history', getHistoryForSubmission());
      streamFormData.set('shoppingContext', getContextForSubmission());

      void startStream(streamFormData);
    },
    [
      addUserMessage,
      getHistoryForSubmission,
      getContextForSubmission,
      startStream,
    ],
  );

  const handleNewChat = useCallback(() => {
    reset();
    startNewConversation();
    lastSubmittedTranscriptRef.current = null;
  }, [reset, startNewConversation]);

  // Reset submitted-transcript guard when a new listening session starts
  useEffect(() => {
    if (voiceMode.voiceState === 'listening') {
      lastSubmittedTranscriptRef.current = null;
    }
  }, [voiceMode.voiceState]);

  // Voice mode: auto-submit transcript when STT completes
  useEffect(() => {
    if (
      voiceMode.transcript &&
      voiceMode.voiceState === 'processing' &&
      voiceMode.transcript !== lastSubmittedTranscriptRef.current
    ) {
      lastSubmittedTranscriptRef.current = voiceMode.transcript;
      const formData = new FormData();
      formData.set('query', voiceMode.transcript);
      handleSubmit(formData);
    }
  }, [voiceMode.transcript, voiceMode.voiceState, handleSubmit]);

  // Voice mode: speak first text block as soon as a tool starts
  const hasToolBlock = state.contentBlocks.some((b) => b.type === 'tool');
  const firstTextBlock = state.contentBlocks.find((b) => b.type === 'text');
  const firstText = firstTextBlock?.type === 'text' ? firstTextBlock.text.trim() : '';
  useEffect(() => {
    if (
      hasToolBlock &&
      firstText &&
      voiceMode.isVoiceMode &&
      !spokenPreToolRef.current
    ) {
      spokenPreToolRef.current = true;
      voiceMode.queueSpeech(firstText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToolBlock, firstText]);

  // Voice mode: speak remaining text when stream completes
  useEffect(() => {
    if (!state.isStreaming && state.fullText && voiceMode.isVoiceMode && !spokenFinalRef.current) {
      spokenFinalRef.current = true;

      if (hasToolBlock) {
        const textAfterFirst = state.contentBlocks
          .filter((b) => b.type === 'text')
          .slice(1)
          .map((b) => (b as {type: 'text'; text: string}).text.trim())
          .filter(Boolean)
          .join(' ');
        if (textAfterFirst) {
          voiceMode.queueSpeech(textAfterFirst);
        }
      } else {
        const fullText = state.streamedText.trim();
        if (fullText) {
          voiceMode.queueSpeech(fullText);
        }
      }

      voiceMode.finishSpeechQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isStreaming, state.fullText]);

  return (
    <ConciergePrompt
      isLoading={false}
      historyJson={getHistoryForSubmission()}
      shoppingContextJson={getContextForSubmission()}
      productContextJson=""
      messages={messages}
      hasHistory={hasHistory}
      onNewChat={handleNewChat}
      onSubmit={handleSubmit}
      streamingText={state.streamedText}
      streamingContentBlocks={state.contentBlocks}
      streamingThinkingText={state.thinkingText}
      isStreaming={state.isStreaming}
      suggestedPrompts={null}
      isVoiceMode={voiceMode.isVoiceMode}
      voiceState={voiceMode.voiceState}
      audioLevel={voiceMode.audioLevel}
      onToggleVoiceMode={voiceMode.toggleVoiceMode}
      onStopSpeaking={voiceMode.stopSpeaking}
      onStartListening={voiceMode.startListening}
      isInHero={true}
      authRequired={state.authRequired}
    />
  );
}

function HeaderAndCart({
  cart,
  isCartOpen,
  onCartOpen,
  onCartClose,
}: {
  cart: CartApiQueryFragment | null | undefined;
  isCartOpen: boolean;
  onCartOpen: () => void;
  onCartClose: () => void;
}) {
  const optimisticCart = useOptimisticCart(cart ?? null);
  const cartCount = optimisticCart?.totalQuantity || 0;

  return (
    <>
      <header>
        <SiteHeader cartCount={cartCount} onCartClick={onCartOpen} />
      </header>
      <SlideOutCart
        isOpen={isCartOpen}
        onClose={onCartClose}
        cart={cart ?? null}
      />
    </>
  );
}
