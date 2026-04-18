#!/usr/bin/env bash
# probe-oxygen.sh -- Tier 2 deploy-marker probe for moa-hydrogen on Oxygen.
#
# Polls the Oxygen preview URL via the authenticated zmux browser pane
# until meta[name="build-sha"] matches the expected stamp (or the timeout
# expires). Uses `zmux browser` because *.o2.myshopify.dev redirects to
# Shopify OAuth -- curl can't authenticate, the authenticated browser can.
#
# Usage: bash scripts/probe-oxygen.sh <expected-sha-prefix> [timeout_sec]
#   expected-sha-prefix: usually `git rev-parse --short HEAD` (7 chars).
#     Matched as prefix of the full stamp `<sha>[-dirty]-<epoch>`.
#   timeout_sec: default 180. Oxygen builds usually land in 60-120s.
#
# Prerequisites:
#   - zmux is running (`zmux ping` returns ok)
#   - A zmux browser pane is open (if not, open one manually in zmux TUI)
#
# Exits 0 when stamp matches. Exits 1 on timeout or missing marker.
# Exits 2 on zmux / browser-pane unavailability (distinct from timeout).
#
# Read-only. Deploy trigger is `git push origin main` (see
# scripts/checkpoint-oxygen.sh) -- this script does NOT push.

set -euo pipefail

EXPECTED="${1:?usage: probe-oxygen.sh <expected-sha-prefix> [timeout_sec]}"
TIMEOUT="${2:-180}"

BASE_URL="https://moa-hydrogen-38b18b44b11e7efb2af1.o2.myshopify.dev/"
POLL_INTERVAL=6
START="$(date +%s)"

# --- Preflight: zmux + browser pane ---
if ! command -v zmux >/dev/null 2>&1; then
  echo "probe-oxygen: FATAL -- zmux CLI not found on PATH" >&2
  printf '{"tier":"oxygen","error":"zmux_not_found"}\n'
  exit 2
fi

if ! zmux ping >/dev/null 2>&1; then
  echo "probe-oxygen: FATAL -- zmux not running" >&2
  printf '{"tier":"oxygen","error":"zmux_not_running"}\n'
  exit 2
fi

PANES="$(zmux browser list 2>/dev/null || echo '[]')"
if [[ "${PANES}" == "[]" || -z "${PANES}" ]]; then
  echo "probe-oxygen: FATAL -- no zmux browser pane open" >&2
  echo "probe-oxygen: open one via the zmux TUI, then re-run this script" >&2
  printf '{"tier":"oxygen","error":"no_browser_pane"}\n'
  exit 2
fi

echo "probe-oxygen: polling ${BASE_URL} via zmux browser" >&2
echo "probe-oxygen: expecting stamp prefix '${EXPECTED}' (timeout ${TIMEOUT}s)" >&2

# Navigate once (cache-bust). Subsequent polls re-navigate to force a
# fresh fetch -- Oxygen edge-caches aggressively.
NAV_URL="${BASE_URL}?_probe=$(date +%s)"
if ! zmux browser navigate "${NAV_URL}" >/dev/null 2>&1; then
  echo "probe-oxygen: WARN -- initial navigate failed, will retry in loop" >&2
fi
sleep 2  # let initial load settle

while true; do
  NOW="$(date +%s)"
  ELAPSED=$((NOW - START))

  if (( ELAPSED > TIMEOUT )); then
    echo "probe-oxygen: TIMEOUT after ${ELAPSED}s" >&2
    printf '{"tier":"oxygen","error":"timeout","expected":"%s","elapsed_sec":%d,"url":"%s"}\n' \
      "${EXPECTED}" "${ELAPSED}" "${BASE_URL}"
    exit 1
  fi

  # Re-navigate with a fresh cache-buster each poll.
  zmux browser navigate "${BASE_URL}?_probe=${NOW}" >/dev/null 2>&1 || true
  sleep 2  # wait for SSR response

  # Read both stamps. JSON.stringify the result so we get a quoted string
  # back -- `zmux browser eval` returns raw JS result.
  EVAL_OUT="$(zmux browser eval 'JSON.stringify({meta:(document.querySelector("meta[name=build-sha]")||{}).content||null,win:typeof window.__BUILD_SHA__==="string"?window.__BUILD_SHA__:null,url:location.href})' 2>/dev/null || echo '')"

  # EVAL_OUT is a JSON string containing an embedded JSON object, or empty.
  # Extract meta + win via sed; simpler than shelling to jq.
  META_STAMP="$(printf '%s' "${EVAL_OUT}" | sed -nE 's/.*"meta":"([^"]*)".*/\1/p')"
  WIN_STAMP="$(printf '%s' "${EVAL_OUT}" | sed -nE 's/.*"win":"([^"]*)".*/\1/p')"
  CUR_URL="$(printf '%s' "${EVAL_OUT}" | sed -nE 's/.*"url":"([^"]*)".*/\1/p')"

  # If the pane is on accounts.shopify.com, auth expired -- tell the agent.
  if [[ "${CUR_URL}" == *"accounts.shopify.com"* ]]; then
    echo "probe-oxygen: [${ELAPSED}s] auth redirect detected (${CUR_URL}) -- log in to the zmux browser pane, then retry" >&2
    printf '{"tier":"oxygen","error":"auth_redirect","url":"%s","elapsed_sec":%d}\n' \
      "${CUR_URL}" "${ELAPSED}"
    exit 2
  fi

  if [[ -z "${META_STAMP}" ]]; then
    echo "probe-oxygen: [${ELAPSED}s] marker missing (page still loading or build broken), retrying..." >&2
    sleep "${POLL_INTERVAL}"
    continue
  fi

  echo "probe-oxygen: [${ELAPSED}s] meta=${META_STAMP} window=${WIN_STAMP}" >&2

  if [[ "${META_STAMP}" != "${WIN_STAMP}" ]]; then
    echo "probe-oxygen: [${ELAPSED}s] meta/window mismatch -- stale SSR cache, retrying..." >&2
    sleep "${POLL_INTERVAL}"
    continue
  fi

  if [[ "${META_STAMP}" == "${EXPECTED}"* ]]; then
    printf '{"tier":"oxygen","stamp":"%s","url":"%s","elapsed_sec":%d}\n' \
      "${META_STAMP}" "${BASE_URL}" "${ELAPSED}"
    exit 0
  fi

  sleep "${POLL_INTERVAL}"
done
