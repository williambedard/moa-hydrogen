#!/usr/bin/env bash
# probe-oxygen.sh -- Tier 2 deploy-marker probe for moa-hydrogen on Oxygen.
#
# Polls the Oxygen preview URL until meta[name="build-sha"] matches the
# expected stamp (or the timeout expires). Cache-busts via ?_probe=<epoch>
# on every fetch because Oxygen edge-caches aggressively.
#
# Usage: bash scripts/probe-oxygen.sh <expected-sha-prefix> [timeout_sec]
#   expected-sha-prefix: usually `git rev-parse --short HEAD` (7 chars).
#     Matched as prefix of the full stamp `<sha>[-dirty]-<epoch>`, so a
#     short SHA is sufficient and the epoch is ignored.
#   timeout_sec: default 180. Oxygen builds usually land in 60-120s.
#
# Exits 0 when stamp matches. Exits 1 on timeout or if the marker is
# missing after a successful fetch (likely SSR broken).
#
# Read-only. Deploy trigger is `git push origin main` (see
# scripts/checkpoint-oxygen.sh) -- this script does NOT push.

set -euo pipefail

EXPECTED="${1:?usage: probe-oxygen.sh <expected-sha-prefix> [timeout_sec]}"
TIMEOUT="${2:-180}"

BASE_URL="https://moa-hydrogen-38b18b44b11e7efb2af1.o2.myshopify.dev/"
POLL_INTERVAL=5
START="$(date +%s)"

echo "probe-oxygen: polling ${BASE_URL}" >&2
echo "probe-oxygen: expecting stamp prefix '${EXPECTED}' (timeout ${TIMEOUT}s)" >&2

while true; do
  NOW="$(date +%s)"
  ELAPSED=$((NOW - START))

  if (( ELAPSED > TIMEOUT )); then
    echo "probe-oxygen: TIMEOUT after ${ELAPSED}s" >&2
    printf '{"tier":"oxygen","error":"timeout","expected":"%s","elapsed_sec":%d,"url":"%s"}\n' \
      "${EXPECTED}" "${ELAPSED}" "${BASE_URL}"
    exit 1
  fi

  URL="${BASE_URL}?_probe=${NOW}"
  HTML="$(curl -fsS --max-time 10 "${URL}" 2>/dev/null || true)"

  if [[ -z "${HTML}" ]]; then
    echo "probe-oxygen: [${ELAPSED}s] fetch failed, retrying..." >&2
    sleep "${POLL_INTERVAL}"
    continue
  fi

  # SSR meta tag
  META_STAMP="$(printf '%s' "${HTML}" \
    | grep -oE '<meta[^>]*name="build-sha"[^>]*>' \
    | grep -oE 'content="[^"]*"' \
    | head -1 \
    | sed -E 's/content="([^"]*)"/\1/')"

  # Client mirror (nonced inline script)
  WIN_STAMP="$(printf '%s' "${HTML}" \
    | grep -oE 'window\.__BUILD_SHA__=("[^"]*")' \
    | head -1 \
    | sed -E 's/.*=("([^"]*)")/\2/')"

  if [[ -z "${META_STAMP}" ]]; then
    echo "probe-oxygen: [${ELAPSED}s] marker missing from SSR HTML (build broken?)" >&2
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
