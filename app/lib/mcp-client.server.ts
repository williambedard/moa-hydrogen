/**
 * MCP Client for Shopify Storefront
 * Connects to the Storefront MCP server to get and call tools.
 *
 * Supports merging tools from the Customer Account MCP server when
 * the customer is authenticated. Tool calls are routed to the correct
 * MCP server based on the tool's `source` tag.
 *
 * Module-level caching: auth cookies and tools list are cached across
 * requests within the same Cloudflare Workers isolate lifetime.
 */

import type {CustomerMcpTool, CustomerAccountMcpClient} from './customer-account-mcp.server';

export interface MCPTool {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Which MCP server this tool came from. Defaults to 'storefront'. */
  source?: 'storefront' | 'customer';
}

export interface MCPToolResult {
  content: Array<{type: string; text: string}>;
  isError?: boolean;
}

interface JSONRPCResponse {
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

// ---------------------------------------------------------------------------
// Module-level cache — persists within a single CF Workers isolate lifetime
// ---------------------------------------------------------------------------

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOOLS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface AuthCacheEntry {
  cookies: string;
  expiresAt: number;
}

interface ToolsCacheEntry {
  tools: MCPTool[];
  expiresAt: number;
}

/** Cached auth cookies keyed by storeDomain (single-tenant: one store per deployment) */
const authCache = new Map<string, AuthCacheEntry>();

/** Cached MCP tools keyed by storeDomain */
const toolsCache = new Map<string, ToolsCacheEntry>();

/**
 * Clear all cached auth and tools data. Useful for testing.
 */
export function clearMCPCache(): void {
  authCache.clear();
  toolsCache.clear();
  console.log('[MCP Cache] Cleared all cached auth and tools');
}

export class MCPClient {
  private tools: MCPTool[] = [];
  private storefrontMcpEndpoint: string;
  private storeDomain: string;
  private authCookies: string | null = null;

  /** Customer Account MCP client + token for routing customer tool calls */
  private customerMcpClient: CustomerAccountMcpClient | null = null;
  private customerAccessToken: string | null = null;

  constructor(
    storeDomain: string,
    private storePassword?: string,
  ) {
    this.storeDomain = storeDomain;
    // The storefront MCP endpoint is at /api/mcp on the store domain
    this.storefrontMcpEndpoint = `${storeDomain}/api/mcp`;
  }

  /**
   * Authenticate with the password-protected storefront to get session cookies.
   * Uses module-level cache to avoid re-authenticating on every request.
   * Includes retry with exponential backoff.
   */
  private async authenticateWithStorefront(): Promise<void> {
    if (!this.storePassword) {
      console.log('[MCP Auth] No STORE_PASSWORD provided, skipping authentication');
      return;
    }

    // Check cache first
    const cached = authCache.get(this.storeDomain);
    if (cached && Date.now() < cached.expiresAt) {
      console.log('[MCP Auth] Using cached auth cookies (expires in ' +
        Math.round((cached.expiresAt - Date.now()) / 1000) + 's)');
      this.authCookies = cached.cookies;
      return;
    }

    const authStart = Date.now();
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          const backoffMs = Math.pow(2, attempt - 1) * 1000;
          console.log(`[MCP Auth] Retry attempt ${attempt}/${maxRetries} after ${backoffMs}ms backoff`);
          await this.sleep(backoffMs);
        }

        console.log(`[MCP Auth] Starting authentication for ${this.storeDomain}`);

        const collectedCookies: Map<string, string> = new Map();

        // Step 1: GET /password to get initial cookies
        console.log(`[MCP Auth] Step 1: GET ${this.storeDomain}/password`);
        const getResponse = await fetch(`${this.storeDomain}/password`, {
          method: 'GET',
          headers: this.getBrowserHeaders(),
          redirect: 'manual',
        });

        console.log(`[MCP Auth]   -> ${getResponse.status} ${getResponse.statusText}`);
        this.logRedirectChain(getResponse);
        this.collectCookies(getResponse, collectedCookies, 'GET /password');

        // Step 2: POST /password with form data
        const cookieHeader = this.buildCookieHeader(collectedCookies);
        const formData = new URLSearchParams();
        formData.append('form_type', 'storefront_password');
        formData.append('utf8', '✓');
        formData.append('password', this.storePassword);
        formData.append('commit', 'Enter');

        console.log(`[MCP Auth] Step 2: POST ${this.storeDomain}/password`);
        const postResponse = await fetch(`${this.storeDomain}/password`, {
          method: 'POST',
          headers: {
            ...this.getBrowserHeaders(),
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: this.storeDomain,
            Referer: `${this.storeDomain}/password`,
            ...(cookieHeader ? {Cookie: cookieHeader} : {}),
          },
          body: formData.toString(),
          redirect: 'manual',
        });

        console.log(`[MCP Auth]   -> ${postResponse.status} ${postResponse.statusText}`);
        this.logRedirectChain(postResponse);
        this.collectCookies(postResponse, collectedCookies, 'POST /password');

        // Check for storefront_digest cookie (the key auth cookie)
        const hasDigest = Array.from(collectedCookies.keys()).some(
          (name) => name.includes('storefront_digest') || name.includes('_storefront_digest'),
        );
        console.log(`[MCP Auth] Has storefront_digest cookie: ${hasDigest}`);

        // Check if authentication succeeded
        if (postResponse.status >= 300 && postResponse.status < 400) {
          const location = postResponse.headers.get('location');
          console.log(`[MCP Auth] Redirect location: ${location}`);

          if (location && location.includes('/password')) {
            throw new Error(
              'Authentication failed: Wrong password (redirected back to /password)',
            );
          }

          console.log('[MCP Auth] ✓ Authentication successful (redirected away from /password)');
        } else if (postResponse.status === 200) {
          // Got 200 on POST - might still be on password page (wrong password)
          const body = await postResponse.text();
          if (
            body.includes('Enter store using password') ||
            body.includes('password-form') ||
            body.includes('incorrect')
          ) {
            throw new Error(
              'Authentication failed: Wrong password (still showing password form)',
            );
          }
        }

        // Store the collected cookies
        if (collectedCookies.size > 0) {
          this.authCookies = this.buildCookieHeader(collectedCookies) ?? null;
          console.log(`[MCP Auth] Stored ${collectedCookies.size} cookies`);
          console.log(`[MCP Auth] Cookie names: ${Array.from(collectedCookies.keys()).join(', ')}`);

          // Cache the auth cookies at the module level
          if (this.authCookies) {
            authCache.set(this.storeDomain, {
              cookies: this.authCookies,
              expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
            });
            console.log(`[MCP Auth] Cached auth cookies for ${AUTH_CACHE_TTL_MS / 1000}s`);
          }
        } else {
          console.warn('[MCP Auth] No cookies collected');
        }

        console.log(`[MCP Auth] Auth completed in ${Date.now() - authStart}ms`);
        return; // Success - exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[MCP Auth] Attempt ${attempt} failed: ${lastError.message}`);

        if (lastError.message.includes('Wrong password')) {
          // Don't retry on wrong password
          throw lastError;
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      throw new Error(`[MCP Auth] Failed after ${maxRetries} attempts: ${lastError.message}`);
    }
  }

  /**
   * Invalidate cached auth and retry authentication. Called when an
   * MCP request gets a 401/403 suggesting stale auth cookies.
   */
  private invalidateAuthCache(): void {
    authCache.delete(this.storeDomain);
    this.authCookies = null;
    console.log('[MCP Auth] Invalidated cached auth for', this.storeDomain);
  }

  private getBrowserHeaders(): Record<string, string> {
    return {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
  }

  private logRedirectChain(response: Response): void {
    const location = response.headers.get('location');
    if (location) {
      console.log(`[MCP Auth]   -> Redirects to: ${location}`);
    }
  }

  private buildCookieHeader(cookies: Map<string, string>): string | undefined {
    if (cookies.size === 0) return undefined;
    return Array.from(cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Collect cookies from a response into the cookie map
   */
  private collectCookies(
    response: Response,
    cookies: Map<string, string>,
    context: string,
  ): void {
    const cookieStrings: string[] = [];

    // Try getSetCookie (modern API)
    if (typeof response.headers.getSetCookie === 'function') {
      cookieStrings.push(...response.headers.getSetCookie());
    }

    // Also try raw header as fallback
    const rawSetCookie = response.headers.get('set-cookie');
    if (rawSetCookie && cookieStrings.length === 0) {
      cookieStrings.push(...rawSetCookie.split(/,(?=[^;]+=[^;]+;)/));
    }

    for (const cookieStr of cookieStrings) {
      const nameValue = cookieStr.split(';')[0].trim();
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex > 0) {
        const name = nameValue.substring(0, eqIndex);
        const value = nameValue.substring(eqIndex + 1);
        cookies.set(name, value);
      }
    }

    if (cookieStrings.length > 0) {
      const names = cookieStrings.map((c) => c.split('=')[0]).join(', ');
      console.log(`[MCP Auth]   -> Set-Cookie (${context}): ${names}`);

      // Specifically check for storefront_digest
      const hasDigest = cookieStrings.some((c) =>
        c.toLowerCase().includes('storefront_digest'),
      );
      if (hasDigest) {
        console.log('[MCP Auth]   -> ✓ Found storefront_digest cookie!');
      }
    }
  }

  /**
   * Connect to the storefront MCP server and retrieve available tools.
   * Uses module-level cache for both auth cookies and tools list.
   */
  async connect(): Promise<MCPTool[]> {
    try {
      // Authenticate first if password is provided (uses cache)
      await this.authenticateWithStorefront();

      // Check tools cache (with TTL)
      const cachedEntry = toolsCache.get(this.storeDomain);
      if (cachedEntry && cachedEntry.tools.length > 0 && Date.now() < cachedEntry.expiresAt) {
        console.log(`[MCP] Using cached tools list (${cachedEntry.tools.length} tools)`);
        this.tools = cachedEntry.tools;
        return this.tools;
      }

      console.log(`[MCP] Connecting to ${this.storefrontMcpEndpoint}`);
      const toolsStart = Date.now();

      const response = await this.makeJsonRpcRequest('tools/list', {});

      const toolsData = response.result?.tools || [];
      this.tools = this.formatToolsData(toolsData);

      console.log(`[MCP] tools/list completed in ${Date.now() - toolsStart}ms`);
      console.log(`[MCP] ✓ Connected with ${this.tools.length} tools available:`);
      for (const tool of this.tools) {
        console.log(`[MCP]   - ${tool.name}: ${tool.description?.substring(0, 80)}...`);
      }

      // Cache the tools list with TTL
      if (this.tools.length > 0) {
        toolsCache.set(this.storeDomain, {
          tools: this.tools,
          expiresAt: Date.now() + TOOLS_CACHE_TTL_MS,
        });
        console.log('[MCP] Cached tools list (30min TTL)');
      }

      return this.tools;
    } catch (error) {
      console.error('[MCP] ✗ Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Get the list of available tools
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Call a tool on the appropriate MCP server.
   * Routes to Customer Account MCP for customer-sourced tools,
   * Storefront MCP for everything else.
   * If a 401/403 occurs on storefront, invalidates auth cache and retries once.
   */
  async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    // Route customer tools to Customer Account MCP
    if (this.isCustomerTool(toolName)) {
      if (!this.customerMcpClient || !this.customerAccessToken) {
        // Customer not authenticated — signal that auth is needed
        return {
          content: [{
            type: 'text',
            text: 'customer_auth_required: Please log in to access your account information.',
          }],
          isError: true,
        };
      }
      return this.customerMcpClient.callTool(toolName, toolArgs, this.customerAccessToken);
    }

    try {
      const toolStart = Date.now();
      console.log(`[MCP] Calling tool: ${toolName}`, toolArgs);

      const response = await this.makeJsonRpcRequest('tools/call', {
        name: toolName,
        arguments: toolArgs,
      });

      const result: MCPToolResult = (response.result as MCPToolResult) || {
        content: [{type: 'text', text: JSON.stringify(response)}],
      };

      console.log(`[MCP] Tool ${toolName} completed in ${Date.now() - toolStart}ms`);
      // Log the tool result
      console.log(`[MCP] Tool result (${toolName}):`);
      if (result.content) {
        for (const item of result.content) {
          if (item.type === 'text') {
            // Pretty print JSON if possible, otherwise log as-is
            try {
              const parsed = JSON.parse(item.text);
              console.log(JSON.stringify(parsed, null, 2));
            } catch {
              console.log(item.text);
            }
          } else {
            console.log(item);
          }
        }
      }

      return result;
    } catch (error) {
      // If auth error, invalidate cache and retry once
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('unauthorized (401)') || errMsg.includes('forbidden (403)')) {
        console.log(`[MCP] Auth error calling ${toolName}, invalidating cache and retrying...`);
        this.invalidateAuthCache();
        await this.authenticateWithStorefront();
        try {
          const response = await this.makeJsonRpcRequest('tools/call', {
            name: toolName,
            arguments: toolArgs,
          });
          return (response.result as MCPToolResult) || {
            content: [{type: 'text', text: JSON.stringify(response)}],
          };
        } catch (retryError) {
          console.error(`[MCP] ✗ Tool call retry failed (${toolName}):`, retryError);
          return {
            content: [
              {
                type: 'text',
                text: `Error calling tool ${toolName}: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }
      }

      console.error(`[MCP] ✗ Tool call failed (${toolName}):`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Merge Customer Account MCP tools into the tool set.
   * Call this after the customer authenticates via PKCE OAuth.
   *
   * The customer tools are tagged with source: 'customer' and callTool
   * will route them to the Customer Account MCP server automatically.
   */
  mergeCustomerTools(
    customerTools: CustomerMcpTool[],
    customerClient: CustomerAccountMcpClient,
    accessToken: string,
  ): void {
    this.customerMcpClient = customerClient;
    this.customerAccessToken = accessToken;

    // Remove any previously merged customer tools
    this.tools = this.tools.filter((t) => t.source !== 'customer');

    // Add customer tools
    const formatted: MCPTool[] = customerTools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
      source: 'customer' as const,
    }));
    this.tools.push(...formatted);

    console.log(`[MCP] Merged ${formatted.length} customer tools. Total: ${this.tools.length}`);
  }

  /**
   * Check whether the customer is authenticated (has Customer Account MCP access).
   */
  isCustomerAuthenticated(): boolean {
    return Boolean(this.customerAccessToken && this.customerMcpClient);
  }

  /**
   * Check whether a tool name belongs to the Customer Account MCP.
   */
  isCustomerTool(toolName: string): boolean {
    return this.tools.some((t) => t.name === toolName && t.source === 'customer');
  }

  /**
   * Make a JSON-RPC request to the MCP endpoint
   */
  private async makeJsonRpcRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<JSONRPCResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getBrowserHeaders(),
      Accept: 'application/json',
    };

    // Include auth cookies if available
    if (this.authCookies) {
      headers['Cookie'] = this.authCookies;
    }

    console.log(
      `[MCP] Request: ${method} to ${this.storefrontMcpEndpoint} (cookies: ${this.authCookies ? 'yes' : 'no'})`,
    );

    const response = await fetch(this.storefrontMcpEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        id: 1,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const truncatedError = errorText.substring(0, 200);
      console.log(`[MCP] ✗ Response: ${response.status} ${response.statusText}`);

      if (response.status === 401) {
        throw new Error(
          `MCP request unauthorized (401). The storefront_digest cookie may be missing or invalid. ` +
          `Check that STORE_PASSWORD is correct.`
        );
      }
      if (response.status === 403) {
        throw new Error(
          `MCP request forbidden (403). May be blocked by Cloudflare or store security. ${truncatedError}`
        );
      }
      throw new Error(`MCP request failed: ${response.status} ${truncatedError}`);
    }

    const jsonResponse = (await response.json()) as JSONRPCResponse;

    if (jsonResponse.error) {
      throw new Error(
        `MCP error: ${jsonResponse.error.code} ${jsonResponse.error.message}`,
      );
    }

    return jsonResponse;
  }

  /**
   * Format tools data into a consistent format for Claude
   */
  private formatToolsData(
    toolsData: Array<{
      name: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      input_schema?: Record<string, unknown>;
    }>,
  ): MCPTool[] {
    return toolsData.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: (tool.inputSchema || tool.input_schema) as MCPTool['input_schema'],
      source: 'storefront' as const,
    }));
  }
}
