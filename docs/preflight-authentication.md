# Authenticating with Password-Protected Shopify Storefronts for MCP

When integrating with Shopify's MCP (Model Context Protocol) server on a password-protected storefront, you need to perform "preflight" authentication to obtain session cookies before making MCP requests.

## Background

### What is Shopify MCP?

Shopify storefronts can expose an MCP server at `/api/mcp` that provides tools for AI agents to interact with the store (search products, get collections, etc.). This uses the JSON-RPC protocol.

### The Problem

Password-protected Shopify storefronts (common during development or for private stores) block all unauthenticated requests:

- Direct requests to `/api/mcp` return `401 Unauthorized` or `403 Forbidden`
- The store requires a `storefront_digest` cookie to prove you've entered the password
- This cookie is only issued through the browser-based password form flow

### The Solution

Programmatically replicate the browser's password submission flow to obtain the authentication cookies, then include them in MCP requests.

---

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Preflight Authentication                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. GET /password                                                │
│     └── Collect initial session cookies (_shopify_y, etc.)      │
│                                                                  │
│  2. POST /password                                               │
│     ├── Send form data with store password                      │
│     ├── Include cookies from step 1                             │
│     └── Receive storefront_digest cookie                        │
│                                                                  │
│  3. Use cookies in MCP requests                                  │
│     └── Include all collected cookies in Cookie header          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### Complete TypeScript Example

```typescript
/**
 * Authenticates with a password-protected Shopify storefront
 * and returns the cookies needed for MCP requests.
 */
async function authenticateWithStorefront(
  storeDomain: string,
  storePassword: string
): Promise<string> {
  const collectedCookies = new Map<string, string>();

  // Step 1: GET /password to collect initial session cookies
  const getResponse = await fetch(`${storeDomain}/password`, {
    method: 'GET',
    headers: getBrowserHeaders(),
    redirect: 'manual',
  });

  collectCookies(getResponse, collectedCookies);

  // Step 2: POST /password with form data
  const formData = new URLSearchParams();
  formData.append('form_type', 'storefront_password');
  formData.append('utf8', '✓');
  formData.append('password', storePassword);
  formData.append('commit', 'Enter');

  const cookieHeader = buildCookieHeader(collectedCookies);

  const postResponse = await fetch(`${storeDomain}/password`, {
    method: 'POST',
    headers: {
      ...getBrowserHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': storeDomain,
      'Referer': `${storeDomain}/password`,
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
    },
    body: formData.toString(),
    redirect: 'manual',
  });

  collectCookies(postResponse, collectedCookies);

  // Validate authentication succeeded
  if (postResponse.status >= 300 && postResponse.status < 400) {
    const location = postResponse.headers.get('location');
    if (location?.includes('/password')) {
      throw new Error('Wrong password: redirected back to /password');
    }
  } else if (postResponse.status === 200) {
    const body = await postResponse.text();
    if (body.includes('Enter store using password') || body.includes('incorrect')) {
      throw new Error('Wrong password: still showing password form');
    }
  }

  // Verify we got the key cookie
  if (!collectedCookies.has('storefront_digest')) {
    console.warn('Warning: storefront_digest cookie not found');
  }

  return buildCookieHeader(collectedCookies) || '';
}

/**
 * Browser-like headers to avoid bot detection
 */
function getBrowserHeaders(): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

/**
 * Extract cookies from response Set-Cookie headers
 */
function collectCookies(response: Response, cookies: Map<string, string>): void {
  const cookieStrings: string[] = [];

  // Modern API (preferred)
  if (typeof response.headers.getSetCookie === 'function') {
    cookieStrings.push(...response.headers.getSetCookie());
  }

  // Fallback: parse raw header
  const rawSetCookie = response.headers.get('set-cookie');
  if (rawSetCookie && cookieStrings.length === 0) {
    // Split on comma, but not commas within cookie values
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
}

/**
 * Build Cookie header string from collected cookies
 */
function buildCookieHeader(cookies: Map<string, string>): string | undefined {
  if (cookies.size === 0) return undefined;
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
```

### Making Authenticated MCP Requests

Once you have the cookies, include them in your MCP requests:

```typescript
async function callMcpTool(
  storeDomain: string,
  authCookies: string,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${storeDomain}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': authCookies,
      ...getBrowserHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: 1,
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP request failed: ${response.status}`);
  }

  return response.json();
}
```

### Full Usage Example

```typescript
async function main() {
  const storeDomain = 'https://your-store.myshopify.com';
  const storePassword = process.env.STORE_PASSWORD!;

  // Authenticate and get cookies
  const authCookies = await authenticateWithStorefront(storeDomain, storePassword);
  console.log('Authenticated successfully');

  // List available MCP tools
  const toolsResponse = await fetch(`${storeDomain}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': authCookies,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
      params: {},
    }),
  });

  const tools = await toolsResponse.json();
  console.log('Available tools:', tools.result?.tools);

  // Call a tool
  const searchResult = await callMcpTool(
    storeDomain,
    authCookies,
    'search_products',
    { query: 'blue shirt' }
  );
  console.log('Search result:', searchResult);
}
```

---

## Key Details

### The `storefront_digest` Cookie

This is the critical authentication token. Without it, `/api/mcp` requests will fail. It's issued by Shopify after successful password submission.

### Form Data Fields

The password form submission requires these fields:

| Field | Value | Description |
|-------|-------|-------------|
| `form_type` | `storefront_password` | Identifies the form type |
| `utf8` | `✓` | UTF-8 encoding indicator |
| `password` | (your password) | The store password |
| `commit` | `Enter` | Submit button value |

### Browser Headers

Shopify may block requests that don't look like they're from a browser. The headers in `getBrowserHeaders()` mimic a real Chrome browser.

### Detecting Success vs Failure

| Response | Meaning |
|----------|---------|
| 302 redirect away from `/password` | Success |
| 302 redirect back to `/password` | Wrong password |
| 200 with password form HTML | Wrong password |
| 200 with store content | Success (rare) |

---

## Adding Retry Logic

For production use, add exponential backoff for transient failures:

```typescript
async function authenticateWithRetry(
  storeDomain: string,
  storePassword: string,
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
      return await authenticateWithStorefront(storeDomain, storePassword);
    } catch (error) {
      lastError = error as Error;

      // Don't retry on wrong password
      if (lastError.message.includes('Wrong password')) {
        throw lastError;
      }
      console.error(`Attempt ${attempt} failed: ${lastError.message}`);
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` on MCP requests | Missing or invalid cookies | Ensure auth completed successfully and cookies are included |
| `403 Forbidden` | Cloudflare/bot protection | Verify browser headers are set correctly |
| `Wrong password` error | Incorrect password | Check `STORE_PASSWORD` env var matches store settings |
| No `storefront_digest` cookie | Auth may have silently failed | Check response bodies for error messages |
| Cookies expire | Session timeout | Re-authenticate before making new requests |

---

## Security Notes

- Store passwords in environment variables, not in code
- Cookies are sensitive - don't log them in production
- Each client/session should maintain its own authentication state
- Consider re-authenticating periodically for long-running processes
