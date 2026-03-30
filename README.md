# AI Shopping Experience

A Shopify Hydrogen storefront with an AI-powered product discovery feature. Users can describe what they're looking for in natural language, and an AI assistant finds relevant products from the catalog.

## Features

### AI Product Search

The home page features an elegant AI-powered search experience:

- **Natural Language Queries** - Users type what they're looking for in conversational language (e.g., "Find me a summer dress for a beach wedding")
- **Claude AI Integration** - Uses Anthropic's Claude API to understand user intent and orchestrate product searches
- **MCP Tool Integration** - Connects to Shopify's Storefront MCP server to search products using Claude's tool-use capabilities
- **Curated Results** - AI generates contextual titles and subtitles for search results
- **Luxury UI Design** - Minimal glass header, animated gradient prompt border, responsive product grid

### Technical Highlights

- **React Router v7** - File-based routing with streaming SSR
- **Shopify Hydrogen 2025** - Headless commerce framework
- **Tailwind CSS v4** - Utility-first styling
- **Framer Motion** - Smooth animations and transitions

## Getting Started

### Requirements

- Node.js 18+
- Shopify store with Storefront API access
- Anthropic API key

### Environment Variables

```bash
# Required
PUBLIC_STORE_DOMAIN=your-store.myshopify.com
ANTHROPIC_API_KEY=sk-ant-...

# Optional - for password-protected stores
STORE_PASSWORD=your-store-password
```

### Development

```bash
npm install
npm run dev
```

## Storefront MCP: Password-Protected Store Workaround

When working with development stores that have password protection enabled, the Storefront MCP endpoint (`/api/mcp`) requires authentication. The standard MCP client won't work because requests are blocked by the password page.

### The Problem

Password-protected Shopify stores redirect unauthenticated requests to `/password`. The MCP endpoint returns 401/403 errors without the `storefront_digest` session cookie.

### The Solution

This repo includes a custom MCP client (`app/lib/mcp-client.server.ts`) that performs **preflight authentication**:

1. **GET `/password`** - Fetches the password page to collect initial session cookies
2. **POST `/password`** - Submits the store password with form data to authenticate
3. **Extract `storefront_digest`** - Captures the authentication cookie from the response
4. **Include in MCP requests** - Attaches the cookie to all subsequent MCP API calls

### Usage

Set the `STORE_PASSWORD` environment variable:

```bash
STORE_PASSWORD=your-store-password
```

The MCP client automatically handles authentication when this variable is present. Authentication includes retry logic with exponential backoff for reliability.

### Implementation Details

```typescript
// The client authenticates before connecting to MCP
const mcpClient = new MCPClient(storeDomain, storePassword);
await mcpClient.connect(); // Handles preflight auth internally

// Subsequent tool calls include the auth cookie
const result = await mcpClient.callTool('search_products', { query: '...' });
```

Key features of the authentication flow:
- Mimics browser headers (User-Agent, Accept, etc.)
- Follows redirect chains correctly
- Handles both redirect-based and 200-response authentication
- Validates the `storefront_digest` cookie was received
- Retries with exponential backoff on transient failures

## Project Structure

```
app/
├── routes/
│   └── ($locale)._index.tsx    # AI shopping home page
├── components/
│   └── AIShop/                  # AI shopping UI components
│       ├── AILuxuryHeader.tsx   # Glass-effect header
│       ├── AIFloatingPrompt.tsx # Search input with animated border
│       ├── AIProductCard.tsx    # Product display card
│       ├── AIProductGrid.tsx    # Responsive product grid
│       └── ...
├── lib/
│   ├── ai-search.server.ts      # AI search orchestration
│   └── mcp-client.server.ts     # MCP client with auth
└── styles/
    ├── app.css                  # AI shop styles
    └── tailwind.css             # Tailwind config
```

## Commands

```bash
npm run dev          # Local development with HMR
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
npm run typecheck    # TypeScript checking
```

## Tech Stack

- [Hydrogen](https://shopify.dev/custom-storefronts/hydrogen) - Shopify's React framework
- [React Router v7](https://reactrouter.com/) - Routing and SSR
- [Anthropic Claude](https://www.anthropic.com/) - AI language model
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Framer Motion](https://www.framer.com/motion/) - Animations

## License

MIT
