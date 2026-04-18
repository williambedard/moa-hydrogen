# Hydrogen Storefront

This is a Shopify Hydrogen storefront built with React Router v7 (NOT Remix). It's a headless commerce application deployed to Shopify Oxygen (Cloudflare Workers).

## Commands

```bash
npm run dev          # Local development with HMR
npm run build        # Production build with type generation
npm run preview      # Preview production build locally
npm run lint         # ESLint check
npm run typecheck    # TypeScript checking + route typegen
npm run codegen      # Generate types from GraphQL schemas
```

The `--codegen` flag runs automatically during build/dev to generate TypeScript types from Shopify GraphQL schemas.

## Agent Feedback Loop

This repo has a two-tier browser feedback loop for agent-driven UI work:

- **Tier 1 (local):** `npm run dev` + `bash scripts/probe-local.sh` — <1s feedback via HMR.
- **Tier 2 (Oxygen):** `bash scripts/checkpoint-oxygen.sh` — pushes to `main` and polls the preview URL for the new build-SHA. ~60–180s. Checkpoint only, never an inner loop.

Build-SHA is stamped by `vite.config.ts` into `<meta name="build-sha">` (SSR) and `window.__BUILD_SHA__` (client). Parity between the two signals SSR/hydration health.

Full recipe: `.claude/skills/browser-feedback-loop.md` (Hydrogen-specific probes, guardrails, escalation).
Shared protocol: `~/.claude/skills/browser-feedback-loop/SKILL.md`.

## Architecture

### Entry Points
- `server.ts` - Cloudflare Workers fetch handler, creates Hydrogen context
- `app/entry.client.tsx` - Client-side React hydration
- `app/entry.server.tsx` - Server-side rendering to readable stream
- `app/root.tsx` - Root layout with global data loading

### Directory Structure
- `/app/routes/` - React Router file-based routes (25 routes)
- `/app/components/` - Reusable React components
- `/app/lib/` - Utilities (context, session, i18n, GraphQL fragments)
- `/app/graphql/customer-account/` - Customer Account API queries (separate from storefront queries)
- `/app/styles/` - Tailwind CSS files

### Routing Pattern
File-based routing using `@react-router/fs-routes`:
- `($locale)` prefix enables multi-market i18n support
- `$handle` for dynamic segments (products, collections)
- Path alias: `~/*` maps to `app/*`

### Data Loading Pattern
Routes use split loading for performance:
- **Critical data:** Awaited before render (will 500 if unavailable)
- **Deferred data:** Returns promises, uses `<Await>` + `<Suspense>` for streaming

### GraphQL Setup
Two separate schemas configured in `.graphqlrc.ts`:
1. **Storefront API:** All `.ts/.tsx` files except `/app/graphql/`
2. **Customer Account API:** Only files in `/app/graphql/customer-account/`

Generated type files: `storefrontapi.generated.d.ts`, `customer-accountapi.generated.d.ts`

## Critical: React Router v7 (Not Remix)

This project uses React Router v7, NOT Remix. When working with documentation or code examples, always replace Remix imports:

| Remix v2 Package | React Router v7 Package |
|------------------|-------------------------|
| `@remix-run/react` | `react-router` |
| `@remix-run/dev` | `@react-router/dev` |
| `@remix-run/architect` | `@react-router/architect` |
| `@remix-run/cloudflare` | `@react-router/cloudflare` |
| `@remix-run/express` | `@react-router/express` |
| `@remix-run/fs-routes` | `@react-router/fs-routes` |
| `@remix-run/node` | `@react-router/node` |
| `@remix-run/route-config` | `@react-router/dev` |
| `@remix-run/routes-option-adapter` | `@react-router/remix-routes-option-adapter` |
| `@remix-run/serve` | `@react-router/serve` |
| `@remix-run/server-runtime` | `react-router` |
| `@remix-run/testing` | `react-router` |

NEVER use `react-router-dom` - always use `react-router` instead.

Reference: https://reactrouter.com/upgrading/remix

## Tech Stack
- Hydrogen 2025.7.3, React 18, TypeScript 5.9
- Vite 6.2 with Tailwind CSS v4
- Shopify Storefront & Customer Account APIs
- Deployed to Oxygen (Cloudflare Workers)
- Framer Motion for animations

## AI Shopping Components

Located in `/app/components/AIShop/`:

### AIConciergePrompt
The main AI prompt UI with collapsed/expanded states:
- **Collapsed state**: Circular avatar button in bottom-right corner with rotating gradient border (same as expanded), white background behind avatar, tooltip on hover ("Ask the AI Concierge")
- **Expanded state**: Avatar on left, prompt input bar extending to the right (700px max-width)
- Always starts collapsed by default
- Input clears when loading starts (after form submission)
- Close via X button, Escape key, or clicking outside
- Uses Framer Motion for animations with `useReducedMotion` support

### ConciergeAvatar
Inline SVG component for the concierge character:
- Navy blue top hat with gold "C" and cream stripe
- Gold band on hat, gold monocle with chain
- Cream/beige face with detailed features (eyebrows, eyes, nose, smirk)
- Dark navy hair on sides
- Props: `size`, `className`

### AILoadingOverlay
Full-screen loading overlay shown during AI queries:
- Uses ConciergeAvatar (96px, centered) with gentle pulse animation
- Displays random loading quotes in italic serif font

### Styling
- Rotating gradient border: `gradientRotate` animation in `tailwind.css`
- Pastel colors: pink (#f4c4ce), lavender (#d8c4e8), light blue (#c4d4f4)
- Input styles override reset.css via `.ai-input` and `.ai-form` classes

### Shopping Context System

The AI chat uses a key facts extraction system to maintain context across conversations:

**Files:**
- `/app/lib/shopping-context.ts` - Type definitions (ShoppingContext, ContextUpdate)
- `/app/lib/shopping-context.server.ts` - Server utilities for context formatting/parsing
- `/app/lib/conversation-storage.client.ts` - IndexedDB storage (v2 includes shoppingContext)
- `/app/hooks/useConversation.ts` - React hook managing conversation + context state

**Flow:**
1. User query sent with `shoppingContext` JSON in form data
2. Server builds cart context from `context.cart.get()`
3. Context formatted into `<shopping_context>` block in system prompt
4. AI extracts new facts via `---CONTEXT_UPDATE---` markers in response
5. Client merges updates and persists to IndexedDB

**Context includes:**
- Preferences: colors, sizes, budget, occasion, style, categories, brands
- Constraints: "no polyester", "needs pockets"
- Rejected/liked products
- Cart: id (for MCP tools), item count, summary

## AI Concierge Enhancement Architecture

### Streaming Chat System
- `/app/lib/ai-search-stream.server.ts` - Streaming AI processor using SSE
- `/app/hooks/useStreamingChat.ts` - Client hook for consuming SSE stream
- Event types: text_delta, tool_use_start/end, products, context_update, intent, done, error

### Conversation Panel
- Expandable above input bar via "Show conversation" button
- Shows message history with tool call visualization (collapsible)
- Product context clears when detail modal closes

### Intent Detection
Claude indicates intent at end of response:
- `product_search` → update product grid
- `cart_action` → cart op, confirmation only
- `product_inquiry` → answer about current product
- `general` → conversational response only

### Product Context
When product detail modal is open, `productContext` is passed to AI including:
- Product ID, handle, title, price
- Available options (sizes, colors)
- Clears to null when modal closes

### Extended Thinking
Optional via `ENABLE_EXTENDED_THINKING` env - shows AI reasoning in collapsible section
