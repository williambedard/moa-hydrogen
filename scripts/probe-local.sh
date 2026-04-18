#!/usr/bin/env bash
# probe-local.sh -- Tier 1 deploy-marker probe for moa-hydrogen.
#
# Fetches the dev server root, extracts <meta name="build-sha">, and emits
# single-line JSON on stdout. Exits 1 if the dev server is unreachable or
# the marker is missing.
#
# Usage: bash scripts/probe-local.sh [port]
#   port defaults to $SERVER_PORT, then $PORT, then 3000 -- matches
#   vite.config.ts server.port resolution.
#
# This is Tier 1 of the two-tier feedback loop. See
# .claude/skills/browser-feedback-loop.md for the full protocol.

set -euo pipefail

PORT="${1:-${SERVER_PORT:-${PORT:-3000}}}"
URL="http://localhost:${PORT}/"

HTML="$(curl -fsS --max-time 5 "${URL}" 2>/dev/null || true)"

if [[ -z "${HTML}" ]]; then
  echo "{\"tier\":\"local\",\"error\":\"dev server unreachable\",\"url\":\"${URL}\"}" >&2
  exit 1
fi

# Extract meta[name="build-sha"] content. Tolerant to attribute order + quotes.
STAMP="$(printf '%s' "${HTML}" \
  | grep -oE '<meta[^>]*name="build-sha"[^>]*>' \
  | grep -oE 'content="[^"]*"' \
  | head -1 \
  | sed -E 's/content="([^"]*)"/\1/')"

if [[ -z "${STAMP}" ]]; then
  echo "{\"tier\":\"local\",\"error\":\"build-sha marker missing from SSR HTML\",\"url\":\"${URL}\"}" >&2
  exit 1
fi

printf '{"tier":"local","stamp":"%s","url":"%s"}\n' "${STAMP}" "${URL}"
