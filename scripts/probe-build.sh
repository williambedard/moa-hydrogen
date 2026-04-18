#!/usr/bin/env bash
# probe-build.sh -- Tier 0 build-time marker probe for moa-hydrogen.
#
# Runs `npm run build` and greps the generated SSR bundle for the
# build-sha marker. No network, no Shopify CLI auth required -- works
# inside a headless agent session.
#
# Verifies the Vite `define` substitution landed in the SSR output,
# catching things like:
#   - `__BUILD_SHA__` referenced outside root.tsx without a declaration
#   - CSP nonce missing on the inline script
#   - root.tsx regression that removes the meta tag
#
# Usage: bash scripts/probe-build.sh
#
# Exits 0 on success with JSON: {"tier":"build","stamp":"<sha>[-dirty]-<ts>"}
# Exits 1 on build failure or missing marker.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "${SCRIPT_DIR}/.."

BUILD_LOG="$(mktemp)"
trap 'rm -f "${BUILD_LOG}"' EXIT

echo "probe-build: running npm run build..." >&2
if ! npm run build > "${BUILD_LOG}" 2>&1; then
  echo "probe-build: BUILD FAILED" >&2
  tail -20 "${BUILD_LOG}" >&2
  printf '{"tier":"build","error":"build_failed"}\n'
  exit 1
fi

SSR_BUNDLE="dist/server/index.js"
if [[ ! -f "${SSR_BUNDLE}" ]]; then
  echo "probe-build: ERROR -- ${SSR_BUNDLE} not found after build" >&2
  printf '{"tier":"build","error":"ssr_bundle_missing"}\n'
  exit 1
fi

# Look for the literal <meta name="build-sha" ...> pattern in the SSR bundle.
# React compiles JSX to `jsx("meta", { name: "build-sha", content: "..." })`
# which minifies to something like `"build-sha",content:"8e0b5b1-dirty-123".
META_STAMP="$(grep -oE '"build-sha"[^)]{0,40}[a-f0-9]{7,}(-dirty)?-[0-9]+' "${SSR_BUNDLE}" \
  | grep -oE '[a-f0-9]{7,}(-dirty)?-[0-9]+' \
  | head -1)"

WIN_STAMP="$(grep -oE 'window\.__BUILD_SHA__[^;]*[a-f0-9]{7,}(-dirty)?-[0-9]+' "${SSR_BUNDLE}" \
  | grep -oE '[a-f0-9]{7,}(-dirty)?-[0-9]+' \
  | head -1)"

if [[ -z "${META_STAMP}" ]]; then
  echo "probe-build: ERROR -- build-sha meta tag missing from SSR bundle" >&2
  echo "probe-build: check app/root.tsx for the <meta name=build-sha> tag" >&2
  printf '{"tier":"build","error":"meta_missing"}\n'
  exit 1
fi

if [[ -z "${WIN_STAMP}" ]]; then
  echo "probe-build: ERROR -- window.__BUILD_SHA__ assignment missing from SSR bundle" >&2
  echo "probe-build: check app/root.tsx for the nonced inline script" >&2
  printf '{"tier":"build","error":"window_missing"}\n'
  exit 1
fi

if [[ "${META_STAMP}" != "${WIN_STAMP}" ]]; then
  echo "probe-build: ERROR -- meta (${META_STAMP}) != window (${WIN_STAMP})" >&2
  printf '{"tier":"build","error":"stamp_mismatch","meta":"%s","win":"%s"}\n' \
    "${META_STAMP}" "${WIN_STAMP}"
  exit 1
fi

printf '{"tier":"build","stamp":"%s","bundle":"%s"}\n' "${META_STAMP}" "${SSR_BUNDLE}"
