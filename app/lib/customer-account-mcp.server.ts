/**
 * Customer Account MCP Client
 *
 * JSON-RPC 2.0 client for the Shopify Customer Account MCP server.
 * Provides order management, returns, and account tools for authenticated customers.
 *
 * Pattern based on Shopify's shop-chat-agent reference app.
 *
 * Flow:
 *   1. Discover MCP endpoint via .well-known/customer-account-api
 *   2. Authenticate customer via PKCE OAuth (handled by auth routes)
 *   3. Call tools/list to discover available tools
 *   4. Call tools/call to execute individual tools
 *
 * Tools are tagged with source: 'customer' so the AI stream can route
 * tool calls to the correct MCP server.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerMcpTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Which MCP server this tool came from */
  source: 'storefront' | 'customer';
}

interface CustomerMcpToolResult {
  content: Array<{type: string; text: string}>;
  isError?: boolean;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: {
    tools?: Array<{
      name: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      input_schema?: Record<string, unknown>;
    }>;
    content?: Array<{type: string; text: string}>;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface CustomerAccountApiWellKnown {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  mcp_endpoint?: string;
  // May contain other OpenID fields
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Endpoint Discovery Cache
// ---------------------------------------------------------------------------

const DISCOVERY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface DiscoveryCache {
  mcpEndpoint: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  expiresAt: number;
}

const discoveryCache = new Map<string, DiscoveryCache>();

// ---------------------------------------------------------------------------
// Customer Account MCP Client
// ---------------------------------------------------------------------------

export class CustomerAccountMcpClient {
  private shopDomain: string;
  private mcpEndpoint: string | null = null;
  private authorizationEndpoint: string | null = null;
  private tokenEndpoint: string | null = null;

  constructor(shopDomain: string) {
    // Normalize: strip protocol if present, we'll add https://
    this.shopDomain = shopDomain.replace(/^https?:\/\//, '');
  }

  /**
   * Discover MCP and OAuth endpoints from the store's well-known URLs.
   * Results are cached for 1 hour.
   */
  async discoverEndpoints(): Promise<{
    mcpEndpoint: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
  }> {
    // Check cache
    const cached = discoveryCache.get(this.shopDomain);
    if (cached && Date.now() < cached.expiresAt) {
      this.mcpEndpoint = cached.mcpEndpoint;
      this.authorizationEndpoint = cached.authorizationEndpoint;
      this.tokenEndpoint = cached.tokenEndpoint;
      return cached;
    }

    console.log(`[CustomerMCP] Discovering endpoints for ${this.shopDomain}`);

    // Step 1: Fetch .well-known/customer-account-api for MCP endpoint
    const customerApiUrl = `https://${this.shopDomain}/.well-known/customer-account-api`;
    const customerApiResponse = await fetch(customerApiUrl);
    if (!customerApiResponse.ok) {
      throw new Error(
        `Failed to discover Customer Account API: ${customerApiResponse.status} ${customerApiResponse.statusText}. ` +
        `Ensure the store has New Customer Accounts enabled and a custom domain.`
      );
    }
    const customerApiData = (await customerApiResponse.json()) as CustomerAccountApiWellKnown;

    // Step 2: Fetch .well-known/openid-configuration for OAuth endpoints
    const oidcUrl = `https://${this.shopDomain}/.well-known/openid-configuration`;
    const oidcResponse = await fetch(oidcUrl);
    if (!oidcResponse.ok) {
      throw new Error(
        `Failed to discover OpenID configuration: ${oidcResponse.status}. ` +
        `The store may not have Customer Accounts properly configured.`
      );
    }
    const oidcData = (await oidcResponse.json()) as CustomerAccountApiWellKnown;

    const mcpEndpoint = customerApiData.mcp_endpoint;
    const authorizationEndpoint = oidcData.authorization_endpoint;
    const tokenEndpoint = oidcData.token_endpoint;

    if (!mcpEndpoint || typeof mcpEndpoint !== 'string') {
      throw new Error(
        'Customer Account MCP endpoint not found in .well-known/customer-account-api. ' +
        'The store may not support Customer Account MCP yet.'
      );
    }

    if (!authorizationEndpoint || !tokenEndpoint) {
      throw new Error(
        'OAuth endpoints not found in .well-known/openid-configuration.'
      );
    }

    const result = {
      mcpEndpoint: mcpEndpoint as string,
      authorizationEndpoint: authorizationEndpoint as string,
      tokenEndpoint: tokenEndpoint as string,
    };

    // Cache
    this.mcpEndpoint = result.mcpEndpoint;
    this.authorizationEndpoint = result.authorizationEndpoint;
    this.tokenEndpoint = result.tokenEndpoint;
    discoveryCache.set(this.shopDomain, {
      ...result,
      expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
    });

    console.log(`[CustomerMCP] Discovered endpoints:`);
    console.log(`[CustomerMCP]   MCP: ${result.mcpEndpoint}`);
    console.log(`[CustomerMCP]   Auth: ${result.authorizationEndpoint}`);
    console.log(`[CustomerMCP]   Token: ${result.tokenEndpoint}`);

    return result;
  }

  /**
   * Get the authorization endpoint for the PKCE OAuth flow.
   * Call discoverEndpoints() first.
   */
  getAuthorizationEndpoint(): string {
    if (!this.authorizationEndpoint) {
      throw new Error('Call discoverEndpoints() first');
    }
    return this.authorizationEndpoint;
  }

  /**
   * Get the token endpoint for exchanging auth codes.
   * Call discoverEndpoints() first.
   */
  getTokenEndpoint(): string {
    if (!this.tokenEndpoint) {
      throw new Error('Call discoverEndpoints() first');
    }
    return this.tokenEndpoint;
  }

  /**
   * Discover available tools from the Customer Account MCP server.
   * Requires a valid customer access token (from PKCE OAuth).
   *
   * Returns tools tagged with source: 'customer' for routing.
   */
  async listTools(accessToken: string): Promise<CustomerMcpTool[]> {
    if (!this.mcpEndpoint) {
      await this.discoverEndpoints();
    }

    console.log(`[CustomerMCP] Listing tools at ${this.mcpEndpoint}`);
    const response = await this.makeJsonRpcRequest(
      'tools/list',
      {},
      accessToken,
    );

    const toolsData = response.result?.tools || [];
    const tools: CustomerMcpTool[] = toolsData.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: (tool.inputSchema || tool.input_schema) as CustomerMcpTool['input_schema'],
      source: 'customer' as const,
    }));

    console.log(`[CustomerMCP] Discovered ${tools.length} customer tools:`);
    for (const tool of tools) {
      console.log(`[CustomerMCP]   - ${tool.name}: ${tool.description?.substring(0, 80)}...`);
    }

    return tools;
  }

  /**
   * Execute a tool on the Customer Account MCP server.
   */
  async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
    accessToken: string,
  ): Promise<CustomerMcpToolResult> {
    if (!this.mcpEndpoint) {
      await this.discoverEndpoints();
    }

    const toolStart = Date.now();
    console.log(`[CustomerMCP] Calling tool: ${toolName}`, toolArgs);

    try {
      const response = await this.makeJsonRpcRequest(
        'tools/call',
        {name: toolName, arguments: toolArgs},
        accessToken,
      );

      const result: CustomerMcpToolResult = (response.result as CustomerMcpToolResult) || {
        content: [{type: 'text', text: JSON.stringify(response)}],
      };

      console.log(`[CustomerMCP] Tool ${toolName} completed in ${Date.now() - toolStart}ms`);
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // Surface 401 specifically — the auth route handler uses this
      if (errMsg.includes('401')) {
        throw new Error(`customer_auth_required: ${errMsg}`);
      }

      console.error(`[CustomerMCP] Tool call failed (${toolName}):`, error);
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${toolName}: ${errMsg}`,
        }],
        isError: true,
      };
    }
  }

  /**
   * Make a JSON-RPC 2.0 request to the Customer Account MCP endpoint.
   */
  private async makeJsonRpcRequest(
    method: string,
    params: Record<string, unknown>,
    accessToken: string,
  ): Promise<JsonRpcResponse> {
    if (!this.mcpEndpoint) {
      throw new Error('MCP endpoint not discovered. Call discoverEndpoints() first.');
    }

    const response = await fetch(this.mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        id: Date.now(),
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Customer MCP request failed: ${response.status} ${response.statusText}. ${errorText.substring(0, 200)}`
      );
    }

    const jsonResponse = (await response.json()) as JsonRpcResponse;

    if (jsonResponse.error) {
      throw new Error(
        `Customer MCP error: ${jsonResponse.error.code} ${jsonResponse.error.message}`
      );
    }

    return jsonResponse;
  }
}

// ---------------------------------------------------------------------------
// PKCE Helpers (used by auth routes)
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE code verifier (43-128 character random string).
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate a PKCE code challenge from a code verifier (S256).
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a random state parameter for OAuth.
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
