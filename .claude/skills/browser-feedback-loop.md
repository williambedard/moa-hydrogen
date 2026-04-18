# Browser Feedback Loop — moa-hydrogen

Project-specific recipe for running a disciplined UI feedback loop against
moa-hydrogen. Follows the shared protocol at
`~/.claude/skills/browser-feedback-loop/SKILL.md` — read that first for the
discipline rules (expectations.json, iteration caps, escalation, loop log).
This file covers only the Hydrogen/Oxygen adaptations.

## Two-tier loop

| Tier | Where | Feedback | Deploy trigger | Probe |
|---|---|---|---|---|
| **1 (inner)** | `npm run dev` + HMR | <1s | file save | `bash scripts/probe-local.sh` |
| **2 (checkpoint)** | Oxygen preview URL | 60–180s | `git push origin main` | `bash scripts/checkpoint-oxygen.sh` |

**Rule:** iterate at Tier 1 until your expectations pass, then push once to
verify Oxygen-only behaviors (SSR output, build-time env, real Storefront
API, CSP, Oxygen worker runtime differences). **Never loop at Tier 2.** It's
a checkpoint, not an inner loop — you'll burn ~2 minutes per round and
nothing there is faster to debug than locally.

## Build-SHA marker

Stamped at build time by `vite.config.ts` `buildSha()` (Vite `define`).
Shape: `<shortSha>[-dirty]-<epoch>`.

- `<shortSha>` from `git rev-parse --short HEAD`
- `-dirty` appears when `git diff --quiet` fails (uncommitted tracked
  changes). Feature, not a bug: it signals you're probing local work that
  won't land on Oxygen until committed + pushed.
- `<epoch>` disambiguates rebuilds of the same SHA.
- `BUILD_SHA` env var overrides everything (for CI / deterministic builds).

Rendered in two places by `app/root.tsx`:

1. `<meta name="build-sha" content={__BUILD_SHA__}>` — SSR. The cheap
   curl-able probe.
2. `<script nonce={nonce}>window.__BUILD_SHA__=...</script>` — client
   mirror. Must be nonced (Hydrogen's CSP blocks unnonced inline scripts).
   Used by hydration-time probes and as the SSR/client-parity signal.

If `window.__BUILD_SHA__ !== meta[name=build-sha]` after hydration, you're
looking at a stale SSR cache serving a new client bundle — investigate
before trusting any other probe.

## Expectations.json

See `~/.claude/skills/browser-feedback-loop/reference/expectations-schema.md`
for the full schema. Typical moa-hydrogen expectations live at
`.claude/expectations/<task-slug>.json`:

```json
{
  "tier": "local",
  "must": [
    { "probe": "marker_present",         "where": "ssr" },
    { "probe": "marker_parity",          "where": "hydrated" },
    { "probe": "no_hydration_mismatch",  "window_ms": 3000 },
    { "probe": "console_clean",          "levels": ["error"] }
  ],
  "expect": [
    { "probe": "storefront_api_budget", "max_calls": 20 }
  ]
}
```

## Hydrogen-specific probes

These extend the shared probe cookbook. Run them inside the zmux browser
via `zmux_browser_eval` after a Tier-1 or Tier-2 match.

### SSR hydration mismatch
```js
// Watch console for 3s after load.
(async () => {
  const msgs = [];
  const orig = console.error;
  console.error = (...a) => { msgs.push(a.join(' ')); orig(...a); };
  await new Promise(r => setTimeout(r, 3000));
  console.error = orig;
  return msgs.filter(m => /hydrat(e|ion).*(fail|mismatch|did not match)/i.test(m));
})()
```
Empty array = pass. Any match = SSR/client divergence; stop and diagnose
before iterating further.

### SSR vs client marker parity
```js
({
  ssr: document.querySelector('meta[name=build-sha]')?.content,
  client: window.__BUILD_SHA__,
  match: document.querySelector('meta[name=build-sha]')?.content === window.__BUILD_SHA__
})
```
`match: false` on Oxygen = stale cache serving old HTML with a new client
bundle. Cache-bust (add `?_probe=<epoch>`) and retry; if still mismatched,
the deploy hasn't fully landed yet.

### Storefront API call budget
```js
performance.getEntriesByType('resource')
  .filter(r => /\/api\/20\d{2}-/.test(r.name)).length
```
Fail fast if > 20 (project baseline). Route changes that blow this budget
usually mean a new loader is issuing queries inside a loop or a component
re-renders are triggering refetches.

### Route-level freshness (Oxygen only)
Oxygen serves routes independently at the edge. After a checkpoint, probe
multiple routes and confirm each returns the same SSR marker:

```bash
for path in / /collections/all /products/sample-product; do
  curl -fsS "https://moa-hydrogen-38b18b44b11e7efb2af1.o2.myshopify.dev${path}?_probe=$(date +%s)" \
    | grep -oE '<meta[^>]*name="build-sha"[^>]*>'
done
```
If markers diverge across routes, the build is partially deployed. Wait ~30s
and retry before escalating.

## Guardrails (enforced by the scripts)

- `checkpoint-oxygen.sh` refuses if working tree is dirty (Oxygen ships
  HEAD; uncommitted work won't land).
- `checkpoint-oxygen.sh` refuses if current branch isn't `main` (Oxygen
  tracks `main` only for this project — see
  `~/.pi/memory/knowledge/moa-hydrogen-conventions.md`).
- No PR workflow. Per project conventions, push directly to main; Will
  manages Oxygen deploy visibility.
- No production-target guard. moa-hydrogen isn't a prod tool; main IS the
  only target.

## Escalation

If Tier 1 passes but Tier 2 fails after 180s:
1. Check the compare URL that `checkpoint-oxygen.sh` printed — is the
   commit actually on `origin/main`?
2. Check Oxygen build logs in the Shopify admin (Will has access).
3. If SSR marker present but wrong SHA → Oxygen is still building; wait.
4. If SSR marker missing → build failed; inspect build output locally with
   `npm run build`.
5. If SSR vs client markers diverge persistently → CSP / nonce issue on the
   inline script; inspect `app/root.tsx` and the response CSP header.

## Related

- Shared skill: `~/.claude/skills/browser-feedback-loop/SKILL.md`
- Probe cookbook: `~/.claude/skills/browser-feedback-loop/reference/probe-cookbook.md`
- Expectations schema: `~/.claude/skills/browser-feedback-loop/reference/expectations-schema.md`
- Pattern doc: `~/.llm-wiki/methods/deploy-marker-stamp-pattern.md`
- Sibling recipe (Quick/IAP variant): `~/Documents/shopify_repos/se-platform/.claude/skills/quick/recipes/browser-feedback-loop.md`
- Project conventions: `~/.pi/memory/knowledge/moa-hydrogen-conventions.md`
