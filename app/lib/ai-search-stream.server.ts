/**
 * Streaming AI search processor using Server-Sent Events.
 * Yields events as the AI processes the query and calls tools.
 *
 * Uses "virtual tools" (_concierge_* prefix) for structured metadata
 * instead of text markers. Virtual tools are intercepted server-side
 * and never sent to MCP.
 *
 * Two curated tools (_concierge_curate_content, _concierge_generate_image)
 * are "visible" — they emit tool_use_start/tool_use_end SSE events so
 * the conversation UI can show progress. All other virtual tools remain
 * invisible.
 */

import Anthropic from '@anthropic-ai/sdk';
import {MCPClient} from './mcp-client.server';
import type {
  ShoppingContext,
  ContextUpdate,
  CartContext,
} from './shopping-context';
import type {ProductContext} from './product-context';
import type {IntentType, IntentResult} from './intent-types';
import {formatContextForPrompt} from './shopping-context.server';
import {formatProductContextForPrompt} from './product-context';
import {generateHeaderImage} from './image-generation.server';

// ---------------------------------------------------------------------------
// Virtual tool definitions — handled server-side, never routed to MCP
// ---------------------------------------------------------------------------

const VIRTUAL_TOOL_PREFIX = '_concierge_';

function isVirtualTool(name: string): boolean {
  return name.startsWith(VIRTUAL_TOOL_PREFIX);
}

/** Invisible virtual tools — processed server-side, NO SSE events to the client. */
const INVISIBLE_VIRTUAL_TOOLS = new Set([
  '_concierge_suggest_prompts',
  '_concierge_update_context',
]);

function isInvisibleVirtualTool(name: string): boolean {
  return INVISIBLE_VIRTUAL_TOOLS.has(name);
}

const VIRTUAL_TOOLS: Anthropic.Tool[] = [
  {
    name: '_concierge_select_products',
    description:
      'After a product search, call this to display product cards in the chat. Pass the product IDs you want to recommend.',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_ids: {
          type: 'array',
          items: {type: 'string'},
          description:
            'Product IDs (e.g. "gid://shopify/Product/123") to display, in preferred order',
        },
      },
      required: ['product_ids'],
      additionalProperties: false,
    },
  },
  {
    name: '_concierge_suggest_prompts',
    description:
      'Suggest 3-4 follow-up questions the user might want to ask.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompts: {
          type: 'array',
          items: {type: 'string'},
          description: 'Short, conversational follow-up suggestions',
        },
      },
      required: ['prompts'],
      additionalProperties: false,
    },
  },
  {
    name: '_concierge_update_context',
    description:
      'Record shopping preferences the user mentioned (goals, budget, dietary needs, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        preferences: {
          type: 'object',
          properties: {
            categories: {type: 'array', items: {type: 'string'}},
            budget: {
              type: 'object',
              properties: {
                min: {type: 'number'},
                max: {type: 'number'},
                currency: {type: 'string'},
              },
              additionalProperties: false,
            },
            goals: {type: 'array', items: {type: 'string'}},
            dietary: {type: 'array', items: {type: 'string'}},
          },
          additionalProperties: false,
        },
        constraints: {
          type: 'array',
          items: {type: 'string'},
        },
      },
      additionalProperties: false,
    },
  },
];

export interface EnrichedProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  url: string;
  price: string;
  compareAtPrice?: string;
  image_url?: string;
  images: string[];
  vendor?: string;
  productType?: string;
  tags: string[];
  availableForSale: boolean;
  options?: Array<{name: string; values: string[]}>;
  variants?: Array<{
    id: string;
    title: string;
    availableForSale: boolean;
    price: string;
    compareAtPrice?: string;
    selectedOptions: Array<{name: string; value: string}>;
    image?: {url: string; altText?: string};
  }>;
}

export interface ToolCallInfo {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'complete' | 'error';
}

export type StreamEvent =
  | {type: 'stream_start'}
  | {type: 'text_delta'; delta: string}
  | {
      type: 'tool_use_start';
      id: string;
      tool: string;
      params: Record<string, unknown>;
    }
  | {type: 'tool_use_end'; id: string; tool: string; result: string}
  | {type: 'curated_products'; products: EnrichedProduct[]}
  | {
      type: 'curated_products_header';
      title: string;
      subtitle: string;
      imageUrl?: string;
    }
  | {type: 'suggested_prompts'; prompts: string[]}
  | {type: 'context_update'; update: ContextUpdate}
  | {type: 'thinking_delta'; delta: string}
  | {type: 'intent'; intent: IntentResult}
  | {type: 'cart_updated'; cartId: string}
  | {type: 'auth_required'; loginUrl: string}
  | {type: 'done'; fullText: string; toolCalls: ToolCallInfo[]}
  | {type: 'error'; message: string};

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MCPProduct {
  id?: string;
  product_id?: string;
  handle?: string;
  title?: string;
  url?: string;
}

type StorefrontClient = {
  query: <T = unknown>(
    query: string,
    options?: {variables?: Record<string, unknown>},
  ) => Promise<T>;
};

interface StreamAIQueryOptions {
  userQuery: string;
  storeDomain: string;
  storefront: StorefrontClient;
  apiKey: string;
  baseURL: string;
  model: string;
  storePassword?: string;
  conversationHistory?: ConversationHistoryMessage[];
  shoppingContext?: ShoppingContext | null;
  cartContext?: CartContext | null;
  productContext?: ProductContext | null;
  enableExtendedThinking?: boolean;
  imageGenerationUrl?: string;
  disableImageGeneration?: boolean;
  openaiBaseURL?: string;
  openaiApiKey?: string;
  /** Customer Account MCP access token (from PKCE OAuth login) */
  customerAccessToken?: string;
}

/**
 * Streams AI query processing as Server-Sent Events.
 */
export async function* streamAIQuery(
  options: StreamAIQueryOptions,
): AsyncGenerator<StreamEvent> {
  const {
    userQuery,
    storeDomain,
    storefront,
    apiKey,
    baseURL,
    model,
    storePassword,
    conversationHistory,
    shoppingContext,
    cartContext,
    productContext,
    enableExtendedThinking,
    imageGenerationUrl,
    disableImageGeneration,
    openaiBaseURL,
    openaiApiKey,
    customerAccessToken,
  } = options;

  const totalStart = Date.now();

  try {
    console.log('[streamAIQuery] Starting with query:', userQuery);
    console.log('[streamAIQuery] Using model:', model, 'baseURL:', baseURL);

    // Emit stream_start immediately so the client knows the stream is alive
    yield {type: 'stream_start'};

    // Shopify AI Proxy requires Authorization: Bearer (not X-Api-Key).
    // Local proxy (local.shop.dev) needs no auth — dev CLI handles it.
    // Remote proxy (proxy.shopify.ai) needs Bearer token via authToken.
    const isLocalProxy = baseURL?.includes('local.shop.dev');
    const anthropic = new Anthropic({
      ...(isLocalProxy
        ? {apiKey: 'local-proxy-no-auth-needed'}
        : {apiKey: 'not-used', authToken: apiKey}),
      baseURL,
      defaultHeaders: {
        'X-Shopify-Session-Affinity-Header': 'conversation-id',
        'X-Shopify-LLM-Container': 'moa-storefront',
        'X-Shopify-LLM-Attribution': 'product-discovery',
      },
    });

    // Initialize MCP client and get tools (uses module-level cache)
    // MCP is optional — if it fails (no storefront MCP, no password, etc.)
    // the AI still works but without product search/cart tools.
    const mcpStart = Date.now();
    let mcpClient: MCPClient | null = null;
    let mcpTools: Array<{name: string; description: string; input_schema: Record<string, unknown>}> = [];
    try {
      console.log('[streamAIQuery] Connecting to MCP...');
      mcpClient = new MCPClient(storeDomain, storePassword);
      mcpTools = await mcpClient.connect();
      console.log(`[streamAIQuery] MCP connected in ${Date.now() - mcpStart}ms, tools: ${mcpTools.length}`);
    } catch (mcpError) {
      console.warn(`[streamAIQuery] MCP connection failed (non-fatal): ${mcpError instanceof Error ? mcpError.message : mcpError}`);
      console.warn('[streamAIQuery] Continuing without MCP tools — AI will respond conversationally');
    }

    // If customer is authenticated, merge Customer Account MCP tools
    if (customerAccessToken && mcpClient) {
      try {
        const {CustomerAccountMcpClient} = await import('./customer-account-mcp.server');
        const customerMcp = new CustomerAccountMcpClient(storeDomain.replace(/^https?:\/\//, ''));
        await customerMcp.discoverEndpoints();
        const customerTools = await customerMcp.listTools(customerAccessToken);
        mcpClient.mergeCustomerTools(customerTools, customerMcp, customerAccessToken);
        console.log(`[streamAIQuery] Customer MCP tools merged: ${customerTools.length} tools`);
      } catch (customerMcpError) {
        console.warn(`[streamAIQuery] Customer MCP failed (non-fatal): ${customerMcpError instanceof Error ? customerMcpError.message : customerMcpError}`);
      }
    }

    const hasHistory = Boolean(
      conversationHistory && conversationHistory.length > 0,
    );
    const contextBlock = formatContextForPrompt(
      shoppingContext || null,
      cartContext || null,
    );
    const productBlock = formatProductContextForPrompt(productContext || null);
    const cartIdNote = cartContext?.id
      ? `\n\nCart ID for cart tools: ${cartContext.id}`
      : '';

    const systemPrompt = buildSystemPrompt(
      hasHistory,
      contextBlock,
      productBlock,
      cartIdNote,
    );

    // Build messages array from history + current query
    let messages: Anthropic.MessageParam[] = [];

    if (hasHistory && conversationHistory) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    messages.push({role: 'user', content: userQuery});

    // Merge MCP tools + virtual tools
    const tools: Anthropic.Tool[] = [
      ...mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
      })),
      ...VIRTUAL_TOOLS,
    ];

    let fullResponseText = '';
    const allToolCalls: ToolCallInfo[] = [];
    let allMcpProducts: MCPProduct[] = [];

    // Captured data from virtual tools
    let capturedSelectedIds: string[] | null = null;
    let capturedSuggestedPrompts: string[] | null = null;
    let capturedContextUpdate: ContextUpdate | null = null;

    // Track whether inline enrichment already emitted products
    let productsEmittedInline = false;

    // Track whether get_product_details has been called in this session
    // Used to enforce the rule: always call get_product_details before update_cart (add to cart)
    let productDetailsCalled = false;

    // Track whether update_cart was actually called for adding items (hallucination detection)
    let cartToolCalled = false;

    // Agentic loop - keep processing while there are tool calls.
    // Each iteration is a separate Claude API call: Claude responds,
    // we execute any tool calls, feed results back, and Claude continues.
    let continueLoop = true;
    let agenticTurn = 0;
    while (continueLoop) {
      continueLoop = false;
      agenticTurn++;

      // Build request params
      const requestParams: Anthropic.MessageCreateParams = {
        model,
        max_tokens: enableExtendedThinking === true ? 16000 : 4096,
        system: systemPrompt,
        tools,
        messages,
        stream: true,
      };

      // Add extended thinking if enabled
      if (enableExtendedThinking === true) {
        (
          requestParams as Anthropic.MessageCreateParams & {
            thinking?: {type: string; budget_tokens: number};
          }
        ).thinking = {
          type: 'enabled',
          budget_tokens: 10000,
        };
      }

      // Stream the response
      const streamStartTime = Date.now();
      // Log what Claude is processing this turn
      const msgCount = messages.length;
      const approxChars = messages.reduce((sum, m) => {
        const c = m.content;
        return sum + (typeof c === 'string' ? c.length : JSON.stringify(c).length);
      }, 0);
      console.log(
        `[streamAIQuery] Agentic turn ${agenticTurn}: calling Claude API (${msgCount} messages, ~${Math.round(approxChars / 1000)}k chars, ${tools.length} tools)`,
      );
      const stream = anthropic.messages.stream(requestParams);

      let currentToolUse: {id: string; name: string; input: string} | null =
        null;
      const pendingToolUses: Array<{
        id: string;
        name: string;
        input: Record<string, unknown>;
      }> = [];
      let currentTextBlock = '';
      let eventCount = 0;
      let firstEventLogged = false;

      try {
        for await (const event of stream) {
          if (!firstEventLogged) {
            console.log(
              `[streamAIQuery] Turn ${agenticTurn} first event: ${Date.now() - streamStartTime}ms`,
            );
            firstEventLogged = true;
          }
          eventCount++;
          if (eventCount <= 5 || eventCount % 20 === 0) {
            console.log(`[streamAIQuery] Turn ${agenticTurn} event #${eventCount}:`, event.type);
          }
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'thinking') {
              // Extended thinking block started
            } else if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
              };
            } else if (event.content_block.type === 'text') {
              currentTextBlock = '';
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta') {
              yield {type: 'thinking_delta', delta: event.delta.thinking};
            } else if (event.delta.type === 'text_delta') {
              currentTextBlock += event.delta.text;
              fullResponseText += event.delta.text;
              yield {type: 'text_delta', delta: event.delta.text};
            } else if (
              event.delta.type === 'input_json_delta' &&
              currentToolUse
            ) {
              currentToolUse.input += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              let parsedInput: Record<string, unknown> = {};
              try {
                parsedInput = JSON.parse(currentToolUse.input || '{}') as Record<
                  string,
                  unknown
                >;
              } catch {
                // Invalid JSON, use empty object
              }
              pendingToolUses.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                input: parsedInput,
              });

              // Emit tool_use_start immediately for visible tools as soon as
              // Claude declares them (during stream), so the client shows them
              // as "pending" while Claude continues outputting. Skip invisible
              // virtual tools — they are processed silently server-side.
              if (!isInvisibleVirtualTool(currentToolUse.name)) {
                yield {
                  type: 'tool_use_start',
                  id: currentToolUse.id,
                  tool: currentToolUse.name,
                  params: parsedInput,
                };
              }

              currentToolUse = null;
            }
          } else if (event.type === 'message_stop') {
            // Message complete
          }
        }
      } catch (streamError) {
        console.error(`[streamAIQuery] Stream error on turn ${agenticTurn}:`, streamError);
        yield {type: 'error' as const, message: streamError instanceof Error ? streamError.message : 'Stream failed'};
        return;
      }

      // Process pending tool calls
      if (pendingToolUses.length > 0) {
        // Only continue the agentic loop if there were real MCP tool calls.
        // Virtual tools all return 'OK' — Claude learns nothing new from them,
        // so an extra round-trip through the proxy is wasted latency.
        const hasMcpTools = pendingToolUses.some(
          (tu) => !isVirtualTool(tu.name),
        );
        continueLoop = hasMcpTools;

        // Build assistant content blocks for the response
        const assistantContent: Anthropic.ContentBlock[] = [];

        if (currentTextBlock) {
          assistantContent.push({
            type: 'text',
            text: currentTextBlock,
          } as Anthropic.TextBlock);
        }

        for (const toolUse of pendingToolUses) {
          assistantContent.push({
            type: 'tool_use',
            id: toolUse.id,
            name: toolUse.name,
            input: toolUse.input,
          });
        }

        const toolResults: Array<{
          type: 'tool_result';
          tool_use_id: string;
          content: string;
          is_error?: boolean;
        }> = [];

        for (const toolUse of pendingToolUses) {
          // --- Intercept virtual tools ---
          if (isVirtualTool(toolUse.name)) {
            // --- _concierge_select_products: enrich and emit product cards ---
            if (toolUse.name === '_concierge_select_products') {
              capturedSelectedIds = Array.isArray(
                toolUse.input.product_ids,
              )
                ? (toolUse.input.product_ids as string[])
                : null;

              const toolCallInfo: ToolCallInfo = {
                id: toolUse.id,
                tool: toolUse.name,
                params: toolUse.input,
                status: 'pending',
              };
              allToolCalls.push(toolCallInfo);

              // Inline enrichment: filter by ID, enrich, emit products NOW
              let enrichResultMsg: string;
              if (
                capturedSelectedIds &&
                capturedSelectedIds.length > 0 &&
                allMcpProducts.length > 0
              ) {
                const uniqueProducts = deduplicateProducts(allMcpProducts);
                // Match by product ID (case-insensitive for GID format variations)
                const selectedIdSet = new Set(
                  capturedSelectedIds.map((id) => id.toLowerCase()),
                );
                let productsToEnrich = uniqueProducts.filter((p) => {
                  const pid = (p.id || p.product_id || '').toLowerCase();
                  return pid && selectedIdSet.has(pid);
                });
                // Maintain the order specified by the AI
                const idOrder = capturedSelectedIds.map((id) =>
                  id.toLowerCase(),
                );
                productsToEnrich.sort((a, b) => {
                  const aId = (a.id || a.product_id || '').toLowerCase();
                  const bId = (b.id || b.product_id || '').toLowerCase();
                  return idOrder.indexOf(aId) - idOrder.indexOf(bId);
                });

                console.log(
                  '[streamAIQuery] Inline enrichment: enriching',
                  productsToEnrich.length,
                  'products by ID',
                );
                const enrichedProducts = await enrichProductsFromStorefront(
                  productsToEnrich.slice(0, 12),
                  storefront,
                );

                if (enrichedProducts.length > 0) {
                  console.log(
                    '[streamAIQuery] Emitting curated_products inline:',
                    enrichedProducts.length,
                  );
                  yield {
                    type: 'curated_products',
                    products: enrichedProducts,
                  };
                  productsEmittedInline = true;
                  enrichResultMsg = `Selected and enriched ${enrichedProducts.length} products`;
                } else {
                  enrichResultMsg =
                    'Products selected but enrichment returned no results';
                }
              } else {
                enrichResultMsg = capturedSelectedIds
                  ? 'Products selected (no MCP products to enrich yet)'
                  : 'No product IDs provided';
              }

              toolCallInfo.result = enrichResultMsg;
              toolCallInfo.status = 'complete';

              yield {
                type: 'tool_use_end',
                id: toolUse.id,
                tool: toolUse.name,
                result: enrichResultMsg,
              };

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: 'OK',
              });
              continue;
            }

            // --- Remaining invisible virtual tools ---
            switch (toolUse.name) {
              case '_concierge_suggest_prompts':
                capturedSuggestedPrompts = Array.isArray(toolUse.input.prompts)
                  ? (toolUse.input.prompts as string[])
                  : null;
                break;
              case '_concierge_update_context': {
                const inp = toolUse.input;
                capturedContextUpdate = {};
                if (inp.preferences && typeof inp.preferences === 'object') {
                  capturedContextUpdate.preferences =
                    inp.preferences as ContextUpdate['preferences'];
                }
                if (Array.isArray(inp.constraints)) {
                  capturedContextUpdate.constraints = (
                    inp.constraints as unknown[]
                  ).filter((c): c is string => typeof c === 'string');
                }
                if (Array.isArray(inp.rejectedProducts)) {
                  capturedContextUpdate.rejectedProducts = (
                    inp.rejectedProducts as unknown[]
                  ).filter((p): p is string => typeof p === 'string');
                }
                if (Array.isArray(inp.likedProducts)) {
                  capturedContextUpdate.likedProducts = (
                    inp.likedProducts as unknown[]
                  ).filter((p): p is string => typeof p === 'string');
                }
                break;
              }
              // _concierge_set_intent removed — no longer needed
            }
            // Invisible virtual tools: return OK to Claude, no SSE events
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: 'OK',
            });
            continue;
          }

          // --- Regular MCP tools: collect for parallel execution ---
          // MCP tools are collected separately and will be executed in parallel below.
          // We skip them in this loop body and handle them after virtual tools.
        }

        // --- Execute MCP tool calls in parallel ---
        // Collect all MCP tool uses that were NOT already handled as virtual tools.
        // Cart-modifying tools (update_cart, get_cart) run sequentially AFTER
        // parallel tools complete, to preserve ordering guarantees (e.g.
        // get_product_details must finish before update_cart can use the variant_id).
        const CART_TOOLS = ['update_cart', 'get_cart'];
        const allMcpToolUses = pendingToolUses.filter(
          (tu) => !isVirtualTool(tu.name),
        );
        const parallelMcpToolUses = allMcpToolUses.filter(
          (tu) => !CART_TOOLS.includes(tu.name),
        );
        const sequentialCartToolUses = allMcpToolUses.filter(
          (tu) => CART_TOOLS.includes(tu.name),
        );

        // Helper to execute a single MCP tool and return a uniform result shape
        const executeMcpTool = async (toolUse: {
          id: string;
          name: string;
          input: Record<string, unknown>;
        }) => {
          const toolCallInfo: ToolCallInfo = {
            id: toolUse.id,
            tool: toolUse.name,
            params: toolUse.input,
            status: 'pending',
          };
          allToolCalls.push(toolCallInfo);

          // Track get_product_details calls
          if (toolUse.name === 'get_product_details') {
            productDetailsCalled = true;
          }

          // Track cart modification calls
          if (toolUse.name === 'update_cart') {
            cartToolCalled = true;
          }

          // Enforce: update_cart when ADDING items (no line_id) requires get_product_details first
          const isCartAdd =
            toolUse.name === 'update_cart' && !toolUse.input.line_id;
          if (isCartAdd && !productDetailsCalled) {
            console.log(
              '[streamAIQuery] Blocking update_cart (add): get_product_details not called yet',
            );
            const errorMsg =
              'Error: You must call get_product_details first to get a valid variant_id before calling update_cart to add items. Call get_product_details with the product handle, then retry update_cart with the variant_id from the response.';
            toolCallInfo.result = errorMsg;
            toolCallInfo.status = 'error';
            return {
              toolUse,
              toolCallInfo,
              toolResult: {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: errorMsg,
                is_error: true,
              },
              products: [] as MCPProduct[],
              cartId: null as string | null,
            };
          }

          // Inject cart_id for cart tools if available
          let toolArgs = toolUse.input;
          if (
            cartContext?.id &&
            CART_TOOLS.includes(toolUse.name)
          ) {
            console.log(
              '[streamAIQuery] Injecting cart_id:',
              cartContext.id,
              'into tool:',
              toolUse.name,
            );
            toolArgs = {...toolArgs, cart_id: cartContext.id};
          }

          try {
            if (!mcpClient) {
              throw new Error('MCP not connected — cannot call tool');
            }
            const toolStart = Date.now();
            const result = await mcpClient.callTool(toolUse.name, toolArgs);
            console.log(`[streamAIQuery] MCP tool ${toolUse.name} completed in ${Date.now() - toolStart}ms`);

            const resultContent =
              result.content?.map((c: {text: string}) => c.text).join('\n') ||
              JSON.stringify(result);

            // Detect customer auth required — the MCP client returns this
            // when a customer-scoped tool is called without authentication
            if (resultContent.includes('customer_auth_required')) {
              toolCallInfo.result = 'Customer login required';
              toolCallInfo.status = 'error';
              return {
                toolUse,
                toolCallInfo,
                toolResult: {
                  type: 'tool_result' as const,
                  tool_use_id: toolUse.id,
                  content: 'The customer needs to log in to access their account information. Please provide a login link.',
                  is_error: true,
                },
                products: [],
                cartId: null,
                authRequired: true,
              };
            }

            const products = extractMCPProducts(result);

            let cartId: string | null = null;
            if (CART_TOOLS.includes(toolUse.name)) {
              cartId = extractCartIdFromResult(resultContent);
            }

            toolCallInfo.result = resultContent;
            toolCallInfo.status =
              result.isError === true ? 'error' : 'complete';

            return {
              toolUse,
              toolCallInfo,
              toolResult: {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: resultContent,
                ...(result.isError === true && {is_error: true}),
              },
              products,
              cartId,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Tool call failed';
            toolCallInfo.result = errorMessage;
            toolCallInfo.status = 'error';
            return {
              toolUse,
              toolCallInfo,
              toolResult: {
                type: 'tool_result' as const,
                tool_use_id: toolUse.id,
                content: `Error: ${errorMessage}`,
                is_error: true,
              },
              products: [] as MCPProduct[],
              cartId: null as string | null,
            };
          }
        };

        // Helper to process MCP tool result (emit events, collect data)
        const processMcpResult = function* (mcpResult: Awaited<ReturnType<typeof executeMcpTool>>) {
          // Check if customer auth is required for this tool
          if ('authRequired' in mcpResult && mcpResult.authRequired) {
            console.log('[streamAIQuery] Customer auth required for tool:', mcpResult.toolUse.name);
            yield {
              type: 'auth_required' as const,
              loginUrl: '/api/auth/login',
            };
          }
          if (mcpResult.products.length > 0) {
            allMcpProducts = [...allMcpProducts, ...mcpResult.products];
          }
          if (mcpResult.cartId) {
            console.log('[streamAIQuery] Cart ID from tool result:', mcpResult.cartId);
            yield {type: 'cart_updated' as const, cartId: mcpResult.cartId};
          }
          yield {
            type: 'tool_use_end' as const,
            id: mcpResult.toolUse.id,
            tool: mcpResult.toolUse.name,
            result: (mcpResult.toolResult.content || '').substring(0, 500),
          };
          toolResults.push(mcpResult.toolResult);
        };

        // Execute non-cart MCP tools in parallel
        // (tool_use_start already emitted during stream for all tools)
        if (parallelMcpToolUses.length > 0) {
          const mcpResults = await Promise.all(
            parallelMcpToolUses.map(executeMcpTool),
          );
          for (const mcpResult of mcpResults) {
            yield* processMcpResult(mcpResult);
          }
        }

        // Execute cart tools sequentially (ordering matters for guards)
        for (const toolUse of sequentialCartToolUses) {
          const mcpResult = await executeMcpTool(toolUse);
          yield* processMcpResult(mcpResult);
        }

        // Add assistant response and tool results to messages for next iteration
        // Ensure toolResults are in the same order as pendingToolUses
        const orderedToolResults = pendingToolUses.map((tu) => {
          const existing = toolResults.find((tr) => tr.tool_use_id === tu.id);
          return existing || {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: 'OK',
          };
        });

        messages = [
          ...messages,
          {role: 'assistant' as const, content: assistantContent},
          {role: 'user' as const, content: orderedToolResults},
        ];
      }
    }

    // --- Cart hallucination detection ---
    // If Claude claimed to add/update cart but never actually called update_cart,
    // inject a correction and re-enter the main agentic loop for one more pass.
    if (!cartToolCalled && claimsCartAdd(fullResponseText)) {
      console.log(
        '[streamAIQuery] Detected hallucinated cart action — forcing retry via main loop',
      );

      yield {
        type: 'text_delta',
        delta: '\n\n*One moment — let me actually do that now...*\n\n',
      };

      messages.push(
        {role: 'assistant' as const, content: fullResponseText},
        {
          role: 'user' as const,
          content:
            'You claimed you modified the cart but you did NOT actually call the update_cart tool. The cart is UNCHANGED. You MUST now call the tools: first get_product_details (if adding an item), then update_cart. Do not respond with only text — call the tools.',
        },
      );

      // Reset and re-enter the main agentic loop for one more pass
      fullResponseText = '';
      continueLoop = true;

      while (continueLoop) {
        continueLoop = false;

        const retryParams: Anthropic.MessageCreateParams = {
          model,
          max_tokens: enableExtendedThinking === true ? 16000 : 4096,
          system: systemPrompt,
          tools,
          messages,
          stream: true,
        };

        if (enableExtendedThinking === true) {
          (
            retryParams as Anthropic.MessageCreateParams & {
              thinking?: {type: string; budget_tokens: number};
            }
          ).thinking = {
            type: 'enabled',
            budget_tokens: 10000,
          };
        }

        const stream = anthropic.messages.stream(retryParams);

        let currentToolUse: {id: string; name: string; input: string} | null =
          null;
        const pendingToolUses: Array<{
          id: string;
          name: string;
          input: Record<string, unknown>;
        }> = [];
        let currentTextBlock = '';

        try {
          for await (const event of stream) {
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: '',
                };
              } else if (event.content_block.type === 'text') {
                currentTextBlock = '';
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                currentTextBlock += event.delta.text;
                fullResponseText += event.delta.text;
                yield {type: 'text_delta', delta: event.delta.text};
              } else if (
                event.delta.type === 'input_json_delta' &&
                currentToolUse
              ) {
                currentToolUse.input += event.delta.partial_json;
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolUse) {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(
                    currentToolUse.input || '{}',
                  ) as Record<string, unknown>;
                } catch {
                  /* noop */
                }
                pendingToolUses.push({
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input: parsedInput,
                });
                currentToolUse = null;
              }
            }
          }
        } catch (streamError) {
          console.error('[streamAIQuery] Retry stream error:', streamError);
          yield {type: 'error' as const, message: streamError instanceof Error ? streamError.message : 'Retry stream failed'};
          return;
        }

        if (pendingToolUses.length > 0) {
          continueLoop = true;
          const assistantContent: Anthropic.ContentBlock[] = [];
          if (currentTextBlock) {
            assistantContent.push({
              type: 'text',
              text: currentTextBlock,
            } as Anthropic.TextBlock);
          }
          for (const tu of pendingToolUses) {
            assistantContent.push({
              type: 'tool_use',
              id: tu.id,
              name: tu.name,
              input: tu.input,
            });
          }

          const toolResults: Array<{
            type: 'tool_result';
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }> = [];

          for (const tu of pendingToolUses) {
            // Virtual tools — return OK immediately
            if (isVirtualTool(tu.name)) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: 'OK',
              });
              continue;
            }

            if (tu.name === 'get_product_details') productDetailsCalled = true;
            if (tu.name === 'update_cart') cartToolCalled = true;

            yield {
              type: 'tool_use_start',
              id: tu.id,
              tool: tu.name,
              params: tu.input,
            };
            const tci: ToolCallInfo = {
              id: tu.id,
              tool: tu.name,
              params: tu.input,
              status: 'pending',
            };
            allToolCalls.push(tci);

            // Guard: adding items without get_product_details
            const isAdd = tu.name === 'update_cart' && !tu.input.line_id;
            if (isAdd && !productDetailsCalled) {
              const err =
                'Error: You must call get_product_details first to get a valid variant_id before calling update_cart to add items.';
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: err,
                is_error: true,
              });
              tci.result = err;
              tci.status = 'error';
              yield {
                type: 'tool_use_end',
                id: tu.id,
                tool: tu.name,
                result: err,
              };
              continue;
            }

            let toolArgs = tu.input;
            if (
              cartContext?.id &&
              ['get_cart', 'update_cart'].includes(tu.name)
            ) {
              toolArgs = {...toolArgs, cart_id: cartContext.id};
            }

            try {
              if (!mcpClient) {
                throw new Error('MCP not connected — cannot call tool');
              }
              const result = await mcpClient.callTool(tu.name, toolArgs);
              const rc =
                result.content?.map((c: {text: string}) => c.text).join('\n') ||
                JSON.stringify(result);
              if (['update_cart', 'get_cart'].includes(tu.name)) {
                const cid = extractCartIdFromResult(rc);
                if (cid) yield {type: 'cart_updated', cartId: cid};
              }
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: rc,
                ...(result.isError === true && {is_error: true}),
              });
              tci.result = rc;
              tci.status = result.isError === true ? 'error' : 'complete';
              yield {
                type: 'tool_use_end',
                id: tu.id,
                tool: tu.name,
                result: rc.substring(0, 500),
              };
            } catch (error) {
              const em =
                error instanceof Error ? error.message : 'Tool call failed';
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Error: ${em}`,
                is_error: true,
              });
              tci.result = em;
              tci.status = 'error';
              yield {
                type: 'tool_use_end',
                id: tu.id,
                tool: tu.name,
                result: `Error: ${em}`,
              };
            }
          }

          messages = [
            ...messages,
            {role: 'assistant' as const, content: assistantContent},
            {role: 'user' as const, content: toolResults},
          ];
        }
      }
    }

    // Emit events from captured virtual tool data
    if (capturedSuggestedPrompts && capturedSuggestedPrompts.length > 0) {
      yield {type: 'suggested_prompts', prompts: capturedSuggestedPrompts};
    }

    if (capturedContextUpdate) {
      yield {type: 'context_update', update: capturedContextUpdate};
    }

    // Safety fallback: enrich and emit products if they weren't already emitted inline.
    if (!productsEmittedInline && allMcpProducts.length > 0) {
      console.log(
        '[streamAIQuery] Fallback: products not emitted inline, enriching post-stream.',
        'MCP products:',
        allMcpProducts.length,
      );
      const uniqueProducts = deduplicateProducts(allMcpProducts);

      let productsToEnrich = uniqueProducts;
      if (capturedSelectedIds && capturedSelectedIds.length > 0) {
        const selectedIdSet = new Set(
          capturedSelectedIds.map((id) => id.toLowerCase()),
        );
        productsToEnrich = uniqueProducts.filter((p) => {
          const pid = (p.id || p.product_id || '').toLowerCase();
          return pid && selectedIdSet.has(pid);
        });
        const idOrder = capturedSelectedIds.map((id) => id.toLowerCase());
        productsToEnrich.sort((a, b) => {
          const aId = (a.id || a.product_id || '').toLowerCase();
          const bId = (b.id || b.product_id || '').toLowerCase();
          return idOrder.indexOf(aId) - idOrder.indexOf(bId);
        });
      }

      const enrichStart = Date.now();
      const enrichedProducts = await enrichProductsFromStorefront(
        productsToEnrich.slice(0, 12),
        storefront,
      );
      console.log(`[streamAIQuery] Fallback product enrichment took ${Date.now() - enrichStart}ms`);
      if (enrichedProducts.length > 0) {
        yield {type: 'curated_products', products: enrichedProducts};
      }
    } else if (!productsEmittedInline) {
      console.log('[streamAIQuery] No MCP products found');
    }

    console.log(`[streamAIQuery] Total stream duration: ${Date.now() - totalStart}ms`);

    // Emit done event — fullResponseText is already clean (no markers)
    yield {
      type: 'done',
      fullText: fullResponseText,
      toolCalls: allToolCalls,
    };
  } catch (error) {
    console.error('[streamAIQuery] Error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    yield {type: 'error', message};
  }
}

/**
 * Creates a ReadableStream of Server-Sent Events from the async generator.
 */
export function createSSEStream(
  generator: AsyncGenerator<StreamEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of generator) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        controller.close();
      } catch (error) {
        const errorEvent: StreamEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Stream error',
        };
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`),
        );
        controller.close();
      }
    },
  });
}

export function buildSystemPrompt(
  hasHistory: boolean,
  contextBlock: string,
  productBlock: string,
  cartIdNote: string,
): string {
  return `You're the MOA concierge. MOA (Mechanism of Action) is a premium supplement brand — clinical-grade, evidence-backed, no fluff.

You know your stuff: sports nutrition, supplementation science, training, recovery. Think chill friend who actually reads the research. Confident but never pushy.

TONE:
- Match the user's energy. Short question → short answer. Detailed question → go deeper.
- Keep it natural. No bullet-point lists unless the user asks for a breakdown. No emojis. No exclamation marks.
- Don't over-explain. If they ask "got creatine?" the answer isn't a paragraph.
- Be direct and honest. If we don't carry something, just say so and move on.
- You can talk science, training, nutrition — you don't have to sell every turn.

THE STORE:
MOA sells a small, curated line of clinical-grade supplements: creatine (Creapure-certified), omega-3, and a growing catalog. The catalog is intentionally tight — a few things done well. Products show up as cards in the chat that users can add to cart directly.
${hasHistory ? '\nOngoing conversation — use earlier context for follow-ups.\n' : ''}${contextBlock}${productBlock}${cartIdNote}

TOOLS (invisible to the user):
- search_shop_catalog: search products. Always pass "query" and "context" args. Use specific terms.
- _concierge_select_products: after a search with results, pass product IDs to show cards in chat.
- get_product_details: fetch details (ingredients, variants) before answering specific product questions.
- get_cart / update_cart: check or modify cart. Get variant IDs from get_product_details first — never fabricate them. Actually call the tools when modifying cart.
- Customer account tools (only available when the customer is logged in): order lookup, order details, account info. If a customer asks about their orders or account but isn't logged in, just say "I'll need you to log in so I can pull up your account." The UI will handle showing a login button.

Always end your turn with text — never finish on just tool calls.`;
}

/**
 * Detect if the AI response text claims to have modified the cart
 * (added, updated, or removed items) without actually calling update_cart.
 */
function claimsCartAdd(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    // Add claims
    "i've added",
    'i have added',
    'added it to your cart',
    'added that to your cart',
    'added to your cart',
    'added it for you',
    "it's in your cart",
    'it is in your cart',
    'been added to your cart',
    'placed it in your cart',
    'put it in your cart',
    'popped it in your cart',
    'popped that into your cart',
    // Update claims
    "i've updated your cart",
    'i have updated your cart',
    'updated the quantity',
    'changed the quantity',
    // Remove claims
    "i've removed",
    'i have removed',
    'removed it from your cart',
    'removed that from your cart',
    'taken it out of your cart',
  ];
  return patterns.some((p) => lower.includes(p));
}

function extractMCPProducts(result: {
  content?: Array<{type: string; text: string}>;
}): MCPProduct[] {
  try {
    if (!result.content || result.content.length === 0) {
      return [];
    }

    const content = result.content[0].text;
    let data: unknown;

    try {
      data = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      return [];
    }

    const productsArray = extractProductsArray(data);

    // Log first product to see structure
    if (productsArray.length > 0) {
      console.log(
        '[extractMCPProducts] Sample product structure:',
        JSON.stringify(productsArray[0], null, 2),
      );
    }

    return productsArray
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const product = p as Record<string, unknown>;
        const title = String(product.title || '');

        // Try to extract handle from various sources
        let handle = String(product.handle || '');
        if (!handle && product.url) {
          // Extract handle from URL like "/products/gray-runners"
          const urlMatch = String(product.url).match(/\/products\/([^/?]+)/);
          if (urlMatch) {
            handle = urlMatch[1];
          }
        }
        if (!handle && title) {
          // Generate handle from title: "Gray Runners" → "gray-runners"
          handle = slugify(title);
        }

        return {
          id: String(product.product_id || product.id || ''),
          product_id: String(product.product_id || product.id || ''),
          handle,
          title,
          url: String(product.url || `/products/${handle}`),
        };
      })
      .filter(Boolean) as MCPProduct[];
  } catch {
    return [];
  }
}

/**
 * Convert a title to a URL-friendly handle.
 * "Gray Runners" → "gray-runners"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Remove consecutive hyphens
}

/**
 * Extract cart ID from cart tool result content.
 * Cart IDs look like "gid://shopify/Cart/xxxxx"
 */
function extractCartIdFromResult(resultContent: string): string | null {
  try {
    // Try to parse as JSON first
    const data = JSON.parse(resultContent) as Record<string, unknown>;

    // Check common locations for cart ID
    if (typeof data.cart_id === 'string') return data.cart_id;
    if (typeof data.cartId === 'string') return data.cartId;
    if (typeof data.id === 'string' && data.id.includes('Cart')) return data.id;
    if (
      data.cart &&
      typeof (data.cart as Record<string, unknown>).id === 'string'
    ) {
      return (data.cart as Record<string, unknown>).id as string;
    }
  } catch {
    // Not JSON, try regex
  }

  // Try to find cart GID in the string
  const gidMatch = resultContent.match(/gid:\/\/shopify\/Cart\/[a-zA-Z0-9]+/);
  if (gidMatch) {
    return gidMatch[0];
  }

  return null;
}

function extractProductsArray(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.products)) return obj.products;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(data)) return data as unknown[];

  return [];
}

function deduplicateProducts(products: MCPProduct[]): MCPProduct[] {
  return products.reduce((acc: MCPProduct[], product) => {
    const handle = product.handle;
    const id = product.id || product.product_id;

    if (handle && handle.length > 0) {
      if (!acc.find((p) => p.handle === handle)) {
        acc.push(product);
      }
    } else if (id) {
      if (!acc.find((p) => (p.id || p.product_id) === id)) {
        acc.push(product);
      }
    }
    return acc;
  }, []);
}

async function enrichProductsFromStorefront(
  mcpProducts: MCPProduct[],
  storefront: StorefrontClient,
): Promise<EnrichedProduct[]> {
  if (mcpProducts.length === 0) {
    return [];
  }

  // Prefer product IDs (more reliable from MCP) over handles
  const productIds = mcpProducts
    .map((p) => p.id || p.product_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const handles = mcpProducts
    .map((p) => p.handle)
    .filter((h): h is string => typeof h === 'string' && h.length > 0);

  let queryString = '';
  if (productIds.length > 0) {
    // Use product IDs - extract numeric ID from GID
    const numericIds = productIds
      .map((id) => {
        const match = id.match(/Product\/(\d+)/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null);
    if (numericIds.length > 0) {
      queryString = numericIds.map((id: string) => `id:${id}`).join(' OR ');
      console.log('[enrichProducts] Using product IDs:', numericIds);
    }
  }

  // Fallback to handles if no IDs
  if (!queryString && handles.length > 0) {
    queryString = handles.map((h: string) => `handle:${h}`).join(' OR ');
    console.log('[enrichProducts] Falling back to handles:', handles);
  }

  if (!queryString) {
    return [];
  }

  try {
    const queryCount = Math.max(handles.length, productIds.length, 1);

    const result = (await storefront.query(PRODUCTS_BY_HANDLES_QUERY, {
      variables: {
        query: queryString,
        first: queryCount,
      },
    })) as {
      products: {
        nodes: Array<{
          id: string;
          handle: string;
          title: string;
          description: string;
          vendor: string;
          productType: string;
          tags: string[];
          availableForSale: boolean;
          featuredImage?: {
            url: string;
            altText?: string;
          };
          images: {
            nodes: Array<{url: string}>;
          };
          options: Array<{name: string; values: string[]}>;
          variants: {
            nodes: Array<{
              id: string;
              title: string;
              availableForSale: boolean;
              price: {amount: string; currencyCode: string};
              compareAtPrice?: {amount: string; currencyCode: string};
              selectedOptions: Array<{name: string; value: string}>;
              image?: {url: string; altText?: string};
            }>;
          };
          priceRange: {
            minVariantPrice: {
              amount: string;
              currencyCode: string;
            };
          };
          compareAtPriceRange: {
            minVariantPrice: {
              amount: string;
              currencyCode: string;
            };
          };
        }>;
      };
    };

    const storefrontProducts = result.products?.nodes || [];

    return storefrontProducts.map((product) => {
      const price = `${product.priceRange.minVariantPrice.currencyCode} ${product.priceRange.minVariantPrice.amount}`;
      const compareAtAmount = parseFloat(
        product.compareAtPriceRange.minVariantPrice.amount,
      );
      const compareAtPrice =
        compareAtAmount > 0
          ? `${product.compareAtPriceRange.minVariantPrice.currencyCode} ${product.compareAtPriceRange.minVariantPrice.amount}`
          : undefined;

      const variants = product.variants.nodes.map((v) => ({
        id: v.id,
        title: v.title,
        availableForSale: v.availableForSale,
        price: `${v.price.currencyCode} ${v.price.amount}`,
        compareAtPrice: v.compareAtPrice
          ? `${v.compareAtPrice.currencyCode} ${v.compareAtPrice.amount}`
          : undefined,
        selectedOptions: v.selectedOptions,
        image: v.image
          ? {url: v.image.url, altText: v.image.altText}
          : undefined,
      }));

      return {
        id: product.id,
        handle: product.handle,
        title: product.title,
        description: product.description,
        url: `/products/${product.handle}`,
        price,
        compareAtPrice,
        image_url: product.featuredImage?.url,
        images: product.images.nodes.map((img) => img.url),
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        availableForSale: product.availableForSale,
        options: product.options,
        variants,
      };
    });
  } catch (error) {
    console.error('Error enriching products from Storefront API:', error);
    return mcpProducts.map((p) => ({
      id: p.id || p.product_id || '',
      handle: p.handle || '',
      title: p.title || 'Product',
      description: '',
      url: p.url || `/products/${p.handle}`,
      price: 'Price not available',
      images: [],
      tags: [],
      availableForSale: true,
      options: [],
      variants: [],
    }));
  }
}

const PRODUCTS_BY_HANDLES_QUERY = `#graphql
  query ProductsByHandles(
    $query: String!
    $first: Int!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: $first, query: $query) {
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
