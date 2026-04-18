#!/usr/bin/env bash
# checkpoint-oxygen.sh -- Tier 2 deploy checkpoint for moa-hydrogen.
#
# IMPORTANT: Oxygen does NOT auto-build on `git push`. Deploys require
# `npx shopify hydrogen deploy` which needs Shopify CLI auth. A headless
# agent session can't complete that auth flow.
#
# This script therefore splits Tier 2 into two steps:
#   1. agent pushes to origin/main (version control, so HEAD is shareable)
#   2. USER runs `npx shopify hydrogen deploy` from their authed shell
#   3. agent runs `bash scripts/probe-oxygen.sh <sha>` via zmux
#
# Usage: bash scripts/checkpoint-oxygen.sh
#
# Guardrails:
#   - Refuses if working tree is dirty.
#   - Refuses if current branch != main (per moa-hydrogen conventions).
#
# Prints the exact commands the user needs to run, plus the expected
# SHA prefix for the follow-up probe.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "${SCRIPT_DIR}/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${BRANCH}" != "main" ]]; then
  echo "checkpoint-oxygen: REFUSING -- current branch is '${BRANCH}', not 'main'." >&2
  exit 2
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "checkpoint-oxygen: REFUSING -- working tree is dirty. Commit first." >&2
  git status --short >&2
  exit 2
fi

EXPECTED_SHA="$(git rev-parse --short HEAD)"
COMPARE_URL="https://github.com/williambedard/moa-hydrogen/compare/origin/main...${EXPECTED_SHA}"

echo "checkpoint-oxygen: HEAD=${EXPECTED_SHA}" >&2
echo "checkpoint-oxygen: compare URL: ${COMPARE_URL}" >&2
echo "checkpoint-oxygen: pushing to origin/main (version control only)..." >&2

git push origin main

cat >&2 <<EOF

checkpoint-oxygen: push complete. Oxygen does NOT auto-build.

NEXT STEPS (manual, authenticated shell required):

  # 1. Deploy to Oxygen
  npx shopify hydrogen deploy --env main

  # 2. Once deploy finishes, verify with:
  bash scripts/probe-oxygen.sh ${EXPECTED_SHA} 180

Expected stamp prefix: ${EXPECTED_SHA}
Probe transport: zmux browser (authenticated Shopify session required).
See .claude/skills/browser-feedback-loop.md for the full protocol.
EOF

printf '{"tier":"checkpoint","pushed":"%s","expected_sha":"%s","compare_url":"%s","next_step":"npx shopify hydrogen deploy --env main"}\n' \
  "${EXPECTED_SHA}" "${EXPECTED_SHA}" "${COMPARE_URL}"
