import {useLoaderData, useRouteLoaderData, Await, useRevalidator} from 'react-router';
import {useState, useCallback, useEffect, useRef, Suspense} from 'react';
import {AnimatePresence} from 'framer-motion';
import {useOptimisticCart} from '@shopify/hydrogen';
import type {RootLoader} from '~/root';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {Route} from './+types/($locale)._index';
import {
  ProductGrid,
  ConciergePrompt,
  LoadingOverlay,
  ProductDetail,
  ProductActionBar,
  SiteHeader,
  CuratedHeader,
  SlideOutCart,
  type Product,
  type ProductVariant,
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
import {
  useStreamingChat,
  type CuratedHeader as CuratedHeaderType,
} from '~/hooks/useStreamingChat';
import {useVoiceMode} from '~/hooks/useVoiceMode';

interface LoaderData {
  defaultProducts: Product[];
  enableExtendedThinking: boolean;
}

export const meta: Route.MetaFunction = () => {
  return [{title: 'MOA | Mechanism of Action'}];
};

export async function loader({context}: Route.LoaderArgs): Promise<LoaderData> {
  const {storefront, env} = context;

  const {products} = await storefront.query(DEFAULT_PRODUCTS_QUERY, {
    variables: {first: 12},
  });

  const defaultProducts: Product[] = (products?.nodes || []).map(
    transformProduct,
  );

  return {
    defaultProducts,
    enableExtendedThinking: env.ENABLE_EXTENDED_THINKING === 'true',
  };
}

function transformProduct(product: {
  id: string;
  handle: string;
  title: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  featuredImage?: {url: string; altText?: string | null} | null;
  images: {nodes: Array<{url: string}>};
  priceRange: {
    minVariantPrice: {amount: string; currencyCode: string};
  };
  compareAtPriceRange: {
    minVariantPrice: {amount: string; currencyCode: string};
  };
  options?: Array<{name: string; values: string[]}>;
  variants?: {
    nodes: Array<{
      id: string;
      title: string;
      availableForSale: boolean;
      price: {amount: string; currencyCode: string};
      compareAtPrice?: {amount: string; currencyCode: string} | null;
      selectedOptions: Array<{name: string; value: string}>;
      image?: {url: string; altText?: string | null} | null;
    }>;
  };
}): Product {
  const compareAtAmount = parseFloat(
    product.compareAtPriceRange.minVariantPrice.amount,
  );

  const variants: ProductVariant[] =
    product.variants?.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      availableForSale: v.availableForSale,
      price: `${v.price.currencyCode} ${v.price.amount}`,
      compareAtPrice: v.compareAtPrice
        ? `${v.compareAtPrice.currencyCode} ${v.compareAtPrice.amount}`
        : undefined,
      selectedOptions: v.selectedOptions,
      image: v.image
        ? {url: v.image.url, altText: v.image.altText ?? undefined}
        : undefined,
    })) || [];

  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description,
    url: `/products/${product.handle}`,
    price: `${product.priceRange.minVariantPrice.currencyCode} ${product.priceRange.minVariantPrice.amount}`,
    compareAtPrice:
      compareAtAmount > 0
        ? `${product.compareAtPriceRange.minVariantPrice.currencyCode} ${product.compareAtPriceRange.minVariantPrice.amount}`
        : undefined,
    image_url: product.featuredImage?.url,
    images: product.images.nodes.map((img) => img.url),
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    availableForSale: product.availableForSale,
    options: product.options,
    variants,
  };
}

export async function action({
  request,
  context,
}: Route.ActionArgs): Promise<Response> {
  const url = new URL(request.url);
  const isStreamRequest = url.searchParams.get('_stream') === '1';

  console.log(
    '[action] Received request, isStreamRequest:',
    isStreamRequest,
    'url:',
    url.toString(),
  );

  const formData = await request.formData();
  const query = String(formData.get('query') || '').trim();
  console.log('[action] Query:', query);
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

  const {env, storefront, cart} = context;
  const storeDomain = `https://${env.PUBLIC_STORE_DOMAIN}`;

  // Get cart data for context
  const cartData = await cart.get();
  const cartContext = buildCartContext(cartData);

  const enableExtendedThinking = env.ENABLE_EXTENDED_THINKING === 'true';

  if (isStreamRequest) {
    console.log('[action] Starting streaming response');
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
    });

    const stream = createSSEStream(generator);
    console.log('[action] Returning SSE stream response');

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming fallback (should not be used with new implementation)
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
    <ClientOnly fallback={<HomepageContent conversationEnabled={false} />}>
      <ConversationProvider>
        <ConversationAwareWrapper />
      </ConversationProvider>
    </ClientOnly>
  );
}

function ConversationAwareWrapper() {
  const {lastResults} = useConversationContext();
  return (
    <HomepageContent conversationEnabled={true} restoredResults={lastResults} />
  );
}

interface HomepageContentProps {
  conversationEnabled: boolean;
  restoredResults?: {
    products: unknown[];
    heroContent: {title: string; subtitle: string; imageUrl?: string};
    query: string;
  } | null;
}

function HomepageContent({
  conversationEnabled,
  restoredResults,
}: HomepageContentProps) {
  const loaderData = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootLoader>('root');
  const curatedSectionRef = useRef<HTMLDivElement>(null);

  // Sentinel ref for detecting when hero scrolls out of view
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const [isInHero, setIsInHero] = useState(true);

  // IntersectionObserver: track whether the hero sentinel is visible
  useEffect(() => {
    const sentinel = heroSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsInHero(entry.isIntersecting),
      {threshold: 0.1},
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Cart state
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Product detail state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // Persist last viewed product so AI retains context after modal close
  const lastViewedProductRef = useRef<ProductContext | null>(null);

  // AI results state (from streaming)
  const [aiProducts, setAiProducts] = useState<Product[] | null>(null);
  const [aiCuratedHeader, setAiCuratedHeader] = useState<CuratedHeaderType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use AI products if available, then restored results, then defaults
  const products =
    aiProducts ||
    (restoredResults?.products as Product[]) ||
    loaderData.defaultProducts;
  const hasCuratedProducts = !!aiProducts || !!restoredResults;
  // Use AI header if available, then restored header
  const curatedHeader = aiCuratedHeader || restoredResults?.heroContent || null;

  // Scroll to curated products when they arrive
  useEffect(() => {
    if (aiProducts && curatedSectionRef.current) {
      curatedSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [aiProducts]);

  // Get selected variant based on color and size
  const getSelectedVariant = useCallback((): ProductVariant | null => {
    if (!selectedProduct?.variants?.length) return null;

    const colorOption = selectedProduct.options?.find(
      (opt) =>
        opt.name.toLowerCase() === 'color' ||
        opt.name.toLowerCase() === 'colour',
    );
    const colors = colorOption?.values || [];
    const currentColor = colors[selectedColorIndex];

    return (
      selectedProduct.variants.find((v) => {
        const matchesColor = v.selectedOptions.some(
          (opt) =>
            (opt.name.toLowerCase() === 'color' ||
              opt.name.toLowerCase() === 'colour') &&
            opt.value === currentColor,
        );
        const matchesSize =
          !selectedSize ||
          v.selectedOptions.some(
            (opt) =>
              opt.name.toLowerCase() === 'size' && opt.value === selectedSize,
          );
        return matchesColor && matchesSize;
      }) || null
    );
  }, [selectedProduct, selectedColorIndex, selectedSize]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSelectedColorIndex(0);
    setSelectedSize(null);
  };

  const handleCloseProduct = () => {
    setSelectedProduct(null);
    setSelectedColorIndex(0);
    setSelectedSize(null);
  };

  const handleSelectColor = (colorIndex: number) => {
    setSelectedColorIndex(colorIndex);
  };

  const handleSelectSize = (size: string) => {
    setSelectedSize(size);
  };

  const handleAddToCart = () => {
    const variant = getSelectedVariant();
    if (variant) {
      console.log('Adding to cart:', variant);
      alert(`Added ${selectedProduct?.title} (${variant.title}) to cart!`);
    }
  };

  // Build product context for AI when a product is selected
  const currentVariant = getSelectedVariant();
  const activeProductContext: ProductContext | null = selectedProduct
    ? {
        id: selectedProduct.id,
        handle: selectedProduct.handle,
        title: selectedProduct.title,
        vendor: selectedProduct.vendor,
        description: selectedProduct.description,
        price: selectedProduct.price,
        compareAtPrice: selectedProduct.compareAtPrice,
        availableOptions:
          selectedProduct.options?.map((opt) => ({
            name: opt.name,
            values: opt.values,
          })) || [],
        selectedVariant: currentVariant
          ? {
              id: currentVariant.id,
              title: currentVariant.title,
              availableForSale: currentVariant.availableForSale,
            }
          : undefined,
      }
    : null;

  // Update last viewed product ref whenever a product is actively selected
  if (activeProductContext) {
    lastViewedProductRef.current = activeProductContext;
  }

  // Use active product context, or fall back to last viewed (with flag)
  const productContext: ProductContext | null = activeProductContext
    ?? (lastViewedProductRef.current
      ? {...lastViewedProductRef.current, isLastViewed: true}
      : null);

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

      <main
        className={`min-h-screen bg-[var(--moa-bg)] pb-24 ${selectedProduct ? 'overflow-hidden' : ''}`}
      >
        {/* Welcome Hero — branding + headline, chat input rendered as child */}
        <WelcomeHero ref={heroSentinelRef}>
          {conversationEnabled ? (
            <StreamingConversationPrompt
              productContext={productContext}
              onProductsReceived={setAiProducts}
              onCuratedHeaderReceived={setAiCuratedHeader}
              onError={setError}
              onClearLastViewed={() => { lastViewedProductRef.current = null; }}
              isInHero={isInHero}
            />
          ) : null}
        </WelcomeHero>

        {/* Products Section */}
        <div ref={curatedSectionRef} className="bg-[var(--moa-bg)] min-h-[50vh]">
          {error && (
            <div className="text-[var(--moa-error)] text-center py-6 px-8 mx-auto my-8 max-w-[500px] bg-[var(--moa-surface)] border border-[var(--moa-border)] font-[var(--font-body)] text-sm">
              {error}
            </div>
          )}

          {hasCuratedProducts && curatedHeader && (
            <CuratedHeader
              title={curatedHeader.title}
              subtitle={curatedHeader.subtitle}
              imageUrl={curatedHeader.imageUrl}
            />
          )}

          {!selectedProduct && (
            <ProductGrid
              products={products}
              onSelectProduct={handleSelectProduct}
            />
          )}

          {selectedProduct && (
            <ProductDetail
              product={selectedProduct}
              selectedColorIndex={selectedColorIndex}
              onClose={handleCloseProduct}
            />
          )}

          {selectedProduct && (
            <ProductActionBar
              product={selectedProduct}
              selectedVariant={getSelectedVariant()}
              onSelectColor={handleSelectColor}
              onSelectSize={handleSelectSize}
              onAddToCart={handleAddToCart}
              onClose={handleCloseProduct}
              selectedColorIndex={selectedColorIndex}
              selectedSize={selectedSize}
            />
          )}
        </div>

        {/* ConciergePrompt is rendered inside WelcomeHero above.
            When isInHero=false, it uses position:fixed and visually
            moves to bottom-right regardless of DOM position. */}
      </main>
    </>
  );
}

function StreamingConversationPrompt(props: {
  productContext: ProductContext | null;
  onProductsReceived: (products: Product[] | null) => void;
  onCuratedHeaderReceived: (header: CuratedHeaderType | null) => void;
  onError: (error: string | null) => void;
  onClearLastViewed: () => void;
  isInHero?: boolean;
}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasSearchStarted, setHasSearchStarted] = useState(false);

  // Reset search flag when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      setHasSearchStarted(false);
    }
  }, [isStreaming]);

  // Only show loading overlay when:
  // 1. Currently streaming
  // 2. Not actively viewing a product detail
  // 3. The search_shop_catalog tool has been called (meaning products are being fetched)
  const isActivelyViewingProduct = props.productContext && !props.productContext.isLastViewed;
  const showLoadingOverlay = isStreaming && !isActivelyViewingProduct && hasSearchStarted;

  return (
    <>
      <AnimatePresence mode="wait">
        {showLoadingOverlay && <LoadingOverlay key="loading" />}
      </AnimatePresence>
      <StreamingConversationPromptInner
        {...props}
        onStreamingChange={setIsStreaming}
        onSearchStarted={setHasSearchStarted}
      />
    </>
  );
}

function StreamingConversationPromptInner({
  productContext,
  onProductsReceived,
  onCuratedHeaderReceived,
  onError,
  onStreamingChange,
  onSearchStarted,
  onClearLastViewed,
  isInHero,
}: {
  productContext: ProductContext | null;
  onProductsReceived: (products: Product[] | null) => void;
  onCuratedHeaderReceived: (header: CuratedHeaderType | null) => void;
  onError: (error: string | null) => void;
  onStreamingChange: (isStreaming: boolean) => void;
  onSearchStarted: (started: boolean) => void;
  onClearLastViewed: () => void;
  isInHero?: boolean;
}) {
  const {
    messages,
    addUserMessage,
    addAssistantMessage,
    saveResults,
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
  const streamProductIdRef = useRef<string | null>(null);
  const lastSubmittedTranscriptRef = useRef<string | null>(null);
  // Track which TTS segments have been queued to prevent double-speaking
  const spokenPreToolRef = useRef(false);
  const spokenFinalRef = useRef(false);

  // Abort stream if user switches to a different product while streaming
  useEffect(() => {
    const currentProductId = productContext?.isLastViewed ? null : (productContext?.id ?? null);
    if (state.isStreaming && streamProductIdRef.current !== currentProductId) {
      reset();
    }
  }, [productContext?.id, productContext?.isLastViewed, state.isStreaming, reset]);

  // Notify parent of streaming state changes
  useEffect(() => {
    onStreamingChange(state.isStreaming);
  }, [state.isStreaming, onStreamingChange]);

  // Notify parent when search_shop_catalog tool starts (triggers loading overlay)
  useEffect(() => {
    const hasSearch = state.toolCalls.some(tc => tc.tool === 'search_shop_catalog');
    if (hasSearch) {
      onSearchStarted(true);
    }
  }, [state.toolCalls, onSearchStarted]);

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

    if (state.fullText && !state.isStreaming) {
      // Add the completed assistant message to conversation
      addAssistantMessage(state.fullText, {
        toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
        thinkingText: state.thinkingText || undefined,
        contentBlocks: state.contentBlocks.length > 0 ? state.contentBlocks : undefined,
      });

      // Handle products
      console.log(
        '[StreamingPrompt] Products check:',
        state.products?.length,
        'products',
      );
      if (state.products && state.products.length > 0) {
        console.log(
          '[StreamingPrompt] Calling onProductsReceived with',
          state.products.length,
          'products',
        );
        onProductsReceived(state.products as Product[]);

        // Use curated header from stream if available
        const header = state.curatedHeader || {
          title: 'Curated For You',
          subtitle: '',
        };
        console.log('[StreamingPrompt] Curated header:', JSON.stringify({
          title: header.title,
          subtitle: header.subtitle,
          hasImageUrl: !!header.imageUrl,
          imageUrlLength: header.imageUrl?.length,
          imageUrlPrefix: header.imageUrl?.slice(0, 50),
        }));
        onCuratedHeaderReceived(header);

        // Save results for restoration
        if (lastQueryRef.current) {
          saveResults({
            products: state.products,
            heroContent: header,
            query: lastQueryRef.current,
          });
        }
      } else if (
        state.intent?.type === 'product_search' &&
        state.intent?.showProducts === false
      ) {
        // Product search with no results - don't change products
      }

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

      // Handle errors
      if (state.error) {
        onError(state.error);
      } else {
        onError(null);
      }
    }
  }, [
    state.fullText,
    state.isStreaming,
    state.products,
    state.curatedHeader,
    state.contextUpdate,
    state.intent,
    state.error,
    state.toolCalls,
    state.thinkingText,
    state.cartId,
    addAssistantMessage,
    onProductsReceived,
    onCuratedHeaderReceived,
    onError,
    saveResults,
    updateShoppingContext,
  ]);

  const handleSubmit = useCallback(
    (formData: FormData) => {
      const query = formData.get('query')?.toString().trim();
      if (!query) return;

      lastQueryRef.current = query;
      // Track which product this stream is for (so we can abort on product change)
      streamProductIdRef.current = productContext?.isLastViewed ? null : (productContext?.id ?? null);
      // Cancel any in-progress TTS queue from previous response
      if (voiceMode.isVoiceMode) {
        voiceMode.stopSpeaking();
      }
      // Reset TTS segment tracking for the new stream
      spokenPreToolRef.current = false;
      spokenFinalRef.current = false;
      // Determine the active product ID (ignore lastViewed for product-switch tracking)
      const activeProductId = productContext?.isLastViewed ? null : (productContext?.id ?? null);
      addUserMessage(query, activeProductId ?? undefined);
      onError(null);

      // Build form data with all context
      const streamFormData = new FormData();
      streamFormData.set('query', query);
      streamFormData.set('history', getHistoryForSubmission(activeProductId));
      streamFormData.set('shoppingContext', getContextForSubmission());
      if (productContext) {
        streamFormData.set('productContext', JSON.stringify(productContext));
      }

      void startStream(streamFormData);
    },
    [
      addUserMessage,
      getHistoryForSubmission,
      getContextForSubmission,
      productContext,
      startStream,
      onError,
    ],
  );

  // (heroSubmitRef removed — ConciergePrompt is now the hero input directly)

  const handleNewChat = useCallback(() => {
    reset();
    startNewConversation();
    onProductsReceived(null);
    onCuratedHeaderReceived(null);
    onError(null);
    onClearLastViewed();
    lastSubmittedTranscriptRef.current = null;
  }, [
    reset,
    startNewConversation,
    onProductsReceived,
    onCuratedHeaderReceived,
    onError,
    onClearLastViewed,
  ]);

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
        // Had tool calls — speak all text blocks after the first one
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
        // No tool calls — speak the entire response
        const fullText = state.streamedText.trim();
        if (fullText) {
          voiceMode.queueSpeech(fullText);
        }
      }

      // Signal that no more segments are coming
      voiceMode.finishSpeechQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isStreaming, state.fullText]);

  return (
    <ConciergePrompt
      isLoading={false}
      historyJson={getHistoryForSubmission()}
      shoppingContextJson={getContextForSubmission()}
      productContextJson={productContext ? JSON.stringify(productContext) : ''}
      messages={messages}
      hasHistory={hasHistory}
      onNewChat={handleNewChat}
      onSubmit={handleSubmit}
      streamingText={state.streamedText}
      streamingContentBlocks={state.contentBlocks}
      streamingThinkingText={state.thinkingText}
      isStreaming={state.isStreaming}
      suggestedPrompts={productContext && !productContext.isLastViewed ? state.suggestedPrompts : null}
      isVoiceMode={voiceMode.isVoiceMode}
      voiceState={voiceMode.voiceState}
      audioLevel={voiceMode.audioLevel}
      onToggleVoiceMode={voiceMode.toggleVoiceMode}
      onStopSpeaking={voiceMode.stopSpeaking}
      onStartListening={voiceMode.startListening}
      isInHero={isInHero}
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

  // Get cart count for header
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


const DEFAULT_PRODUCTS_QUERY = `#graphql
  query DefaultProducts(
    $first: Int
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: $first, sortKey: BEST_SELLING) {
      nodes {
        id
        handle
        title
        description
        vendor
        productType
        tags
        availableForSale
        featuredImage {
          url
          altText
        }
        images(first: 10) {
          nodes {
            url
          }
        }
        options {
          name
          values
        }
        variants(first: 50) {
          nodes {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
            compareAtPrice {
              amount
              currencyCode
            }
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
          }
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
` as const;
