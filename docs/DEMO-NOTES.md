# AI Shopping Concierge - Demo Notes

## The Concept

An AI-powered shopping concierge built on top of Shopify's Hydrogen storefront framework. Instead of traditional category browsing and keyword search, customers interact with a conversational AI assistant that understands natural language, remembers preferences, and curates products in real-time.

Think of it as having a personal shopper in your pocket — one that knows the entire catalog, can add items to your cart, and adapts to your taste as you talk to it.

---

## What We Built (Feature Walkthrough)

### 1. AI-Powered Product Discovery
- Customers type natural language queries like "I need a summer outfit for a beach wedding" or "show me something cozy under $100"
- Claude (Anthropic's AI) processes the request and uses **Shopify's Model Context Protocol (MCP)** to search the real product catalog
- Results are displayed as a curated product grid with AI-generated collection headers (e.g., "Beach Wedding Essentials")

### 2. The Concierge Character
- Custom-designed avatar: a distinguished character with a navy top hat, gold monocle, and a knowing smirk
- Collapsed state: a small circular button in the bottom-right corner with a rotating pastel gradient border
- Expanded state: the avatar anchors a sleek prompt input bar that extends to the left
- Hover tooltip ("Ask the AI Concierge") guides first-time users

### 3. Streaming Conversational Chat
- Real-time streaming responses via Server-Sent Events (SSE) — text appears word-by-word as Claude thinks
- Expandable conversation panel shows full chat history above the input
- The AI speaks in a warm, concierge-like tone — it acknowledges your request ("Let me find that for you..."), searches, then comments on results
- Tool call visualization shows the AI's actions in real-time (searching catalog, looking up products, managing cart)

### 4. Multi-Turn Conversations with Memory
- The AI remembers what you've asked for across the conversation
- Follow-up queries work naturally: "show me those in red", "what about a smaller size?", "actually, I prefer something more casual"
- **Shopping context extraction**: the AI automatically tracks your preferences (colors, sizes, budget, occasion, style), constraints ("no polyester"), and product feedback (liked/disliked items)
- Context persists in IndexedDB so conversations survive page reloads (7-day retention)

### 5. Product-Aware Conversations
- When viewing a product detail modal, the AI knows exactly which product you're looking at
- Ask questions like "does this come in blue?" or "what would go well with this?"
- Product context includes title, price, available variants (sizes, colors), and variant IDs
- Even after closing the modal, the AI remembers the last product you were viewing

### 6. Cart Integration
- The AI can add items to your cart directly through conversation: "add the medium in navy to my cart"
- **Bidirectional cart sync**: AI cart operations (via MCP) are synced back to the Hydrogen session cart, so the cart icon updates in real-time
- The AI knows what's already in your cart and can reference it in recommendations
- Slide-out cart drawer for quick review without leaving the page

### 7. Dynamic Suggested Prompts
- After each response, the AI generates contextual follow-up suggestions
- Prompts adapt to what you're doing: browsing products vs. viewing a specific item
- Helps guide the conversation and shows users what's possible

### 8. Voice Mode
- **Speech-to-text**: tap the microphone, speak your query, and it's transcribed via OpenAI Whisper
- **Text-to-speech**: the AI's response is read aloud with streaming audio playback
- **Voice Activity Detection (VAD)**: automatically detects 1.5s of silence to stop recording
- **Auto-loop**: in voice mode, the conversation flows naturally — listen, speak, listen, speak
- **Avatar lip-sync**: the concierge avatar's mouth animates in sync with the audio (4 mouth shapes)
- **Visual feedback**: animated pastel bar visualizer shows audio levels while recording
- **Safari compatible**: falls back to MP4 audio format when WebM/Opus isn't supported

### 9. Luxury UI/UX
- Animated gradient borders and glows throughout (pastel pink, lavender, light blue)
- Framer Motion animations with `prefers-reduced-motion` support
- Welcome hero section with video background
- Responsive design across all components
- Full Tailwind CSS v4 implementation

---

## Technical Architecture (Talking Points)

### Stack
- **Frontend**: Shopify Hydrogen (React 18 + React Router v7 + TypeScript)
- **AI**: Anthropic Claude via direct API with streaming
- **Product Data**: Shopify Storefront API via MCP (Model Context Protocol)
- **Voice**: OpenAI Whisper (STT) + TTS-1 (text-to-speech)
- **Deployment**: Shopify Oxygen (Cloudflare Workers at the edge)
- **Styling**: Tailwind CSS v4, Framer Motion

### Key Technical Decisions
- **MCP over GraphQL for AI**: Claude calls Shopify's MCP tools directly rather than us writing custom product search logic — the AI decides which tools to use and how to search
- **SSE streaming**: chosen over WebSockets for simplicity and edge compatibility (Cloudflare Workers don't support WebSockets natively in Hydrogen)
- **Virtual tools system**: metadata (intent, selected products, context updates, suggested prompts) communicated from Claude via "virtual tools" — tool calls that are intercepted server-side before reaching the client, keeping the response stream clean
- **IndexedDB for persistence**: conversation history and shopping context stored client-side, no additional backend needed
- **Edge-compatible voice services**: all OpenAI API calls use `fetch()` (no Node.js SDK) so they run on Cloudflare Workers

### Data Flow
```
User types/speaks query
  → ConciergePrompt (React)
  → POST /api/ai-stream (with conversation history + shopping context + product context)
  → ai-search-stream.server.ts (agentic loop: Claude ↔ MCP tools)
  → SSE stream back to client (text deltas, tool calls, products, context updates)
  → UI updates in real-time (conversation panel, product grid, cart)
```

---

## Scale of the Project

- **44 commits** across 6 PRs + feature branch work
- **108 files changed**, ~30,000 lines of code added
- **17 custom Shop components** (avatar, prompt, conversation panel, product cards, cart, voice visualizer, etc.)
- Built from a blank Hydrogen scaffold to a fully functional AI shopping experience

---

## Demo Flow Suggestions

1. **Start with the storefront** — show the clean landing page with hero video
2. **Click the concierge avatar** — show the expand animation
3. **Type a natural query** — e.g., "I'm looking for a gift for my partner, they love minimalist style"
4. **Watch streaming response** — point out the real-time text + tool call visualization
5. **Show curated results** — AI-generated header + product grid
6. **Click a product** — open detail modal, then ask the AI about it: "does this come in other colors?"
7. **Add to cart via AI** — "add this to my cart in size medium"
8. **Show cart sync** — open slide-out cart to confirm it's there
9. **Follow-up query** — "what else would pair well with this?" to show multi-turn memory
10. **Voice mode** — tap the mic, speak a query, show the avatar lip-sync and audio response
11. **Show conversation panel** — expand to reveal the full chat history with tool calls
