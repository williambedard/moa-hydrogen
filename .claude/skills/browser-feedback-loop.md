# Browser Feedback Loop — moa-hydrogen

Project-specific recipe for running a disciplined feedback loop against
moa-hydrogen. Follows the shared protocol at
`~/.claude/skills/browser-feedback-loop/SKILL.md` — read that first for the
discipline rules (expectations.json, iteration caps, escalation, loop log).
This file covers only the Hydrogen/Oxygen adaptations.

## The auth reality (read this before choosing a tier)

Two auth gates shape what a headless agent can do here:

- **`npm run dev` and `npm run preview`** both require Shopify CLI auth
  (`shopify hydrogen dev`, device-code flow). An agent can't complete that
  flow. Only works when Will runs these in his own terminal.
- **Oxygen deploys** require `npx shopify hydrogen deploy` (same CLI auth).
  `git push origin main` versions the code but does NOT trigger an Oxygen
  build. This is different from Vercel/Netlify reflexes.

So the loop has three tiers instead of two, and Tier 2 is a handoff.

## Three-tier loop

| Tier | Where | Feedback | Agent can run alone? | Probe |
|---|---|---|---|---|
| **0 (build)** | `npm run build` \| SSR bundle grep | ~10s | ✅ yes | `bash scripts/probe-build.sh` |
| **1 (live local)** | `npm run dev` + HMR | <1s | ❌ needs Will's shell | `bash scripts/probe-local.sh` |
| **2 (Oxygen)** | Oxygen preview URL | 60–180s post-deploy | ❌ deploy is manual | `bash scripts/probe-oxygen.sh <sha>` via zmux |

**Rule:** iterate at Tier 0 for headless agent work. Hand off to Tier 1
when hydration-time behavior matters (console, network, rendered DOM).
Use Tier 2 as a checkpoint after Will deploys manually. Never loop at
Tier 2 — it's a verification step, not an inner loop.

### Tier 0: build probe (headless-safe)

`scripts/probe-build.sh` runs `npm run build` and greps the generated
`dist/server/index.js` for the build-sha marker. No network, no auth.
Catches:

- Vite `define` regressions (e.g. someone references `__BUILD_SHA__`
  outside `root.tsx` without updating `env.d.ts`)
- Missing `<meta name="build-sha">` or the nonced `window.__BUILD_SHA__`
  inline script (CSP nonce regression)
- Stamp divergence between meta and window

For purely-SSR changes this is enough. Agent iterates build → probe →
edit until the bundle looks right, then hands off to Will for Tier 1/2.

### Tier 1: live local (needs Will's shell)

Will runs `npm run dev` in his own terminal. Agent then calls
`scripts/probe-local.sh [port]` which curls `http://localhost:<port>/`
and extracts the meta tag. Port defaults to `$SERVER_PORT → $PORT → 3000`
to mirror `vite.config.ts`'s `server.port` resolution.

Use for behaviors that only appear at runtime:
- Hydration mismatches (SSR ≠ client render)
- Console errors during page load
- Network/API call patterns
- Actual rendered DOM

### Tier 2: Oxygen checkpoint (manual deploy + zmux probe)

`scripts/checkpoint-oxygen.sh` pushes `main` (version control only) and
prints the exact commands Will needs to run:

```
npx shopify hydrogen deploy --env main
bash scripts/probe-oxygen.sh <sha> 180
```

`probe-oxygen.sh` drives an authenticated zmux browser pane (Oxygen
preview URLs redirect unauthenticated requests to Shopify OAuth; `curl`
can't handle that, `zmux browser` can). It re-navigates with a fresh
`?_probe=<epoch>` cache-buster each poll.

**Before running the Oxygen probe:**
1. Open a zmux browser pane (zmux TUI).
2. Navigate to the Oxygen URL once, complete Shopify OAuth if prompted.
3. Pane stays authenticated for subsequent probes.

If the probe detects `accounts.shopify.com` in the current URL mid-loop,
it exits 2 with `{"error":"auth_redirect"}` — re-auth manually, retry.

## Build-SHA marker

Stamped at build time by `vite.config.ts` `buildSha()` (Vite `define`).
Shape: `<shortSha>[-dirty]-<epoch>`.

- `<shortSha>` from `git rev-parse --short HEAD`
- `-dirty` appears when `git diff --quiet` fails (uncommitted tracked
  changes). Feature, not a bug: signals you're probing local work that
  won't land on Oxygen until deployed.
- `<epoch>` disambiguates rebuilds of the same SHA.
- `BUILD_SHA` env override for CI / deterministic builds.

Rendered in two places by `app/root.tsx`:

1. `<meta name="build-sha" content={__BUILD_SHA__}>` — SSR. Curl-probable.
2. `<script nonce={nonce}>window.__BUILD_SHA__=...</script>` — client
   mirror. Nonce is required (Hydrogen's CSP blocks unnonced inline scripts).
   Used by hydration-time probes and SSR/client-parity checks.

If `window.__BUILD_SHA__ !== meta[name=build-sha]` after hydration, you're
looking at a stale SSR cache serving a new client bundle — investigate
before trusting any other probe.

## Expectations.json

See `~/.claude/skills/browser-feedback-loop/reference/expectations-schema.md`
for the full schema. Typical moa-hydrogen expectations live at
`.claude/expectations/<task-slug>.json`:

```json
{
  "tier": "build",
  "must": [
    { "probe": "build_succeeds" },
    { "probe": "marker_parity", "where": "ssr_bundle" }
  ],
  "escalate_to_tier_1_when": ["hydration", "console", "dom"],
  "escalate_to_tier_2_when": ["ssr_response", "oxygen_runtime", "edge_cache"]
}
```

## Hydrogen-specific probes

Run in the authenticated zmux browser via `zmux browser eval`.

### SSR hydration mismatch
```js
(async () => {
  const msgs = [];
  const orig = console.error;
  console.error = (...a) => { msgs.push(a.join(' ')); orig(...a); };
  await new Promise(r => setTimeout(r, 3000));
  console.error = orig;
  return msgs.filter(m => /hydrat(e|ion).*(fail|mismatch|did not match)/i.test(m));
})()
```
Empty array = pass. Any match = SSR/client divergence; stop and diagnose.

### SSR vs client marker parity
```js
({
  ssr: document.querySelector('meta[name=build-sha]')?.content,
  client: window.__BUILD_SHA__,
  match: document.querySelector('meta[name=build-sha]')?.content === window.__BUILD_SHA__
})
```
`match: false` on Oxygen = stale edge cache. Cache-bust and retry.

### Storefront API call budget
```js
performance.getEntriesByType('resource')
  .filter(r => /\/api\/20\d{2}-/.test(r.name)).length
```
Fail fast if > 20 (project baseline).

### Route-level freshness (Oxygen only)
After a deploy, probe multiple routes — Oxygen serves routes independently
at the edge. Use the zmux browser for each:
```
zmux browser navigate https://moa-hydrogen-...o2.myshopify.dev/
zmux browser navigate https://moa-hydrogen-...o2.myshopify.dev/collections/all
zmux browser navigate https://moa-hydrogen-...o2.myshopify.dev/products/<handle>
```
Eval the marker parity probe after each.

## Guardrails (enforced by scripts)

- `checkpoint-oxygen.sh` refuses if working tree is dirty (can't deploy
  uncommitted work cleanly).
- `checkpoint-oxygen.sh` refuses if current branch isn't `main`
  (see `CLAUDE.md` project conventions).
- `probe-oxygen.sh` exits 2 (not 1) if zmux isn't running or no browser
  pane is open. Distinguishes "infra missing" from "deploy timeout".
- No PR workflow. Per project conventions, push directly to main; Will
  runs the Oxygen deploy.
- No production-target guard. moa-hydrogen isn't a prod tool; `main` IS
  the only target.

## Escalation

- Tier 0 fails with `build_failed` → check `npm run build` output locally.
- Tier 0 fails with `meta_missing` / `window_missing` → regression in
  `app/root.tsx`. Check for accidental removal.
- Tier 0 fails with `stamp_mismatch` → someone is computing the stamp
  twice; check `vite.config.ts` for multiple `define` passes.
- Tier 2 returns `auth_redirect` → zmux pane lost auth. Re-auth manually.
- Tier 2 returns `no_browser_pane` → open one in zmux TUI.
- Tier 2 times out → check deploy actually ran (`npx shopify hydrogen
  deploy` output in Will's shell). Oxygen build logs live in Shopify
  admin.

## Related

- Shared skill: `~/.claude/skills/browser-feedback-loop/SKILL.md`
- Probe cookbook: `~/.claude/skills/browser-feedback-loop/reference/probe-cookbook.md`
- Expectations schema: `~/.claude/skills/browser-feedback-loop/reference/expectations-schema.md`
- Pattern doc: `~/.llm-wiki/methods/deploy-marker-stamp-pattern.md`
- Sibling recipe (Quick/IAP variant): `~/Documents/shopify_repos/se-platform/.claude/skills/quick/recipes/browser-feedback-loop.md`
- Project conventions: `CLAUDE.md` in this repo (cascades to Claude Code sessions)
