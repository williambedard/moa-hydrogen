#!/usr/bin/env bash
# checkpoint-oxygen.sh -- Tier 2 deploy checkpoint for moa-hydrogen.
#
# Pushes current HEAD to origin/main and waits for the Oxygen preview
# URL to reflect the new build-sha. Run this ONCE at the end of a
# Tier 1 loop to verify Oxygen-only behaviors (SSR output, build-time
# env, real Storefront API). Never loop at Tier 2 -- it's a checkpoint.
#
# Usage: bash scripts/checkpoint-oxygen.sh [timeout_sec]
#   timeout_sec: passed through to probe-oxygen.sh (default 180)
#
# Guardrails:
#   - Refuses if working tree is dirty (Oxygen ships HEAD; dirty work
#     won't land).
#   - Refuses if current branch != main (Oxygen tracks main only for
#     this project -- see knowledge/moa-hydrogen-conventions.md).
#
# Deploy trigger: `git push origin main`. Oxygen auto-builds from main;
# no other deploy step required.

set -euo pipefail

TIMEOUT="${1:-180}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "${SCRIPT_DIR}/.."

# Guard: branch must be main.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${BRANCH}" != "main" ]]; then
  echo "checkpoint-oxygen: REFUSING -- current branch is '${BRANCH}', not 'main'." >&2
  echo "checkpoint-oxygen: Oxygen tracks main only for this project." >&2
  exit 2
fi

# Guard: working tree must be clean.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "checkpoint-oxygen: REFUSING -- working tree is dirty." >&2
  echo "checkpoint-oxygen: Oxygen ships HEAD; dirty work won't land. Commit first." >&2
  git status --short >&2
  exit 2
fi

EXPECTED_SHA="$(git rev-parse --short HEAD)"
COMPARE_URL="https://github.com/williambedard/moa-hydrogen/compare/origin/main...${EXPECTED_SHA}"

echo "checkpoint-oxygen: HEAD=${EXPECTED_SHA}" >&2
echo "checkpoint-oxygen: compare URL: ${COMPARE_URL}" >&2
echo "checkpoint-oxygen: pushing to origin/main..." >&2

git push origin main

echo "checkpoint-oxygen: push complete, starting Oxygen probe..." >&2
exec bash "${SCRIPT_DIR}/probe-oxygen.sh" "${EXPECTED_SHA}" "${TIMEOUT}"
