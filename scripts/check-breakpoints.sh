#!/usr/bin/env bash
# Media queries name the breakpoint in src/app/(payload)/_styles/_breakpoints.scss rather than a
# pixel value, so "phone" means the same width everywhere (767px, not 768px). Run by `npm run lint`.
set -euo pipefail
cd "$(dirname "$0")/.."

found=$(grep -rnE '(max|min)-width: *[0-9]+px' src --include='*.scss' --include='*.css' --include='*.tsx' \
  | grep -v '_styles/_breakpoints.scss' || true)

if [[ -n $found ]]; then
  echo "Pixel breakpoints; use breakpoints.\$phone from src/app/(payload)/_styles/_breakpoints.scss instead:" >&2
  echo "$found" >&2
  exit 1
fi
