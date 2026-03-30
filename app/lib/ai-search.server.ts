import Anthropic from '@anthropic-ai/sdk';
import {MCPClient} from './mcp-client.server';
import type {ShoppingContext, ContextUpdate, CartContext} from './shopping-context';
import {
  formatContextForPrompt,
  parseContextUpdate,
} from './shopping-context.server';

export interface EnrichedProductVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  price: string;
  compareAtPrice?: string;
  selectedOptions: Array<{name: string; value: string}>;
  image?: {
    url: string;
    altText?: string;
  };
}

export interface EnrichedProductOption {
  name: string;
  values: string[];
}

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
  options?: EnrichedProductOption[];
  variants?: EnrichedProductVariant[];
}

export interface AISearchResult {
  products: EnrichedProduct[];
  contextTitle: string;
  contextSubtitle: string;
  assistantMessage: string;
  contextUpdate?: ContextUpdate;
}

interface MCPProduct {
  id?: string;
  product_id?: string;
  handle?: string;
  title?: string;
  url?: string;
}

interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type StorefrontClient = {
  query: (query: string, ...options: unknown[]) => Promise<unknown>;
};

export interface ConversationHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function processAIQuery(
  userQuery: string,
  storeDomain: string,
  storefront: StorefrontClient,
  apiKey: string,
  baseURL: string,
  model: string,
  storePassword?: string,
  conversationHistory?: ConversationHistoryMessage[],
  shoppingContext?: ShoppingContext | null,
  cartContext?: CartContext | null,
): Promise<AISearchResult> {
  const anthropic = new Anthropic({
    apiKey,
    baseURL,
  });

  // Initialize MCP client and get tools
  // Pass store password for preflight authentication if store is password-protected
  const mcpClient = new MCPClient(storeDomain, storePassword);
  const mcpTools = await mcpClient.connect();

  const hasHistory = conversationHistory && conversationHistory.length > 0;
  const contextBlock = formatContextForPrompt(shoppingContext || null, cartContext || null);
  const cartIdNote = cartContext?.id
    ? `\n\nCart ID for cart tools: ${cartContext.id}`
    : '';

  const systemPrompt = `You are a helpful shopping assistant for an online store. Your goal is to help customers find products they're looking for.

When a user describes what they want, use the available tools to search for relevant products. Be creative with search terms to maximize relevant results.

After finding products, provide:
1. A short, engaging title for the results (e.g., "Summer Dresses For You", "Cozy Winter Essentials")
2. A brief subtitle describing what was found

Keep responses friendly and helpful. Focus on understanding the user's needs and finding the best matches.${
    hasHistory
      ? `

IMPORTANT: This is a multi-turn conversation. The user may reference previous queries or results. Use the conversation context to understand follow-up requests like "show me those in red" or "what about a smaller size?". When the user refers to previous results, search for products that match both the original criteria and the new refinement.`
      : ''
  }${contextBlock}${cartIdNote}

CONTEXT EXTRACTION: When the user mentions new shopping preferences, constraints, or product feedback, output a context update block at the END of your response in this exact format:

---CONTEXT_UPDATE---
{
  "preferences": {"colors": ["blue"], "budget": {"max": 100, "currency": "$"}, "occasion": "wedding"},
  "constraints": ["needs pockets", "no polyester"],
  "rejectedProducts": ["product-handle-1"],
  "likedProducts": ["product-handle-2"]
}
---END_CONTEXT_UPDATE---

Only include fields that changed or were newly mentioned. Do not repeat existing context. If nothing changed, do not include the block.`;

  // Build messages array from history + current query
  let messages: Anthropic.MessageParam[] = [];

  if (hasHistory) {
    // Add conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Add current user query
  messages.push({role: 'user', content: userQuery});

  // Convert MCP tools to Anthropic tool format
  const tools: Anthropic.Tool[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool['input_schema'],
  }));

  // Initial API call
  let response = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
  });

  let allMcpProducts: MCPProduct[] = [];
  let contextTitle = 'Products For You';
  let contextSubtitle = 'Curated based on your request';

  // Handle tool calls in a loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    const toolResults: ToolResultContent[] = [];

    for (const toolUse of toolUseBlocks) {
      // Inject cart_id for cart tools if available
      let toolArgs = toolUse.input as Record<string, unknown>;
      if (
        cartContext?.id &&
        ['get_cart', 'update_cart', 'add_to_cart'].includes(toolUse.name)
      ) {
        toolArgs = {...toolArgs, cart_id: cartContext.id};
      }

      // Call the tool via MCP
      const result = await mcpClient.callTool(toolUse.name, toolArgs);

      // Extract products if this is a product search tool
      const products = extractMCPProducts(result);
      console.log(`[AI Search] Extracted ${products.length} products from tool ${toolUse.name}`);
      if (products.length > 0) {
        console.log(`[AI Search] Product IDs: ${products.map(p => p.id || p.product_id).join(', ')}`);
        allMcpProducts = [...allMcpProducts, ...products];
      }

      // Format result content for Claude
      const resultContent =
        result.content?.map((c) => c.text).join('\n') ||
        JSON.stringify(result);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
      });
    }

    // Add assistant response and tool results to messages
    messages = [
      ...messages,
      {role: 'assistant', content: response.content},
      {role: 'user', content: toolResults},
    ];

    // Continue the conversation
    response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
  }

  // Extract title and subtitle from final text response
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  let assistantMessage = '';
  let contextUpdate: ContextUpdate | undefined;

  if (textBlocks.length > 0) {
    const rawResponseText = textBlocks[0].text;

    // Parse out any context update markers
    const {cleanedText, update} = parseContextUpdate(rawResponseText);
    assistantMessage = cleanedText;
    if (update) {
      contextUpdate = update;
    }

    // Try to extract a title-like first line
    const lines = cleanedText.split('\n').filter((line) => line.trim());
    if (lines.length > 0) {
      // Clean up the title - remove markdown formatting
      const rawTitle = lines[0].replace(/[#*_]/g, '').trim();
      if (rawTitle.length < 60) {
        contextTitle = rawTitle;
      }
      if (lines.length > 1) {
        const rawSubtitle = lines[1].replace(/[#*_]/g, '').trim();
        if (rawSubtitle.length < 120) {
          contextSubtitle = rawSubtitle;
        }
      }
    }
  }

  // Remove duplicate products by handle or ID
  const uniqueProducts = allMcpProducts.reduce(
    (acc: MCPProduct[], product) => {
      // Use handle for dedup if available, otherwise use ID
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
    },
    [],
  );

  // Enrich products with full data from Storefront API
  console.log(`[AI Search] Unique products to enrich: ${uniqueProducts.length}`);
  const enrichedProducts = await enrichProductsFromStorefront(
    uniqueProducts.slice(0, 12),
    storefront,
  );

  console.log(`[AI Search] Final enriched products: ${enrichedProducts.length}`);
  if (enrichedProducts.length > 0) {
    console.log(`[AI Search] Product titles: ${enrichedProducts.map(p => p.title).join(', ')}`);
  }

  return {
    products: enrichedProducts,
    contextTitle,
    contextSubtitle,
    assistantMessage,
    contextUpdate,
  };
}

/**
 * Extract basic product data from MCP tool result
 */
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

    // Handle different response formats from MCP tools
    const productsArray = extractProductsArray(data);

    return productsArray
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const product = p as Record<string, unknown>;
        return {
          id: String(product.product_id || product.id || ''),
          product_id: String(product.product_id || product.id || ''),
          handle: String(product.handle || ''),
          title: String(product.title || ''),
          url: String(product.url || ''),
        };
      })
      .filter(Boolean) as MCPProduct[];
  } catch (error) {
    console.error('Error extracting products from result:', error);
    return [];
  }
}

/**
 * Extract products array from various response formats
 */
function extractProductsArray(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;

  // Check common patterns for product arrays
  if (Array.isArray(obj.products)) return obj.products;
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(data)) return data as unknown[];

  return [];
}

/**
 * Enrich products with full data from Storefront API
 */
async function enrichProductsFromStorefront(
  mcpProducts: MCPProduct[],
  storefront: StorefrontClient,
): Promise<EnrichedProduct[]> {
  if (mcpProducts.length === 0) {
    console.log('[AI Search] No MCP products to enrich');
    return [];
  }

  console.log(`[AI Search] Enriching ${mcpProducts.length} products from MCP`);

  // Extract handles for batch query
  const handles = mcpProducts
    .map((p) => p.handle)
    .filter((h): h is string => Boolean(h) && h.length > 0);

  // Extract product IDs (remove gid:// prefix for query)
  const productIds = mcpProducts
    .map((p) => p.id || p.product_id)
    .filter((id): id is string => Boolean(id) && id.length > 0);

  console.log(`[AI Search] Found ${handles.length} handles, ${productIds.length} product IDs`);

  // Build query string - prefer handles, fall back to IDs
  let queryString = '';
  if (handles.length > 0) {
    queryString = handles.map((h) => `handle:${h}`).join(' OR ');
  } else if (productIds.length > 0) {
    // Extract numeric IDs from gid://shopify/Product/123 format
    const numericIds = productIds
      .map((id) => {
        const match = id.match(/Product\/(\d+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
    if (numericIds.length > 0) {
      queryString = numericIds.map((id) => `id:${id}`).join(' OR ');
    }
  }

  if (!queryString) {
    console.log('[AI Search] No handles or IDs to query, returning empty');
    return [];
  }

  console.log(`[AI Search] Query string: ${queryString.substring(0, 100)}...`);

  try {
    // Batch fetch products from Storefront API
    const queryCount = Math.max(handles.length, productIds.length, 1);
    console.log(`[AI Search] Fetching ${queryCount} products from Storefront API`);

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
    console.log(`[AI Search] Storefront API returned ${storefrontProducts.length} products`);

    if (storefrontProducts.length === 0) {
      console.log('[AI Search] No products returned from Storefront API');
    }

    // Map storefront data to enriched format
    return storefrontProducts.map((product) => {
      const price = `${product.priceRange.minVariantPrice.currencyCode} ${product.priceRange.minVariantPrice.amount}`;
      const compareAtAmount = parseFloat(
        product.compareAtPriceRange.minVariantPrice.amount,
      );
      const compareAtPrice =
        compareAtAmount > 0
          ? `${product.compareAtPriceRange.minVariantPrice.currencyCode} ${product.compareAtPriceRange.minVariantPrice.amount}`
          : undefined;

      const variants: EnrichedProductVariant[] = product.variants.nodes.map(
        (v) => ({
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
        }),
      );

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

    // Fallback: return basic product data from MCP
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
